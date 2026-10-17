// ── Create the day-one channels and set who runs them ───────────────
//
// Reads scripts/channels.seed.json. Safe to re-run: it only creates channels
// that don't exist yet, and only ADDS admins (never removes anyone).
//
//   node scripts/seedChannels.js --admin you@st.lasu.edu.ng            (look first)
//   node scripts/seedChannels.js --admin you@st.lasu.edu.ng --apply    (do it)
//
// --admin is YOUR account: it becomes a platform admin and is an admin of every
// channel created, so you can post and manage them until each channel's own
// people are added to the JSON file.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Channel = require('../models/Channel');

const APPLY = process.argv.includes('--apply');
const argAfter = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : undefined; };
const OWNER_TYPES = ['sug', 'faculty', 'department', 'brand', 'admin_office', 'student'];
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

async function run() {
  const adminEmail = (argAfter('--admin') || '').toLowerCase().trim();
  if (!adminEmail) {
    console.error('Please pass your own account email, e.g.  node scripts/seedChannels.js --admin you@st.lasu.edu.ng');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'channels.seed.json'), 'utf8'));

  await connectDB();
  console.log(APPLY ? '*** APPLY MODE: changes WILL be made ***\n' : 'DRY RUN: nothing will be changed. Add --apply to make the changes.\n');

  const platformAdmin = await User.findOne({ email: adminEmail, isVerified: true });
  if (!platformAdmin) {
    console.error(`No verified LASU Connect account found for ${adminEmail}. Register it first, then run this again.`);
    await mongoose.disconnect(); process.exit(1);
  }
  if (platformAdmin.role !== 'admin') {
    console.log(`Platform admin: ${adminEmail} (role is "${platformAdmin.role}", will be set to "admin")`);
    if (APPLY) await User.updateOne({ _id: platformAdmin._id }, { $set: { role: 'admin' } });
  } else {
    console.log(`Platform admin: ${adminEmail} (already admin)`);
  }

  const emailCache = new Map();
  const findUser = async (email) => {
    const key = String(email).toLowerCase().trim();
    if (!emailCache.has(key)) emailCache.set(key, await User.findOne({ email: key, isVerified: true }).select('_id email displayName'));
    return emailCache.get(key);
  };
  const missingAccounts = new Set();

  let created = 0, updated = 0, unchanged = 0;
  for (const c of config.channels) {
    if (!OWNER_TYPES.includes(c.ownerType)) { console.error(`  !! "${c.name}": unknown ownerType "${c.ownerType}", skipped`); continue; }
    const slug = c.slug || slugify(c.name);

    // who should be an admin: you, plus anyone listed who has an account
    const wanted = [platformAdmin._id];
    for (const email of c.admins || []) {
      const u = await findUser(email);
      if (u) wanted.push(u._id); else missingAccounts.add(`${email} (for ${c.name})`);
    }

    const existing = await Channel.findOne({ slug });
    if (!existing) {
      console.log(`  CREATE  ${c.name}  [${c.ownerType}, posting: ${c.postingMode || 'admins'}]  admins: ${wanted.length}`);
      if (APPLY) {
        await Channel.create({
          name: c.name, slug, description: c.description || '', ownerType: c.ownerType,
          postingMode: c.postingMode || 'admins',
          admins: wanted.map((id) => ({ user: id, scope: null })),
          createdBy: platformAdmin._id,
        });
      }
      created++;
      continue;
    }

    const have = new Set(existing.admins.map((a) => String(a.user)));
    const toAdd = wanted.filter((id) => !have.has(String(id)));
    if (!toAdd.length) { console.log(`  ok      ${c.name}  (already exists, admins up to date)`); unchanged++; continue; }
    console.log(`  UPDATE  ${c.name}  (adding ${toAdd.length} admin${toAdd.length > 1 ? 's' : ''})`);
    if (APPLY) { existing.admins.push(...toAdd.map((id) => ({ user: id, scope: null }))); await existing.save(); }
    updated++;
  }

  console.log('\nEvent creators:');
  if (!(config.eventCreators || []).length) console.log('  none listed');
  for (const email of config.eventCreators || []) {
    const u = await findUser(email);
    if (!u) { missingAccounts.add(`${email} (event creator)`); continue; }
    const full = await User.findById(u._id).select('role displayName');
    if (full.role === 'student') {
      console.log(`  ${email}: will be allowed to publish events (role -> official)`);
      if (APPLY) await User.updateOne({ _id: u._id }, { $set: { role: 'official' } });
    } else {
      console.log(`  ${email}: already allowed (role is ${full.role})`);
    }
  }

  if (missingAccounts.size) {
    console.log('\nNo LASU Connect account yet (they must register first, then re-run this):');
    for (const m of missingAccounts) console.log('  - ' + m);
  }

  console.log(`\nDone. Channels ${APPLY ? 'created' : 'to create'}: ${created}. ${APPLY ? 'Updated' : 'To update'}: ${updated}. Already fine: ${unchanged}.`);
  if (!APPLY) console.log('No changes were made.');
  await mongoose.disconnect();
}

run().catch((err) => { console.error('Seed script crashed:', err); process.exit(1); });
