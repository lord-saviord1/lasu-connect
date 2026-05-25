const express       = require('express');
const router        = express.Router();
const rateLimit     = require('express-rate-limit');
const jwt           = require('jsonwebtoken');
const User          = require('../models/User');
const OTP           = require('../models/OTP');
const generateOTP   = require('../utils/generateOTP');
const { sendOTPEmail } = require('../utils/mailer');
const validateLasuMail = require('../middleware/lasuMail');
const { protect }   = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({ success: true, token, user });
};

// ── Rate limiters ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 10 minutes.' }
});

// ── POST /api/auth/register ───────────────────────────────
// Creates a new (unverified) user and sends OTP to LASU Mail
router.post('/register', authLimiter, validateLasuMail, async (req, res) => {
  try {
    const { fullName, displayName, email, matricNumber, password, faculty, department, level, avatar } = req.body;

    // Basic field checks
    const required = { fullName, displayName, email, matricNumber, password, faculty, department, level };
    for (const [key, val] of Object.entries(required)) {
      if (!val || !String(val).trim()) {
        return res.status(400).json({ success: false, message: `${key} is required.` });
      }
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check for duplicates
    const existingEmail  = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this LASU Mail already exists.' });
    }
    const existingMatric = await User.findOne({ matricNumber: matricNumber.trim() });
    if (existingMatric) {
      return res.status(409).json({ success: false, message: 'An account with this matric number already exists.' });
    }

    // Create user (not yet verified)
    const user = await User.create({
      fullName:     fullName.trim(),
      displayName:  displayName.trim(),
      email:        email.toLowerCase().trim(),
      matricNumber: matricNumber.trim().toUpperCase(),
      passwordHash: password, // pre-save hook hashes this
      faculty,
      department,
      level,
      avatar:       avatar || '👨🏾‍🎓',
      isVerified:   false,
    });

    // Generate and store OTP
    const { raw, hash } = await generateOTP();
    await OTP.create({
      email:     user.email,
      codeHash:  hash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Send OTP email
    await sendOTPEmail(user.email, raw);

    res.status(201).json({
      success: true,
      message: `Verification code sent to ${user.email}. Check your LASU Mail inbox.`,
      email: user.email, // return so frontend can prefill OTP screen
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
// Verifies the 6-digit code and activates the account
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required.' });
    }

    // Find the most recent unused OTP for this email
    const otpDoc = await OTP.findOne({ email: email.toLowerCase(), used: false }).sort({ createdAt: -1 });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'No active OTP found. Please request a new one.' });
    }

    const { ok, reason } = await otpDoc.isValid(code.trim());
    if (!ok) {
      return res.status(400).json({ success: false, message: reason });
    }

    // Mark OTP as used
    otpDoc.used = true;
    await otpDoc.save();

    // Activate user
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isVerified: true },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    sendTokenResponse(user, 200, res);

  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/resend-otp ─────────────────────────────
// Resends a fresh OTP (rate limited to 5 per 10 mins)
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)       return res.status(404).json({ success: false, message: 'No account found with this email.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified.' });

    const { raw, hash } = await generateOTP();
    await OTP.create({
      email:     user.email,
      codeHash:  hash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await sendOTPEmail(user.email, raw);

    res.json({ success: true, message: 'New OTP sent to your LASU Mail.' });

  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', authLimiter, validateLasuMail, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Explicitly select passwordHash (excluded by default)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your LASU Mail before logging in.' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    sendTokenResponse(user, 200, res);

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
// Returns the current logged-in user's profile
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password', otpLimiter, validateLasuMail, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
    }

    const { raw, hash } = await generateOTP();
    await OTP.create({
      email:     user.email,
      codeHash:  hash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await sendOTPEmail(user.email, raw);

    res.json({ success: true, message: 'Password reset code sent to your LASU Mail.' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────
router.post('/reset-password', otpLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, code, and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const otpDoc = await OTP.findOne({ email: email.toLowerCase(), used: false }).sort({ createdAt: -1 });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'No active reset code found.' });
    }

    const { ok, reason } = await otpDoc.isValid(code.trim());
    if (!ok) return res.status(400).json({ success: false, message: reason });

    otpDoc.used = true;
    await otpDoc.save();

    const user = await User.findOne({ email: email.toLowerCase() });
    user.passwordHash = newPassword; // pre-save hook rehashes
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
