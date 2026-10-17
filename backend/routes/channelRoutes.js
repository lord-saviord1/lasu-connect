const express = require('express');
const rateLimit = require('express-rate-limit');
const Channel = require('../models/Channel');
const ChannelPost = require('../models/ChannelPost');
const PostVote = require('../models/PostVote');
const ChannelFollow = require('../models/ChannelFollow');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { requireChannelAdmin } = require('../middleware/channelPermissions');

const router = express.Router();

const OID = /^[a-f0-9]{24}$/i;
const OWNER_TYPES = ['sug', 'faculty', 'department', 'brand', 'admin_office', 'student'];
const PUBLIC_FIELDS = 'name slug description coverImage ownerType postingMode followerCount';
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// A malformed id is a 404, not a server error.
['id', 'postId', 'userId'].forEach((p) =>
  router.param(p, (req, res, next, v) => (OID.test(v) ? next() : fail(res, 404, 'Not found.')))
);

// Limits keyed per signed-in user (campus networks share IPs, so per-IP would punish everyone).
const perUser = (windowMs, limit, message, countOnlySuccess = false) =>
  rateLimit({ windowMs, limit, keyGenerator: (req) => String(req.user._id), skipFailedRequests: countOnlySuccess, standardHeaders: true, legacyHeaders: false, message: { success: false, message } });
// Posting: only posts that actually went through count, so a refused or blank post never uses up the allowance.
const postLimiter = perUser(10 * 60 * 1000, 20, 'You are posting too fast. Try again in a few minutes.', true);
const voteLimiter = perUser(60 * 1000, 60, 'Slow down a little.');

const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const adminEntryOf = (channel, user) => channel.admins.find((a) => String(a.user) === String(user._id));

// Who may post in a channel: platform admins; its admins (event-scoped admins only
// for their own event); and everyone signed in when the channel is 'open'.
function canPost(channel, user, eventId) {
  if (user.role === 'admin') return true;
  const entry = adminEntryOf(channel, user);
  if (entry) return entry.scope !== 'event_only' || (eventId && String(eventId) === String(entry.scopedEventId));
  return channel.postingMode === 'open';
}

// ---------------- Discovery (PUBLIC: no sign-in needed to read) ----------------

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.ownerType) {
      if (!OWNER_TYPES.includes(req.query.ownerType)) return fail(res, 400, 'Unknown channel type.');
      filter.ownerType = req.query.ownerType;
    }
    const channels = await Channel.find(filter).select(PUBLIC_FIELDS).sort({ followerCount: -1, name: 1 }).lean();
    res.json({ success: true, channels });
  } catch (err) {
    console.error('List channels error:', err);
    fail(res, 500, 'Failed to load channels.');
  }
});

router.get('/me/sidebar', protect, async (req, res) => {
  try {
    const rows = await ChannelFollow.find({ user: req.user._id, pinned: true })
      .populate('channel', PUBLIC_FIELDS).lean();
    res.json({ success: true, pinnedChannels: rows.map((f) => f.channel).filter(Boolean) });
  } catch (err) {
    console.error('Sidebar error:', err);
    fail(res, 500, 'Failed to load your pinned channels.');
  }
});

// Friendly deep links, e.g. channels.html?c=lasusu-info
router.get('/slug/:slug', async (req, res) => {
  try {
    const channel = await Channel.findOne({ slug: String(req.params.slug).toLowerCase() }).select(PUBLIC_FIELDS).lean();
    if (!channel) return fail(res, 404, 'Channel not found.');
    res.json({ success: true, channel });
  } catch (err) {
    console.error('Channel by slug error:', err);
    fail(res, 500, 'Failed to load channel.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).select(PUBLIC_FIELDS).lean();
    if (!channel) return fail(res, 404, 'Channel not found.');
    res.json({ success: true, channel });
  } catch (err) {
    console.error('Get channel error:', err);
    fail(res, 500, 'Failed to load channel.');
  }
});

// What can the signed-in viewer do here? (follow state + whether to show the post box)
router.get('/:id/me', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return fail(res, 404, 'Channel not found.');
    const follow = await ChannelFollow.findOne({ channel: channel._id, user: req.user._id }).lean();
    const entry = adminEntryOf(channel, req.user);
    res.json({
      success: true,
      following: !!follow,
      pinned: !!(follow && follow.pinned),
      isAdmin: req.user.role === 'admin' || !!entry,
      canPost: canPost(channel, req.user, undefined),
    });
  } catch (err) {
    console.error('Channel me error:', err);
    fail(res, 500, 'Failed to load channel state.');
  }
});

// ---------------- Posts ----------------

