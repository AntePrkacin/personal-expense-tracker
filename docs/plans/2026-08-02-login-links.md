# PET-13: account creation and login-link issuing

## Context

PR #3 (`feat/backend-db-bootstrap`) landed the persistence layer and two proof-of-stack
endpoints, `POST /api/users` and `GET /api/users/:id`. Those cover roughly half of PET-13's
AC1 and nothing else. This branch implements the rest: the magic-link half of Register and
Log in, per the tech spec's `register(...)` and `requestLoginLink(email)` operations
(section 4) and requirements REG-4, REG-6, LOG-3, LOG-6, VER-2 with assumptions A32, A34,
A35, A36.

Branch `feat/PET-13-login-links`, cut from `feat/backend-db-bootstrap` because PR #3 is not
merged yet. Nothing is pushed until it is. Rebase then, with
`git rebase --onto main feat/backend-db-bootstrap feat/PET-13-login-links`, which replays
only this branch's own commits and therefore survives PR #3 being squash-merged.

### Decisions made

**Provisioning moves out of registration.** Register writes the central `users` row with
`db_url` and `db_auth_token` left NULL, stashes the onboarding payload, issues a token and
sends the link. The Turso database is created on first touch of the user database, which
happens during verification (PET-14). Three reasons: an unauthenticated endpoint can no
longer create real cloud databases, which closes the pre-auth cost exposure in
`docs/TODO.md` outright rather than mitigating it; register stops making two sequential
Platform API calls, which is what made AC3 leak account existence through response latency
even with identical bodies; and A19 designs no loading state for "Finish setup", so a
register that blocks on cloud provisioning is a spinner-shaped hole in a screen with no
spinner. The schema already permits the NULL state because local mode uses it, so nothing
widens. Recorded on PET-13 as a comment, because a literal read of AC1 says an account
exists holding the profile at register-success and under this ordering the `profile` row
does not exist yet, only the central row holding the same values.

**Both endpoints return an identical empty 202.** REG-6 and LOG-6 with A35 require that
neither register nor request-link discloses whether an account exists. An empty body is
the cheapest way to be byte-for-byte identical, and the frontend already has the submitted
address to interpolate into screen 24. Validation failures still return 400: a malformed
address is a fact about the input, not about the account.

**A link is only ever issued for an account that exists.** Submitting an unknown address to
request-link creates nothing and sends nothing; only the response is identical. Sending
mail to strangers because they were typed into a form is worse than the enumeration it
would be defending against. Every `login_links` row therefore references a real user.

**Email over HTTP, not SMTP, through MailPace.** Outbound SMTP is commonly blocked in
production (port 25 permanently on GCP, throttled on EC2, blocked on Azure and new
DigitalOcean accounts) precisely to limit spam from compromised instances, and 587/465 are
not guaranteed either. HTTPS on 443 always works, gives structured JSON errors instead of
SMTP status codes, and needs no connection handling.

**MailPace's API is called with `fetch`, not their SDK.** `@mailpace/mailpace.js` is at
0.1.3, published 2024-10-12, with two releases ever, and declares `axios@^0.21.1` (capped
at 0.21.4, affected by CVE-2023-45857), `ts-node` and Node 14 typings as *runtime*
dependencies. The API it wraps is one POST. `TursoPlatformService` is already exactly this
shape in this codebase, so the mailer copies it: zero new dependencies and no ESM/Jest
interop risk, which this repo has documented pain with.

**The proof-of-stack endpoints are deleted, not protected.** `POST /api/users` and
`GET /api/users/:id` appear nowhere in the tech spec's API surface. The read is replaced by
a session-scoped `getProfile()` in PET-14; the write is replaced here.

## Design conventions (in addition to the repo's existing ones)

