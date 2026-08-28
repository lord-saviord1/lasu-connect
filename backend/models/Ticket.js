import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * A ticket is a claim to entry, tied to a specific person — not an
 * "interested" flag. Each ticket carries a unique, unguessable code that
 * gets encoded into the QR sent by email; that code is what gets scanned
 * and verified at the door.
 */
const ticketSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    code: { type: String, required: true, unique: true, default: () => crypto.randomBytes(16).toString('hex') },

    // For a free event this goes straight to 'issued'. For a paid event
    // this starts 'pending_payment' and only flips to 'issued' once the
    // transaction confirms — the QR/email only gets sent at that point.
    status: { type: String, enum: ['pending_payment', 'issued', 'checked_in', 'cancelled'], default: 'issued' },

    pricePaidNaira: { type: Number, default: 0 },
    paymentReference: { type: String }, // ties back to whatever payment provider is wired in later

    checkedInAt: { type: Date },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // which staff member scanned it
  },
  { timestamps: true }
);

// One ticket per user per event in v1 — matches "single ticket type" scope.
// Remove/adjust this once multi-person ticket types (v2) are built, since
// at that point a user could reasonably hold multiple ticket entries.
ticketSchema.index({ event: 1, user: 1 }, { unique: true });

export default mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