router.get('/:id/posts', optionalAuth, async (req, res) => {
  try {
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const channel = await Channel.findById(req.params.id).select('admins');
    if (!channel) return fail(res, 404, 'Channel not found.');

    const sortSpec = sort === 'new' ? { createdAt: -1 } : { upvoteCount: -1, createdAt: -1 };
    const rows = await ChannelPost.find({ channel: channel._id })
      .sort(sortSpec).skip((page - 1) * limit).limit(limit + 1)
      .populate('author', 'displayName avatar').lean();

    const hasMore = rows.length > limit;
    const posts = rows.slice(0, limit);

    const adminIds = new Set(channel.admins.map((a) => String(a.user)));
    let voted = new Set();
    if (req.user && posts.length) {
      const votes = await PostVote.find({ user: req.user._id, post: { $in: posts.map((p) => p._id) } }).select('post').lean();
      voted = new Set(votes.map((v) => String(v.post)));
    }
    posts.forEach((p) => {
      p.byAdmin = !!p.author && adminIds.has(String(p.author._id)); // official voice badge
      p.upvoted = voted.has(String(p._id));
    });

    res.json({ success: true, posts, page, hasMore });
  } catch (err) {
    console.error('List posts error:', err);
    fail(res, 500, 'Failed to load posts.');
  }
});

router.post('/:id/posts', protect, postLimiter, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return fail(res, 404, 'Channel not found.');

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) return fail(res, 400, 'Write something first.');
    if (content.length > 2000) return fail(res, 400, 'Posts can be at most 2000 characters.');

    const eventId = req.body.event && OID.test(String(req.body.event)) ? String(req.body.event) : undefined;
    if (!canPost(channel, req.user, eventId)) {
      return fail(res, 403, "Only this channel's admins can post here.");
    }

    const post = await ChannelPost.create({ channel: channel._id, author: req.user._id, content, event: eventId });
    res.status(201).json({ success: true, post });
  } catch (err) {
    console.error('Create post error:', err);
    fail(res, 500, 'Failed to create post.');
  }
});

// Remove a post: its author, the channel's full admins, or a platform admin.
router.delete('/posts/:postId', protect, async (req, res) => {
  try {
    const post = await ChannelPost.findById(req.params.postId);
    if (!post) return fail(res, 404, 'Post not found.');
    const channel = await Channel.findById(post.channel).select('admins');
    const isAuthor = String(post.author) === String(req.user._id);
    const isChannelAdmin = !!channel && channel.admins.some((a) => String(a.user) === String(req.user._id) && !a.scope);
    if (!isAuthor && !isChannelAdmin && req.user.role !== 'admin') return fail(res, 403, 'You cannot remove this post.');
    await PostVote.deleteMany({ post: post._id });
    await post.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    fail(res, 500, 'Failed to remove post.');
  }
});

router.post('/posts/:postId/upvote', protect, voteLimiter, async (req, res) => {
  try {
    const post = await ChannelPost.findById(req.params.postId).select('_id');
    if (!post) return fail(res, 404, 'Post not found.');

    // Toggle off: the delete itself is the atomic "did they have a vote?" check.
    const removed = await PostVote.findOneAndDelete({ post: post._id, user: req.user._id });
    if (removed) {
      const updated = await ChannelPost.findByIdAndUpdate(post._id, { $inc: { upvoteCount: -1 } }, { new: true });
      return res.json({ success: true, upvoted: false, upvoteCount: Math.max(0, updated.upvoteCount) });
    }

    try {
      await PostVote.create({ post: post._id, user: req.user._id });
    } catch (e) {
      if (e && e.code === 11000) { // a double-click raced us: report the current state, count nothing twice
        const current = await ChannelPost.findById(post._id).select('upvoteCount');
        return res.json({ success: true, upvoted: true, upvoteCount: current.upvoteCount });
      }
      throw e;
    }
    const updated = await ChannelPost.findByIdAndUpdate(post._id, { $inc: { upvoteCount: 1 } }, { new: true });
    res.json({ success: true, upvoted: true, upvoteCount: updated.upvoteCount });
  } catch (err) {
    console.error('Upvote error:', err);
    fail(res, 500, 'Failed to register vote.');
  }
});

// ---------------- Follow / pin ----------------

router.post('/:id/follow', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).select('_id');
    if (!channel) return fail(res, 404, 'Channel not found.');
    try {
      await ChannelFollow.create({ channel: channel._id, user: req.user._id });
    } catch (e) {
      if (e && e.code === 11000) return fail(res, 409, 'Already following this channel.');
      throw e;
    }
    await Channel.updateOne({ _id: channel._id }, { $inc: { followerCount: 1 } });
    res.status(201).json({ success: true, followed: true });
  } catch (err) {
    console.error('Follow error:', err);
    fail(res, 500, 'Failed to follow channel.');
  }
});

