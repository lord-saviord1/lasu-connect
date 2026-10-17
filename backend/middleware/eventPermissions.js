const Event = require('../models/Event');

const OID = /^[a-f0-9]{24}$/i;

/**
 * Only an event's organizers (or a platform admin) can manage it: edit
 * details, view tickets, run check-in. Use after `protect`.
 */
async function requireEventOrganizer(req, res, next) {
  try {
    if (!OID.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'Event not found.' });

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const isOrganizer = event.organizers.some((id) => String(id) === String(req.user._id));
    if (!isOrganizer && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Only this event's organizers can do that." });
    }

    req.event = event; // handed to the route so it doesn't re-fetch
    next();
  } catch (err) {
    console.error('requireEventOrganizer error:', err);
    res.status(500).json({ success: false, message: 'Permission check failed.' });
  }
}

module.exports = { requireEventOrganizer };
