// ── One-time backfill: add existing users to their department+level groups ──
//
// Run this once after deploying the department-group auto-join feature,
// to retroactively group students who registered before this existed.
//
// Usage:
//   node scripts/backfillDeptGroups.js
//
// Safe to re-run — addUserToDeptLevelGroup is idempotent (checks for
// existing membership before adding).

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { addUserToDeptLevelGroup } = require('../utils/deptGroups');

async function run() {
  await connectDB();
  console.log('Connected. Starting department-group backfill...\n');

  const users = await User.find({
    isVerified: true,
    department: { $exists: true, $ne: null, $ne: 'Pending' },
    level: { $exists: true, $ne: null },
  }).select('_id displayName department level');

  console.log(`Found ${users.length} verified users with department+level set.\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await addUserToDeptLevelGroup(user._id, user.department, user.level);
      added++;
      process.stdout.write(`\r  Processed ${added + skipped}/${users.length}...`);
    } catch (err) {
      failed++;
      console.error(`\nFailed for user ${user._id} (${user.displayName}):`, err.message);
    }
  }

  console.log(`\n\nDone. Processed: ${added}, Failed: ${failed}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill script crashed:', err);
  process.exit(1);
});
