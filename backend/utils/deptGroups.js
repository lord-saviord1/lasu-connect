const Conversation = require('../models/Conversation');

// ── Department + Level auto-groups ────────────────────────────────
//
// Every student is automatically placed in a group scoped to their
// exact department + level (e.g. "Computer Science · 300 Level").
// These are identified by groupType: 'department_level' on the
// Conversation model, so they're distinguishable from manually-created
// groups (e.g. for a future "you can't leave this group" UI rule).
//
// Students are NOT allowed to leave these groups — that restriction
// lives in the leave-group route, not here; this file only handles
// finding/creating the group and adding a member to it.
//
// No admin is auto-assigned. Class reps / Heads of Course get admin
// rights manually, by contacting the LASU Connect team.

function deptLevelGroupName(department, level) {
  return `${department} · ${level}`;
}

/**
 * Finds the department+level group for the given department/level,
 * creating it if it doesn't exist yet. Returns the Conversation doc.
 */
async function getOrCreateDeptLevelGroup(department, level) {
  if (!department || !level) {
    throw new Error('department and level are required to resolve a department group.');
  }

  let group = await Conversation.findOne({
    type: 'group',
    groupType: 'department_level',
    department,
    level,
  });

  if (!group) {
    group = await Conversation.create({
      type: 'group',
      name: deptLevelGroupName(department, level),
      icon: '🎓',
      members: [],
      admins: [], // no default admin — assigned manually later
      groupType: 'department_level',
      department,
      level,
    });
  }

  return group;
}

/**
 * Adds a user to their department+level group, creating the group if
 * needed. Idempotent — safe to call even if the user is already a
 * member (e.g. re-running the backfill script, or a profile PATCH that
 * doesn't actually change department/level).
 */
async function addUserToDeptLevelGroup(userId, department, level) {
  const group = await getOrCreateDeptLevelGroup(department, level);

  const alreadyMember = group.members.some((m) => String(m) === String(userId));
  if (!alreadyMember) {
    group.members.push(userId);
    await group.save();
  }

  return group;
}

module.exports = { getOrCreateDeptLevelGroup, addUserToDeptLevelGroup, deptLevelGroupName };
