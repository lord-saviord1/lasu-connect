const { Resend } = require('resend');

// ── Resend-based mailer ──────────────────────────────────
// Replaces the old Gmail SMTP transport. Render blocks outbound SMTP
// ports (587/465), which caused every OTP send to hang and eventually
// time out (ETIMEDOUT on CONN). Resend sends over HTTPS, so it works
// fine from Render.
//
// Required env var: RESEND_API_KEY
// Optional env var: RESEND_FROM_EMAIL — defaults to Resend's shared
// test sender (onboarding@resend.dev). Switch this once a custom
// domain is verified on Resend, e.g. "LASU Connect <noreply@yourdomain>".

if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
  console.error('RESEND_API_KEY is not set — OTP emails will fail in production.');
}

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'LASU Connect <onboarding@resend.dev>';

function buildOtpHtml(otp) {
  return `
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
  `;
}

async function sendWithRetry(sendFn, attempts = 2) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await sendFn();
      if (result.error) throw new Error(result.error.message || 'Resend API returned an error');
      return result;
    } catch (err) {
      lastErr = err;
      console.warn(`Email send attempt ${i + 1} failed:`, err && err.message ? err.message : err);
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

// ── Send OTP Email ────────────────────────────────────────
// Same signature as before: sendOTPEmail(toEmail, otp)
const sendOTPEmail = async (toEmail, otp) => {
  const attempts = parseInt(process.env.EMAIL_SEND_ATTEMPTS || '2', 10);

  const result = await sendWithRetry(
    () =>
      resend.emails.send({
        from: FROM_ADDRESS,
        to: toEmail,
        subject: 'Your LASU Connect Verification Code',
        html: buildOtpHtml(otp),
      }),
    attempts
  );

  console.log(`📧 OTP sent via Resend to ${toEmail} (id: ${result.data?.id || 'unknown'})`);
  return result;
};

module.exports = { sendOTPEmail };
