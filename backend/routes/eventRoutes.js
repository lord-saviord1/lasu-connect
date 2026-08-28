import express from 'express';
import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import { requireAuth } from '../middleware/auth.js'; // assumes existing customer auth middleware
import { requireEventOrganizer } from '../middleware/eventPermissions.js';
import { generateTicketQR } from '../utils/qrService.js';
import { sendTicketEmail } from '../utils/ticketMailer.js';

const router = express.Router();

// ---- Public / student-facing ----

router.get('/', async (req, res) => {
  try {
    const events = await Event.find({ status: 'published' }).sort({ startsAt: 1 });
    res.json({ events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizers', 'name');
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load event' });
  }
});

/**
 * Claim a ticket. For a free event this issues immediately and emails
 * the QR straight away. For a paid event, this creates a
 * 'pending_payment' ticket — actual issuance + email happens in the
 * payment webhook/confirmation handler (not built here — same pattern
 * as CipherStream's Monnify webhook, wire in whichever payment provider
 * LASU Connect ends up using).
 */
router.post('/:id/claim', requireAuth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.status !== 'published') return res.status(404).json({ error: 'Event not found' });
    if (event.ticketsClaimed >= event.capacity) return res.status(409).json({ error: 'Event is sold out' });

    const existing = await Ticket.findOne({ event: event._id, user: req.auth.id });
    if (existing) return res.status(409).json({ error: 'You already have a ticket for this event' });

    const ticket = await Ticket.create({
      event: event._id,
      user: req.auth.id,
      status: event.isPaid ? 'pending_payment' : 'issued',
      pricePaidNaira: event.isPaid ? event.priceNaira : 0,
    });

    event.ticketsClaimed += 1;
    await event.save();

    if (!event.isPaid) {
      const qrDataUrl = await generateTicketQR(ticket.code);
      await sendTicketEmail({ userId: req.auth.id, event, ticket, qrDataUrl });
    }

    res.status(201).json({ ticket, requiresPayment: event.isPaid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to claim ticket' });
  }
});

router.get('/tickets/mine', requireAuth, async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.auth.id }).populate('event');
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load your tickets' });
  }
});

// ---- Organizer / admin ----

router.post('/', requireAuth, async (req, res) => {
  try {
    // Any authenticated user can create a draft event and becomes its
    // first organizer — tighten this to a role check once LASU Connect
    // has a formal "verified admin" concept, per the product doc.
    const event = await Event.create({ ...req.body, organizers: [req.auth.id] });
    res.status(201).json({ event });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create event' });
  }
});

router.patch('/:id', requireAuth, requireEventOrganizer, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ event });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to update event' });
  }
});

router.get('/:id/tickets', requireAuth, requireEventOrganizer, async (req, res) => {
  try {
    const tickets = await Ticket.find({ event: req.params.id }).populate('user', 'name email');
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

/**
 * Check-in scan. Staff-facing — takes the code read off a QR (by any
 * scanner, this doesn't care how the code was read) and marks it used.
 * Rejects a second scan of the same ticket, since v1 is single-entry only.
 */
router.post('/:id/check-in', requireAuth, requireEventOrganizer, async (req, res) => {
  try {
    const { code } = req.body;
    const ticket = await Ticket.findOne({ event: req.params.id, code });
    if (!ticket) return res.status(404).json({ error: 'No ticket found with that code for this event' });
    if (ticket.status === 'checked_in') {
      return res.status(409).json({ error: 'This ticket has already been checked in', checkedInAt: ticket.checkedInAt });
    }
    if (ticket.status !== 'issued') {
      return res.status(400).json({ error: `Ticket is not valid for entry (status: ${ticket.status})` });
    }
    ticket.status = 'checked_in';
    ticket.checkedInAt = new Date();
    ticket.checkedInBy = req.auth.id;
    await ticket.save();
    res.json({ checkedIn: true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

export default router;
