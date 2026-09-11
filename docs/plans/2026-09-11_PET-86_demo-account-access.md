# PET-86: a demo account a recruiter can open, and the pool behind it

Jira: [PET-86](https://decode.atlassian.net/browse/PET-86) · Epic: **to be filed** · Design:
**none**. No frame draws a demo entry point, an unavailable state, or anything else in this ticket,
so the copy, the placement and the whole `/demo` flow are invented and owe a designer the way A39's
logout control did. The ticket should carry `design-review` for that reason.

Base branch: `main` at `dba3bb3`. Nothing to stack on. Note that `dba3bb3` landed directly on `main`
rather than through a branch, which is how the `TURSO_GROUP` default reached `default` ahead of this
work.

## Why

The repo is going public as a portfolio piece from the Decode Academy final project. A recruiter
should be able to open a link, land on a populated dashboard and click around, with no email round
trip. Three facts make that impossible today:

1. **There is no way in.** Access is passwordless only. A login link is single-use with a 15 minute
   default TTL; `invite-showcase.ts` can stretch a minted link to 336 hours and it is still consumed
   by the first click; a session is a 30 day absolute bearer. `POST /api/auth/verify` is the app's
   only session issuer.
2. **Mail is gone.** The domain and mail service are no longer set up and will not be. Cloud Run
   carries no `MAILPACE_API_TOKEN` or `MAIL_FROM`, so login links are written to logs and delivered
   to nobody. The normal login flow is therefore dead for every visitor, including the owner.
3. **Pre-seeded data goes stale on its own.** The showcase fixture positions transactions by
   `(month, occurrence)` and `seed-showcase.ts` resolves them against **today**. An account seeded in
   September shows September as the current period; opened in November its current period is empty
   and the app looks broken rather than populated.

Two more facts constrain the design:

- **Turso is on the starter plan with overages disabled**: 100 databases, 10M rows written per month,
  1 group. Since this app is database-per-user, every demo account costs one database slot against a
  hard cap that, once hit, fails provisioning for real signups too.
- **`docs/TODO.md` records "a single instance is a deployment invariant"** and three behaviours depend
  on it: the in-memory `@nestjs/throttler` store, the absent cross-process migration lock, and
  `InsightsService`'s in-memory `inFlight`/`dirty` state. Cloud Run is configured `maxScale: 20`,
  `minScale: 0`, `containerConcurrency: 80`. Fly held the invariant by construction; the GCP migration
  dropped it silently, and **no file in the repo mentions GCP or Cloud Run at all**.

Intended outcome: a shareable `/demo` link that hands each visitor their own isolated, fully populated,
writable account out of a bounded pool of ten, restored to the fixture on every hand-out. Plus the
single-instance enforcement restored and the deploy tooling telling the truth about where this
deploys.

## Approach

A **pool of 10 pre-seeded demo accounts, leased per visitor.** Rejected alternatives and why, briefly:
provisioning an account per visitor draws down the 100 database cap from an unauthenticated public
route and puts a Platform API create, migrations and 2,249 inserts inside a click; a single shared
account lets one visitor's deletions become the next visitor's first impression; a read-only session
is a new auth concept and contradicts "click around".

### Backend

```
backend/src/demo/
  demo.module.ts
  demo.controller.ts                  POST /api/demo/session   @Public()
  demo-lease.service.ts               expire -> claim -> release
  demo-seed.service.ts                the fixture write phase, extracted
  dto/demo-session.response.dto.ts    { token, expiresAt }
```

`AuthController`'s four published routes stay untouched, and the whole feature is one removable
directory with its own OpenAPI tag.

**`DemoSeedService` is an extraction, not new code.** `seed-showcase.ts`'s `seed()` (lines 278-406),
`generateInsights()` (426-473), `ensureShowcaseUser()` (191-226) and `assertCategoriesMatch()`
(245-276) already depend only on injected services (`ConfigService`, `UsersService`,
`VerificationService`, `LoginTokenService`, `TemplatesService`, `UserDatabaseService`,
`InsightsService`) and pure helpers (`showcase/fixture.ts`, `showcase/dates.ts`,
`showcase/plan.ts`'s `MAX_DAY_OF_MONTH`, `common/period-rules`'s `mostRecentAnchor`,
`common/month-window`'s `todayIn`). They move into the service with the module-level
`SHOWCASE_EMAIL` constant becoming a method parameter, and the CLI then calls
`app.get(DemoSeedService)` so there is exactly one implementation of the write phase.

Two things stay behind in the CLI and must not follow: everything in `seed-showcase.env.ts` (a live
app must never mutate its own `process.env`) and `bootstrap()`'s `app.close()` (it would close the
shared `UserDatabaseService` connections under every other request).

**The lease lives in central**, as a new `demo_accounts` table. This needs arguing in
`backend/src/database/CLAUDE.md` rather than assuming, because that file names exactly four sanctioned
exceptions to "central holds only an email and a pointer". The argument: a lease is about *which
session may be issued next*, which is the same reason `sessions` and `login_links` are already there,
and it is not profile data. Shape follows the file's own conventions: UUIDv7 text PK, `integer(...,
{ mode: 'timestamp_ms' })` throughout, `createdAt`/`updatedAt`/`deletedAt`, no `references()`.

| column | meaning |
| --- | --- |
| `userId` | the pooled account, plain text, no FK |
| `leaseExpiresAt` | nullable; non-null means leased, and the lease dies at this instant |
| `leasedAt` | nullable; when the current or last lease started |
| `seededAt` | when the fixture was last written to this account |

Indexes: `demo_accounts_user_id_live_unique` (partial unique where `deletedAt IS NULL`) and
`demo_accounts_lease_expires_at_idx`.

**The lease algorithm**, per request, serialized through an `issueQueue`-style promise chain copied
from `LoginTokenService` (lines 46-53) because the embedded Turso driver runs one connection per
database and refuses overlapping transactions:

1. **Expire** every lease whose `leaseExpiresAt` is in the past, in one `UPDATE`. This is a lazy
   sweep on the request path, which is why the feature needs no scheduler at all and works with
   `minScale: 0` and CPU throttling.
2. **Claim** one free account with a single conditional `UPDATE ... RETURNING` ordered by
   `leasedAt` ascending nulls first, never a read followed by a write. `LoginTokenService.consume()`
   is the precedent.
3. **No free account** means `503` with `Retry-After`, which is the polite-busy answer.
4. **Re-seed** the claimed account unless it has never been leased and was seeded today, then issue a
   session with `SessionService.issue(userId)` and return `{ token, expiresAt }`, the same shape
   `VerifyResponseDto` carries.
5. **A seed failure releases the lease** and answers `503`. The write phase is only partly
   transactional (only the `transactions` delete-and-insert is wrapped), so a failed re-seed can leave
   a half-written account, and the lease must not survive it.

Insight generation is floated by `generate()` and only observable by polling `getSet()` until its
state leaves `generating`. The CLI polls for 15s; the request path gets a **4s budget** and proceeds
regardless, because the dashboard already renders a `generating` state and a recruiter waiting on
insight cards is worse than a recruiter seeing them fill in.

A **fifth named throttler**, `demo`, tracked by IP with `trackByIp`, `DEMO_RATE_LIMIT` default 5 over
`DEMO_RATE_TTL_S` default 3600. Adding it is not one line: every throttled route in the app must skip
every throttler it is not named by, and a bare `@SkipThrottle()` means `{ default: true }` and
silently skips nothing, so each existing `@UseGuards(ThrottlerGuard)` controller gains
`demo: true` in its skip list and the new route skips the other four.

`DEMO_ENABLED`, Joi boolean defaulting to **false**, so a fresh clone and the e2e suite do not expose
a public session minter by accident. Disabled answers `404`, not `503`, so a deployment without a pool
does not advertise a feature it lacks.

### Frontend

The entry point is a **shareable URL the README can carry**, so it is a navigation, and this repo's
recorded rule is that a navigation forces a route handler: `frontend/src/app/demo/route.ts`, a `GET`
mirroring `app/auth/verify/route.ts` almost exactly. It POSTs the fixed backend path, classifies the
status through a `Record<number, DemoFailureReason>` the way `REASON_BY_STATUS` does, computes
`sessionCookieOptions(expiresAt)`, sets `SESSION_COOKIE` on the response object, and answers a
**relative 307** to `/dashboard` via a hand-built `NextResponse` (never `NextResponse.redirect()`,
which demands an absolute origin).

This buys one code path for both entry points: the Welcome screen's "Try the demo" is a plain anchor
to `/demo`, not a Server Action, so there is no second implementation to keep in step.

**One trap to handle deliberately: this is a GET with side effects.** A Next.js `<Link>` prefetch, a
crawler following the README, or a link preview would silently burn a lease. So it must be a plain
`<a>` (or `prefetch={false}`), the handler sets `Cache-Control: no-store`, `robots.txt` disallows
`/demo`, and the `demo` throttler bounds the rest. A burned lease self-heals: it expires and the next
hand-out re-seeds it.

Failure lands on `/demo/unavailable?reason=...`, an `AccessCard` screen mirroring
`auth/verify/failed/`. It cannot use the PET-77 toast region, because `ToastProvider` is mounted on
`(app)/layout.tsx` and the access screens sit outside that group and have no toast surface at all.

Note this is the app's second cookie setter; `auth/verify/route.ts` was the only one.

### Ops

`--max-instances=1`, applied and then **encoded in the deploy tooling** so a future deploy cannot
drop it again. Since the user asked for the GCP port in this ticket, the Fly tooling is replaced
rather than left lying: `deploy.yml`, `deploy-verify.yml`, `scripts/deploy-backend.sh`, the
`repo-fly` skill, `backend/fly.toml`, the Fly volume steps in `scripts/reset-databases.sh`, and the
guides that describe deployment. This half is independently valuable and roughly doubles the ticket;
splitting it into PET-87 if the PR gets unwieldy is reasonable and worth raising at review.

## Tasks

**Plan and branch**

- [ ] Commit this plan alone as `docs/plans/2026-09-11_PET-86_demo-account-access.md` on
      `feat/PET-86-demo-account-access`, push with `-u`, open a draft PR with this checklist in the body

**Central schema and the lease**

- [ ] Add the `demoAccounts` table to `backend/src/database/central/schema.ts` with both indexes
- [ ] Generate the central migration with `npm run db:generate:central`, commit both
      `migration.sql` and `snapshot.json` unedited
- [ ] Argue the fifth central exception in `backend/src/database/CLAUDE.md`

**Seed extraction**

- [ ] Create `backend/src/demo/demo-seed.service.ts` by moving `seed()`, `generateInsights()`,
      `ensureShowcaseUser()` and `assertCategoriesMatch()` out of `seed-showcase.ts`, taking the
      account email as a parameter
- [ ] Rewrite `seed-showcase.ts` to call `app.get(DemoSeedService)`, keeping `seed-showcase.env.ts`
      and the `app.close()` teardown CLI-only
- [ ] Accept a repeatable `--email=` (or `--pool`) so one app context seeds all ten accounts, rather
      than paying `NestFactory.createApplicationContext` ten times
- [ ] Register each seeded account in `demo_accounts`, idempotently
- [ ] Add `mise run seed:demo-pool` and `seed:demo-pool:cloud` tasks
- [ ] Fix the now-false deliverability comments in `seed-showcase.ts` (the `slavko@` docblock) and
      step 5 of both sections of `docs/guides/seeding-dummy-data.md`

**The endpoint**

- [ ] `demo-lease.service.ts`: expire, claim via conditional `UPDATE ... RETURNING`, release, all
      serialized through an `issueQueue`-style chain
- [ ] `dto/demo-session.response.dto.ts` mirroring `VerifyResponseDto`
- [ ] `demo.controller.ts`: `POST /api/demo/session`, `@Public()`, `@HttpCode(200)`,
      `@ApiErrorResponse(...)`, 404 when `DEMO_ENABLED` is false, 503 with `Retry-After` when the pool
      is exhausted
- [ ] `demo.module.ts`, wired into `AppModule`
- [ ] Add `DEMO_ENABLED`, `DEMO_RATE_LIMIT`, `DEMO_RATE_TTL_S` and `DEMO_LEASE_TTL_M` to
      `env.validation.ts`, `env.validation.spec.ts`, `backend/.env.example` and
      `docs/guides/configuration.md`
- [ ] Register the fifth `demo` throttler in `app.module.ts` and add `demo: true` to every other
      throttled controller's skip list
- [ ] `npm run api:sync` from the repo root, commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts`

