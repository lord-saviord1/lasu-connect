const express      = require('express');
const router       = express.Router();
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect }  = require('../middleware/auth');

router.use(protect);

// ── GET /api/messages/:conversationId ─────────────────────
// Paginated message history (newest first, then reverse on frontend)
router.get('/:conversationId', async (req, res) => {
  try {
    const { page = 1, limit = 40 } = req.query;
    const convo = await Conversation.findOne({ _id: req.params.conversationId, members: req.user._id });
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.' });

    const messages = await Message.find({
      conversationId: req.params.conversationId,
      deletedForAll:  false,
      deletedFor:     { $nin: [req.user._id] },
    })
    .populate('sender',  'displayName avatar')
    .populate('replyTo', 'content sender type')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    res.json({ success: true, messages: messages.reverse(), page: parseInt(page) });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/messages ─────────────────────────────────────
// Send a message (REST fallback — real-time handled by Socket.io)
router.post('/', async (req, res) => {
  try {
    const { conversationId, content, type, replyTo, poll } = req.body;
    if (!conversationId || (!content && !poll)) {
      return res.status(400).json({ success: false, message: 'conversationId and content are required.' });
    }

    const convo = await Conversation.findOne({ _id: conversationId, members: req.user._id });
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found or you are not a member.' });

    const message = await Message.create({
      conversationId,
      sender:  req.user._id,
      type:    type || 'text',
      content: content || '',
      replyTo: replyTo || null,
      poll:    poll || undefined,
    });
    await message.populate('sender', 'displayName avatar');

    // Update lastMessage on conversation
    convo.lastMessage = { text: content || '📊 Poll', sender: req.user._id, timestamp: new Date() };
    await convo.save();

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/messages/:id/react ──────────────────────────
router.post('/:id/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found.' });

    const existing = msg.reactions.find(r => r.emoji === emoji);
    if (existing) {
      const userIndex = existing.users.indexOf(req.user._id);
      if (userIndex > -1) {
        existing.users.splice(userIndex, 1); // toggle off
        if (existing.users.length === 0) {
          msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existing.users.push(req.user._id); // toggle on
      }
    } else {
      msg.reactions.push({ emoji, users: [req.user._id] });
    }

    await msg.save();
    res.json({ success: true, reactions: msg.reactions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DELETE /api/messages/:id ──────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { forAll } = req.query;
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found.' });

    const isSender = String(msg.sender) === String(req.user._id);

    if (forAll === 'true') {
      if (!isSender) return res.status(403).json({ success: false, message: 'Only the sender can delete for everyone.' });
      msg.deletedForAll = true;
      msg.content = '';
    } else {
      if (!msg.deletedFor.includes(req.user._id)) {
        msg.deletedFor.push(req.user._id);
      }
    }

    await msg.save();
    res.json({ success: true, message: 'Message deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
