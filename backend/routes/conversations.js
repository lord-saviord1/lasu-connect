const express      = require('express');
const router       = express.Router();
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const { protect }  = require('../middleware/auth');

router.use(protect);

// ── GET /api/conversations ────────────────────────────────
router.get('/', async (req, res) => {
  try {
   const conversations = await Conversation.find({ members: req.user._id })
      .populate('members', 'displayName avatar isOnline lastSeen')
      .populate('lastMessage.sender', 'displayName')
      .sort({ 'lastMessage.timestamp': -1, createdAt: -1 });

    // Add unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (convo) => {
        const unreadCount = await Message.countDocuments({
          conversationId: convo._id,
          sender: { $ne: req.user._id },
          readBy: { $nin: [req.user._id] },
        });
        return { ...convo.toObject(), unreadCount };
      })
    );

    res.json({ success: true, conversations: conversationsWithUnread });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/conversations/dm ────────────────────────────
router.post('/dm', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required.' });

    const isSelfDM = String(req.user._id) === String(userId);

    // Check if DM already exists
    let convo;
    if (isSelfDM) {
      // Self DM: members array has only one entry
      convo = await Conversation.findOne({
        type: 'dm',
        members: { $all: [req.user._id], $size: 1 }
      }).populate('members', 'displayName avatar isOnline lastSeen');
    } else {
      convo = await Conversation.findOne({
        type: 'dm',
        members: { $all: [req.user._id, userId], $size: 2 }
      }).populate('members', 'displayName avatar isOnline lastSeen');
    }

    if (convo) return res.json({ success: true, conversation: convo, existing: true });

    // Create new DM
    convo = await Conversation.create({
      type:    'dm',
      members: isSelfDM ? [req.user._id] : [req.user._id, userId],
      admins:  [],
    });
    await convo.populate('members', 'displayName avatar isOnline lastSeen');

    res.status(201).json({ success: true, conversation: convo, existing: false });
  } catch (err) {
    console.error('Create DM error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/conversations/group ─────────────────────────
router.post('/group', async (req, res) => {
  try {
    const { name, memberIds, icon, faculty, groupType } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Group name is required.' });
    }
    if (!memberIds || memberIds.length < 1) {
      return res.status(400).json({ success: false, message: 'Add at least one other member.' });
    }

    const members = [...new Set([String(req.user._id), ...memberIds])];

    const convo = await Conversation.create({
      type:      'group',
      name:      name.trim(),
      icon:      icon || '💬',
      members,
      admins:    [req.user._id],
      faculty:   faculty || null,
      groupType: groupType || null,
    });
    await convo.populate('members', 'displayName avatar isOnline');

    res.status(201).json({ success: true, conversation: convo });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/conversations/:id ────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, members: req.user._id })
      .populate('members', 'displayName avatar isOnline lastSeen role')
      .populate('admins',  'displayName avatar');

    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    res.json({ success: true, conversation: convo });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/conversations/:id/members ───────────────────
router.post('/:id/members', async (req, res) => {
  try {
    const { userIds } = req.body;
    const convo = await Conversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    if (!convo.admins.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only admins can add members.' });
    }

    const newMembers = userIds.filter(id => !convo.members.map(String).includes(id));
    convo.members.push(...newMembers);
    await convo.save();

    res.json({ success: true, message: `${newMembers.length} member(s) added.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});


// POST /api/conversations/:id/leave
router.post('/:id/leave', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, members: req.user._id });
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    if (convo.type !== 'group') return res.status(400).json({ success: false, message: 'You can only leave group conversations.' });
    convo.members = convo.members.filter(m => String(m) !== String(req.user._id));
    convo.admins  = convo.admins.filter(a => String(a) !== String(req.user._id));
    if (convo.members.length === 0) {
      await Conversation.deleteOne({ _id: convo._id });
      return res.json({ success: true, message: 'Group deleted as no members remain.' });
    }
    if (convo.admins.length === 0 && convo.members.length > 0) {
      convo.admins.push(convo.members[0]);
    }
    await convo.save();
    res.json({ success: true, message: 'You have left the group.' });
  } catch (err) {
    console.error('Leave group error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});
module.exports = router;
