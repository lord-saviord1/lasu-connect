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

  // Poll data
  poll: {
    question: String,
    anonymous: { type: Boolean, default: false },
    closesAt:  Date,
    options: [{
      text:  String,
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }]
  },

  // Reply threading
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },

  // Reactions: [{ emoji: '🔥', users: [userId, ...] }]
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],

  // Read receipts
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Soft delete
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedForAll: { type: Boolean, default: false },

}, { timestamps: true });

// Index for fast message fetching per conversation
messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
