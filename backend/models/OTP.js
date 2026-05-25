const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const otpSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  codeHash:  { type: String, required: true },
  expiresAt: { type: Date,   required: true },
  used:      { type: Boolean, default: false },
}, { timestamps: true });

// Auto-delete expired OTP documents (MongoDB TTL index)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.methods.isValid = async function(submitted) {
  if (this.used)                     return { ok: false, reason: 'OTP already used.' };
  if (new Date() > this.expiresAt)   return { ok: false, reason: 'OTP has expired. Request a new one.' };
  const match = await bcrypt.compare(submitted, this.codeHash);
  if (!match)                        return { ok: false, reason: 'Incorrect OTP code.' };
  return { ok: true };
};

module.exports = mongoose.model('OTP', otpSchema);