**Frontend**

- [ ] `frontend/src/app/demo/route.ts`, modelled on `auth/verify/route.ts`, with a
      `Record<number, DemoFailureReason>` status map
- [ ] `frontend/src/app/demo/unavailable/` page plus screen component, on `AccessCard`
- [ ] Declare `/demo` under `HANDLERS` and `/demo/unavailable` under `BUILT` in `lib/routes.ts`
- [ ] Add the "Try the demo" anchor to `WelcomeScreen.tsx` with prefetch off, plus its story
- [ ] Disallow `/demo` in `robots.txt`
- [ ] Read the response type as `components['schemas']['DemoSessionResponseDto']`, never restated

**Tests**

- [ ] `backend/src/demo/*.spec.ts` for the lease service, using the `test/query-chain.ts` helper
- [ ] `backend/test/demo.e2e-spec.ts`: hand-out, isolation between two leases, 503 on exhaustion,
      lease expiry reclaim, the seeded-today skip, 404 when disabled, and the throttler
- [ ] `frontend/src/app/demo/route.test.ts` with `/** @jest-environment node */`, covering the cookie
      write, the 307 target, and every failure arm
- [ ] Watch the relevant proof or assertion fail before making it pass, as PET-67 did with
      `EverySortIsOffered`

**Ops and deployment**

