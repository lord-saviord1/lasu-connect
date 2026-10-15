// ── Merge duplicate department groups and tidy memberships ─────────
//
// Two department groups can end up as duplicates of each other (for
// example two requests creating the "same" group at the same instant).
// This script:
//   1. Finds duplicate department groups (same department + level,
//      ignoring capitals and extra spaces) and merges each set into one.
//      Members, admins, pinned messages and ALL messages move to the
//      survivor, then the emptied duplicate is deleted. The survivor is
//      the group with the most messages (then most members, then oldest).
//   2. Makes sure every verified student is in exactly ONE department
//      group: the one matching their department + level.
//   3. Adds the unique index that stops duplicates being created again.
//
// DRY RUN by default: it prints what it WOULD do and changes nothing.
//   node scripts/mergeDuplicateDeptGroups.js            (look first)
//   node scripts/mergeDuplicateDeptGroups.js --apply    (do it)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { reassignDeptLevelGroup } = require('../utils/deptGroups');

const APPLY = process.argv.includes('--apply');

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const keyOf = (department, level) => norm(department) + '|' + norm(level);

// Which group in a duplicate set survives: most messages, then most
// members, then the oldest.
function pickCanonical(groups) {
  return [...groups].sort((a, b) =>
    (b.messageCount - a.messageCount) ||
    (b.memberCount - a.memberCount) ||
    (new Date(a.createdAt) - new Date(b.createdAt))
  )[0];
}

// Sets of 2+ groups that are really the same department + level.
function findDuplicateClusters(groups) {
  const byKey = new Map();
  for (const g of groups) {
    const k = keyOf(g.department, g.level);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(g);
  }
  return [...byKey.values()].filter((c) => c.length > 1);
}

