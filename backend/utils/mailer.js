const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   parseInt(process.env.EMAIL_PORT),
  secure: false, // true for port 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = async (toEmail, otp) => {
  const mailOptions = {
    from:    process.env.EMAIL_FROM,
    to:      toEmail,
    subject: 'Your LASU Connect Verification Code',
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0B0F0E; color: #E4EBE7; border-radius: 14px; overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #006633, #00894A); padding: 28px 32px;">
          <div style="font-size: 24px; font-weight: 800; letter-spacing: 1px; color: #FFD700;">LASU Connect</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 2px;">Lagos State University</div>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <p style="font-size: 15px; color: #E4EBE7; margin: 0 0 8px;">Hello,</p>
          <p style="font-size: 14px; color: #7A8F83; line-height: 1.6; margin: 0 0 28px;">
            Use the code below to verify your LASU Mail address and activate your account. This code expires in <strong style="color: #E4EBE7;">10 minutes</strong>.
          </p>

          <!-- OTP Box -->
          <div style="background: #161D1A; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 28px;">
            <div style="font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #FFD700; font-family: monospace;">
              ${otp}
            </div>
            <div style="font-size: 11px; color: #4A5E54; margin-top: 8px; letter-spacing: 1px;">VERIFICATION CODE</div>
          </div>

          <p style="font-size: 13px; color: #4A5E54; line-height: 1.6; margin: 0;">
            If you did not create a LASU Connect account, ignore this email. Do not share this code with anyone.
          </p>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 32px; border-top: 1px solid rgba(255,255,255,0.06);">
          <p style="font-size: 11px; color: #4A5E54; margin: 0;">
            © ${new Date().getFullYear()} LASU Connect · Exclusively for Lagos State University Students
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOTPEmail };
