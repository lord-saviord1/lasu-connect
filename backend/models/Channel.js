const mongoose = require('mongoose');

/**
 * A channel is a space run by an entity (SUG, a faculty, a brand, a school
 * office, a student group) that posts to a following. Anyone can READ a
 * channel, including people who aren't signed in; posting depends on the
 * channel's postingMode.
 *
 * Not in v1 (by design, needs real usage data first): main feed,
 * verification badges, boosting, the Ad Center.
 */
const channelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // e.g. "lasusu-info"
    description: { type: String, default: '', maxlength: 280 },
    coverImage: { type: String, default: '' },

    ownerType: {
      type: String,
      required: true,
      enum: ['sug', 'faculty', 'department', 'brand', 'admin_office', 'student'],
    },

    // 'admins': only this channel's admins can post (official voices: SUG, school
    //           offices, brands, Project-NODE...).
    // 'open'  : any signed-in student can post (faculty / department / community).
    postingMode: { type: String, enum: ['admins', 'open'], default: 'admins' },

    // An admin entry is full-control (scope null) or limited to one event.
    admins: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        scope: { type: String, enum: ['event_only'], default: null },
        scopedEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, // only when scope === 'event_only'
      },
    ],

    followerCount: { type: Number, default: 0 }, // denormalized; ChannelFollow holds the real relationship

    // Channel creation is team-gated, not open to the public.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Channel || mongoose.model('Channel', channelSchema);
