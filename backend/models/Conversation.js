const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  type:    { type: String, enum: ['dm', 'group'], required: true },
  name:    { type: String, default: null },       // null for DMs
  icon:    { type: String, default: '💬' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  lastMessage: {
    text:      { type: String, default: '' },
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    timestamp: { type: Date, default: Date.now }
  },
  // Group-specific
  faculty:     { type: String, default: null },
  groupType:   { type: String, default: null }, // Study Group, Committee, etc.
  isOfficial:  { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
