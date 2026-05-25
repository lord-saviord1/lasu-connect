const bcrypt = require('bcryptjs');

// Returns { raw, hash }
// raw  → sent in the email to the student
// hash → stored in the database
const generateOTP = async () => {
  const raw  = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const hash = await bcrypt.hash(raw, 10);
  return { raw, hash };
};

module.exports = generateOTP;
