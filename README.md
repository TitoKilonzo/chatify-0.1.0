# Chatify

Real-time chat with direct and group conversations, file sharing, read receipts, presence and
typing indicators.

- Frontend: React 19 (Vite), React Router, TanStack Query, Zustand, react-virtuoso, lucide-react
- Backend: Node 22, Express 5, Socket.io 4
- Database: Turso / libSQL through Drizzle ORM, with drizzle-kit migrations
- Language: JavaScript (ES modules) throughout

There are no machine-learning features, no emojis in the product or the source, and no demo data outside the
optional development seed command.

## Contents

1. [Quick start](#quick-start)
2. [Scripts](#scripts)
3. [Configuration](#configuration)
4. [Architecture](#architecture)
5. [Realtime protocol](#realtime-protocol)
6. [REST API](#rest-api)
7. [Security model](#security-model)
8. [Design system](#design-system)
9. [Accessibility and keyboard shortcuts](#accessibility-and-keyboard-shortcuts)
10. [Testing](#testing)
11. [Production deployment](#production-deployment)
12. [Known limits](#known-limits)
13. [Public site and installable app](#public-site-and-installable-app)

## Quick start

Requirements: Node.js 22.9 or newer and npm 10 or newer.

```bash
npm ci
cp server/.env.example server/.env
# Edit server/.env and set JWT_ACCESS_SECRET to a random string of 32+ characters, for example:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run db:migrate
npm run dev
```

- The client runs on http://localhost:5173 and proxies `/api` and `/socket.io` to the server on
  http://localhost:4000, so the browser sees one origin and cookies behave exactly as in production.
- Locally the database is a file (`server/data/chatify.db`). No Turso account is needed to develop.
- Optional, development only: `npm run seed` creates four clearly labelled sample accounts
  (`seed_alice`, `seed_bob`, `seed_carol`, `seed_dev`) with one direct chat and one group. It
  refuses to run in production or against a remote database.

## Scripts

Run from the repository root.

| Script                   | What it does                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`            | Server (with file watching) and Vite client together                                  |
| `npm run build`          | Production build of the client into `client/dist`                                     |
| `npm start`              | Start the server (serves `client/dist` when `CLIENT_DIST_DIR` is set)                 |
| `npm run db:migrate`     | Apply pending database migrations. Never run automatically at boot                    |
| `npm run seed`           | Development sample data                                                               |
| `npm run icons`          | Regenerate favicon and app icons from the palette tokens                              |
| `npm test`               | Server tests then client tests                                                        |
| `npm run lint`           | ESLint (includes jsx-a11y and react-hooks rules)                                      |
| `npm run format:check`   | Prettier check (`npm run format` writes)                                              |
| `npm run check:contrast` | WCAG contrast check of every text/background pair in the palette                      |
| `npm run check:rules`    | ASCII only, hex colours only in `tokens.css`, no placeholder text, no banned terms    |
| `npm run verify`         | lint, format, contrast, rules, all tests and the build. Run this before every release |

Database schema changes: edit `server/src/db/schema.js`, then
`npm run db:generate -w server -- --name describe_change`, review the SQL in
`server/src/db/migrations/`, and commit it.

## Configuration

All configuration is environment variables, validated once at start-up. A bad configuration stops
the server with one message listing every problem. See `server/.env.example`.

| Variable                                                 | Default                  | Notes                                                                                                    |
| -------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                               | `development`            | `production` turns on Secure cookies and requires a Turso URL                                            |
| `PORT`                                                   | `4000`                   |                                                                                                          |
| `LOG_LEVEL`                                              | `info`                   | pino levels                                                                                              |
| `CORS_ORIGINS`                                           | `http://localhost:5173`  | Comma-separated origins (scheme, host, port; no path). Also the websocket and CSRF origin allow-list     |
| `DATABASE_URL`                                           | `file:./data/chatify.db` | `libsql://...` for Turso. A local file is refused in production                                          |
| `DATABASE_AUTH_TOKEN`                                    | -                        | Required for a remote database                                                                           |
| `JWT_ACCESS_SECRET`                                      | required                 | At least 32 characters. Also keys the CSRF token signature                                               |
| `ACCESS_TOKEN_TTL_SECONDS`                               | `900`                    |                                                                                                          |
| `REFRESH_TOKEN_TTL_SECONDS`                              | `604800`                 |                                                                                                          |
| `LOGIN_MAX_FAILURES`                                     | `5`                      | Consecutive failures before the account locks                                                            |
| `LOGIN_LOCKOUT_MINUTES`                                  | `15`                     |                                                                                                          |
| `AUTH_RATE_LIMIT_MAX`                                    | `30`                     | Credential requests per IP per 15 minutes                                                                |
| `TRUST_PROXY`                                            | `0`                      | Number of reverse proxies in front of the server                                                         |
| `UPLOAD_DIR`                                             | `./data/uploads`         | Must be on persistent storage                                                                            |
| `MAX_UPLOAD_BYTES`                                       | `26214400`               | 25 MB                                                                                                    |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | -                        | Web Push. Set all three or none. Generate with `npm run vapid -w server`                                 |
| `MAX_RESUMABLE_BYTES`                                    | see `.env.example`       | Largest file accepted through resumable uploads                                                          |
| `SMS_PROVIDER`, `SMS_DEFAULT_COUNTRY_CODE`, `AT_*`       | `none`                   | Phone sign-in. `none` hides it; `console` logs codes (development only); `africastalking` sends real SMS |
| `CLIENT_DIST_DIR`                                        | -                        | When set, the server also serves the built client with SPA fallback                                      |

## Architecture

```
chatify/
  server/
    src/
      config/        env parsing (pure) and the process singleton
      db/            Drizzle schema, client, migrations, seed command
      middleware/    auth, CSRF, validation, rate limits, logging, errors
      modules/       auth, users, conversations, messages, attachments, health
                     each: repository -> service -> controller -> routes
      realtime/      Socket.io: auth, registry, presence, typing, event fan-out
      storage/       StorageDriver (local disk implementation)
      utils/         errors, logger, in-process event bus
      container.js   composition root: builds every repository and service once
      app.js         Express app; index.js is the process entry point
    test/            vitest + supertest + socket.io-client
  client/
    src/
      app/           routes and the signed-in shell
      components/ui/ Button, Input, Dialog, Menu, Avatar, Badge, ...
      features/      auth, chat, profile
      lib/           api client, socket, pure cache and date helpers
      stores/        Zustand stores (messages, presence, typing, drafts)
      styles/        tokens.css (the only place colours are defined) and base.css
    test/            vitest unit tests for the pure logic
  e2e/smoke.mjs      two-browser smoke test (Playwright)
  scripts/           contrast and content-rule checkers
```

Layering rules: controllers only translate HTTP to plain arguments; services hold business rules
and know nothing about HTTP or sockets; repositories are the only code that touches the database.
Services publish facts ("message.created") on an in-process event bus and the realtime layer
subscribes, so the same business code serves REST and sockets.

### Conversations and permissions

- Direct conversations are unique per pair through a sorted `direct_key`, so concurrent
  "open chat" requests from both people yield one conversation.
- Groups have roles: owner, admin, member. Owners and admins rename the group, change its photo and
  add members; admins can remove plain members; only the owner changes roles. When the owner leaves,
  ownership passes to the longest-standing admin, otherwise the longest-standing member. The last
  member leaving deletes the group.
- Every endpoint and socket event answers 404 for non-members, so conversation and message ids
  cannot be probed. This is covered by tests over REST and Socket.io.

### Messages, ordering and idempotency

- `messages.id` is an autoincrement integer. History is paged with a stable cursor on
  `(created_at, id)`, so pages never overlap or skip, even with identical timestamps.
- Every send carries a client-generated `clientId`. A unique `(sender_id, client_id)` index makes
  retries idempotent: a repeated send returns the original message. The client sends over the
  socket and falls back to HTTP with the same `clientId` if the acknowledgement does not arrive.
- Deleting is a soft delete: the row stays as a tombstone (ordering and receipts stay intact), the
  body is cleared, and the attachment record and files are removed.

### Receipts

- Sent: stored. Delivered: a connected client acknowledged the `message:new` event (or fetched
  the message over HTTP). Read: the recipient's open, visible conversation marked it read.
- Receipts are "up to" watermarks (`receipt:update` carries `upToMessageId`), so one small event
  covers any number of messages. A group message is delivered or read only when every recipient has
  reached that state; the UI also reports "read by 2 of 4".
- Replying implicitly reads everything before the reply. Reading in one tab clears the unread badge
  in every other tab and device.

### Reconnecting without loss or duplicates

The client remembers the highest message id it has seen. After any reconnect it calls
`GET /api/sync?afterId=<id>` (paged) and merges by message id, so a message that arrives both live
and through sync appears once. It then refetches the conversation list and the newest page of the
open chat (which also picks up edits and deletions made while offline) and resends any message that
failed while offline. Messages composed while offline stay visible as "sending" and show Retry or
Discard if they cannot be sent.

### Files

- Uploads are validated by content (file signature), never by the client's file name or
  Content-Type. Allowed: PNG, JPEG, GIF, WebP, PDF, ZIP, Office documents (docx, xlsx, pptx, and
  the legacy doc, xls, ppt), MP3, MP4, and plain text (txt, csv, md, json, log). SVG and HTML are
  refused because they can carry script.
- Files are stored under random keys (`ab/<32 hex>`), never under the user's file name. Images get
  a 480 px WebP thumbnail; dimension limits protect against decompression bombs.
- Downloads go through an authenticated endpoint that checks conversation membership. Responses
  carry `X-Content-Type-Options: nosniff` and a sandboxing CSP; only images render inline, every
  other type downloads. Uploads that are never sent in a message are deleted after 24 hours.
- The `StorageDriver` interface (`put`, `get`, `delete`, `signedUrl`) lets an S3-compatible driver
  replace local disk without touching the rest of the code.

### Presence and typing

A user is online while at least one of their sockets is open. Going offline is delayed by 5
seconds so a page reload does not flicker the status for everyone. Typing indicators expire on the
server after 3 seconds and on the client after 4.5 seconds, so a vanished client can never leave a
stuck "typing..." line.

## Realtime protocol

Socket.io on the same origin, authenticated from the same httpOnly cookies as the REST API. The
handshake fails with `UNAUTHENTICATED` or `SESSION_REVOKED`. Logging out, changing the password and
refresh-token reuse detection disconnect the user's sockets immediately.

Client to server:

| Event          | Payload                                             | Ack                                                    |
| -------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `message:send` | `{ conversationId, clientId, body, attachmentId? }` | `{ ok, message, duplicate }` or `{ ok: false, error }` |
| `message:read` | `{ conversationId, upToMessageId? }`                | `{ ok, unreadCount }`                                  |
| `typing`       | `{ conversationId, typing }`                        | none                                                   |

Server to client:

| Event                  | Payload                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `message:new`          | `{ message }` (the client must call the ack: that means delivered) |
| `message:updated`      | `{ message }`                                                      |
| `message:deleted`      | `{ conversationId, messageId }`                                    |
| `receipt:update`       | `{ conversationId, userId, upToMessageId, state }`                 |
| `typing:update`        | `{ conversationId, userId, typing }`                               |
| `presence:update`      | `{ userId, status, lastSeenAt }`                                   |
| `conversation:changed` | `{ conversationId, reason, removed }`                              |
| `user:updated`         | `{ userId }`                                                       |

Each socket is rate limited (20 sends per 10 seconds); payloads are capped at 64 KB.

## REST API

All endpoints are under `/api`, return JSON, and report errors as
`{ "error": { "code", "message", "details?" } }`. State-changing requests need the
`X-CSRF-Token` header (from `GET /api/auth/csrf`).

| Method and path                                  | Purpose                                      |
| ------------------------------------------------ | -------------------------------------------- |
| `GET /health`                                    | Liveness and database check (no auth)        |
| `POST /auth/register`, `/auth/login`             | Create an account or sign in                 |
| `POST /auth/refresh`, `/auth/logout`             | Rotate or revoke the session                 |
| `GET /auth/me`                                   | The signed-in user                           |
| `PATCH /users/me`                                | Change display name                          |
| `POST /users/me/password`                        | Change password (revokes all other sessions) |
| `PUT` / `DELETE /users/me/avatar`                | Set or remove profile photo                  |
| `GET /users?q=`                                  | Search people (2+ characters)                |
| `GET /users/:id/avatar`                          | Avatar image                                 |
| `GET /conversations`                             | Inbox with unread counts and last message    |
| `POST /conversations/direct`, `/group`           | Open a direct chat, create a group           |
| `GET`, `PATCH /conversations/:id`                | Details with members; rename a group         |
| `PUT /conversations/:id/preferences`             | Archive or mute (per user)                   |
| `POST /conversations/:id/members`                | Add members                                  |
| `PATCH`, `DELETE /conversations/:id/members/:u`  | Change role, remove member                   |
| `POST /conversations/:id/leave`                  | Leave a group                                |
| `PUT`, `DELETE`, `GET /conversations/:id/avatar` | Group photo                                  |
| `GET`, `POST /conversations/:id/messages`        | History page (`before`, `limit`); send       |
| `POST /conversations/:id/read`                   | Mark read                                    |
| `PATCH`, `DELETE /messages/:id`                  | Edit or delete own message                   |
| `GET /sync?afterId=`                             | Messages missed while disconnected           |
| `POST /attachments`                              | Upload one file (multipart field `file`)     |
| `GET /attachments/:id`, `/:id/thumbnail`         | Authenticated download (supports `Range`)    |
| `PUT`, `DELETE /messages/:id/reaction`           | Set, change or clear your reaction           |
| `PUT`, `DELETE /messages/:id/pin`                | Pin or unpin (max 10 per conversation)       |
| `POST /messages/:id/forward`                     | Copy a message to up to 5 conversations      |
| `GET /conversations/:id/pins`                    | Pinned messages                              |
| `GET /search/messages?q=`                        | Search your messages (2+ characters)         |
| `GET /push/key`                                  | Whether push is on, and the public key       |
| `POST`, `DELETE /push/subscriptions`             | Register or remove this browser for push     |

## Security model

- Passwords: argon2id with OWASP parameters; a dummy hash is verified for unknown users so login
  timing does not reveal which accounts exist. Accounts lock for 15 minutes after 5 failures.
- Sessions: short-lived access token and rotating refresh token, both in httpOnly SameSite cookies
  (Secure in production). Refresh tokens are stored hashed. Reusing a revoked refresh token revokes
  every session of that user (with a short grace window for the harmless two-tabs race).
- CSRF: signed double-submit token plus an Origin allow-list check on state-changing requests.
- Realtime: handshake origin allow-list (blocks cross-site websocket hijacking), cookie auth,
  re-checked whenever sessions are revoked.
- Transport and headers: helmet with a strict CSP (no inline script, no eval), `Cache-Control:
no-store` on API responses, CORS limited to the configured origins.
- Abuse limits: per-IP rate limits on credentials, refresh, sends and uploads; per-socket limits;
  hourly per-user upload cap; request body and upload size limits.
- Input: every request is validated with zod; SQL goes through Drizzle (parameterised); search
  patterns are escaped; message text is rendered as text, never as HTML.
- Authorization: non-members get 404 everywhere; only authors edit or delete messages; file
  downloads check membership.
- Logging: structured (pino) with request ids; credentials, tokens and message bodies are not
  logged.

## Design system

Defined only in `client/src/styles/tokens.css` (no hex colour exists anywhere else; `npm run
check:rules` enforces this).

- Oat `#F2EADB` / `#FAF6EE` / `#DCCFB8` is the base surface (60%).
- Cocoa `#4A2F22` / `#35211A` / `#7A5C4D` is the structure and text (30%): the navigation rail, own
  message bubbles, text.
- Cherry `#B5232E` / `#961B25` is the accent (10%), used only for unread badges, the send button,
  primary actions, key focus rings, the online indicator and destructive confirmations.
- No gradients, no heavy shadows. Icons are lucide-react only.

`npm run check:contrast` verifies WCAG AA for every text and background pair in use.

Layout: three columns on desktop (navigation rail 220 px, conversation list 340 px, conversation
pane). Under 1100 px the rail collapses to icons. Under 700 px the layout is a single column: the
list and the conversation are separate routes with a back button, and the rail becomes a bottom bar.

## Accessibility and keyboard shortcuts

- Every control has an accessible name; dialogs use the native `<dialog>` (focus trap, Escape).
- Meaning never depends on colour alone: receipts use different icons plus hidden text, errors use
  an icon and text.
- Incoming messages are announced through a polite live region; the tab title shows the unread
  count; `prefers-reduced-motion` is respected.

| Shortcut           | Action                             |
| ------------------ | ---------------------------------- |
| Ctrl+K (Cmd+K)     | Search conversations               |
| Alt+Up, Alt+Down   | Previous or next conversation      |
| Enter, Shift+Enter | Send, new line                     |
| Escape             | Close a dialog or the image viewer |

## Testing

```bash
npm test                 # server (197 tests) then client (35 tests)
npm run verify           # everything the release gate needs
```

- Server integration tests run the real Express app against a real migrated libSQL database per
  test file. The realtime suite uses real Socket.io clients: two-client delivery, delivered and read
  receipts, multi-tab read sync, typing, presence and its grace period, session revocation,
  idempotent retries, rate limiting, reconnect catch-up, and isolation (non-members receive nothing
  and cannot send, read-mark or type).
- Upload tests cover signature validation (executables renamed to .png, SVG, HTML, corrupt images),
  size limits, thumbnails, authorization, header hardening, orphan cleanup and avatars.
- Client tests cover the pure logic: message merging and ordering, receipts, unread counting,
  filtering, the store, and date and size formatting.

Two-browser smoke test (needs Playwright and Chromium; not part of `npm test`):

```bash
npm run build
export JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
export CORS_ORIGINS=http://localhost:4000 CLIENT_DIST_DIR=client/dist DATABASE_URL=file:/tmp/chatify-e2e.db
npm run db:migrate && npm start &
BASE_URL=http://localhost:4000 node e2e/smoke.mjs
```

It registers two users in separate browser contexts and checks realtime delivery, unread badges,
read receipts, typing, an offline period followed by catch-up without duplicates, image sharing
and the mobile layout.

## Production deployment

1. Create a Turso database and a token (`turso db create`, `turso db tokens create`).
2. Set the environment: `NODE_ENV=production`, `DATABASE_URL=libsql://...`,
   `DATABASE_AUTH_TOKEN`, a strong `JWT_ACCESS_SECRET`, `CORS_ORIGINS` set to the public site origin
   (for example `https://chat.example.com`), `TRUST_PROXY=1` behind one proxy, `UPLOAD_DIR` on a
   persistent volume, and `CLIENT_DIST_DIR=../client/dist` to serve the app from the same origin.
3. Install and migrate: `npm ci --omit=dev --workspace server`, then `npm run db:migrate`.
4. Start: `npm start`. Terminate TLS at your proxy and forward websocket upgrades for
   `/socket.io`. Health check: `GET /api/health`.

Run migrations as a separate deploy step, not from every instance at boot.

### Deploying on Render

`render.yaml` in the repository root is a Render Blueprint. It builds the client, applies the
migrations to Turso during the build, and starts one service that serves the API, the websocket and
the web app from a single origin.

- Do not set `PORT`; Render provides it.
- Set `CORS_ORIGINS` to the service's public origin, for example `https://chatify.onrender.com`.
  A trailing slash is tolerated, but a path is not.
- Keep `NODE_ENV=production`, `TRUST_PROXY=1` and `CLIENT_DIST_DIR=../client/dist`.
- Host the client on the same service rather than on a separate site. The browser app talks to
  relative `/api` and `/socket.io` URLs and uses first-party cookies, so a second domain for the
  client would need proxying that cannot carry websockets or large uploads.
- Uploaded files are stored on local disk. On a service without a persistent disk they are lost at
  each deploy or restart; attach a Render disk and point `UPLOAD_DIR` at it to keep them.

### Durable file storage with Cloudflare R2

On hosts without a persistent disk, local uploads disappear at every deploy. Use R2:

1. In the Cloudflare dashboard open R2, create a bucket (keep it private) and note the account id.
2. Create an R2 API token with Object Read and Write for that bucket. Copy the access key id and
   secret.
3. Set these variables on the server: `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Optionally `SIGNED_URL_TTL_SECONDS` (default 300).
4. Redeploy. New uploads go to R2. Files already on local disk are not moved.

How it works: the server still authenticates every request and checks conversation membership, then
answers with a redirect to a short-lived signed URL, so file bytes go straight from R2 to the
browser. The signature fixes the content type and disposition, files are never HTML or SVG, and the
bucket is on another origin, so a file cannot run inside the app. The Content Security Policy allows
images and media from the R2 origin only. Redirects are cached for a little under half the URL
lifetime so thumbnails are not downloaded again on every scroll.

### Keeping a free instance awake

Set `KEEP_ALIVE_URL` to the service's public URL and the server will request its own
`/api/health` every 10 minutes. This is a stop-gap; a paid instance is the reliable fix, and an
external monitor (for example UptimeRobot on `/api/health`) works as well.

### Continuous integration

`.github/workflows/ci.yml` runs `npm run verify` and a production dependency audit on every push and
pull request, then the two-browser smoke test against a freshly built app.

## Offline sending

Messages written while offline are saved in the browser (`localStorage`, per user) before the first
send attempt, shown as not yet sent, and delivered automatically when the connection returns, also
after a reload or a closed tab. Sends are idempotent, so a message that actually arrived is never
duplicated. Messages the server rejects for good (for example after being removed from a group) are
dropped from the queue. The queue is cleared on explicit sign-out. Attachments need a connection to
upload, so only text and already uploaded files are queued.

## Replies, reactions, pins, forwarding, search

- **Replies** carry a short preview of the original; choosing the quote jumps to it, loading older
  history when needed.
- **Reactions** are a fixed set of six icons (like, love, funny, sad, star, done). One reaction per
  person per message; choosing the same one again removes it.
- **Pins**: up to 10 per conversation. In groups only owners and admins can pin.
- **Forwarding** copies the text and duplicates any file, so each message owns its file. Up to 5
  conversations at once; every target is checked before anything is sent.
- **Search** matches message text in your own conversations (2+ characters). It is a plain
  substring match, which works the same on local SQLite and Turso.

## Notifications

Browsers can show a notification for new messages while Chatify is not open. Run
`npm run vapid -w server`, set the three `VAPID_*` variables on the server, then turn notifications
on in Settings on each device. Only people with no live connection are notified, muted
conversations are skipped, and a subscription the push service reports as gone is deleted. On
iPhone and iPad the app must first be added to the home screen. Signing out turns notifications off
for that browser.

## Voice notes

The microphone button in the composer records with the browser's MediaRecorder (up to 5 minutes),
shows the elapsed time, and sends on request. Recordings are checked by content like any upload and
must be audio. Playback uses a custom player; the server answers `Range` requests so seeking works.

## Disappearing messages, resumable uploads, threads, data saver

- **Disappearing messages.** Any member of a direct chat (or an owner or admin of a group) can set
  a timer: off, 1 hour, 1 day, 1 week or 30 days. It applies to messages sent after the change. The
  server hides expired messages from every read path immediately and deletes them (and their files)
  every 30 seconds; clients remove them live.
- **Resumable uploads.** Files larger than the single-request threshold are sent in chunks through
  `/api/uploads`. If the connection drops, the client asks the server how much it has and continues
  from there. Stale sessions are cleaned up hourly.
- **Group threads.** In a group, "Reply in thread" opens a side conversation under a message.
  Replies stay out of the main history, and the root shows a reply count. Threads do not nest.
- **Data saver.** Photos are not downloaded until tapped. It follows the browser's Save-Data
  setting unless you choose otherwise in Settings.

## Phone sign-in

Users can add a phone number in Settings, verify it with a code, and then sign in with the number
and a code. Codes are single-use, expire, and are rate limited. SMS goes through a provider
interface; Africa's Talking is built in (`SMS_PROVIDER=africastalking` plus the `AT_*` variables in
`server/.env.example`). With `SMS_PROVIDER=console` the code is written to the server log, which is
for development only.

## End-to-end encryption

Direct chats can be switched to end-to-end encryption from the conversation details. Each user has
a P-256 key pair created in Settings. The private key stays in this browser's IndexedDB. A shared
key is derived per pair (ECDH, then HKDF-SHA256) and messages are sealed with AES-256-GCM, bound to
the conversation id. The server stores only ciphertext, so it cannot read or search those
messages. The safety number in the details dialog lets two people check they hold each other's real
keys.

Key backup is optional: Settings can lock the private key with a passphrase (PBKDF2, 310000 rounds,
then AES-GCM) and store that opaque blob on the server. We cannot recover a forgotten passphrase.
On sign-out the local key is removed only when a backup exists.

Limits, by design:

- Direct chats only. No files, voice notes, search or forwarding for encrypted messages, and
  previews and push text do not show the content.
- A key lives on one device unless restored from the backup. Without the key, older encrypted
  messages show as unreadable. Creating a new key replaces the old one and drops its backup.
- Keys are extractable inside the browser (needed for backup), so a compromised browser profile
  exposes them. Turning encryption on does not re-encrypt earlier messages.

## Known limits

- Realtime state (connected sockets, presence, typing) lives in process memory, so run a single
  server instance. Scaling out needs the Socket.io Redis adapter and shared presence and rate-limit
  stores; the event bus and registry are the two seams to change.
- Uploaded files use local disk. For multiple instances or ephemeral hosts, implement the
  `StorageDriver` interface for S3-compatible storage.
- Encryption has the limits listed above. Calls, device management and channels are not built yet.

## Public site and installable app

Visitors can use these pages before signing in: Home (`/`), Features, About, Help, Contact, Privacy
and Terms. The header has dropdown menus for Features and Help, the footer repeats the links, and
the sign-in and sign-up pages have a Back to home button. Contact details live in one place,
`client/src/features/public/site.js`.

The Contact form has no server endpoint: it opens the visitor's own email app with the message
addressed to the public email, so nothing is stored by Chatify.

Chatify is a Progressive Web App:

- `client/public/manifest.webmanifest` describes the app. A client test checks that its colors
  match the design tokens.
- `client/public/sw.js` is a deliberately small service worker. It shows an offline page when a
  navigation fails and never caches API responses, sockets or uploads. It is registered in
  production builds only, and the server serves it with `Cache-Control: no-cache`.
- The Install app button (public header, footer, Home, Help and Settings; deliberately not on sign-in or sign-up) uses the browser's
  native prompt where available and otherwise shows steps for the visitor's device.
- Favicon and app icons are generated from the palette tokens with `npm run icons`. Run it only
  when the palette or mark changes; the output in `client/public` is committed.

Browsers only offer installation over HTTPS (or on localhost), so serve production behind TLS.
