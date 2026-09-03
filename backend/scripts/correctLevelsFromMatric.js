// ── One-time correction: fix Level field from matric number, reassign groups ──
//
// For every existing verified user, this derives what their Level
// SHOULD be based on their matric number (see utils/matricLevel.js),
// and if it doesn't match what's currently stored:
//   1. Updates User.level to the correct value
//   2. Removes them from their old (now-incorrect) department+level group
//   3. Adds them to the correct department+level group
//
// This intentionally overrides the "can't leave your department group"
// rule — that rule stops a STUDENT choosing to leave; this is the
// system correcting a data error, which is different.
//
// Usage:
//   node scripts/correctLevelsFromMatric.js
//
// Safe to re-run — anyone already correct is skipped and left alone.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { deriveLevelFromMatric } = require('../utils/matricLevel');
const { reassignDeptLevelGroup } = require('../utils/deptGroups');

async function run() {
  await connectDB();
  console.log('Connected. Starting level correction from matric numbers...\n');

  const users = await User.find({
    isVerified: true,
    department: { $exists: true, $ne: null, $ne: 'Pending' },
  }).select('_id displayName matricNumber department level');

  console.log(`Found ${users.length} verified users with a department set.\n`);

  let correct = 0;
  let fixed = 0;
  let undeterminable = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const derivedLevel = deriveLevelFromMatric(user.matricNumber);

      if (!derivedLevel) {
        undeterminable++;
        console.log(`\n  Skipped ${user.displayName} (${user._id}) — matric "${user.matricNumber}" doesn't yield a derivable level.`);
        continue;
      }

      if (derivedLevel === user.level) {
        correct++;
        continue;
      }

      // Mismatch found — correct it.
      const oldLevel = user.level;
      user.level = derivedLevel;
      await user.save();

      await reassignDeptLevelGroup(user._id, user.department, derivedLevel);

      fixed++;
      console.log(`\n  Fixed ${user.displayName} (${user._id}): "${oldLevel}" -> "${derivedLevel}" (matric ${user.matricNumber})`);
    } catch (err) {
      failed++;
      console.error(`\n  Failed for user ${user._id} (${user.displayName}):`, err.message);
    }
  }

  console.log(`\n\nDone.`);
  console.log(`  Already correct: ${correct}`);
  console.log(`  Fixed:           ${fixed}`);
  console.log(`  Undeterminable:  ${undeterminable} (matric number didn't parse — left untouched)`);
  console.log(`  Failed:          ${failed}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Correction script crashed:', err);
  process.exit(1);
});
