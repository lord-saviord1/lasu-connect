const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  type:    { type: String, enum: ['dm', 'group'], required: true },
  name:    { type: String, default: null },
  icon:    { type: String, default: '💬' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  lastMessage: {
    text:      { type: String, default: '' },
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    timestamp: { type: Date, default: Date.now }
  },
  faculty:     { type: String, default: null },
  groupType:   { type: String, default: null },
  isOfficial:  { type: Boolean, default: false },
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────
// Most critical: members lookup on every login + disconnect
conversationSchema.index({ members: 1 });

// Sort conversations by last message time (sidebar list)
conversationSchema.index({ 'lastMessage.timestamp': -1 });

// Find DMs between two specific users
conversationSchema.index({ type: 1, members: 1 });

// Find official/faculty channels
conversationSchema.index({ isOfficial: 1, faculty: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
