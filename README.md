# Sara7a API

Node.js and Express backend for anonymous messaging, with MongoDB, authentication, private inboxes, profiles and moderation.

## Setup

Clone the repository and enter its directory:

```sh
git clone https://github.com/AhmedAssem191/Sara7aApp.git
cd Sara7aApp
```

1. Use Node.js 22.12+ and MongoDB 7+.
2. Run `npm ci`.
3. Copy `config/.env.example` to `config/.env.dev` and fill in your own values. Production uses `config/.env.prod` or injected environment variables.
4. Run `npm start` or `npm run start:dev`.
5. Check `GET /health/live` and `GET /health/ready`.

The app validates configuration before connecting and only reports listening after the HTTP port opens. MongoDB is required; Redis is not needed by the current session/limiter implementation. Keep secrets out of Git.

Generate independent secrets with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. For ENCRYPTION_SECRET, use exactly 32 UTF-8 bytes, e.g. the hexadecimal output of 16 random bytes. Do not replace an existing encryption key without migrating encrypted phone data.

## Features

- Email confirmation and password-reset OTPs, expiry, cooldown, attempt limits.
- Password login, Google login, rotating refresh tokens, session list/revocation.
- Private inbox with pagination, literal text search, read/unread, favorites and deletion.
- Receiver privacy settings and optional signed-in-only delivery; sender identity stays hidden.
- Public profile handle and QR code, bio/theme, profile and cover images.
- Explicit opt-in publication of individual messages and PNG share cards. Unpublishing removes the share URL.
- Sender blocking, reports, admin moderation, account actions and audit log.
- Realtime Server-Sent Events with authentication and a notification preference.
- Inbox totals, unread/favorite/published counts, and profile request counts.
- Streaming NDJSON data export and identity-verified account deletion.
- Shared MongoDB request limits, duplicate-message suppression, optional Turnstile CAPTCHA.

See the [API reference](docs/API.md) for endpoints and request formats.

## Deployment details

- Set PUBLIC_URL to the externally reachable API origin (used for QR/share links).
- Set WHITE_LIST to comma-separated frontend origins.
- If behind a proxy, set TRUST_PROXY only to trusted IPs/CIDRs such as `loopback` for a local proxy. Never trust arbitrary client forwarding headers.
- MongoDB TTL and unique indexes must be allowed to build. Existing users get a persistent handle on their first authenticated profile read; no destructive migration runs at startup.
- Request-limit counters are shared via MongoDB. SSE connections currently live in one Node process: deploy one API instance for realtime delivery, or add a shared event bus before horizontal scaling. Persisted messages remain the source of truth after reconnect.
- Place `src/uploads` on persistent storage. Uploads are publicly retrievable images; original file names are discarded. Account deletion removes the user's upload directory.
- PNG cards need system fonts. Install a font with Arabic support (for example Noto Sans Arabic) on Linux. Fontconfig also needs a writable cache directory.
- CAPTCHA is enforced for message sends when CAPTCHA_SECRET is set. The frontend must obtain a Turnstile token and submit `captchaToken`. Server validation follows [Cloudflare's official API](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- Anonymous blocking uses a receiver-scoped HMAC of the IP; signed-in delivery also includes a receiver-scoped account fingerprint. This is best-effort abuse prevention: shared networks can be affected, and changing IP/account can bypass it. Raw identities are never returned to the receiver.
- Profile views count successful profile requests, not unique people.
- Account deletion removes received messages, reports filed by the account, blocks, sessions and files. Audit records are retained for moderation. Anonymous messages sent to others cannot be attributed for export/deletion.
- Failed multi-collection deletion leaves a disabled tombstone and can be retried by an admin. It never silently reactivates the account.
- Admin role provisioning is an operator/database action; there is no public role-escalation endpoint.
- Existing `/auth`, misspelled image URLs, and the original message URLs remain available. New response shapes are documented in the API reference.
