const mongoose = require('mongoose');

// A separate collection (not an array on the post) keeps posts small and makes
// "did this user already vote" an indexed lookup.
const postVoteSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'ChannelPost', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

postVoteSchema.index({ post: 1, user: 1 }, { unique: true }); // one vote per user per post

module.exports = mongoose.models.PostVote || mongoose.model('PostVote', postVoteSchema);
