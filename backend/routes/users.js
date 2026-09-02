const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');
const { addUserToDeptLevelGroup } = require('../utils/deptGroups');

// All user routes require authentication
router.use(protect);

// ── GET /api/users/search?q=name_or_matric ────────────────
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters.' });
    }

    const trimmed = q.trim();

    // BUG FIX 1: Use anchored regex for matricNumber so "24" only matches
    // matric numbers that START with "24", not ones that merely contain it.
    // displayName / fullName / department keep the loose contains-match.
    const looseRegex  = new RegExp(trimmed, 'i');
    const strictRegex = new RegExp('^' + trimmed, 'i'); // starts-with for matric

    const users = await User.find({
      $or: [
        { displayName:  looseRegex  },
        { fullName:     looseRegex  },
        { matricNumber: strictRegex }, // anchored — must START with the query
        { department:   looseRegex  },
      ]
    })
    .select('displayName fullName avatar faculty department level isOnline lastSeen matricNumber')
    .limit(20);

    res.json({ success: true, count: users.length, users });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('displayName fullName avatar faculty department level isOnline lastSeen role');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── PATCH /api/users/profile ──────────────────────────────
router.patch('/profile', async (req, res) => {
  try {
    const allowed = ['displayName', 'avatar', 'faculty', 'department', 'level'];
    const updates = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });

    // Auto-join the student's department+level group once both fields
    // are known. Safe to call repeatedly — addUserToDeptLevelGroup is
    // idempotent, so re-saving a profile without changing dept/level
    // won't create duplicates or double-add.
    if (user.department && user.level) {
      try {
        await addUserToDeptLevelGroup(user._id, user.department, user.level);
      } catch (groupErr) {
        // Don't fail the whole profile update if group assignment has
        // an issue — log it so it's visible, but the user's profile
        // save should still succeed.
        console.error('Department group auto-join failed:', groupErr);
      }
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
