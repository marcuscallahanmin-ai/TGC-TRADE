# TGC TRADE

TGC TRADE is a Node.js community trading-card marketplace MVP.

## Run

- Requires Node.js 18 or newer.
- Run `npm start`.
- The server listens on `PORT` (default `10000`).
- User, session, want, and listing records are stored in `data.json`; uploaded images are stored in `uploads/`.

## Authentication flow

1. The browser requests `GET /api/me` on startup.
2. If no valid session cookie is present, the app shows the sign-in screen.
3. Registration uses `POST /api/register` with a display name, email, password, and location. Passwords must be 10–200 characters.
4. Login uses `POST /api/login`. The server verifies a scrypt password hash using a random per-user salt and constant-time comparison.
5. Successful registration/login issues a random session token in a `tgc_session` cookie. The server stores only its SHA-256 hash and expiry in `data.json`. The cookie is HttpOnly and SameSite=Lax, and Secure is set when the request is HTTPS.
6. Authenticated requests are checked against the server-side session. `POST /api/logout` invalidates the session.
7. Profile updates, listing creation/deletion, and personal wants require a valid session. Listing seller name/location are derived from the authenticated profile rather than trusted from the browser. A user's wants are stored with that user's account ID.
8. Listing browsing remains public. The private `GET /api/my/listings` endpoint returns only the logged-in user's listings.

## Security notes and limitations

- This is an MVP, not a security-audited production service.
- Configure HTTPS in production. Secure cookie behavior relies on the hosting proxy's `x-forwarded-proto: https` header or a TLS socket.
- `data.json` and `uploads/` are local filesystem storage. On ephemeral hosting, data may be lost on restart/redeploy; use a persistent disk or database before real launch.
- Login throttling is in-memory and resets when the server restarts. Production should use a shared rate limiter, email verification, password reset, monitoring, and backups.
- Account registration currently does not verify email ownership.
- Listing media supports JPEG, PNG, WebP images (up to 5 MB after browser compression) and MP4/WebM videos (up to 8 MB). Video playback is available in listing cards/details. Messaging and offer submission are not implemented yet; the current offer button is only a placeholder.
- Existing demo listings remain visible and are not owned by registered accounts. New listings have authenticated ownership.
- The app has not been deployed or integration-tested by this change. Test registration, login, logout, profile editing, listing/image creation, and wants on the target host before treating it as production-ready.

## Deploy to Render

1. In Render, choose **New + → Blueprint** and connect this GitHub repository.
2. Render reads `render.yaml` and creates the `tgc-trade` web service using `npm install` and `npm start`.
3. After the first deploy, open the service URL and verify `/api/health` returns JSON with `"ok":true`.
4. This blueprint uses Render's free plan for initial testing. **Do not use it for real customer accounts or valuable uploads yet:** the free service has an ephemeral filesystem, so `data.json` and uploaded media can disappear after a restart, redeploy, or instance replacement. Durable storage requires a paid persistent disk or moving the data/media to a managed database/object store. Do not upgrade or add paid resources without confirming the cost first.
