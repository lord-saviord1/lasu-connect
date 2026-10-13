// One-off cleanup: reset any avatar / group icon already in the database
// that contains markup characters or is unreasonably long.
//
// The app now escapes these when rendering and rejects them on save, so
// this just removes leftovers. Safe to re-run.
//
// Usage (from the backend folder):  node scripts/sanitizeAvatars.js

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { isSafeAvatar } = require('../utils/validators');

async function run() {
  await connectDB();

  const users = await User.find({}).select('_id displayName avatar');
  let badUsers = 0;
  for (const u of users) {
    if (!isSafeAvatar(u.avatar)) {
      badUsers++;
      console.log(`User ${u._id} (${u.displayName}) had a bad avatar: ${JSON.stringify(u.avatar).slice(0, 80)}`);
      await User.updateOne({ _id: u._id }, { avatar: '👨🏾‍🎓' });
    }
  }

  const convos = await Conversation.find({ type: 'group' }).select('_id name icon');
  let badGroups = 0;
  for (const c of convos) {
    if (!isSafeAvatar(c.icon)) {
      badGroups++;
      console.log(`Group ${c._id} (${c.name}) had a bad icon: ${JSON.stringify(c.icon).slice(0, 80)}`);
      await Conversation.updateOne({ _id: c._id }, { icon: '💬' });
    }
  }

  console.log(`\nChecked ${users.length} users and ${convos.length} groups.`);
  console.log(`Reset ${badUsers} bad avatar(s) and ${badGroups} bad group icon(s).`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error('Sanitize script crashed:', err); process.exit(1); });
