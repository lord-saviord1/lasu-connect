const mongoose = require('mongoose');

const channelPostSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    content: { type: String, required: true, trim: true, maxlength: 2000 },
    images: [{ type: String }], // Cloudinary URLs (not used by the launch UI yet)

    // Links a post to the event it promotes — the channel -> event connection point.
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },

    upvoteCount: { type: Number, default: 0 }, // denormalized; PostVote holds the real relationship
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

channelPostSchema.index({ channel: 1, upvoteCount: -1, createdAt: -1 }); // "top posts in this channel"
channelPostSchema.index({ channel: 1, createdAt: -1 });                  // "new posts in this channel"

module.exports = mongoose.models.ChannelPost || mongoose.model('ChannelPost', channelPostSchema);