- **Tokens are looked up by hash, never compared.** `randomBytes(32).toString('base64url')`
  gives 256 bits of entropy; the SHA-256 of it is the stored lookup key. Because the hash
  *is* the key, there is no secret comparison and therefore no timing-comparison concern.
  A single unsalted SHA-256 is correct here and bcrypt/argon2 would be wrong: those exist
  to slow brute force against low-entropy secrets, and a 256-bit random value has none of
  that weakness.
- **Two distinct invalidation columns**, `used_at` and `superseded_at`, rather than folding
  supersession into expiry. A38 says an expired, reused or wrong-device link has no
  designed screen, so these will be debugged from the database and "why did this link stop
  working" should be answerable without inference.
- **Rate limiting is keyed on both IP and submitted email**, and runs before the existence
  check. Per-IP alone lets a botnet hammer one address; per-email alone lets one host walk
  a list. Running it first keeps the throttled response identical regardless of whether the
  account exists.
- **Mail send failure never fails the request.** The account is already created and the
  design's own recovery path is "Resend link" (VER-2). A 500 here would tell the client
  registration failed when it succeeded. Log at error level, return the same 202.

## Steps

### 1. Central schema (`src/database/central/schema.ts`)

**`login_links`**, new table: `id` text PK (UUIDv7); `userId` text notNull; `tokenHash`
text notNull with a unique index; `expiresAt` integer notNull epoch-ms; `usedAt` integer
nullable; `supersededAt` integer nullable; the three standard timestamp columns. Index on
`userId` for the supersede-prior query. Plain text `userId` with no `references()`, matching
the existing schema, which declares no foreign keys anywhere and does not rely on
`PRAGMA foreign_keys`; the comment should say so rather than leave it looking like an
oversight.

**`users`** gains `onboardingPayload`, nullable, `text({ mode: 'json' }).$type<...>()`
holding `{ firstName, lastName, currency, monthlyBudget, monthStartDay, categories }`.
Transient: written at registration, read once at verification, then set NULL. It is a
deliberate exception to "central holds only email and a pointer" and the column comment must
say what empties it, or the next reader will treat profile data in central as the pattern.

`npm run db:generate`, commit what it writes. Note the drizzle-kit RC limitation already
recorded in `docs/TODO.md`: the sqlite differ only sees created and dropped entities, so
adding a column to an existing table is fine but altering one in place is not.

### 2. User schema (`src/database/user/schema.ts`)

**`categories`**, per the tech spec's Category entity: `id` text PK (UUIDv7); `name` text
notNull; `color` text notNull; `monthlyCapCents` integer nullable; `icon` text nullable;
`note` text nullable; standard timestamps and `deleted_at`. Only the table and a
`STARTER_CATEGORIES` constant land here. CRUD, stats and the allocation summary belong to
the categories feature.

The ten starter chips in Figma order: Groceries, Dining out, Transport, Shopping, Housing,
Health, Entertainment, Bills, Subscriptions, Other (CAT-2). **Open item: the chip colors are
not in hand.** Pull them from frame 03 or seed with a placeholder ramp and correct it in the
categories ticket. Note A7's known conflict: this set includes Bills and Subscriptions,
which never reappear, while later screens show Health and Other; each screen follows its own
mock until the designer resolves it, so seeding all ten is right.

A `seedStarterCategories(userDb, names)` helper ships here and is *called* from PET-14.

### 3. Login token service (`src/auth/login-token.service.ts`)

- `issue(userId)`: supersede every live token for that user (`superseded_at = now` where
  `used_at IS NULL AND superseded_at IS NULL`), insert a new row, return the raw token. The
  raw value exists only in this return; nothing persists or logs it.
- `consume(rawToken)`: look up by hash, reject when `used_at` or `superseded_at` is set or
  `expires_at` has passed, otherwise mark used and return the `userId`. Written here even
  though PET-14 calls it, because the invalidation rules it enforces are AC4 and AC5 and
  belong with the tests that prove them.
- Expiry from `LOGIN_LINK_TTL_M`, default 15. A34 says minutes, not days.

### 4. Mail (`src/mail/`)

