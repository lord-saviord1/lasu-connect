# LASU Connect — Events & Campus Channels (v1 Backend)

Built against reasonable assumptions about your existing codebase (Mongoose
models, `requireAuth` JWT middleware, Nodemailer-based mail sending) since
I don't have direct access to your actual repo files yet. **You'll need to
reconcile the exact wiring** — import paths especially — against what's
really there. Treat this as a strong first draft, not drop-in-and-done.

## What's scoped IN for v1

**Events:**
- Create/edit an event (organizers, capacity, free-or-paid toggle)
- Claim a ticket (single ticket type — one per user per event)
- QR code generation + email delivery on issue
- Staff-side check-in scanning (marks a ticket used, rejects re-scans)
- Organizer-only ticket list view

**Campus Channels:**
- Channel creation (gated behind auth — tighten to a real admin role later)
- Scoped admin permissions (full admin vs. event-only admin, per spec)
- Open posting within a channel (any student, not just admins)
- Upvoting (toggleable), sorted "top" or "new" post views
- Follow / pin-to-sidebar

## What's deliberately scoped OUT of v1 (and why)

These aren't forgotten — they're the parts of your product doc that
explicitly depend on having real usage data or a bigger follow-up build
first:

- **Multi-person ticket types** (Couple's Ticket, group tickets) — v1 is
  single-ticket-only on purpose. The `Ticket` model has a comment marking
  where this extends without a breaking migration.
- **Main feed / notability qualification** — needs real posting activity
  to design a fair qualification bar against.
- **Verification badges** — depends on the qualification system above.
- **Reach algorithm / impressions** — same reasoning your own Wallet doc
  gives for deferring the rewards scoring formula: needs real data to
  calibrate, not just to build.
- **Boosting / Ad Center** — monetization layer, deliberately last.
- **Channel-creation request queue** — the spec says channel creation
  goes through "a dedicated space/channel" for requests; v1 just gates
  the route behind auth as a placeholder. Build the actual request/review
  flow once you know who's approving these day to day.

## Files in this package

```
models/
  Event.js
  Ticket.js
  Channel.js
  ChannelPost.js
  PostVote.js
  ChannelFollow.js
middleware/
  eventPermissions.js      — requireEventOrganizer
  channelPermissions.js    — requireChannelAdmin (scope-aware)
routes/
  eventRoutes.js
  channelRoutes.js
services/
  qrService.js             — needs `npm install qrcode`
  ticketMailer.js           — STUB, see below
```

## Integration steps

1. **Drop the files in** — `models/`, `routes/`, `middleware/`, `services/`
   go into their matching folders in your existing backend structure.

2. **Fix the import paths.** Every file assumes:
   - `../middleware/auth.js` exports `requireAuth` (matching your
     existing customer JWT middleware)
   - `../models/User.js` exists at that relative path
   
   Adjust these to match your actual file layout.

3. **Install the QR package:**
   ```bash
   npm install qrcode
   ```

4. **Wire `ticketMailer.js` into your real mail sender.** This file is a
   stub — it currently just logs instead of sending. Replace the
   `console.log` line with a call into whatever function your existing
   OTP round-robin Gmail sender uses, so tickets ride the same
   infrastructure instead of duplicating a mail transport.

5. **Register the routes** in your main app file:
   ```js
   import eventRoutes from './routes/eventRoutes.js';
   import channelRoutes from './routes/channelRoutes.js';
   
   app.use('/api/events', eventRoutes);
   app.use('/api/channels', channelRoutes);
   ```

6. **Payment integration for paid events** isn't built here — the
   `claim` route already branches on `event.isPaid` and creates a
   `pending_payment` ticket, but nothing calls a payment provider yet.
   This is the same shape as CipherStream's Monnify webhook pattern —
   whichever provider LASU Connect uses, the webhook handler should
   flip the ticket to `issued` and call `sendTicketEmail` at that point,
   not before.

7. **No frontend yet** — this is backend only. Once this is wired in and
   you've confirmed the models/routes match your conventions, the next
   step is the actual Events and Campus Channels pages in the frontend,
   replacing the current placeholder stubs in the left rail.
