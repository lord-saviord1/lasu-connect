const nodemailer = require('nodemailer');

// ── Round-Robin Email Sender with dev ethereal fallback and retries ──
// Production: requires EMAIL_ACCOUNTS or EMAIL_USER+EMAIL_PASS to be configured.
// Development: if no credentials provided, we create a nodemailer test account (ethereal)
// and log the preview URL so developers can inspect the message without a real SMTP server.

function parseAccountsFromEnv() {
  const raw = process.env.EMAIL_ACCOUNTS;
  if (raw) {
    return raw.split(',').map(entry => {
      const [user, pass] = entry.trim().split(':');
      return { user: user && user.trim(), pass: pass && pass.trim() };
    }).filter(a => a.user && a.pass);
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return [{ user: process.env.EMAIL_USER.trim(), pass: process.env.EMAIL_PASS.trim() }];
  }
  return [];
}

let accounts = parseAccountsFromEnv();
let _roundRobinIndex = 0;

function getNextAccount() {
  if (!accounts || accounts.length === 0) return null;
  const account = accounts[_roundRobinIndex % accounts.length];
  _roundRobinIndex++;
  return account;
}

async function createEtherealAccount() {
  const testAccount = await nodemailer.createTestAccount();
  return {
    user: testAccount.user,
    pass: testAccount.pass,
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    isEthereal: true,
  };
}

function createTransporterFromAccount(account) {
  // account may include host/port (for ethereal) or just user/pass for user-specified SMTP
  const host = account.host || process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = account.port ? parseInt(account.port, 10) : parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
}

async function sendWithRetry(transporter, mailOptions, attempts = 2) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return info;
    } catch (err) {
      lastErr = err;
      console.warn(`Email send attempt ${i + 1} failed:`, err && err.message ? err.message : err);
      // small backoff before retrying
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

// ── Send OTP Email ────────────────────────────────────────
const sendOTPEmail = async (toEmail, otp) => {
  // pick configured account; if none and in development, create ethereal test account
  let account = getNextAccount();
  let transporter;
  let usedEthereal = false;

  if (!account) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No email accounts configured for production. Set EMAIL_ACCOUNTS or EMAIL_USER/EMAIL_PASS.');
    }

    // Development fallback: create an ethereal account and use that
    const eth = await createEtherealAccount();
    account = { user: eth.user, pass: eth.pass, host: eth.host, port: eth.port, isEthereal: true };
    usedEthereal = true;
  }

  transporter = createTransporterFromAccount(account);

  const fromName = process.env.EMAIL_FROM_NAME || 'LASU Connect';
  const fromAddress = account.user;

  const mailOptions = {
    from:    `"${fromName}" <${fromAddress}>`,
    to:      toEmail,
    subject: 'Your LASU Connect Verification Code',
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0B0F0E; color: #E4EBE7; border-radius: 14px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #006633, #00894A); padding: 28px 32px;">
          <div style="font-size: 24px; font-weight: 800; letter-spacing: 1px; color: #FFD700;">LASU Connect</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 2px;">Lagos State University</div>
        </div>
        <div style="padding: 32px;">
          <p style="font-size: 15px; color: #E4EBE7; margin: 0 0 8px;">Hello,</p>
          <p style="font-size: 14px; color: #7A8F83; line-height: 1.6; margin: 0 0 28px;">
            Use the code below to verify your LASU Mail address and activate your account. This code expires in <strong style="color: #E4EBE7;">10 minutes</strong>.
          </p>
          <div style="background: #161D1A; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 28px;">
            <div style="font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #FFD700; font-family: monospace;">${otp}</div>
            <div style="font-size: 11px; color: #4A5E54; margin-top: 8px; letter-spacing: 1px;">VERIFICATION CODE</div>
          </div>
          <p style="font-size: 13px; color: #4A5E54; line-height: 1.6; margin: 0;">If you did not create a LASU Connect account, ignore this email. Do not share this code with anyone.</p>
        </div>
        <div style="padding: 16px 32px; border-top: 1px solid rgba(255,255,255,0.06);">
          <p style="font-size: 11px; color: #4A5E54; margin: 0;">© ${new Date().getFullYear()} LASU Connect · Exclusively for Lagos State University Students</p>
        </div>
      </div>
    `,
  };

  const attempts = parseInt(process.env.EMAIL_SEND_ATTEMPTS || '2', 10);

  const info = await sendWithRetry(transporter, mailOptions, attempts);
  console.log(`📧 OTP sent via ${fromAddress} to ${toEmail}`);

  if (usedEthereal && info && info.messageId) {
    // Log the ethereal preview URL for developers
    try {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log(`Ethereal preview URL: ${preview}`);
    } catch (e) {
      // ignore
    }
  }

  return info;
};

module.exports = { sendOTPEmail };