- `mailer.ts`: a `Mailer` interface, `send(message): Promise<void>`, and a `MAILER` DI token.
- `log.mailer.ts`: default. Logs subject, recipient and the link. Keeps "both apps run on
  their defaults with no `.env` at all" true and keeps the e2e suite offline.
- `mailpace.mailer.ts`: `POST https://app.mailpace.com/api/v1/send`, header
  `MailPace-Server-Token`, body `{ from, to, subject, htmlbody, textbody, tags }`, 2xx is
  success. Modelled on `TursoPlatformService`: `AbortSignal.timeout`, and a failed response
  is logged with its body but thrown as a generic error so nothing leaks outward. Send
  `tags: ['login-link']` for separability later. Do **not** send `list_unsubscribe`: that is
  for bulk mail and has no business on the one email that must arrive.
- `login-link.template.ts`: returns `{ subject, htmlbody, textbody }`. Both bodies, because
  text-only improves deliverability. Link is
  `${FRONTEND_URL}/auth/verify?token=<raw>`, using the config value that already exists.
- `MailModule` picks the implementation by whether `MAILPACE_API_TOKEN` is set.

### 5. Auth module (`src/auth/`)

`AuthController` on `@Controller('auth')`, both routes `@HttpCode(202)` returning `void`:

- `POST /api/auth/register` takes `RegisterDto`: the current `CreateUserDto` fields plus
  `categories: string[]` (`@IsIn(STARTER_CATEGORY_NAMES, { each: true })`, `@ArrayUnique()`,
  `@ArrayMaxSize(10)`, no minimum, because A4 says none is enforced).
- `POST /api/auth/login-link` takes `RequestLoginLinkDto`: the same normalized email field.

`AuthService.register(dto)`: look up the email; if a live user exists, issue a token and
send, creating nothing; otherwise insert the central row with the payload, then issue and
send. The unique-index race is now a benign convergence rather than a 409, so catching it
falls through to the issue-and-send path.

`AuthService.requestLoginLink(email)`: look up; if absent, return; otherwise issue and send.

`UsersService` keeps the central-row reads and writes and loses its controller, its
provisioning call, its profile insert and its whole `rollback` method. Register is now a
single insert into one database, so the cross-database compensation that method existed for
has nothing left to compensate. `deleteUserDb` stays on `UserDatabaseService` for PET-14's
provisioning failure path.

### 6. Rate limiting

`npm install @nestjs/throttler`, the only new dependency on this branch. `ThrottlerModule`
configured from `AUTH_RATE_LIMIT` (default 5) and `AUTH_RATE_TTL_S` (default 900), applied
to both auth routes with a custom tracker returning `${ip}:${normalizedEmail}`. Exposed as
config so the e2e suite can trip the limit without waiting fifteen minutes. In-memory
storage, so this assumes a single instance, consistent with the migration-lock note already
in `docs/TODO.md`; add it there. **Open item:** behind a reverse proxy `req.ip` needs
`trust proxy` set or every request shares one key.

### 7. Config (`src/config/env.validation.ts`)

Add `MAILPACE_API_TOKEN` and `MAIL_FROM` (`.email()`), optional and tied together with
`.and()` the way the four `TURSO_*` variables are, so a half-filled `.env` fails at boot
instead of silently logging mail. Add `LOGIN_LINK_TTL_M` (default 15), `AUTH_RATE_LIMIT`
(default 5), `AUTH_RATE_TTL_S` (default 900). Mirror all five into `backend/.env.example`
in its existing commented style, including the note that the MailPace domain needs completed
DKIM authorization and that `MAIL_FROM` must be on that domain.

`test/setup-e2e.ts` must delete `MAILPACE_API_TOKEN` and `MAIL_FROM` alongside `TURSO_*`,
for the same reason: `ConfigModule` would otherwise read them back out of `backend/.env`
and a developer with a filled-in file would send real email from the test suite.

### 8. Tests

