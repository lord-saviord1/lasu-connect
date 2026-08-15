const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['text', 'file', 'voice', 'image', 'poll', 'announcement'],
    default: 'text'
  },
  content:  { type: String, default: '' },
  fileUrl:  { type: String, default: null },
  fileName: { type: String, default: null },
  fileSize: { type: Number, default: null },
  poll: {
    question: String,
    anonymous: { type: Boolean, default: false },
    closesAt:  Date,
    options: [{
      text:  String,
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }]
  },
  replyTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  readBy:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedFor:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedForAll: { type: Boolean, default: false },
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────
// Primary: fetch messages for a conversation (already existed)
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Unread count query: find messages in convo not read by user
messageSchema.index({ conversationId: 1, readBy: 1 });

// Find messages by sender in a conversation (delete auth check)
messageSchema.index({ conversationId: 1, sender: 1 });

// Soft delete filter
messageSchema.index({ deletedForAll: 1 });

module.exports = mongoose.model('Message', messageSchema);
