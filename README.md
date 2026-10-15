<div align="center">

# `LASU CONNECT`

### **Campus communication · events · channels · community systems**

[![Live app](https://img.shields.io/badge/LIVE-lasu--connect.netlify.app-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://lasu-connect.netlify.app/)
[![Source](https://img.shields.io/badge/SOURCE-GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/lord-saviord1/lasu-connect)
[![Branch](https://img.shields.io/badge/BRANCH-master-006633?style=for-the-badge&logo=git&logoColor=white)](https://github.com/lord-saviord1/lasu-connect/tree/master)

</div>

## `// PRODUCT CONTROL`

<table width="100%">
<tr>
<td width="25%" align="center"><b>PRODUCT</b><br/><br/>🎓<br/><sub>student-built campus platform</sub></td>
<td width="25%" align="center"><b>COMMUNICATION</b><br/><br/>💬<br/><sub>real-time chat and channels</sub></td>
<td width="25%" align="center"><b>EVENTS</b><br/><br/>🎟️<br/><sub>tickets, QR entry and organizers</sub></td>
<td width="25%" align="center"><b>STATUS</b><br/><br/>🟢<br/><sub>actively evolving</sub></td>
</tr>
</table>

LASU Connect is a campus-oriented communication platform designed for Lagos State University students. It brings together real-time messaging, campus communities, announcements, events and practical student utility in one product direction.

> **A digital layer for campus life — built around communication, participation and access.**

## `// LIVE BUILD TELEMETRY`

<table width="100%">
<tr><th>Signal</th><th>Current state</th><th>Details</th></tr>
<tr><td><b>Repository</b></td><td><a href="https://github.com/lord-saviord1/lasu-connect">lord-saviord1/lasu-connect</a></td><td>Primary source of truth</td></tr>
<tr><td><b>Active branch</b></td><td><code>master</code></td><td>Current default branch</td></tr>
<tr><td><b>Latest repository update</b></td><td>October 15, 2026</td><td>Repository activity inspected from GitHub metadata</td></tr>
<tr><td><b>Languages</b></td><td>HTML · JavaScript · CSS</td><td>Repository language telemetry</td></tr>
<tr><td><b>Live deployment</b></td><td><a href="https://lasu-connect.netlify.app/">Netlify</a></td><td>Public application surface</td></tr>
<tr><td><b>Repository homepage</b></td><td><a href="https://lasu-connect-theta.vercel.app">Vercel preview</a></td><td>Configured repository homepage</td></tr>
</table>

## `// LIVE PREVIEW`

<div align="center">

<a href="https://lasu-connect.netlify.app/">
<img src="https://image.thum.io/get/width/1400/crop/900/https://lasu-connect.netlify.app/" width="100%" alt="LASU Connect live application preview" />
</a>

[Open the live application →](https://lasu-connect.netlify.app/)

</div>

## `// FEATURE MATRIX`

<table width="100%">
<tr>
<td width="50%" valign="top">

### 💬 Real-time communication

- Messaging-oriented campus experience
- Protected user flows
- Socket-based real-time layer
- Student-focused communication surfaces
- Designed for groups, communities and campus announcements

</td>
<td width="50%" valign="top">

### 🎓 Campus channels

- Channel creation and channel administration
- Faculty, department, brand, student and admin ownership concepts
- Open posting inside channels
- Follow and pin-to-sidebar flows
- Top/new sorting and upvote-driven visibility

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🎟️ Events and tickets

- Create and edit events
- Organizer and capacity controls
- Free or paid event states
- Ticket claiming
- QR code generation
- Staff-side check-in and re-scan protection

</td>
<td width="50%" valign="top">

### 🛡️ Product trust layer

- JWT-based protected routes
- Password hashing with bcrypt
- Helmet security headers
- CORS configuration
- Request rate limiting
- Validation and controlled media uploads

</td>
</tr>
</table>

## `// SYSTEM ARCHITECTURE GUI`

<table width="100%">
<tr>
<td width="33%" valign="top">

### `FRONTEND`

| Layer | Technology |
|---|---|
| Markup | HTML |
| Styling | CSS |
| UI framework | Bootstrap |
| Icons | Bootstrap Icons |
| Typography | Syne · DM Sans |
| State | Browser storage / token state |
| Auth client | JWT token flow |
| API client | Fetch-based browser calls |

</td>
<td width="33%" valign="top">

### `BACKEND`

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Realtime | Socket.IO |
| Database | MongoDB |
| ODM | Mongoose |
| Uploads | Multer |
| Media storage | Cloudinary |
| Email | Resend |

</td>
<td width="33%" valign="top">

### `PROTECTION`

| Layer | Technology |
|---|---|
| Authentication | JWT |
| Passwords | bcryptjs |
| Headers | Helmet |
| Cross-origin | CORS |
| Abuse control | express-rate-limit |
| Input checks | validator |
| Configuration | dotenv |
| Development | nodemon |

</td>
</tr>
</table>

## `// REQUEST FLOW`

<table width="100%">
<tr>
<td align="center"><b>01<br/>BROWSER</b><br/><sub>student opens the app</sub></td>
<td align="center">→</td>
<td align="center"><b>02<br/>AUTH</b><br/><sub>JWT-protected request</sub></td>
<td align="center">→</td>
<td align="center"><b>03<br/>API</b><br/><sub>Express route</sub></td>
<td align="center">→</td>
<td align="center"><b>04<br/>DATA</b><br/><sub>MongoDB / Mongoose</sub></td>
<td align="center">→</td>
<td align="center"><b>05<br/>REALTIME</b><br/><sub>Socket.IO event</sub></td>
</tr>
</table>

## `// BACKEND SERVICE MAP`

<table width="100%">
<tr><th>Service</th><th>Role</th><th>Connected capability</th></tr>
<tr><td><b>Express</b></td><td>HTTP application framework</td><td>API routes and middleware</td></tr>
<tr><td><b>MongoDB</b></td><td>Document database</td><td>Users, events, tickets, channels and posts</td></tr>
<tr><td><b>Mongoose</b></td><td>Data modeling layer</td><td>Models, validation and persistence</td></tr>
<tr><td><b>Socket.IO</b></td><td>Realtime transport</td><td>Live messaging and event-driven updates</td></tr>
<tr><td><b>Cloudinary</b></td><td>Media storage</td><td>Uploaded images and hosted assets</td></tr>
<tr><td><b>Resend</b></td><td>Email delivery</td><td>Notifications and ticket communication</td></tr>
<tr><td><b>Multer</b></td><td>Multipart upload handling</td><td>Receiving files before media storage</td></tr>
</table>

## `// EVENTS MODULE GUI`

<table width="100%">
<tr><td width="25%" align="center"><b>CREATE</b><br/><sub>organizer creates event</sub></td><td width="25%" align="center"><b>CLAIM</b><br/><sub>student requests ticket</sub></td><td width="25%" align="center"><b>ISSUE</b><br/><sub>QR ticket generated</sub></td><td width="25%" align="center"><b>CHECK-IN</b><br/><sub>staff validates entry</sub></td></tr>
</table>

The events direction currently supports organizer controls, capacity, free/paid states, single-ticket claiming, QR generation, email delivery and staff-side check-in behavior. Paid-event payment integration remains an explicit follow-up surface: the ticket flow can hold a `pending_payment` state until a provider webhook is connected.

## `// CAMPUS CHANNELS GUI`

<table width="100%">
<tr>
<td width="20%" align="center"><b>SUG</b><br/><sub>student government</sub></td>
<td width="20%" align="center"><b>FACULTY</b><br/><sub>faculty communities</sub></td>
<td width="20%" align="center"><b>DEPT</b><br/><sub>department spaces</sub></td>
<td width="20%" align="center"><b>BRAND</b><br/><sub>organization channels</sub></td>
<td width="20%" align="center"><b>ADMIN</b><br/><sub>managed spaces</sub></td>
</tr>
</table>

| Capability | Product behavior |
|---|---|
| Channel access | Authenticated channel surfaces |
| Posting | Open posting within a channel |
| Visibility | Top and newest post views |
| Engagement | Toggleable upvoting |
| Personalization | Follow and pin-to-sidebar |
| Administration | Scoped full-admin and event-only permissions |
| Future surface | Channel request/review workflow |

## `// SECURITY & API CONTROL`

<table width="100%">
<tr><th>Control</th><th>Implementation</th><th>Purpose</th></tr>
<tr><td>Authentication</td><td>JWT middleware</td><td>Protect authenticated routes</td></tr>
<tr><td>Password security</td><td>bcryptjs</td><td>Hash user credentials</td></tr>
<tr><td>HTTP hardening</td><td>Helmet</td><td>Set protective response headers</td></tr>
<tr><td>Cross-origin policy</td><td>CORS</td><td>Control browser origins</td></tr>
<tr><td>Rate protection</td><td>express-rate-limit</td><td>Reduce abusive request patterns</td></tr>
<tr><td>Input validation</td><td>validator</td><td>Check user-provided values</td></tr>
<tr><td>Secrets</td><td>dotenv environment configuration</td><td>Keep configuration outside source</td></tr>
</table>

## `// REPOSITORY MAP`

<table width="100%">
<tr><th>Area</th><th>Important surfaces</th></tr>
<tr><td><b>Backend models</b></td><td><code>Event.js</code> · <code>Ticket.js</code> · <code>Channel.js</code> · <code>ChannelPost.js</code> · <code>PostVote.js</code> · <code>ChannelFollow.js</code></td></tr>
<tr><td><b>Backend middleware</b></td><td><code>eventPermissions.js</code> · <code>channelPermissions.js</code> · authentication middleware</td></tr>
<tr><td><b>Backend routes</b></td><td><code>eventRoutes.js</code> · <code>channelRoutes.js</code></td></tr>
<tr><td><b>Backend services</b></td><td><code>qrService.js</code> · <code>ticketMailer.js</code> · Cloudinary configuration</td></tr>
<tr><td><b>Frontend pages</b></td><td><code>events.html</code> · <code>events.css</code> · <code>events.js</code> · <code>channels.html</code> · <code>channels.css</code> · <code>channels.js</code></td></tr>
<tr><td><b>Core app</b></td><td>Chat, authentication, registration, profile and campus navigation surfaces</td></tr>
</table>

## `// LOCAL DEVELOPMENT GUI`

<table width="100%">
<tr><td width="33%" align="center"><b>1 · INSTALL</b><br/><code>npm install</code><br/><sub>install backend dependencies</sub></td><td width="33%" align="center"><b>2 · CONFIGURE</b><br/><code>.env</code><br/><sub>add database and service secrets</sub></td><td width="33%" align="center"><b>3 · RUN</b><br/><code>npm run dev</code><br/><sub>start the development server</sub></td></tr>
</table>

### Backend commands

```bash
cd backend
npm install
npm run dev
```

The backend package provides:

- `npm start` — run `node server.js`
- `npm run dev` — run with `nodemon`

### Frontend integration notes

The Events and Campus Channels pages are designed to be integrated alongside the existing chat and authentication pages. Before production use, verify the actual JWT storage key, API base path, route registration and navigation links against the live application.

## `// CONFIGURATION PANEL`

| Variable group | Used for |
|---|---|
| MongoDB connection | Database access and persistence |
| JWT secret | Signing and verifying authentication tokens |
| Cloudinary credentials | Image/media storage |
| Resend credentials | Email delivery |
| CORS origins | Browser access policy |
| Rate-limit settings | Request protection |
| Application URL | Canonical links and generated ticket URLs |

Never commit real secrets, API keys or private service credentials. Use environment configuration locally and in the deployment provider.

## `// ROADMAP CONTROL`

<table width="100%">
<tr><th>Now</th><th>Next</th><th>Later</th></tr>
<tr><td>Chat · events · channels · auth</td><td>Payment provider webhook · real channel request queue · admin tooling</td><td>Multi-person tickets · main feed qualification · verification badges · reach algorithm · boosting / Ad Center</td></tr>
</table>

The deferred items are intentional: several depend on real usage data, operational policy or a confirmed payment provider rather than only implementation effort.

## `// DEPLOYMENT SURFACES`

<div align="center">

[![Netlify](https://img.shields.io/badge/NETLIFY-LIVE-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://lasu-connect.netlify.app/)
[![Vercel](https://img.shields.io/badge/VERCEL-PREVIEW-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://lasu-connect-theta.vercel.app)
[![GitHub](https://img.shields.io/badge/SOURCE-GITHUB-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/lord-saviord1/lasu-connect)

</div>

## `// CONTRIBUTING & FEEDBACK`

Issues, implementation notes and product feedback are welcome through the repository’s GitHub issue tracker. If you are working on the Events and Channels package, please verify the real backend wiring before treating the provisional integration notes as final.

[Open an issue](https://github.com/lord-saviord1/lasu-connect/issues) · [View discussions](https://github.com/lord-saviord1/lasu-connect/discussions) · [View commits](https://github.com/lord-saviord1/lasu-connect/commits/master)

<div align="center">

### `STATUS: BUILDING A BETTER CAMPUS LAYER`

Built by [lord-saviord1](https://github.com/lord-saviord1) · Part of the Cipher PR build network

</div>