router.delete('/:id/follow', protect, async (req, res) => {
  try {
    const deleted = await ChannelFollow.findOneAndDelete({ channel: req.params.id, user: req.user._id });
    if (deleted) await Channel.updateOne({ _id: req.params.id }, { $inc: { followerCount: -1 } });
    res.json({ success: true, followed: false });
  } catch (err) {
    console.error('Unfollow error:', err);
    fail(res, 500, 'Failed to unfollow channel.');
  }
});

router.patch('/:id/pin', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).select('_id');
    if (!channel) return fail(res, 404, 'Channel not found.');
    const pinned = !!req.body.pinned;

    let follow = await ChannelFollow.findOne({ channel: channel._id, user: req.user._id });
    if (follow) {
      follow.pinned = pinned;
      await follow.save();
    } else {
      // Pinning implies following.
      try {
        follow = await ChannelFollow.create({ channel: channel._id, user: req.user._id, pinned });
        await Channel.updateOne({ _id: channel._id }, { $inc: { followerCount: 1 } });
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
        follow = await ChannelFollow.findOneAndUpdate({ channel: channel._id, user: req.user._id }, { pinned }, { new: true });
      }
    }
    res.json({ success: true, pinned: follow.pinned });
  } catch (err) {
    console.error('Pin error:', err);
    fail(res, 500, 'Failed to update pin.');
  }
});

// ---------------- Channel creation + admin management ----------------

// Channel creation is team-gated (platform admins only), not open to students.
router.post('/', protect, requireRole('admin'), async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 60) return fail(res, 400, 'Channel name must be 2 to 60 characters.');
    if (!OWNER_TYPES.includes(req.body.ownerType)) return fail(res, 400, `ownerType must be one of: ${OWNER_TYPES.join(', ')}.`);
    const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 280) : '';
    const postingMode = req.body.postingMode === 'open' || req.body.postingMode === 'admins'
      ? req.body.postingMode
      : (['faculty', 'department', 'student'].includes(req.body.ownerType) ? 'open' : 'admins');

    const base = slugify(name) || 'channel';
    let slug = base;
    for (let i = 2; await Channel.exists({ slug }); i++) slug = `${base}-${i}`;

    const channel = await Channel.create({
      name, slug, description, ownerType: req.body.ownerType, postingMode,
      admins: [{ user: req.user._id, scope: null }],
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, channel });
  } catch (err) {
    if (err && err.code === 11000) return fail(res, 409, 'A channel with that name already exists.');
    console.error('Create channel error:', err);
    fail(res, 500, 'Failed to create channel.');
  }
});

router.post('/:id/admins', protect, requireChannelAdmin, async (req, res) => {
  try {
    if (req.channelAdminEntry.scope) return fail(res, 403, 'Only a full admin can add other admins.');

    let user = null;
    if (typeof req.body.email === 'string') user = await User.findOne({ email: req.body.email.toLowerCase().trim(), isVerified: true });
    else if (OID.test(String(req.body.userId))) user = await User.findOne({ _id: req.body.userId, isVerified: true });
    if (!user) return fail(res, 404, 'No LASU Connect account found for that person.');
    if (adminEntryOf(req.channel, user)) return fail(res, 409, 'They are already an admin of this channel.');

    const scoped = req.body.scope === 'event_only' && OID.test(String(req.body.scopedEventId));
    req.channel.admins.push({ user: user._id, scope: scoped ? 'event_only' : null, scopedEventId: scoped ? req.body.scopedEventId : undefined });
    await req.channel.save();
    res.json({ success: true, adminCount: req.channel.admins.length });
  } catch (err) {
    console.error('Add admin error:', err);
    fail(res, 500, 'Failed to add admin.');
  }
});

router.delete('/:id/admins/:userId', protect, requireChannelAdmin, async (req, res) => {
  try {
    if (req.channelAdminEntry.scope) return fail(res, 403, 'Only a full admin can remove admins.');
    const remaining = req.channel.admins.filter((a) => String(a.user) !== String(req.params.userId));
    if (remaining.length === req.channel.admins.length) return fail(res, 404, 'That person is not an admin of this channel.');
    if (!remaining.some((a) => !a.scope)) return fail(res, 400, 'A channel needs at least one full admin.');
    req.channel.admins = remaining;
    await req.channel.save();
    res.json({ success: true, adminCount: remaining.length });
  } catch (err) {
    console.error('Remove admin error:', err);
    fail(res, 500, 'Failed to remove admin.');
  }
});

module.exports = router;
