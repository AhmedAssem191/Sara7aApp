# API reference

JSON success: `{ message, data }`. Errors: `{ message, status, details? }`.
Protected routes require `Authorization: Bearer <accessToken>`.
Refresh uses the **refresh token** in that header. Never put tokens in URLs.
Unknown request fields are rejected. Object IDs are 24 hexadecimal characters.

## Authentication

| Method | Path | Body / behavior |
| --- | --- | --- |
| POST | /api/auth/signup | firstName, lastName, email, age, Egyptian phone, password (12–128 chars), confirmPassword |
| PATCH | /api/auth/confirm-email | email, otp (six digits) |
| POST | /api/auth/resend-confirmation | email |
| POST | /api/auth/login | email, password; returns credentials and user |
| POST | /api/auth/social-login | idToken from Google |
| POST | /api/auth/refresh-token | Refresh-token header; returns fresh credentials; previous refresh token cannot be reused |
| POST | /api/auth/logout | Optional flag: logout or logoutFromAll |
| PATCH | /api/auth/forget-password | email; generic response |
| PATCH | /api/auth/reset-password | email, otp, password, confirmPassword |
| GET | /api/auth/sessions | Current account's active sessions |
| DELETE | /api/auth/sessions/:sessionId | Revoke owned session (UUID) |

OTP lifetime: 10 minutes, resend cooldown: 60 seconds, max verification attempts: 5.
`/auth` is an alias for `/api/auth`; `/logout-with-redis` aliases logout.

## Profile and account (authenticated unless public)

| Method | Path | Body / result |
| --- | --- | --- |
| GET | /api/user | Own profile, decrypted phone, profileUrl |
| PATCH | /api/user | Any subset of firstName, lastName, handle, bio, theme, acceptMessages, allowAnonymous, notificationsEnabled |
| GET | /u/:handle | Public profile JSON only; increments view count |
| GET | /u/:handle/qr | SVG QR for the profile link |
| PATCH | /api/user/update-profile-pic | multipart/form-data, one attachments file |
| PATCH | /api/user/update-cover-pic | multipart/form-data, 1–5 attachments files; replaces cover list |
| PATCH | /api/user/update-password | oldPassword, newPassword, confirmNewPassword; revokes all sessions |
| GET | /api/user/stats | total, unread, favorites, published, profileViews |
| GET | /api/user/export | Downloads NDJSON profile + received messages |
| DELETE | /api/user/me | confirmation: DELETE, plus password; Google users provide idToken instead |
| DELETE | /api/user/freeze-account | Freeze self and revoke sessions |
| DELETE | /api/user/:userId/freeze-account | Admin may freeze another account |
| PATCH | /api/user/:userId/restore-account | Admin restores account; old sessions remain revoked |
| DELETE | /api/user/:userId/hard-delete | Admin deletion; can retry tombstone cleanup |
| GET | /api/user/blocks | Paginated block records without sender fingerprints |
| DELETE | /api/user/blocks/:blockId | Remove an owned block |
| GET | /api/user/notifications | Authenticated SSE stream |

Handles: 3–30 lowercase letters, digits, underscore or hyphen, starting with letter/digit.
Themes: light, dark, blue. Bio max 300 characters. Settings reject role/email/password changes.
Images: PNG/JPEG, max 5 MB each, verified by file signature. Historical `upadate-profile-pic` and `upadate-cover-pic` aliases work.
Public profiles never return email, phone, age, roles or moderation data.

## Messages

| Method | Path | Access / body |
| --- | --- | --- |
| POST | /api/message/send-message/:receiverId | Optional authentication; content (trimmed, 2–500 chars), captchaToken when configured |
| GET | /api/message/get-message | Own messages only |
| PATCH | /api/message/:messageId | Owner only; read, favorite, published booleans |
| DELETE | /api/message/:messageId | Owner only |
| POST | /api/message/:messageId/report | Owner only; reason (3–500 chars) |
| POST | /api/message/:messageId/block | Owner blocks source of received message |
| GET | /api/message/public/:receiverId | Public; only explicitly published messages |
| GET | /api/message/shared/:shareId | Public; message content and timestamp |
| GET | /api/message/shared/:shareId/image | Public; PNG image download |

List query: `page=1&limit=20&sort=newest` (limit 1–100; sort newest/oldest).
Private inbox additionally accepts `read=true|false`, `favorite=true|false`, `search=literal text`.
Response: `data: { messages, total, page, limit }`.
Updating publication returns `data.message.shareUrl`. Republishing rotates the link; unpublishing revokes it.
Only the receiver can publish; messages are private by default. Deleting/freezing the recipient hides public shares.
Blocking a signed-in sender creates both account/network block records; remove all returned records to fully unblock that source.
Legacy messages without a sender fingerprint cannot be retrospectively blocked.
Reports retain a content snapshot after individual message deletion for moderation.

## Admin API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /api/message/get-message-admin/:receiverId | Read specified inbox; records access in audit log |
| GET | /api/message/get-message-admin | Reads the admin's own inbox |
| GET | /api/message/reports | Paginated; optional status=open/resolved/dismissed |
| PATCH | /api/message/reports/:reportId | status=resolved or dismissed; open reports only |
| GET | /api/message/admin/stats | users, messages, openReports, frozenAccounts |
| GET | /api/message/admin/audit | Paginated moderation/access events |

All these routes require admin role. These are backend endpoints for a moderation dashboard, not a graphical dashboard.

## Notifications

Fetch `/api/user/notifications` with the Authorization header and read the SSE body. Native browser EventSource cannot add that header, so use a fetch-based SSE client. Events:
- `ready`: connection established.
- `message`: a new message ID and createdAt, without sender identity or message content.
- Comment heartbeat every 15 seconds.

Maximum three connections per account. Tokens/sessions are revalidated before each notification and at heartbeat. Logout, password changes, freezing or disabling notifications close connections. Reconnect with a refreshed access token and fetch the inbox to recover missed events.

## Limits and health

Shared MongoDB counters: global 300/min/IP, auth 30/15min/IP, email 10/15min/IP, send 20/min/IP, uploads 20/15min/IP. Excess requests return 429 and standard rate-limit headers.
Identical message content from the same network to the same receiver is suppressed for 60 seconds.
`GET /health/live` checks process availability. `GET /health/ready` returns 503 until MongoDB is connected.
