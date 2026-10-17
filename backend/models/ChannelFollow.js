const mongoose = require('mongoose');

// Backs both "follower count" on a channel and "my pinned channels" in a user's sidebar.
const channelFollowSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

channelFollowSchema.index({ channel: 1, user: 1 }, { unique: true });
channelFollowSchema.index({ user: 1, pinned: 1 });

module.exports = mongoose.models.ChannelFollow || mongoose.model('ChannelFollow', channelFollowSchema);
