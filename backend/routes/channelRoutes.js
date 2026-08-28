import express from 'express';
import Channel from '../models/Channel.js';
import ChannelPost from '../models/ChannelPost.js';
import PostVote from '../models/PostVote.js';
import ChannelFollow from '../models/ChannelFollow.js';
import { requireAuth } from '../middleware/auth.js';
import { requireChannelAdmin } from '../middleware/channelPermissions.js';

const router = express.Router();

// ---- Discovery ----

router.get('/', async (req, res) => {
  try {
    const { ownerType } = req.query;
    const filter = ownerType ? { ownerType } : {};
    const channels = await Channel.find(filter).select('-admins').sort({ followerCount: -1 });
    res.json({ channels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load channel' });
  }
});

/**
 * Channel creation is gated per spec — this is NOT a public "anyone can
 * create a channel" route. Restrict this to a platform-admin role once
 * LASU Connect has one; for now it exists so the workflow can be built,
 * but should sit behind whatever the team decides "LASU Connect team
 * approval" means in practice (a request queue is spec'd — see note
 * below, not built in v1).
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const channel = await Channel.create({
      ...req.body,
      admins: [{ user: req.auth.id, scope: null }],
      createdBy: req.auth.id,
    });
    res.status(201).json({ channel });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create channel' });
  }
});

// ---- Posts within a channel ----

router.get('/:id/posts', async (req, res) => {
  try {
    const { sort = 'top' } = req.query; // 'top' or 'new'
    const sortSpec = sort === 'new' ? { createdAt: -1 } : { upvoteCount: -1, createdAt: -1 };
    const posts = await ChannelPost.find({ channel: req.params.id })
      .populate('author', 'name')
      .sort(sortSpec);
    res.json({ posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

/**
 * Posting is open to individual students within a channel, per spec —
 * not admin-only. Only channel creation itself is gated.
 */
router.post('/:id/posts', requireAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const post = await ChannelPost.create({
      channel: channel._id,
      author: req.auth.id,
      content: req.body.content,
      images: req.body.images || [],
      event: req.body.event,
    });
    res.status(201).json({ post });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create post' });
  }
});

router.post('/posts/:postId/upvote', requireAuth, async (req, res) => {
  try {
    const existing = await PostVote.findOne({ post: req.params.postId, user: req.auth.id });
    if (existing) {
      // toggle off — un-voting
      await existing.deleteOne();
      const post = await ChannelPost.findByIdAndUpdate(
        req.params.postId,
        { $inc: { upvoteCount: -1 } },
        { new: true }
      );
      return res.json({ upvoted: false, upvoteCount: post.upvoteCount });
    }
    await PostVote.create({ post: req.params.postId, user: req.auth.id });
    const post = await ChannelPost.findByIdAndUpdate(
      req.params.postId,
      { $inc: { upvoteCount: 1 } },
      { new: true }
    );
    res.json({ upvoted: true, upvoteCount: post.upvoteCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register vote' });
  }
});

// ---- Follow / pin ----

router.post('/:id/follow', requireAuth, async (req, res) => {
  try {
    const existing = await ChannelFollow.findOne({ channel: req.params.id, user: req.auth.id });
    if (existing) return res.status(409).json({ error: 'Already following this channel' });
    await ChannelFollow.create({ channel: req.params.id, user: req.auth.id });
    await Channel.findByIdAndUpdate(req.params.id, { $inc: { followerCount: 1 } });
    res.status(201).json({ followed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to follow channel' });
  }
});

router.delete('/:id/follow', requireAuth, async (req, res) => {
  try {
    const deleted = await ChannelFollow.findOneAndDelete({ channel: req.params.id, user: req.auth.id });
    if (deleted) await Channel.findByIdAndUpdate(req.params.id, { $inc: { followerCount: -1 } });
    res.json({ followed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unfollow channel' });
  }
});

router.patch('/:id/pin', requireAuth, async (req, res) => {
  try {
    const { pinned } = req.body;
    const follow = await ChannelFollow.findOneAndUpdate(
      { channel: req.params.id, user: req.auth.id },
      { pinned: !!pinned },
      { new: true, upsert: true }
    );
    res.json({ pinned: follow.pinned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update pin' });
  }
});

router.get('/me/sidebar', requireAuth, async (req, res) => {
  try {
    const pinned = await ChannelFollow.find({ user: req.auth.id, pinned: true }).populate('channel');
    res.json({ pinnedChannels: pinned.map((f) => f.channel) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load sidebar' });
  }
});

// ---- Admin management ----

router.post('/:id/admins', requireAuth, requireChannelAdmin, async (req, res) => {
  try {
    if (req.channelAdminEntry.scope !== null) {
      return res.status(403).json({ error: 'Only a full admin can add other admins' });
    }
    const { userId, scope, scopedEventId } = req.body;
    req.channel.admins.push({ user: userId, scope: scope || null, scopedEventId });
    await req.channel.save();
    res.json({ channel: req.channel });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to add admin' });
  }
});

export default router;
