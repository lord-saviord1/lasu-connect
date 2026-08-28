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
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 10 minutes.' }
});

// ── POST /api/auth/register ───────────────────────────────
router.post('/register', authLimiter, validateLasuMail, async (req, res) => {
  try {
    const { fullName, displayName, email, matricNumber, password, faculty, department, level, avatar } = req.body;

    const required = { fullName, displayName, email, matricNumber, password, faculty, department, level };
    for (const [key, val] of Object.entries(required)) {
      if (!val || !String(val).trim()) {
        return res.status(400).json({ success: false, message: `${key} is required.` });
      }
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedMatric = matricNumber.trim().toUpperCase();

    // ── KEY FIX: If email exists but unverified, delete and allow re-registration ──
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      if (!existingEmail.isVerified) {
        // Clean up stale unverified account and its OTPs so they can start fresh
        await OTP.deleteMany({ email: normalizedEmail });
        await User.deleteOne({ _id: existingEmail._id });
      } else {
        return res.status(409).json({ success: false, message: 'An account with this LASU Mail already exists.' });
      }
    }

    // Check matric number — only block if the existing account is verified
    const existingMatric = await User.findOne({ matricNumber: normalizedMatric });
    if (existingMatric) {
      if (existingMatric.isVerified) {
        return res.status(409).json({ success: false, message: 'An account with this matric number already exists.' });
      } else {
        // Clean up stale unverified account with same matric
        await OTP.deleteMany({ email: existingMatric.email });
        await User.deleteOne({ _id: existingMatric._id });
      }
    }

    // Create user (not yet verified)
    const user = await User.create({
      fullName:     fullName.trim(),
      displayName:  displayName.trim(),
      email:        normalizedEmail,
      matricNumber: normalizedMatric,
      passwordHash: password,
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
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Send OTP email — do not fail registration if email sending fails in development
    try {
      await sendOTPEmail(user.email, raw);

      return res.status(201).json({
        success: true,
        message: `Verification code sent to ${user.email}. Check your LASU Mail inbox.`,
        email: user.email,
      });

    } catch (mailErr) {
      console.error('Failed to send OTP email:', mailErr);

      if (process.env.NODE_ENV !== 'production') {
        // In development/testing environments return the OTP so testers can continue
        console.warn('Development mode: returning OTP in response for testing purposes. Do NOT enable in production.');
        return res.status(201).json({
          success: true,
          message: `Verification code generated for ${user.email}. Email delivery failed in development.`,
          email: user.email,
          devOtp: raw,
        });
      }

      // In production, surface a clear error to the client
      return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
    }

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required.' });
    }

    const otpDoc = await OTP.findOne({ email: email.toLowerCase(), used: false }).sort({ createdAt: -1 });
    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'No active OTP found. Please request a new one.' });
    }

    const { ok, reason } = await otpDoc.isValid(code.trim());
    if (!ok) {
      return res.status(400).json({ success: false, message: reason });
    }

    otpDoc.used = true;
    await otpDoc.save();

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
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)           return res.status(404).json({ success: false, message: 'No account found with this email.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified.' });

    // Invalidate all previous OTPs for this email
    await OTP.updateMany({ email: email.toLowerCase(), used: false }, { used: true });

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

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your LASU Mail before logging in.',
        unverified: true,
        email: user.email,
      });
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
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password', otpLimiter, validateLasuMail, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

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
    user.passwordHash = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