- [ ] `gcloud run services update expenso --max-instances=1 --region=europe-west1`
- [ ] Replace `.github/workflows/deploy.yml` with a Cloud Run deploy that passes `--max-instances=1`
      explicitly, so the invariant is enforced by tooling
- [ ] Update `deploy-verify.yml`, `scripts/deploy-backend.sh` and the `repo-fly` skill for GCP
- [ ] Rewrite the Fly volume steps in `scripts/reset-databases.sh` for Cloud Run's ephemeral `/tmp`
- [ ] Retire `backend/fly.toml` and every Fly reference in `docs/guides/`
- [ ] Seed the ten-account pool into Turso Cloud and set `DEMO_ENABLED=true` on Cloud Run

**Docs**

- [ ] `backend/CLAUDE.md`: a Demo section, the throttler count four to five, the public route count
      five to six
- [ ] `frontend/src/app/CLAUDE.md`: the new handler, the second cookie setter, the GET-side-effect
      trade-off
- [ ] Root `CLAUDE.md`: the PET-86 paragraph, and correct the PET-84/85 claim that mail is deliverable
- [ ] `docs/guides/` : a demo-pool guide covering re-seeding, lease TTL and what to do when the pool
      is exhausted
- [ ] `docs/TODO.md`: record the single-instance enforcement gap, the GET-with-side-effects decision,
      and that the connection cache now holds ten demo databases
