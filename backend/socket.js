const jwt          = require('jsonwebtoken');
const User         = require('./models/User');
const Message      = require('./models/Message');
const Conversation = require('./models/Conversation');

const onlineUsers = new Map();

// ── Per-user socket rate limiting ─────────────────────
const socketRateLimits = new Map();
function isRateLimited(userId, event, maxPerMinute) {
  const key = `${userId}:${event}`;
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (!socketRateLimits.has(key)) {
    socketRateLimits.set(key, []);
  }
  const timestamps = socketRateLimits.get(key).filter(t => now - t < windowMs);
  timestamps.push(now);
  socketRateLimits.set(key, timestamps);
  return timestamps.length > maxPerMinute;
}

// Clean up rate limit map every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of socketRateLimits.entries()) {
    const fresh = timestamps.filter(t => now - t < 60 * 1000);
    if (fresh.length === 0) socketRateLimits.delete(key);
    else socketRateLimits.set(key, fresh);
  }
}, 5 * 60 * 1000);

const initSocket = (io) => {

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication token missing.'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id);
      if (!user || !user.isVerified) return next(new Error('Unauthorised.'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🟢 ${user.displayName} connected — socket: ${socket.id}`);

    onlineUsers.set(String(user._id), socket.id);
    await User.findByIdAndUpdate(user._id, { isOnline: true, socketId: socket.id });

    // Join all existing conversation rooms
    const convos = await Conversation.find({ members: user._id }).select('_id');
    convos.forEach(c => socket.join(String(c._id)));

    // Broadcast presence
    convos.forEach(c => {
      socket.to(String(c._id)).emit('userOnline', { userId: user._id, displayName: user.displayName });
    });

    // ── Send Message ──────────────────────────────────
    socket.on('sendMessage', async (data, callback) => {
      // Rate limit: max 30 messages per minute per user
      if (isRateLimited(String(user._id), 'sendMessage', 30)) {
        return callback?.({ error: 'Slow down — too many messages.' });
      }

      try {
        const { conversationId, content, type, replyTo, fileUrl, fileName, fileSize } = data;

        // ── FIX: Membership check + single DB query ──
        const convo = await Conversation.findOne({ _id: conversationId, members: user._id })
          .populate('members', 'displayName avatar isOnline lastSeen socketId');
        if (!convo) return callback?.({ error: 'Conversation not found.' });

        const message = await Message.create({
          conversationId,
          sender:   user._id,
          type:     type || 'text',
          content:  content || '',
          replyTo:  replyTo || null,
          fileUrl:  fileUrl || null,
          fileName: fileName || null,
          fileSize: fileSize || null,
          readBy:   [user._id],
        });

        await message.populate('sender', 'displayName avatar');
        await message.populate('replyTo', 'content sender');

        // Update lastMessage
        convo.lastMessage = {
          text:      content || `📎 ${fileName || 'File'}`,
          sender:    user._id,
          timestamp: new Date(),
        };
        await convo.save();

        // ── FIX 1: Query conversation ONCE outside the loop ──
        const populatedConvo = await Conversation.findById(conversationId)
          .populate('members', 'displayName avatar isOnline lastSeen');

        // ── FIX 2: Only emit to room ONCE — no per-member loop ──
        // Members not yet in the room (e.g. new DMs) get joined first
        for (const member of convo.members) {
          const memberId = String(member._id);
          const memberSocketId = onlineUsers.get(memberId);
          if (memberSocketId && memberId !== String(user._id)) {
            const memberSocket = io.sockets.sockets.get(memberSocketId);
            if (memberSocket) {
              // Ensure they're in the room so the broadcast below reaches them
              memberSocket.join(conversationId);
            }
          }
        }

        // Single broadcast to everyone in the room (no duplicates)
        io.to(conversationId).emit('newMessage', message);

        // Notify members about conversation sidebar update (once, reusing populatedConvo)
        for (const member of convo.members) {
          const memberId = String(member._id);
          const memberSocketId = onlineUsers.get(memberId);
          if (memberSocketId && memberId !== String(user._id)) {
            const memberSocket = io.sockets.sockets.get(memberSocketId);
            if (memberSocket) {
              memberSocket.emit('conversationUpdated', {
                conversationId,
                lastMessage: convo.lastMessage,
                conversation: populatedConvo,
              });
            }
          }
        }

        callback?.({ success: true, message });
      } catch (err) {
        console.error('sendMessage error:', err);
        callback?.({ error: 'Failed to send message.' });
      }
    });

    // ── Typing Indicator ──────────────────────────────
    socket.on('typing', ({ conversationId }) => {
      // Rate limit: max 20 typing events per minute
      if (isRateLimited(String(user._id), 'typing', 20)) return;
      socket.to(conversationId).emit('userTyping', {
        userId:      user._id,
        displayName: user.displayName,
        conversationId,
      });
    });

    socket.on('stopTyping', ({ conversationId }) => {
      socket.to(conversationId).emit('userStoppedTyping', {
        userId: user._id,
        conversationId,
      });
    });

    // ── Read Receipts ─────────────────────────────────
    socket.on('markRead', async ({ conversationId, messageId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { $addToSet: { readBy: user._id } });
        socket.to(conversationId).emit('messageRead', { userId: user._id, messageId });
      } catch (err) {
        console.error('markRead error:', err);
      }
    });

    // ── Reactions ─────────────────────────────────────
    socket.on('react', async ({ messageId, emoji, conversationId }) => {
      // Rate limit: max 30 reactions per minute
      if (isRateLimited(String(user._id), 'react', 30)) return;
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        const existing = msg.reactions.find(r => r.emoji === emoji);
        if (existing) {
          const idx = existing.users.map(String).indexOf(String(user._id));
          if (idx > -1) {
            existing.users.splice(idx, 1);
            if (existing.users.length === 0) {
              msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
            }
          } else {
            existing.users.push(user._id);
          }
        } else {
          msg.reactions.push({ emoji, users: [user._id] });
        }

        await msg.save();
        // Broadcast to all in room including sender so everyone sees the update
        io.to(conversationId).emit('reactionUpdate', {
          messageId,
          reactions: msg.reactions,
          reactedBy: user._id,
        });
      } catch (err) {
        console.error('react error:', err);
      }
    });

    // ── Delete Message ────────────────────────────────
    socket.on('deleteMessage', async ({ messageId, conversationId, forAll }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        // ── Security: only sender can delete for all ──
        if (forAll && String(msg.sender) === String(user._id)) {
          msg.deletedForAll = true;
          msg.content = '';
        } else {
          msg.deletedFor.addToSet(user._id);
        }

        await msg.save();
        io.to(conversationId).emit('messageDeleted', {
          messageId,
          forAll: !!forAll,
          deletedBy: user._id,
        });
      } catch (err) {
        console.error('deleteMessage error:', err);
      }
    });

    // ── Poll Vote ─────────────────────────────────────
    socket.on('votePoll', async ({ messageId, optionIndex, conversationId }) => {
      // Rate limit: max 10 votes per minute
      if (isRateLimited(String(user._id), 'votePoll', 10)) return;
      try {
        // ── FIX: Use $pull and $push instead of forEach filter ──
        await Message.updateOne(
          { _id: messageId },
          { $pull: { 'poll.options.$[].votes': user._id } }
        );
        await Message.updateOne(
          { _id: messageId },
          { $push: { [`poll.options.${optionIndex}.votes`]: user._id } }
        );

        const msg = await Message.findById(messageId);
        if (!msg || msg.type !== 'poll') return;
        if (msg.poll.closesAt && new Date() > msg.poll.closesAt) return;

        io.to(conversationId).emit('pollUpdate', { messageId, poll: msg.poll });
      } catch (err) {
        console.error('votePoll error:', err);
      }
    });

    // ── Join conversation room ─────────────────────────
    socket.on('joinConversation', ({ conversationId }) => {
      socket.join(conversationId);
    });

    // ── Disconnect ────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔴 ${user.displayName} disconnected`);
      onlineUsers.delete(String(user._id));
      await User.findByIdAndUpdate(user._id, { isOnline: false, lastSeen: new Date(), socketId: null });
      const convos = await Conversation.find({ members: user._id }).select('_id');
      convos.forEach(c => {
        socket.to(String(c._id)).emit('userOffline', { userId: user._id, lastSeen: new Date() });
      });
    });
  });
};

module.exports = { initSocket, onlineUsers };
