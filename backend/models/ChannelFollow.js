import mongoose from 'mongoose';

// Backs both "follower count" on a channel and "my pinned/followed
// channels" sidebar list on the user side.
const channelFollowSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false }, // pinning to sidebar is a stronger signal than a plain follow
  },
  { timestamps: true }
);

channelFollowSchema.index({ channel: 1, user: 1 }, { unique: true });

export default mongoose.models.ChannelFollow || mongoose.model('ChannelFollow', channelFollowSchema);
