# LASU Connect — Events & Campus Channels (Frontend)

Two standalone pages, matching the API shape from the backend package
(`lasu-connect-events-channels.zip`). Built in parallel, before you've
confirmed the backend is wired — so **treat the API calls here as
provisional until you've tested against the real live routes.**

## What's here

```
events.html / events.css / events.js
channels.html / channels.css / channels.js
```

Drop these into wherever your other pages live (alongside `chat.html`,
`login.html`, etc.) in the frontend repo.

## Things you WILL need to adjust once backend is confirmed live

1. **Token key name** — both `events.js` and `channels.js` read
   `localStorage.getItem("lc_token")`. If your actual login flow stores
   the JWT under a different key, change that one line in each file.

2. **API_BASE** — set to `"/api"` (same-origin), assuming your frontend
   and backend share a domain via a proxy/rewrite, matching how the rest
   of LASU Connect's frontend likely already calls its API. If Events/
   Channels turn out to be hosted separately, change this to the full
   backend URL instead (same pattern as CipherStream's `API_BASE`).

3. **Nav link back to chat** — both pages link `← Back` to `chat.html`.
   Adjust if your main app entry point has a different filename.

4. **Wire these into your left rail** — the placeholder Events and
   Campus Channels stubs in the sidebar should link to these two pages
   once you're ready to swap them in.

## What's intentionally NOT built here (matches backend's v1 scope)

- No payment flow UI for paid events — the claim button already detects
  `requiresPayment` and shows a holding message; the actual payment step
  needs building once a provider's chosen (same open item as backend).
- No main feed (cross-channel discovery) — only per-channel feeds. Main
  feed depends on the qualification/notability logic that's deferred.
- No verification badges, boosting, or Ad Center UI — same deferral
  reasoning as the backend.
- No channel-admin management UI (adding/removing admins, scoped
  permissions) — the backend route exists (`POST /channels/:id/admins`)
  but there's no form for it yet. Worth building once you're actually
  onboarding channel admins day to day.
- Create Channel isn't in the UI at all — matches the spec's "channel
  creation isn't open to the public" instruction; for now, creating a
  channel means calling `POST /api/channels` directly (e.g. via the
  admin panel pattern from CipherStream, or just a script) until the
  "request a channel" flow gets designed.

## Design notes

Followed the existing brand tokens exactly — near-black `#0B0F0E`,
primary green `#006633`, gold `#FFD700` accent, Syne (display) + DM Sans
(body), nothing new invented.

Two deliberate signature elements, each grounded in what the feature
actually does rather than decoration:
- **Events**: ticket-stub cards with a dashed perforation line and
  punched notch cutouts — because a ticket is a provable claim to
  entry, not just a listing.
- **Channels**: nameplate tags (SUG / Faculty / Dept / Brand / Admin /
  Student) on each channel card, color-coded by owner type — because
  who runs a channel is the real organizing fact of the whole system,
  per the spec's ownership-types section.

Posts use a Reddit-style vertical upvote rail (arrow + count), matching
the spec's explicit "should feel like Reddit... upvote-driven
visibility" instruction.
