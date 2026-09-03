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

/**
 * Moves a user OUT of their current department+level group(s) and INTO
 * the correct one for the given department/level. Used whenever a
 * student's true department/level changes — either because their
 * stored level was wrong and got corrected against their matric
 * number, or because they genuinely transferred department.
 *
 * This intentionally bypasses the "can't leave your department group"
 * rule that applies to the student-facing leave-group API route — that
 * rule exists to stop a student unilaterally opting out of their own
 * group, not to prevent the system from correcting group membership
 * when the underlying department/level itself has changed.
 *
 * Removes the user from every OTHER department_level group they're
 * currently in (there should normally be at most one, but this cleans
 * up regardless), then adds them to the correct one. Idempotent — safe
 * to call even if they're already correctly placed.
 *
 * Returns { newGroup, removedFromGroupIds }.
 */
async function reassignDeptLevelGroup(userId, correctDepartment, correctLevel) {
  const correctGroup = await getOrCreateDeptLevelGroup(correctDepartment, correctLevel);

  // Find every department_level group this user currently belongs to,
  // other than the correct one, and remove them.
  const staleGroups = await Conversation.find({
    type: 'group',
    groupType: 'department_level',
    members: userId,
    _id: { $ne: correctGroup._id },
  });

  const removedFromGroupIds = [];
  for (const stale of staleGroups) {
    stale.members = stale.members.filter((m) => String(m) !== String(userId));
    await stale.save();
    removedFromGroupIds.push(stale._id);
  }

  const alreadyInCorrectGroup = correctGroup.members.some((m) => String(m) === String(userId));
  if (!alreadyInCorrectGroup) {
    correctGroup.members.push(userId);
    await correctGroup.save();
  }

  return { newGroup: correctGroup, removedFromGroupIds };
}

module.exports = { getOrCreateDeptLevelGroup, addUserToDeptLevelGroup, reassignDeptLevelGroup, deptLevelGroupName };
