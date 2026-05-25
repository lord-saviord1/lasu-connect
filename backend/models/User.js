const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  displayName:  { type: String, required: true, trim: true },
  email: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    validate: {
      validator: v => v.endsWith('@st.lasu.edu.ng'),
      message: 'Only @st.lasu.edu.ng email addresses are allowed.'
    }
  },
  matricNumber: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  faculty:      { type: String, required: true },
  department:   { type: String, required: true },
  level:        { type: String, required: true },
  avatar:       { type: String, default: '👨🏾‍🎓' },
  isVerified:   { type: Boolean, default: false },
  isOnline:     { type: Boolean, default: false },
  lastSeen:     { type: Date,    default: Date.now },
  role:         { type: String,  enum: ['student','official','admin'], default: 'student' },
  socketId:     { type: String,  default: null },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Compare submitted password against stored hash
userSchema.methods.comparePassword = async function(submitted) {
  return bcrypt.compare(submitted, this.passwordHash);
};

// Never return passwordHash in JSON responses
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.socketId;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
