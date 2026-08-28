import mongoose from 'mongoose';

/**
 * v1 scope: channels exist, have admins, have posts, can be pinned.
 * Deliberately NOT in v1 (per the roadmap discussion): main-feed
 * qualification/notability logic, verification badges, boosting, the
 * Ad Center. Those depend on having real posting activity to design
 * against — same reasoning the product doc itself gives for deferring
 * Wallet/Rewards.
 */
const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true }, // URL-friendly, e.g. "sug", "computer-science-dept"
    description: { type: String, default: '' },
    coverImage: { type: String, default: '' },

    ownerType: {
      type: String,
      required: true,
      enum: ['sug', 'faculty', 'department', 'brand', 'admin_office', 'student'],
    },

    // Scoped admin permissions per spec: an admin entry can be
    // full-control, or limited to a specific purpose (e.g. "can only
    // post about event X"). `scope: null` = full admin rights.
    admins: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scope: {
          type: String,
          enum: [null, 'event_only'],
          default: null,
        },
        scopedEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, // only set when scope === 'event_only'
      },
    ],

    followerCount: { type: Number, default: 0 }, // denormalized; see ChannelFollow model for the actual relationship

    // Channel creation is admin-gated per spec, not open to the public.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Channel || mongoose.model('Channel', channelSchema);