- [ ] Update every `## Not built here` section this changes, and pass `npm run docs:check`

## Files

**New**: `backend/src/demo/` (five files plus specs), `backend/drizzle/central/<timestamp>_demo_accounts/`,
`backend/test/demo.e2e-spec.ts`, `frontend/src/app/demo/route.ts`,
`frontend/src/app/demo/unavailable/{page.tsx,DemoUnavailableScreen.tsx}`, a GCP deploy workflow, the
demo-pool guide.

**Modified, load-bearing**: `backend/src/scripts/seed-showcase.ts` (gutted to a CLI wrapper),
`backend/src/database/central/schema.ts`, `backend/src/app.module.ts` (throttler and module),
`backend/src/config/env.validation.ts`, every throttled controller (skip lists),
`frontend/src/app/WelcomeScreen.tsx`, `frontend/src/lib/routes.ts`, `mise.toml`,
`scripts/reset-databases.sh`, both generated contract artifacts.

**Reused rather than rewritten**: `SessionService.issue()`, `LoginTokenService`'s `issueQueue` pattern
and its `consume()` conditional-update shape, `sessionCookieOptions()`, `AccessCard`, `FormError`,
`ApiErrorResponse`, `trackByIp`, `showcase/fixture.ts` and `showcase/dates.ts`, `mostRecentAnchor`,
`todayIn`, `test/query-chain.ts`.

## Verification

1. `cd backend && npm run build && npm test && npm run test:e2e`; `cd frontend && npm run build && npm test`.
2. `npm run api:sync` from the root leaves no diff.
3. `mise run docs:check` and the root lint pass.
4. Local end to end, which is the check that matters most, because the two defects this repo's gates
   have historically missed (PET-64's colours, PET-85's overflow) were both found by opening the app:
   - `mise run reset && mise run seed:demo-pool`, `DEMO_ENABLED=true mise run dev`
   - open `http://localhost:4200/demo`, confirm a populated dashboard with the **current** period
     filled, insight cards present, and every screen rendering real figures
   - in a second browser profile open `/demo` again, confirm a **different** account, then delete a
     category in one and confirm the other is untouched
   - set `DEMO_LEASE_TTL_M=1`, exhaust the pool with eleven hand-outs, confirm the eleventh gets the
     polite unavailable screen, then confirm a hand-out succeeds again after the TTL
   - empty an account entirely, release it, take it again, and confirm the fixture is back
5. Confirm `gcloud run services describe expenso` reports `maxScale: 1`, then deploy through the new
   workflow and confirm it still does.
6. Seed the cloud pool, check `turso db list` shows eleven databases, and `turso plan show` reports
   database and row-write usage well inside the starter limits.
7. Open the deployed `/demo` from a phone on mobile data, which is the only check that exercises the
   real proxy, the real cookie `secure` flag and a cold start together.

## Risks

- **The re-seed is in the request path.** Roughly 2,300 inserts plus a 4s insight budget. If it reads
  slow in practice, the honest fix is a loading screen on `/demo` rather than skipping the re-seed.
- **The write phase is not fully transactional.** Only the `transactions` table is wrapped, which is
  why a failed seed must release the lease rather than hand out a half-written account.
- **No gate in this repo can see a stale pool.** If the ten accounts are never re-seeded and every
  lease is skipped, the calendar problem returns silently, exactly as PET-85's constant went stale for
  two tickets with every check green. The `seededAt` skip condition is deliberately narrow for that
  reason: never leased **and** seeded today.
