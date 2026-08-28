import QRCode from 'qrcode';

/**
 * Generates a QR code (as a data URL, embeddable directly in an email)
 * encoding just the ticket's unique code. The scanner endpoint looks that
 * code up against the Ticket collection — the QR image itself carries no
 * sensitive data, just an opaque reference.
 */
export async function generateTicketQR(ticketCode) {
  return QRCode.toDataURL(ticketCode, { width: 400, margin: 2 });
}
