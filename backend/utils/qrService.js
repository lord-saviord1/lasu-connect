const QRCode = require('qrcode');

// The QR encodes ONLY the ticket's opaque code. The check-in endpoint looks that
// code up in the Ticket collection, so the image itself carries nothing sensitive.

// PNG as a data URL: shown inside the app (My Tickets).
async function generateTicketQR(ticketCode) {
  return QRCode.toDataURL(ticketCode, { width: 400, margin: 2 });
}

// PNG as a Buffer: attached to the ticket email (many mail apps block data-URL images).
async function generateTicketQRBuffer(ticketCode) {
  return QRCode.toBuffer(ticketCode, { width: 400, margin: 2 });
}

module.exports = { generateTicketQR, generateTicketQRBuffer };
