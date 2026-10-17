const User = require('../models/User');
const { sendEmail } = require('./mailer');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Emails a ticket (QR attached as a PNG). Best effort: the ticket also lives in
 * the app under My Tickets, so a failed email never fails the claim.
 */
async function sendTicketEmail({ userId, event, ticket, qrPng }) {
  const user = await User.findById(userId).select('email displayName');
  if (!user) return;

  const when = new Date(event.startsAt).toLocaleString('en-NG', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos',
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#006633;margin-bottom:4px;">${esc(event.title)}</h2>
      <p style="margin:0 0 12px;color:#444;">${esc(when)}<br/>${esc(event.venue)}</p>
      <p>Hi ${esc(user.displayName)}, your ticket is attached as <b>ticket-qr.png</b>.
         Show the QR code at the door. You can also open it any time in LASU Connect under Events, then My Tickets.</p>
      <p style="font-size:12px;color:#888;">Ticket code: ${esc(ticket.code)}</p>
    </div>`;

  await sendEmail({
    to: user.email,
    subject: `Your ticket for ${event.title}`,
    html,
    attachments: [{ filename: 'ticket-qr.png', content: qrPng }],
  });
}

module.exports = { sendTicketEmail };
