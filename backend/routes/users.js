const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { protect } = require('../middleware/auth');
const { addUserToDeptLevelGroup } = require('../utils/deptGroups');
const { deriveLevelFromMatric } = require('../utils/matricLevel');
const { isSafeAvatar } = require('../utils/validators');

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
// department and level are only settable ONCE — at first-time profile
// completion (registration's Step 3) — never editable afterward.
//
// Why: level must only ever reflect the matric-derived truth (see
// utils/matricLevel.js); letting students self-edit it after the fact
// defeats the point of deriving it, and silently creates incorrect
// department+level groups. CONFIRMED this exact bug happened: a
// student manually changed level to "200 Level" via this route, which
// created a brand-new 200L group and left them in both the old and
// new one simultaneously.
//
// department changes (genuine transfers) need a proper admin-reviewed
// flow that also triggers a real group reassignment (see
// utils/deptGroups.js reassignDeptLevelGroup) — not a silent self-edit
// that just adds them to a new group without removing the old one.
router.patch('/profile', async (req, res) => {
  try {
    const allowed = ['displayName', 'avatar'];
    const updates = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    // avatar is rendered as an emoji on other students' screens — never accept markup.
    if (updates.avatar !== undefined) {
      if (!isSafeAvatar(updates.avatar)) {
        return res.status(400).json({ success: false, message: 'Invalid avatar.' });
      }
      updates.avatar = updates.avatar.trim();
    }

    const currentUser = await User.findById(req.user._id);
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found.' });

    // faculty + department + level: only set ONCE, at first-time profile
    // completion right after registration — never as a later edit.
    // Level is derived here from the matric number; whatever the client
    // sends for level is ignored, so it can't be spoofed.
    const isFirstTimeCompletion = (!currentUser.department || currentUser.department === 'Pending');
    if (isFirstTimeCompletion && req.body.department !== undefined) {
      const derivedLevel = deriveLevelFromMatric(currentUser.matricNumber);
      if (!derivedLevel) {
        return res.status(400).json({ success: false, message: 'Could not determine your level from your matric number. Please contact support.' });
      }
      updates.department = req.body.department;
      updates.level = derivedLevel;
      if (req.body.faculty !== undefined) updates.faculty = req.body.faculty;
    }
    const completedDeptNow = updates.department !== undefined;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });

    // Auto-join the student's department+level group — only fires on
    // first-time completion, since that's the only path that can set
    // these fields at all via this route. Safe/idempotent regardless.
    if (completedDeptNow && user.department && user.level) {
      try {
        await addUserToDeptLevelGroup(user._id, user.department, user.level);
      } catch (groupErr) {
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
