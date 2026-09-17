# Verification

Tests are executable with npm test; results below are from the local implementation run.

Result: **30 passed, 0 failed, 0 skipped**. `npm run check` checked **58 JavaScript files** with no syntax or local-import casing errors. The real production entry point was launched against the temporary database and successfully opened its HTTP port.

- App imports, health endpoints, missing credentials, unknown URLs and CORS.
- Authenticated encryption round trip and tamper rejection.
- Token type/role key isolation and authorization checks.
- Signup, confirmation, one-time OTP consumption, login, concurrent refresh rotation and logout.
- Private inbox isolation, ownership checks, literal search, filters and bounded pagination.
- Privacy settings, inactive accounts and atomic duplicate suppression.
- Public profile field allowlist, handle uniqueness, QR generation and legacy handle persistence.
- Opt-in publication, safe PNG rendering and revocation of share URLs.
- Report ownership, duplicate prevention, admin moderation and audit records.
- Sender blocking/unblocking without revealing fingerprints.
- Valid uploads, old-image removal, multi-cover uploads, rejected file contents and 5 MB limits.
- Password changes, session revocation, freeze/restore and complete account cleanup.
- NDJSON export excludes sender fingerprints and authentication secrets.
- Live notifications, disabling notifications, and Google-account conflict checks.
- Expired/reused reset codes are rejected.
- MongoDB-backed limiter concurrency and window reset.
- HTTP 429 behavior, CAPTCHA rejection/provider-failure handling, OTP attempt exhaustion and recoverable email delivery failures.

External boundaries: real Gmail delivery and real Google OAuth are not exercised; tests inject deterministic substitutes. CAPTCHA needs a configured Turnstile site and frontend widget for a real end-to-end check. No production database or existing user data is used.

npm audit reported zero known dependency vulnerabilities after compatible dependency updates. This is a point-in-time dependency check, not a guarantee that no vulnerabilities exist.

The project remains a backend API. No frontend existed in the source tree; public profiles and moderation APIs are ready for frontend integration.
