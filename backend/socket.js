const jwt  = require('jsonwebtoken');
const User = require('./models/User');
const Message      = require('./models/Message');
const Conversation = require('./models/Conversation');

const onlineUsers = new Map();

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

    // ── Send Message ─────────────────────────────────────
    socket.on('sendMessage', async (data, callback) => {
      try {
        const { conversationId, content, type, replyTo, fileUrl, fileName, fileSize } = data;

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

        await message.populate('sender',  'displayName avatar');
        await message.populate('replyTo', 'content sender');

        // Update lastMessage
        convo.lastMessage = { text: content || `📎 ${fileName || 'File'}`, sender: user._id, timestamp: new Date() };
        await convo.save();

        // BUG FIX 3: For each member of the conversation, if they are online
        // but not yet in this socket room, add them to the room first then
        // emit newMessage directly to their socket so it appears in their sidebar.
        for (const member of convo.members) {
          const memberId = String(member._id);
          const memberSocketId = onlineUsers.get(memberId);
          if (memberSocketId && memberId !== String(user._id)) {
            const memberSocket = io.sockets.sockets.get(memberSocketId);
            if (memberSocket) {
              // Make them join the room if not already in it
              memberSocket.join(conversationId);
              // Send them the new message directly
              memberSocket.emit('newMessage', message);
              // Also notify them that a new conversation appeared in their sidebar
              memberSocket.emit('conversationUpdated', {
                conversationId,
                lastMessage: convo.lastMessage,
                conversation: await Conversation.findById(conversationId)
                  .populate('members', 'displayName avatar isOnline lastSeen')
              });
            }
          }
        }

        // Emit to everyone already in the room (including sender)
        io.to(conversationId).emit('newMessage', message);

        callback?.({ success: true, message });
      } catch (err) {
        console.error('sendMessage error:', err);
        callback?.({ error: 'Failed to send message.' });
      }
    });

    // ── Typing Indicator ─────────────────────────────────
    socket.on('typing', ({ conversationId }) => {
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

    // ── Read Receipts ────────────────────────────────────
    socket.on('markRead', async ({ conversationId, messageId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { $addToSet: { readBy: user._id } });
        socket.to(conversationId).emit('messageRead', { userId: user._id, messageId });
      } catch (err) {
        console.error('markRead error:', err);
      }
    });

    // ── Reactions ────────────────────────────────────────
    socket.on('react', async ({ messageId, emoji, conversationId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;
        const existing = msg.reactions.find(r => r.emoji === emoji);
        if (existing) {
          const idx = existing.users.map(String).indexOf(String(user._id));
          if (idx > -1) {
            existing.users.splice(idx, 1);
            if (existing.users.length === 0) msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
          } else {
            existing.users.push(user._id);
          }
        } else {
          msg.reactions.push({ emoji, users: [user._id] });
        }
        await msg.save();
        io.to(conversationId).emit('reactionUpdate', { messageId, reactions: msg.reactions });
      } catch (err) {
        console.error('react error:', err);
      }
    });

    // ── Delete Message ───────────────────────────────────
    socket.on('deleteMessage', async ({ messageId, conversationId, forAll }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;
        if (forAll && String(msg.sender) === String(user._id)) {
          msg.deletedForAll = true;
          msg.content = '';
        } else {
          msg.deletedFor.addToSet(user._id);
        }
        await msg.save();
        io.to(conversationId).emit('messageDeleted', { messageId, forAll: !!forAll, deletedBy: user._id });
      } catch (err) {
        console.error('deleteMessage error:', err);
      }
    });

    // ── Poll Vote ────────────────────────────────────────
    socket.on('votePoll', async ({ messageId, optionIndex, conversationId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg || msg.type !== 'poll') return;
        if (msg.poll.closesAt && new Date() > msg.poll.closesAt) return;
        msg.poll.options.forEach(opt => {
          opt.votes = opt.votes.filter(v => String(v) !== String(user._id));
        });
        msg.poll.options[optionIndex].votes.push(user._id);
        await msg.save();
        io.to(conversationId).emit('pollUpdate', { messageId, poll: msg.poll });
      } catch (err) {
        console.error('votePoll error:', err);
      }
    });

    // ── Join conversation room ───────────────────────────
    socket.on('joinConversation', ({ conversationId }) => {
      socket.join(conversationId);
    });

    // ── Disconnect ───────────────────────────────────────
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
