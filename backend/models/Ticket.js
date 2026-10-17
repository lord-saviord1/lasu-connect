const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A ticket is a claim to entry tied to a specific person. Each carries a
 * unique, unguessable code that is encoded into its QR and verified at the door.
 */
const ticketSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    code: { type: String, required: true, unique: true, default: () => crypto.randomBytes(16).toString('hex') },

    // Free events go straight to 'issued'. Paid events (later) start 'pending_payment'
    // and only become 'issued' once the payment confirms.
    status: { type: String, enum: ['pending_payment', 'issued', 'checked_in', 'cancelled'], default: 'issued' },

    pricePaidNaira: { type: Number, default: 0 },
    paymentReference: { type: String },

    checkedInAt: { type: Date },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One ticket per user per event in v1. Adjust when multi-person tickets (v2) arrive.
ticketSchema.index({ event: 1, user: 1 }, { unique: true });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
