import Channel from '../models/Channel.js';

/**
 * Checks admin rights on a channel, respecting the scoped-permission
 * model — a full admin passes any check; an event-scoped admin only
 * passes when the action concerns their specific event.
 */
export async function requireChannelAdmin(req, res, next) {
  try {
    const channel = await Channel.findById(req.params.id || req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const adminEntry = channel.admins.find((a) => a.user.toString() === req.auth.id);
    if (!adminEntry) return res.status(403).json({ error: 'You are not an admin of this channel' });

    if (adminEntry.scope === 'event_only') {
      const targetEventId = req.body.event || req.params.eventId;
      if (!targetEventId || targetEventId !== adminEntry.scopedEventId?.toString()) {
        return res.status(403).json({ error: 'Your admin access here is limited to a specific event' });
      }
    }

    req.channel = channel;
    req.channelAdminEntry = adminEntry;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Permission check failed' });
  }
}
