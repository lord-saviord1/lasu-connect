import Event from '../models/Event.js';

/**
 * Only an event's organizers (or, once your role system exists, a
 * platform-level admin) can manage it — edit details, view tickets,
 * run check-in scanning.
 */
export async function requireEventOrganizer(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isOrganizer = event.organizers.some((id) => id.toString() === req.auth.id);
    if (!isOrganizer) return res.status(403).json({ error: 'Only this event\'s organizers can do that' });
    req.event = event; // handed to the route so it doesn't need to re-fetch
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Permission check failed' });
  }
}
