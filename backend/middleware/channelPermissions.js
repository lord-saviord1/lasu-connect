const Channel = require('../models/Channel');

const OID = /^[a-f0-9]{24}$/i;

/**
 * Admin rights on a channel (use after `protect`). Platform admins (role
 * 'admin') always pass. A full channel admin passes any check; an
 * event-scoped admin only passes when the action concerns their own event.
 */
async function requireChannelAdmin(req, res, next) {
  try {
    const channelId = req.params.id || req.params.channelId;
    if (!OID.test(String(channelId))) return res.status(404).json({ success: false, message: 'Channel not found.' });

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found.' });

    if (req.user.role === 'admin') {
      req.channel = channel;
      req.channelAdminEntry = { scope: null };
      return next();
    }

    const adminEntry = channel.admins.find((a) => String(a.user) === String(req.user._id));
    if (!adminEntry) return res.status(403).json({ success: false, message: 'You are not an admin of this channel.' });

    if (adminEntry.scope === 'event_only') {
      const targetEventId = (req.body && req.body.event) || req.params.eventId;
      if (!targetEventId || String(targetEventId) !== String(adminEntry.scopedEventId)) {
        return res.status(403).json({ success: false, message: 'Your admin access here is limited to a specific event.' });
      }
    }

    req.channel = channel;
    req.channelAdminEntry = adminEntry;
    next();
  } catch (err) {
    console.error('requireChannelAdmin error:', err);
    res.status(500).json({ success: false, message: 'Permission check failed.' });
  }
}

module.exports = { requireChannelAdmin };
