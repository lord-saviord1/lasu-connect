const Conversation = require('../models/Conversation');

// ── Department + Level auto-groups ────────────────────────────────
//
// Every student is automatically placed in a group scoped to their
// exact department + level (e.g. "Computer Science · 300 Level").
// These are identified by groupType: 'department_level' on the
// Conversation model, so they're distinguishable from manually-created
// groups.
//
// Students are NOT allowed to leave these groups — that restriction
// lives in the leave-group route, not here; this file only handles
// finding/creating the group and moving members in and out.
//
// No admin is auto-assigned. Class reps / Heads of Course get admin
// rights manually, by contacting the LASU Connect team.
//
// Everything here is ATOMIC on purpose. Many students register at the
// same moment, so "look it up, then create it" or "load the group, push
// a member, save it" would let simultaneous requests create duplicate
// groups or overwrite each other. The database enforces one group per
// department+level (unique partial index on the Conversation model);
// if two requests collide, the loser simply reads the winner's group.

function deptLevelGroupName(department, level) {
  return `${department} · ${level}`;
}

/**
 * Finds the department+level group, creating it if it doesn't exist.
 * Safe to call from many requests at once.
 */
async function getOrCreateDeptLevelGroup(department, level) {
  if (!department || !level) {
    throw new Error('department and level are required to resolve a department group.');
  }

  const filter = { type: 'group', groupType: 'department_level', department, level };

  try {
    return await Conversation.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          name: deptLevelGroupName(department, level),
          icon: '🎓',
          members: [],
          admins: [], // no default admin — assigned manually later
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // Another request created it at the same instant (unique index hit).
    // Read the group it made instead of failing.
    if (err && err.code === 11000) {
      const existing = await Conversation.findOne(filter);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Adds a user to their department+level group, creating the group if
 * needed. Idempotent ($addToSet) — safe to call repeatedly.
 */
async function addUserToDeptLevelGroup(userId, department, level) {
  const group = await getOrCreateDeptLevelGroup(department, level);
  await Conversation.updateOne({ _id: group._id }, { $addToSet: { members: userId } });
  return group;
}

/**
 * Moves a user OUT of every other department group they're in and INTO
 * the correct one for the given department/level. Used when a student's
 * true department/level changes (e.g. their level was corrected against
 * their matric number, or they genuinely transferred).
 *
 * Intentionally bypasses the "can't leave your department group" rule
 * of the student-facing leave route: that rule stops a student opting
 * out; it must not stop the system correcting a wrong membership. If
 * the user was an admin of a group they're moved out of, that admin
 * role is removed too.
 *
 * Returns { newGroup, removedFromGroupIds }.
 */
async function reassignDeptLevelGroup(userId, correctDepartment, correctLevel) {
  const correctGroup = await getOrCreateDeptLevelGroup(correctDepartment, correctLevel);

  const staleGroups = await Conversation.find({
    type: 'group',
    groupType: 'department_level',
    members: userId,
    _id: { $ne: correctGroup._id },
  });
  const removedFromGroupIds = staleGroups.map((g) => g._id);

  if (removedFromGroupIds.length) {
    await Conversation.updateMany(
      { _id: { $in: removedFromGroupIds } },
      { $pull: { members: userId, admins: userId } }
    );
  }

  await Conversation.updateOne({ _id: correctGroup._id }, { $addToSet: { members: userId } });

  return { newGroup: correctGroup, removedFromGroupIds };
}

module.exports = { getOrCreateDeptLevelGroup, addUserToDeptLevelGroup, reassignDeptLevelGroup, deptLevelGroupName };
