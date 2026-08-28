import mongoose from 'mongoose';

/**
 * v1 scope: single ticket type per event, free-or-paid toggle.
 * Multi-person ticket types (Couple's Ticket, group tickets) are a
 * deliberate v2 addition — see TicketType note below for how to extend
 * this without a breaking migration when that's ready.
 */
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    coverImage: { type: String, default: '' }, // Cloudinary URL

    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    venue: { type: String, required: true },

    capacity: { type: Number, required: true }, // total tickets available
    ticketsClaimed: { type: Number, default: 0 }, // denormalized counter, kept in sync on claim/cancel

    isPaid: { type: Boolean, default: false },
    priceNaira: { type: Number, default: 0 }, // ignored if isPaid is false

    // Multiple organizers/admins can manage one event, per spec.
    organizers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],

    // Which channel (if any) this event is posted through — connects
    // Events to Campus Channels per the "how the two pieces connect" note.
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },

    status: { type: String, enum: ['draft', 'published', 'cancelled', 'completed'], default: 'draft' },
  },
  { timestamps: true }
);

export default mongoose.models.Event || mongoose.model('Event', eventSchema);
