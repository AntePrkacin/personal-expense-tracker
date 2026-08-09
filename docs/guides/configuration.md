# Configuration

Every environment variable, its default, and what a missing or half-filled value does. This is
the single home for these tables. Why the pairings and the validation work the way they do is in
`backend/CLAUDE.md` under Environment.

<!-- single-source: backend-env -->

Copy the templates, then fill in values. Both real files are gitignored.

| App      | Template                | Real file             | Variables                                       |
| -------- | ----------------------- | --------------------- | ----------------------------------------------- |
| Backend  | `backend/.env.example`  | `backend/.env`        | see the table below                             |
| Frontend | `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL` (default `http://localhost:3000`) |

Backend variables:

| Variable                 | Default                 | Purpose                                               |
| ------------------------ | ----------------------- | ----------------------------------------------------- |
| `PORT`                   | `3000`                  | API port                                              |
| `FRONTEND_URL`           | `http://localhost:4200` | CORS origin                                           |
| `APP_TIMEZONE`           | `Europe/Zagreb`         | IANA zone the budgeting period resolves in            |
| `DATABASE_DIR`           | `./databases`           | Local database files (gitignored)                     |
| `TURSO_ORG`              | -                       | Organization slug. Cloud mode: set all four or none   |
| `TURSO_ORG_TOKEN`        | -                       | Control-plane token; group-scoped is enough           |
| `TURSO_CENTRAL_DB_URL`   | -                       | Central database URL                                  |
| `TURSO_CENTRAL_DB_TOKEN` | -                       | Central database data-plane token                     |
| `TURSO_GROUP_TOKEN`      | -                       | Break-glass CLI/Studio access; the app never reads it |
| `TURSO_GROUP`            | `decode-pet`            | Group holding the central and all per-user databases  |
| `TURSO_SYNC_INTERVAL_S`  | `60`                    | Cloud-mode push/pull interval                         |
| `MAILPACE_API_TOKEN`     | -                       | MailPace server token. Paired with `MAIL_FROM`        |
| `MAIL_FROM`              | -                       | Sender address, on the DKIM-authorized domain         |
| `MAIL_FROM_NAME`         | -                       | Sender display name; optional, unpaired               |
| `LOGIN_LINK_TTL_M`       | `15`                    | Login-link lifetime, in minutes                       |
| `SESSION_TTL_D`          | `30`                    | Session lifetime in days; fixed expiry, not sliding   |
| `AUTH_RATE_LIMIT`        | `5`                     | Auth requests per window, per submitted address       |
| `AUTH_RATE_IP_LIMIT`     | `30`                    | Auth requests per window, per caller IP               |
| `AUTH_RATE_TTL_S`        | `900`                   | Window length in seconds, shared by both limiters     |
| `GEMINI_API_KEY`         | -                       | Google AI Studio key for receipt scanning; unset means 503 |
| `SCAN_RATE_LIMIT`        | `10`                    | Receipt scans per window, per session user id         |
| `SCAN_RATE_TTL_S`        | `3600`                  | Window length in seconds for the scan limiter         |
| `TRUST_PROXY_HOPS`       | `0`                     | Reverse proxies in front; 0 means `req.ip` is the socket |

Both apps run on their defaults with no `.env` at all, so a missing file is not an error.

The defaults above are the **local development** values. What the deployed backend sets instead
lives in `backend/fly.toml`, and [Deployment](deployment.md) explains the two that carry
consequences: `FRONTEND_URL`, which is both the single allowed CORS origin and the base of every
emailed login link, and `TRUST_PROXY_HOPS`, which is what makes `req.ip` the real caller rather
than Fly's proxy.

Note the filename difference: Nest reads `.env`, Next.js reads `.env.local`.
A typo or a bad value fails at **boot**, not at first use: the backend validates its environment
with a Joi schema (`backend/src/config/env.validation.ts`) and the message names the variable.
The four cloud variables are paired, so a half-filled `.env` is an error rather than a silent
fallback to local mode, and `MAILPACE_API_TOKEN` with `MAIL_FROM` are paired the same way. Both
pairs therefore stay commented out in `.env.example`, value and all, because that file is copied
verbatim by `cp .env.example .env` and uncommenting only one half would leave a fresh clone
unable to start.

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately has no
prefix because it is read server-side only. A `NEXT_PUBLIC_` variable is inlined into the browser
bundle and is therefore public forever.

Note that drizzle-kit never passes through that schema: it reads raw `process.env`, which is why
the two `drizzle.*.config.ts` files repeat the `DATABASE_DIR` default themselves.
