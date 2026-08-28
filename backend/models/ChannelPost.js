import mongoose from 'mongoose';

const channelPostSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    content: { type: String, required: true },
    images: [{ type: String }], // Cloudinary URLs

    // Links this post to an event it's promoting — the "channel pushes
    // event-specific content" connection point from the spec.
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },

    upvoteCount: { type: Number, default: 0 }, // denormalized; see PostVote model for the actual relationship
    commentCount: { type: Number, default: 0 },

    // v1 ranking is straightforward — no authenticity/originality
    // multipliers like the rewards-phase scoring doc describes. That
    // level of sophistication waits for real usage data, same as
    // everything else deferred to Phase 1.
  },
  { timestamps: true }
);

channelPostSchema.index({ channel: 1, upvoteCount: -1, createdAt: -1 }); // supports "top posts in this channel" queries

export default mongoose.models.ChannelPost || mongoose.model('ChannelPost', channelPostSchema);
