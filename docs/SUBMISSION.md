# Project submission guide

## Scope

Sara7a App is a Node.js backend for anonymous messaging. The submitted repository contains the API source, dependency lockfile, configuration template, documentation and automated tests. It does not yet include a frontend or a deployed website.

## Structure

| Path | Responsibility |
| --- | --- |
| `index.js` | Configuration validation, database connection, HTTP startup and shutdown |
| `src/app.controller.js` | Middleware and route registration |
| `src/modules/Auth` | Registration, verification, login, password reset and sessions |
| `src/modules/User` | Profiles, privacy, uploads and account management |
| `src/modules/Messages` | Private messages, publication, blocking and moderation |
| `src/middlewares` | Authentication, authorization, validation and request limits |
| `src/DB/models` | MongoDB schemas and indexes |
| `src/Utils` | Encryption, tokens, email, upload handling and notifications |
| `test` | Unit and isolated database/API integration tests |
| `docs/API.md` | Endpoint and request reference |

## Reproduce the project

1. Follow the installation instructions in the README and run `npm ci` to use the committed lockfile.
2. Create your local `config/.env.dev` from `config/.env.example`. Generate independent secrets and configure a development MongoDB database and a Gmail app password. Do not share this file in the submission.
3. Run `npm run check` and `npm test`. The tests use a temporary MongoDB database and simulated email/Google services, so they do not require your real account credentials. The first run may download MongoDB.
4. Run `npm start` with the development configuration and check `/health/live` and `/health/ready`.
5. Use an API client for the demonstration; there is no frontend in this submission.

## Suggested demonstration

Use accounts created specifically for the demonstration, not personal data.

1. Register a user, confirm the code received by email, and log in.
2. Read the profile and change its handle and privacy settings.
3. Send a message to that user's ID, then open the recipient's inbox.
4. Show that a different signed-in account cannot read or change that message.
5. Mark it read, favorite it, and demonstrate search and pagination.
6. Publish a selected message, download its PNG card, then unpublish it and show that the old share URL no longer works.
7. Report or block a message source. Admin-only features require an account provisioned with the admin role by the database operator.
8. Change the password or revoke a session and show that the old access token is rejected.

For a demonstration without external services, run the automated integration suite. Do not disable email verification or expose test-only authentication bypasses in a running server.

## Repository hygiene

- Real environment files, dependencies, uploaded user content, logs, caches, database files and private certificates are excluded through `.gitignore`.
- The environment example contains blank secret fields. Values inside tests are disposable test fixtures, not production credentials.
- `package-lock.json` is intentionally included for reproducible installation.
- The package is marked `private` to prevent accidental publication to the npm registry; this does not change the visibility of the GitHub repository.
- Never place real credentials in screenshots, API-client exports, commits or the project report.

## Current verification limits

The test suite covers local API behavior, including authorization and ownership checks. Real Gmail delivery, Google OAuth and Turnstile must also be configured and exercised for an external-service demonstration. A clean dependency scan and passing tests are useful evidence, not a guarantee that all security issues have been eliminated. See `docs/VERIFICATION.md` for details.