Unit: `login-token.service.spec.ts` (raw token never stored, hash is; expiry from config;
issuing supersedes prior; consume rejects used, expired and superseded, and is itself single
use), `auth.service.spec.ts` (new email inserts one row and sends once; existing email
inserts nothing and sends once; unknown email on request-link inserts nothing and sends
nothing; a send failure is logged and swallowed), `mailpace.mailer.spec.ts` (mock `fetch`:
URL, `MailPace-Server-Token` header, body shape, timeout wired, error body logged but not
thrown outward).

E2e: `test/auth.e2e-spec.ts` replaces `test/users.e2e-spec.ts`, which tested the two deleted
routes. A `MemoryMailer` test double via `overrideProvider(MAILER)` makes "exactly one email
sent" assertable. Cases: register new address; register an address that already exists,
asserting the status and body are identical to the first, with no second row; request-link
for an unknown address, identical again and nothing sent; a reissue superseding the prior
token, checked against the central database directly; the throttle returning 429; 400 for a
malformed email and for an unknown extra field.

### 9. Docs

`CLAUDE.md`: replace the users-endpoints description under Not yet built, document the
access flow and the deferred-provisioning decision under Architecture, add the five env
vars. `README.md`: the MailPace setup step, and that it is optional for local work.
`docs/TODO.md`: delete "Unauthenticated registration creates real cloud databases" (this
branch removes the cause) and the Housekeeping branch-name entry (retired with the old
branch); update "Auth, and the users endpoints it replaces" to note that `mintUserDbToken`
is now PET-14's; add the single-instance throttler assumption.

## Commits

1. `docs: plan the login-link flow for PET-13`
2. `feat(backend): add login_links and the onboarding payload column`
3. `feat(backend): add the categories table and starter set`
4. `feat(backend): add the login token service`
5. `feat(backend): add the mailer with a mailpace transport`
6. `feat(backend): add auth register and login-link endpoints`
7. `feat(backend): rate-limit the auth endpoints`
8. `test(backend): cover the login-link flow end to end`
9. `docs: document the access flow and its env vars`

2 through 5 are independent of each other; 6 needs 4 and 5.

## Verification

1. `cd backend && npm run lint && npm run build` (build is the typecheck gate).
2. `npm test` and `npm run test:e2e`. Run both before every commit: the pre-commit hook
   deliberately skips backend tests, and nothing is pushed until PR #3 merges, so there is
   no CI safety net on this branch until the rebase.
3. Local smoke, no `.env`: `npm run start:dev`, POST a registration, confirm the 202 with an
   empty body, the link printed by `LogMailer`, one row in `login_links`, and **no**
   `expensa-user-*.db` file created. POST the same address again: identical response, still
   one user row, a second token with the first now superseded. POST an unknown address to
   `login-link`: identical response, nothing written, nothing logged as sent.
4. Trip the throttle with `AUTH_RATE_LIMIT=2` and confirm 429 on the third call for the same
   address, and that an unknown address throttles the same way.
5. MailPace smoke with credentials set: one real email arrives, the link resolves against
   `FRONTEND_URL`, and the `from` address is on the DKIM-authorized domain.

## Known risks and open items

- **Starter category colors are not in hand.** Blocks nothing but leaves seeded categories
  visually wrong until pulled from Figma frame 03.
- **Unverified registrations hold their email.** The same squatting exposure exists today,
  and this branch at least stops it costing a database, but rows now accumulate. Give them
  an expiry before this is deployed anywhere public.
- **The throttler is in-memory**, so the limit is per instance.
- **`req.ip` behind a proxy** collapses every caller to one key unless `trust proxy` is set.
- **Timing is equalized, not measured.** Both paths now do one indexed read plus at most one
  insert and one HTTP send, but nobody has profiled them. If enumeration resistance ever has
  to be more than best-effort, this needs a measurement rather than an argument.
- **A send failure still strands the user** on screen 24 with only Resend. That is the
  design's own answer (A36) and is accepted, not solved.
