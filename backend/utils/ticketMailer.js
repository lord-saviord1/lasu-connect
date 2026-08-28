// Wire this into whatever Nodemailer/round-robin sender setup already
// exists in LASU Connect's backend (per the OTP delivery pattern) rather
// than duplicating a separate mail transport just for tickets.
import User from '../models/User.js'; // adjust path to match actual location

export async function sendTicketEmail({ userId, event, ticket, qrDataUrl }) {
  const user = await User.findById(userId);
  if (!user) return;

  // Replace this with a call into the existing mail-sending utility —
  // this function's job is just to build the right content, not to own
  // its own transport.
  const subject = `Your ticket for ${event.title}`;
  const html = `
    <h2>${event.title}</h2>
    <p>${new Date(event.startsAt).toLocaleString()} — ${event.venue}</p>
    <p>Show this QR code at the door:</p>
    <img src="${qrDataUrl}" alt="Ticket QR code" width="300" />
    <p style="font-size:12px;color:#888;">Ticket code: ${ticket.code}</p>
  `;

  // await sendMail({ to: user.email, subject, html }); // ← plug in existing mailer here
  console.log(`[ticketMailer] Would send ticket email to ${user.email} for event ${event.title}`);
}
