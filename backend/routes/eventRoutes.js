const express = require('express');
const rateLimit = require('express-rate-limit');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const Channel = require('../models/Channel');
const { protect, requireRole } = require('../middleware/auth');
const { requireEventOrganizer } = require('../middleware/eventPermissions');
const { generateTicketQR, generateTicketQRBuffer } = require('../utils/qrService');
const { sendTicketEmail } = require('../utils/ticketMailer');

const router = express.Router();

const OID = /^[a-f0-9]{24}$/i;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const HOUR = 3600 * 1000;

['id'].forEach((p) => router.param(p, (req, res, next, v) => (OID.test(v) ? next() : fail(res, 404, 'Not found.'))));

const perUser = (windowMs, limit, message, countOnlySuccess = false) =>
  rateLimit({ windowMs, limit, keyGenerator: (req) => String(req.user._id), skipFailedRequests: countOnlySuccess, standardHeaders: true, legacyHeaders: false, message: { success: false, message } });
// Creating: only events that were actually created count, so fixing typos never locks an organizer out.
const createLimiter = perUser(HOUR, 20, 'You are creating events too fast. Try again later.', true);
const claimLimiter = perUser(10 * 60 * 1000, 30, 'Too many ticket requests. Try again in a few minutes.');

// An event with no end time is treated as ending 12h after it starts.
const endOf = (e) => e.endsAt || new Date(new Date(e.startsAt).getTime() + 12 * HOUR);

const ownCloudinary = (u) => typeof u === 'string' && u.startsWith(
  process.env.CLOUDINARY_CLOUD_NAME ? `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/` : 'https://res.cloudinary.com/');

// Validates the fields a client may set. Anything else in the body is ignored
// (never copy req.body straight into the database).
async function validateEventInput(body, user, { creating }) {
  const out = {};
  const bad = (message) => ({ error: message });

  if (creating || body.title !== undefined) {
    const t = typeof body.title === 'string' ? body.title.trim() : '';
    if (t.length < 3 || t.length > 120) return bad('Title must be 3 to 120 characters.');
    out.title = t;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 2000) return bad('Description can be at most 2000 characters.');
    out.description = body.description.trim();
  }
  if (creating || body.venue !== undefined) {
    const v = typeof body.venue === 'string' ? body.venue.trim() : '';
    if (v.length < 2 || v.length > 120) return bad('Venue must be 2 to 120 characters.');
    out.venue = v;
  }
  if (creating || body.startsAt !== undefined) {
    const d = new Date(body.startsAt);
    if (isNaN(d)) return bad('Please give a valid start date and time.');
    if (creating && d.getTime() < Date.now() - HOUR) return bad('The start time is in the past.');
    out.startsAt = d;
  }
  if (body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== '') {
    const d = new Date(body.endsAt);
    if (isNaN(d)) return bad('Please give a valid end date and time.');
    out.endsAt = d;
  }
  if (creating || body.capacity !== undefined) {
    const c = Number(body.capacity);
    if (!Number.isInteger(c) || c < 1 || c > 100000) return bad('Capacity must be a whole number from 1 to 100000.');
    out.capacity = c;
  }
  if (body.coverImage !== undefined && ownCloudinary(body.coverImage)) out.coverImage = body.coverImage;

  if (body.channel !== undefined && body.channel !== null && body.channel !== '') {
    if (!OID.test(String(body.channel))) return bad('Unknown channel.');
    const channel = await Channel.findById(body.channel).select('admins');
    if (!channel) return bad('Unknown channel.');
    const isFullAdmin = user.role === 'admin' || channel.admins.some((a) => String(a.user) === String(user._id) && !a.scope);
    if (!isFullAdmin) return { error: 'You are not an admin of that channel.', status: 403 };
    out.channel = channel._id;
  }
  return { value: out };
}

// ---------------- Public (no sign-in needed to look) ----------------

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const events = await Event.find({
      status: 'published',
      $or: [{ startsAt: { $gte: new Date(now.getTime() - 24 * HOUR) } }, { endsAt: { $gte: now } }],
    }).sort({ startsAt: 1 }).limit(100).select('-organizers').populate('channel', 'name slug ownerType').lean();
    res.json({ success: true, events });
  } catch (err) {
    console.error('List events error:', err);
    fail(res, 500, 'Failed to load events.');
  }
});

// Must come before '/:id' so "tickets" is not read as an event id.
router.get('/tickets/mine', protect, async (req, res) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id }).sort({ createdAt: -1 })
      .populate('event', 'title startsAt endsAt venue status').lean();
    // Issued tickets carry their QR so it can be shown at the door, even if the email never arrived.
    for (const t of tickets) {
      if (t.status === 'issued') t.qr = await generateTicketQR(t.code);
    }
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('My tickets error:', err);
    fail(res, 500, 'Failed to load your tickets.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, status: 'published' })
      .populate('organizers', 'displayName').populate('channel', 'name slug ownerType').lean();
    if (!event) return fail(res, 404, 'Event not found.');
    res.json({ success: true, event });
  } catch (err) {
    console.error('Get event error:', err);
    fail(res, 500, 'Failed to load event.');
  }
});

// ---------------- Students ----------------

/**
 * Claim a free ticket. Paid events are not available at launch. The capacity
 * check and the counter bump are ONE atomic update, so two students can never
 * take the last spot between them.
 */
router.post('/:id/claim', protect, claimLimiter, async (req, res) => {
  try {
    const base = await Event.findOne({ _id: req.params.id, status: 'published' }).select('isPaid capacity startsAt endsAt');
    if (!base) return fail(res, 404, 'Event not found.');
    if (base.isPaid) return fail(res, 400, 'Paid events are not available yet.');
    if (endOf(base) < new Date()) return fail(res, 410, 'This event has already ended.');

    if (await Ticket.exists({ event: base._id, user: req.user._id })) {
      return fail(res, 409, 'You already have a ticket for this event.');
    }

    const event = await Event.findOneAndUpdate(
      { _id: base._id, status: 'published', ticketsClaimed: { $lt: base.capacity } },
      { $inc: { ticketsClaimed: 1 } },
      { new: true }
    );
    if (!event) return fail(res, 409, 'Sorry, this event is sold out.');

    let ticket;
    try {
      ticket = await Ticket.create({ event: event._id, user: req.user._id, status: 'issued', pricePaidNaira: 0 });
    } catch (e) {
      await Event.updateOne({ _id: event._id }, { $inc: { ticketsClaimed: -1 } }); // give the spot back
      if (e && e.code === 11000) return fail(res, 409, 'You already have a ticket for this event.');
      throw e;
    }

    // Email is a bonus (the ticket is always in My Tickets), so never let it fail the claim.
    generateTicketQRBuffer(ticket.code)
      .then((qrPng) => sendTicketEmail({ userId: req.user._id, event, ticket, qrPng }))
      .catch((e) => console.error('Ticket email failed (ticket is still valid):', e.message));

    res.status(201).json({ success: true, ticket: { _id: ticket._id, status: ticket.status }, requiresPayment: false });
  } catch (err) {
    console.error('Claim ticket error:', err);
    fail(res, 500, 'Failed to claim ticket.');
  }
});

// ---------------- Organizers ----------------

// Only people the team has approved (role 'official' or 'admin') can publish events.
router.post('/', protect, requireRole('official', 'admin'), createLimiter, async (req, res) => {
  try {
    const v = await validateEventInput(req.body, req.user, { creating: true });
    if (v.error) return fail(res, v.status || 400, v.error);
    if (v.value.endsAt && v.value.endsAt <= v.value.startsAt) return fail(res, 400, 'The end time must be after the start time.');

    const event = await Event.create({
      ...v.value,
      organizers: [req.user._id],
      isPaid: false, priceNaira: 0, ticketsClaimed: 0, // free events only at launch
      status: req.body.status === 'draft' ? 'draft' : 'published',
    });
    res.status(201).json({ success: true, event });
  } catch (err) {
    console.error('Create event error:', err);
    fail(res, 500, 'Failed to create event.');
  }
});

router.patch('/:id', protect, requireEventOrganizer, async (req, res) => {
  try {
    const v = await validateEventInput(req.body, req.user, { creating: false });
    if (v.error) return fail(res, v.status || 400, v.error);

    const updates = v.value;
    if (req.body.status !== undefined) {
      if (!['draft', 'published', 'cancelled', 'completed'].includes(req.body.status)) return fail(res, 400, 'Unknown status.');
      updates.status = req.body.status;
    }
    if (updates.capacity !== undefined && updates.capacity < req.event.ticketsClaimed) {
      return fail(res, 400, `Capacity cannot be lower than the ${req.event.ticketsClaimed} tickets already claimed.`);
    }
    Object.assign(req.event, updates);
    if (req.event.endsAt && req.event.endsAt <= req.event.startsAt) return fail(res, 400, 'The end time must be after the start time.');
    await req.event.save();
    res.json({ success: true, event: req.event });
  } catch (err) {
    console.error('Update event error:', err);
    fail(res, 500, 'Failed to update event.');
  }
});

router.get('/:id/tickets', protect, requireEventOrganizer, async (req, res) => {
  try {
    const tickets = await Ticket.find({ event: req.params.id }).populate('user', 'displayName email').sort({ createdAt: 1 }).lean();
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('Event tickets error:', err);
    fail(res, 500, 'Failed to load tickets.');
  }
});

// Check-in scan: takes the code read off a QR and marks it used. One atomic update,
// so scanning the same ticket twice at once still lets only one person in.
router.post('/:id/check-in', protect, requireEventOrganizer, async (req, res) => {
  try {
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (!code) return fail(res, 400, 'No ticket code given.');

    const ticket = await Ticket.findOneAndUpdate(
      { event: req.params.id, code, status: 'issued' },
      { status: 'checked_in', checkedInAt: new Date(), checkedInBy: req.user._id },
      { new: true }
    );
    if (ticket) return res.json({ success: true, checkedIn: true, ticket: { _id: ticket._id, status: ticket.status } });

    const existing = await Ticket.findOne({ event: req.params.id, code }).select('status checkedInAt');
    if (!existing) return fail(res, 404, 'No ticket found with that code for this event.');
    if (existing.status === 'checked_in') return res.status(409).json({ success: false, message: 'This ticket has already been checked in.', checkedInAt: existing.checkedInAt });
    return fail(res, 400, `Ticket is not valid for entry (status: ${existing.status}).`);
  } catch (err) {
    console.error('Check-in error:', err);
    fail(res, 500, 'Check-in failed.');
  }
});

module.exports = router;
