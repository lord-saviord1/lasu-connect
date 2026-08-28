import mongoose from 'mongoose';

// Separate collection rather than an array on ChannelPost — keeps the
// post document small and makes "did this user already vote" a fast
// indexed lookup instead of scanning an array.
const postVoteSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'ChannelPost', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

postVoteSchema.index({ post: 1, user: 1 }, { unique: true }); // one vote per user per post

export default mongoose.models.PostVote || mongoose.model('PostVote', postVoteSchema);
