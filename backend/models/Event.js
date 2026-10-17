const mongoose = require('mongoose');

/**
 * v1: single ticket type per event, FREE events only at launch. The isPaid /
 * priceNaira fields exist so paid events can be switched on once a payment
 * provider is wired in; the routes force them to free until then.
 */
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    coverImage: { type: String, default: '' },

    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    venue: { type: String, required: true, trim: true, maxlength: 120 },

    capacity: { type: Number, required: true, min: 1, max: 100000 },
    ticketsClaimed: { type: Number, default: 0, min: 0 }, // kept in sync atomically on claim

    isPaid: { type: Boolean, default: false },
    priceNaira: { type: Number, default: 0, min: 0 },

    organizers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // The channel this event is posted through (connects Events to Channels).
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },

    status: { type: String, enum: ['draft', 'published', 'cancelled', 'completed'], default: 'draft' },
  },
  { timestamps: true }
);

eventSchema.index({ status: 1, startsAt: 1 });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