async function run() {
  await connectDB();
  console.log(APPLY
    ? '*** APPLY MODE: changes WILL be made ***\n'
    : 'DRY RUN: nothing will be changed. Add --apply to make the changes.\n');

  // ---- load everything ----
  const docs = await Conversation.find({ type: 'group', groupType: 'department_level' });
  const groups = [];
  for (const doc of docs) {
    groups.push({
      id: String(doc._id), doc, name: doc.name, department: doc.department, level: doc.level,
      memberCount: doc.members.length,
      messageCount: await Message.countDocuments({ conversationId: doc._id }),
      createdAt: doc.createdAt,
    });
  }
  console.log(`All department groups (${groups.length}):`);
  for (const g of groups) {
    console.log(`  ${g.id}  "${g.name}"  dept=${JSON.stringify(g.department)} (${String(g.department || '').length} chars)  level=${JSON.stringify(g.level)}  members=${g.memberCount}  messages=${g.messageCount}`);
  }

  const users = await User.find({
    isVerified: true,
    department: { $nin: [null, 'Pending'] },
    level: { $nin: [null, 'Pending'] },
  }).select('_id displayName department level');

  // ---- step 1: merge duplicate groups ----
  console.log('\nSTEP 1: duplicate groups');
  const survivorOf = new Map(groups.map((g) => [g.id, g.id])); // group id -> surviving group id
  const clusters = findDuplicateClusters(groups);
  let removed = 0;
  if (!clusters.length) console.log('  none found.');

  for (const cluster of clusters) {
    const keep = pickCanonical(cluster);
    console.log(`\n  Duplicate set: ${cluster.map((g) => g.id).join(', ')}`);
    console.log(`    KEEP   ${keep.id}  (${keep.memberCount} members, ${keep.messageCount} messages)`);

    // Make the survivor use the exact spelling students actually have,
    // so later lookups find it instead of creating a fresh group.
    const spellings = new Map();
    for (const u of users.filter((u) => keyOf(u.department, u.level) === keyOf(keep.department, keep.level))) {
      const k = JSON.stringify([u.department, u.level]);
      spellings.set(k, (spellings.get(k) || 0) + 1);
    }
    const top = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [dept, lvl] = JSON.parse(top[0]);
      if (dept !== keep.department || lvl !== keep.level) {
        console.log(`    RESPELL survivor to match students: ${JSON.stringify([keep.department, keep.level])} -> ${JSON.stringify([dept, lvl])}`);
        if (APPLY) await Conversation.updateOne({ _id: keep.doc._id }, { $set: { department: dept, level: lvl, name: `${dept} · ${lvl}` } });
        keep.department = dept; keep.level = lvl; keep.name = `${dept} · ${lvl}`;
      }
    }

    for (const dup of cluster.filter((g) => g.id !== keep.id)) {
      survivorOf.set(dup.id, keep.id);
      console.log(`    MERGE  ${dup.id} into it  (${dup.memberCount} members, ${dup.messageCount} messages), then delete it`);
      if (!APPLY) continue;

      await Conversation.updateOne({ _id: keep.doc._id }, {
        $addToSet: {
          members: { $each: dup.doc.members },
          admins: { $each: dup.doc.admins || [] },
          pinnedMessages: { $each: dup.doc.pinnedMessages || [] },
        },
      });
      const moved = await Message.updateMany({ conversationId: dup.doc._id }, { $set: { conversationId: keep.doc._id } });
      if (moved.modifiedCount !== dup.messageCount) {
        console.error(`    !! moved ${moved.modifiedCount} of ${dup.messageCount} messages. NOT deleting ${dup.id}; please send me this output.`);
        continue;
      }
      if (dup.doc.lastMessage && dup.doc.lastMessage.timestamp &&
          (!keep.doc.lastMessage || !keep.doc.lastMessage.timestamp || new Date(dup.doc.lastMessage.timestamp) > new Date(keep.doc.lastMessage.timestamp))) {
        await Conversation.updateOne({ _id: keep.doc._id }, { $set: { lastMessage: dup.doc.lastMessage } });
      }
      await Conversation.deleteOne({ _id: dup.doc._id });
      removed++;
    }
  }

  // ---- step 2: every student in exactly one department group ----
  console.log('\nSTEP 2: students who are not in exactly one correct department group');
  const membership = new Map(); // user id -> Set(surviving group ids)
  for (const g of groups) {
    for (const m of g.doc.members) {
      const k = String(m);
      if (!membership.has(k)) membership.set(k, new Set());
      membership.get(k).add(survivorOf.get(g.id));
    }
  }
  const survivors = groups.filter((g) => survivorOf.get(g.id) === g.id);
  let moved = 0;
  for (const u of users) {
    const target = survivors.find((g) => keyOf(g.department, g.level) === keyOf(u.department, u.level));
    const current = membership.get(String(u._id)) || new Set();
    if (target && current.size === 1 && current.has(target.id)) continue;
    moved++;
    console.log(`  ${u.displayName}: now in [${[...current].join(', ') || 'no department group'}] -> should be only in ${target ? `${target.id} "${target.name}"` : `a NEW group for ${u.department} · ${u.level}`}`);
    if (APPLY) await reassignDeptLevelGroup(u._id, target ? target.department : u.department, target ? target.level : u.level);
  }
  if (!moved) console.log('  none: everyone is already correct.');

  // ---- step 3: the unique index ----
  console.log('\nSTEP 3: unique index (stops duplicates being created again)');
  if (APPLY) {
    try { await Conversation.collection.dropIndex('groupType_1_department_1_level_1'); console.log('  dropped the old non-unique index'); }
    catch (e) { console.log(`  old index not dropped (${e.codeName || e.message}), carrying on`); }
    await Conversation.collection.createIndex(
      { groupType: 1, department: 1, level: 1 },
      { unique: true, partialFilterExpression: { groupType: 'department_level' } }
    );
    console.log('  created the unique index');
  } else {
    console.log('  would drop the old index and create the unique one.');
  }

  console.log(`\nDone. Duplicate sets: ${clusters.length}. Duplicate groups ${APPLY ? 'removed' : 'that would be removed'}: ${APPLY ? removed : clusters.reduce((n, c) => n + c.length - 1, 0)}. Students ${APPLY ? 'moved' : 'that would be moved'}: ${moved}.`);
  if (!APPLY) console.log('No changes were made.');
  await mongoose.disconnect();
}

module.exports = { norm, pickCanonical, findDuplicateClusters };

if (require.main === module) {
  run().catch((err) => { console.error('Merge script crashed:', err); process.exit(1); });
}
