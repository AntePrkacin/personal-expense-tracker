# PET-52: the verify page, the session cookie and the signed-in redirects

No Figma frame: the Screens page holds 24 and none of them is this. The closest visual
authority is **24 Check your email** (node `134:1142`), whose card `components/AccessCard.tsx`
already reproduces. Routes `/auth/verify` (a route handler) and `/auth/verify/failed`. Branch
`feat/PET-52-verify-page-and-session-cookie`, stacked on
`feat/PET-12-login-and-check-your-email` (PET-12 is not merged), with the draft PR based on that
branch so GitHub retargets it when [#30](https://github.com/AntePrkacin/personal-expense-tracker/pull/30)
lands.

## Context

The access flow is finished on the backend and finished on the frontend right up to the point
where the user leaves for their inbox. `POST /api/auth/verify` spends a link, provisions the
account on first use and answers `{token, expiresAt}`; `GET /api/auth/session` answers who a
bearer is. Nothing on the frontend calls either. The emailed link points at
`${FRONTEND_URL}/auth/verify?token=<raw>`, built in `backend/src/mail/login-link.template.ts`,
and that route **404s today** - so every account this app can create is unreachable. Onboarding
ends at `/check-email`, the mail arrives, and the link goes nowhere.

Three seams have been waiting on this branch and all three say so in their own files.
`requireSession()` in `frontend/src/lib/session.ts` lets every request into the `(app)` shell,
which is PET-19's deferral of its AC5. `hasSession()` answers `false` for everybody, which is
PET-8's, and is what puts Welcome at `/` for a signed-in visitor. And `PLACEHOLDER_PROFILE` in
`app/(app)/layout.tsx` feeds the sidebar footer Figma's own sample data behind a `TODO(PET-52)`.
The two doc comments in `lib/session.ts` are the specification for the first two, and the one
thing they deliberately withheld is the cookie's name, because PET-19 would have been handing
over a contract it had not chosen. This branch chooses it.

Four things were decided with the ticket owner while planning: the failure surface is its own
route, `/setup` and `/login` get gated, the sidebar profile becomes real, and the cloud-mode
verify latency is measured here rather than deferred again.

## What the design actually says

**Nothing, and that is the finding rather than a gap in the research.** Verified against the
file with the Figma MCP: the Screens page carries exactly 24 named frames, 01 to 24, and there
is no verify frame, no expired-link frame and no error frame anywhere among them. The spec says
the same twice over - VER-4 and A33 record that "the link-opening step has no frame of its own",
and A38 says outright that nothing is designed for opening the link: no success landing, no
expired, already-used or wrong-device screen, only the instruction to "handle these with plain
messages and a way to request a new link".

So the success path is a redirect nobody sees, and the failure screen is net-new UI. Its one
visual authority is frame 24 (node `134:1142`), checked against a render: a 520px centred column
with the lockup 38px tall above it, the card 24px below that, content inset `x 40` / `y 36`,
heading to body 8px, and a footer row carrying a single secondary control flush right. Every one
of those numbers is already in `components/AccessCard.tsx` and `app/check-email/LogInAgain.tsx`,
which is exactly why the extraction PET-12 did to `SetupShell` pays for itself here rather than
one screen later.

VER-4 also distinguishes 05 Dashboard - Empty for a new account from 04 Dashboard for a
returning one. Both are the route `/dashboard`, and the ticket says landing on the existing route
is enough; the empty state belongs to the Dashboard epic.

## Decisions

**`/auth/verify` is a Route Handler, and the navigation is what forces it.** `route.ts`, not
`page.tsx`: the browser *arrives at* this URL by following a link, and a Server Action cannot
answer a GET navigation. `docs/agents/api-contract.md` already predicts this and already draws
the distinction that matters - what forces the handler is the navigation, not the cookie, since
`registerAccount` proves an action sets one perfectly well. A page could not do it anyway: a
Server Component cannot write a cookie, and POSTing the token from a client component would drag
a live credential into client-side JavaScript, against the template's own constraint that this
page load no third-party resources and consume the token immediately.

The handler is the whole success path:

```
GET /auth/verify?token=...
  no token, or empty        -> 302 /auth/verify/failed?reason=invalid   (never POSTs)
  POST /api/auth/verify { token }
    200 -> set spendifico.session, delete spendifico.pending_email, 302 /dashboard
    400 -> 302 ...?reason=invalid
    401 -> 302 ...?reason=invalid
    409 -> 302 ...?reason=superseded
    429 -> 302 ...?reason=busy
    anything else, or a throw -> 302 ...?reason=failed
```

400 folds into `invalid` rather than getting a case of its own. It means the token was malformed
or absent, which to the person holding the email is indistinguishable from a link that stopped
working, and the advice is identical.

**The cookie is `spendifico.session`.** Same namespace as `PENDING_EMAIL_COOKIE`, which is the
only precedent this repo has, and the same option shape:

- `httpOnly`, because no client code has any use for it and AC6 requires the raw token never
  reach client-side JavaScript.
- `sameSite: 'lax'`, which is **required rather than chosen**: the emailed link arrives as a
  cross-site top-level GET, and `'strict'` withholds cookies from exactly that. Both
  `lib/pendingEmail.ts` and `docs/TODO.md` already say so, so do not "tighten" it.
- `secure` outside development only, since local dev is plain HTTP.
- `path: '/'`.

`__Host-spendifico.session` was considered and rejected. The prefix is the hardened form and
browsers enforce `Secure`, `Path=/` and no `Domain` for it - but it requires `Secure`
unconditionally, and `secure` is false in development here, so the cookie would silently fail to
set under `npm run dev`. A security control that is off in the one environment a developer
watches is worse than the plain name.

**`maxAge` is derived from `expiresAt`, and that is the one place this improves on the cookie
beside it.** `lib/pendingEmail.ts` hard-codes fifteen minutes to mirror `LOGIN_LINK_TTL_M`, a
duplication `docs/TODO.md` records as accepted-because-unfixable: the frontend has no channel to
a backend variable. Verify does not have that problem, because it returns the instant in its
response body. So the cookie's lifetime is
`Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)` and there is nothing to drift from
`SESSION_TTL_D`. A value that is not a positive number - an unparseable string, or an instant
already past - is treated as a failed verify rather than written as a session, because a cookie
with a non-positive `Max-Age` is a cookie the browser deletes on arrival, which would look like
a successful sign-in that immediately signs the user out.

**One shared read behind both session seams.** `lib/session.ts` gains a module-private
`readSession()`: read the cookie, and if it is there call `GET /api/auth/session` on
`BACKEND_URL` with the value lifted into `Authorization: Bearer <token>` and `cache: 'no-store'`,
because the backend reads no cookies at all by design. It answers a `SessionResponseDto` or
`null`, where a missing cookie, a 401 and a network throw are all `null` - the same never-throw
discipline `lib/backend.ts` sets, for the same reason: a rejection inside a Server Component
reaches the client as an opaque digest nothing can branch on.

`requireSession()` redirects to `ACCESS_ROUTES.login` on `null` and otherwise returns the
session; `hasSession()` answers `readSession() !== null`. That is precisely the "the two should
share whatever helper does the fetch rather than each doing their own" both doc comments ask
for, and it keeps the two functions separate for the reason they were separate as stubs: the
shell wants to be let through or sent away, the root route wants a fact to branch on.

**`requireSession()` cannot clear a stale cookie, and its spec is amended to say so.** Step 4 of
its doc comment says "clear the cookie and redirect the same way as a missing one". It cannot:
the only caller is a layout, a Server Component, where `cookies()` is read-only and `.delete()`
throws `ReadonlyRequestCookiesError` at runtime with nothing in the types to warn you - the same
trap `lib/pendingEmail.ts` documents for `.set`. The clear also costs almost nothing now that
`maxAge` tracks `expiresAt`: an *expired* session's cookie is already gone from the browser
before the backend would reject it. The only state that leaves a live cookie holding a dead
token is a manual revocation tombstone, which `docs/TODO.md` already describes as a hand-run
operation with no user-facing path to it. So the redirect stands, the clear does not happen, and
the doc comment is rewritten rather than left describing something the file does not do.

**The failure screen is `/auth/verify/failed`, and the reason travels in the query string.**
Four reasons - `invalid`, `superseded`, `busy`, `failed` - validated on read against a literal
union, with anything unrecognised falling back to `failed`. That is the same "everything this
module hands out is something the system could have produced" discipline `parseDraft` applies to
sessionStorage and `readPendingEmail` applies to its cookie, and it matters for the same reason:
the value is user-editable and is interpolated straight into the screen's copy.

**A query parameter is safe here in a way it was not for PET-12.** The argument that replaced
`/check-email?email=` with a cookie was the server access log, not the address bar - every
registration was writing a user's address into Next's request log and everywhere upstream.
`?reason=superseded` is not personal data and identifies nobody, so none of that applies, and a
cookie would be a mechanism with no threat behind it.

The screen is `AccessCard` with a heading, one line of body copy and one control. The control is
`ResendLink` when the pending-email cookie still holds an address and `LogInAgain` when it does
not - the identical pair `/check-email` already renders, already tests, and already handles the
mid-session expiry swap for. A38 asks for "a way to request a new link" and this is literally
that component.

**`ResendLink` and `LogInAgain` move to `components/`.** Two routes render them now, which is the
exact move PET-12 made when Log in and Check your email turned out to draw the same card
`SetupShell` owned, and the rule `frontend/CLAUDE.md` states: shared UI that belongs to more
screens than one route segment holds goes in `components/`, beside `LogoLockup` and
`AccessCard`. Neither is a Components-page tile, so `ui/` stays wrong for both.

`resendLoginLink` **stays** in `app/check-email/actions.ts` and is imported by both pages. It is
a fixed-path Server Action owned by the resend behaviour rather than by either screen, and moving
it would mean inventing a home convention for shared actions - `lib/` deliberately holds no
`'use server'` module, which `lib/backend.ts` is explicit about - to serve one extra caller. If a
third appears, lift it then; that is the rule `utilities.test.ts` states about its own harness.

**`/setup` and `/login` get the same `hasSession()` branch `app/page.tsx` uses.** `docs/TODO.md`
hands both to this branch in one breath - "whichever way PET-52 answers this for `/setup`, it
should answer it for `/login` in the same breath" - and the answer is the same for both: a
signed-in visitor goes to `/dashboard`. Both were ungated only because a third and fourth call
into the stubs would have been claims nothing could test, and that reason is gone the moment the
stubs are real.

The gate goes on `app/setup/layout.tsx`, not on the three step pages: one call site covering all
three, in the file that already wraps them. `/login` loses its static prerender as a result,
which is correct rather than a regression - the cookie read opts the route out on its own,
exactly as `lib/session.ts` predicted for `/`, so **neither page gets an `export const
dynamic`**.

**`/check-email` stays ungated, deliberately.** It is the one screen whose entire premise is that
no session exists yet, and gating it would add a round trip to the pre-session wait to defend
against a state nobody reaches by accident. Recorded in `docs/TODO.md` so it reads as a decision
rather than an inconsistency somebody re-derives from the other three.

**The sidebar profile becomes real, through a second read rather than a folded-in one.**
`lib/profile.ts` gains `readProfile()`, the same cookie-plus-bearer shape as `readSession()`,
against `GET /api/profile` - the endpoint PET-45 shipped, which stitches the names from the
per-user `profile` row together with the email from the central `users` row, which is exactly the
seam `PLACEHOLDER_PROFILE`'s comment describes.

The shell therefore makes **two** backend requests where the profile read alone would have
satisfied both the gate and the data, and that is chosen rather than overlooked. The gate and the
profile are different concerns: `/`, `/setup` and `/login` want the gate and no profile, and
folding them would make `lib/session.ts` depend on a Settings-shaped endpoint that three of its
four callers have no use for. It is the same trade `backend/CLAUDE.md` already accepts and
documents for the dashboard reading the profile row up to three times in one request. A `null`
profile behind a live session is the broken invariant the backend answers 500 for, so the layout
redirects to Log in rather than rendering half a sidebar.

**`export const dynamic = 'force-dynamic'` comes out of `(app)/layout.tsx`.**
`frontend/src/app/CLAUDE.md` states the condition outright: PET-52's `cookies()` read makes the
segment dynamic on its own, "at which point the line becomes redundant and should be deleted
rather than left as a claim about nothing". Its assertion in `layout.test.tsx` goes with it, and
the suite keeps the sharper of the two assertions - that the session call site still exists.

**`ACCESS_ROUTES` gains two keys, and `routes.test.ts` gains a third classification.** `verify`
and `verifyFailed` both belong there: the handler redirects to the second, which is a link-out in
the sense that file means. But `verify` is answered by a `route.ts` rather than a `page.tsx`, and
that suite asserts with `fs` that every built route has a `page.tsx` behind it - so it needs a
`HANDLERS` list checking for the right filename instead of an exemption, on the same reasoning
that keeps `PENDING` as an empty array rather than deleting the structure: a key must be forced
into a decision instead of silently escaping the check.

**No `api:sync`.** No DTO, response shape or controller changes, so both generated artifacts stay
byte-identical and the two drift jobs prove it. Every request and response type is read out of
`frontend/src/types/api.d.ts` - `VerifyLoginLinkDto`, `VerifyResponseDto`, `SessionResponseDto`,
`ProfileResponseDto` - rather than hand-declared, which is the rule `docs/agents/api-contract.md`
sets for every caller and which this branch is the first *read* to follow.

## Copy

Four new strings plus four headings, none read off a frame, all joining what A29 owes a designer
alongside PET-11's five and PET-12's five.

| Reason       | Heading                   | Body                                                                                          |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| `invalid`    | This link no longer works | Login links can only be used once and expire after a short time. Send yourself a new one.       |
| `superseded` | A newer link was sent     | This link was replaced when a newer one was requested. Open the most recent email to sign in.   |
| `busy`       | Too many attempts         | Please wait a few minutes and then request a new link.                                          |
| `failed`     | We couldn't sign you in   | Something went wrong on our end. Please try again.                                              |

Straight apostrophes, following the spec and every other string in the repo rather than Figma's
curly ones. The control reuses `Resend link` and `Log in again`, so no new control copy.

The `superseded` line is the one the backend built its 409 for: `docs/TODO.md` records that Gmail
collapses these emails into a single thread because every message has an identical sender and
subject, which makes clicking the older of two ordinary rather than exotic. Distinguishing it
from the 401 needs no body parsing - the status code alone carries it.

## Files

New:

| File                                                          | What it is                                              |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `frontend/src/app/auth/verify/route.ts`                       | the GET handler: POST, cookie, redirect                  |
| `frontend/src/app/auth/verify/failed/page.tsx`                | reads `?reason=` and the pending address, narrows        |
| `frontend/src/app/auth/verify/failed/VerifyFailedScreen.tsx`  | the `AccessCard`, the copy table, the control            |
| `frontend/src/lib/profile.ts`                                 | `readProfile()`                                          |
| `frontend/src/components/ResendLink.tsx`                      | moved out of `app/check-email/`                          |
| `frontend/src/components/LogInAgain.tsx`                      | moved out of `app/check-email/`                          |

Modified: `lib/session.ts` (both seams filled in, plus `SESSION_COOKIE` and `readSession()`),
`lib/pendingEmail.ts` (a response-scoped clear), `lib/routes.ts` and `routes.test.ts`,
`app/(app)/layout.tsx` and its suite, `app/login/page.tsx`, `app/setup/layout.tsx` and its suite,
`app/check-email/{page,CheckEmailScreen}.tsx` and their suites (import paths only),
`app/screens.stories.test.tsx`, `components/ui/utilities.test.ts`, `frontend/.env.example`, plus
the documentation in step 7.

Plus a colocated test for every new file - including the repo's **first** `lib/session.test.ts`,
that module being the only one in `src/lib/` without one - and `VerifyFailedScreen.stories.tsx`
with one story per reason, which also satisfies the smoke harness's two-per-module minimum.

Deliberately not touched: everything in `components/ui/`, because `AccessCard`, `Button` and the
two existing recovery controls cover this screen without a new primitive; and `backend/`, which
is finished and whose contract this branch only consumes.

## Steps

### 1. This plan

Committed alone as the branch's first commit, with a draft PR opened on it against
`feat/PET-12-login-and-check-your-email` carrying the checklist below.

### 2. The recovery controls move

`app/check-email/ResendLink.tsx` and `LogInAgain.tsx` to `components/`, with their suites
following them and their import paths updated in `CheckEmailScreen.tsx`. No behaviour changes, so
both suites should pass with nothing but their specifiers edited - that is the check that the
move is a move.

### 3. `lib/session.ts` and `lib/profile.ts`

`SESSION_COOKIE`, the cookie options helper, `readSession()`, and both seams filled in;
`readProfile()` beside it. New suites for both, mocking `next/headers` with a package specifier
and swapping `global.fetch` for a `respondWith(status, body)` helper, the way `lib/backend.test.ts`
and `lib/pendingEmail.test.ts` already do. `requireSession()`'s redirect is asserted through a
mocked `next/navigation`.

### 4. The route handler

`app/auth/verify/route.ts` and its suite: the no-token short circuit that never POSTs, each of
400, 401, 409, 429 and a network throw landing on the right reason, the 200 path setting the
session cookie with the derived `maxAge` and deleting the pending-email cookie, and a
non-positive `maxAge` taking the `failed` branch rather than writing a self-deleting cookie.

### 5. The failure screen

`page.tsx` reads `?reason=` and `readPendingEmail()` and narrows before rendering, the way
`/check-email`'s does, so `VerifyFailedScreen.tsx` imports nothing reaching `next/headers` and
Storybook can render it. Four stories, `title: 'Screens/Verify link failed'` - **no frame
number**, because there is no frame - registered in `screens.stories.test.tsx`'s `MODULES`.

### 6. The redirects, the profile and the routes

`app/setup/layout.tsx` and `app/login/page.tsx` gated on `hasSession()`; `(app)/layout.tsx` on
the real profile with `force-dynamic` deleted; `lib/routes.ts` gaining `verify` and
`verifyFailed` with `routes.test.ts` gaining its `HANDLERS` list. Then measure the cloud-mode
verify latency and record the numbers.

### 7. Docs

- `frontend/src/app/CLAUDE.md`, at the end of The access screens: the verify handler and why the
  navigation forces it, the session cookie and its derived lifetime, the two new gates and the
  deliberately ungated `/check-email`, the real profile and the two reads it costs, and the
  deleted `force-dynamic`.
- `frontend/CLAUDE.md`: delete the whole "Any *read* from the backend" bullet and the route
  handler half of the first - whole bullets, never merged - and update the "shell's content and
  its authentication" bullet, which is now only the four empty `<main>` elements.
- `docs/agents/api-contract.md`: the first read and the first route handler both exist now.
- `docs/TODO.md`: delete the verify item and the `/setup` gating item; add the frontend
  access-log exposure, the route-path coupling with the mail template, the ungated
  `/check-email`, the new A29 strings, and the latency numbers.
- `frontend/.env.example`: `BACKEND_URL` has more than one reader now.

Then `npm run docs:check` from the repo root, which no hook runs.

## Task checklist

- [ ] Commit this plan alone and open a draft PR carrying this checklist
- [ ] Move `ResendLink` and `LogInAgain` into `components/` with their suites
- [ ] `lib/session.ts` and `lib/profile.ts` with their suites
- [ ] `app/auth/verify/route.ts` and its suite
- [ ] The failure screen, its four stories and `screens.stories.test.tsx`
- [ ] The two gates, the real profile, `lib/routes.ts` and `routes.test.ts`
- [ ] Measure first-verify and returning-verify latency in cloud mode
- [ ] Docs, then `npm run docs:check`
- [ ] Gates: `npm test`, `npm run lint`, `npm run build`, `npm run build-storybook`,
      `npx tsc --noEmit`
- [ ] Open the four new stories **and** `Screens/24 Check your email`, against node `134:1142`
- [ ] Walk a real emailed link end to end against a running backend
- [ ] Comment on PET-52: the cookie's name, the `requireSession()` amendment, the extra scope
      taken and the latency figures

## Commits

1. `docs: plan the verify page and the session cookie (PET-52)` - this file alone, the branch's
   first commit, with the draft PR opened on it.
2. `refactor(frontend): move the recovery controls beside the access card (PET-52)` - step 2.
   Split out because it changes no behaviour on a shipped screen, and a reviewer checks it by
   confirming `check-email`'s suites only changed their import paths.
3. `feat(frontend): read the session behind one shared helper (PET-52)` - step 3, reviewable
   before anything calls it.
4. `feat(frontend): sign the user in from the emailed link (PET-52)` - steps 4 and 5.
5. `feat(frontend): send signed-in visitors to the dashboard (PET-52)` - step 6.
6. `docs: record the verify handler and the session cookie (PET-52)` - step 7.

Read `git branch --show-current` immediately before each commit, and read the `[branch sha]` line
back.

## Verification

**Gates**, from `frontend/`: `npm test`, `npm run lint`, `npm run build` (this repo's typecheck)
and `npm run build-storybook`, plus `npx tsc --noEmit` - the last because `build` does not reach
test files, which is how PET-12 shipped four exclusive-union violations with every gate green.
From the repo root: `npm run docs:check`. **`npm run api:sync` is not run**, because nothing a
request or response body is made of changed.

**Storybook**, which is where jsdom cannot help: all four failure stories at 520px with the
lockup 24px above, the single control flush right, and the body copy wrapping as frame 24's does.
**Open `Screens/24 Check your email` too** - the controls moved out from under it, which is
exactly the kind of change that breaks a story with a green suite and a green build.

**End to end**, both apps under `npm run dev`, with mail configured per `docs/guides/email.md`
and smoke mail going to `spendifico@gmail.com` rather than a personal address:

- Register a fresh account, open the real emailed link, and confirm it lands on `/dashboard` with
  the sidebar footer showing the **registered** name and address rather than Marko Kovač.
- In devtools: `spendifico.session` is httpOnly, `SameSite=Lax`, `Path=/` and expires about
  thirty days out, and `spendifico.pending_email` is gone.
- Click the same link a second time for the `invalid` screen, and confirm its Resend works.
- Resend, then open the **older** email, for the `superseded` screen.
- Open `/auth/verify` with no token and then with a junk token: `invalid` both times, and no POST
  reaches the backend in the first case.
- Delete the session cookie and request `/dashboard`: redirected to `/login` with no app data
  rendered (AC5).
- With a live cookie, request `/`, `/setup` and `/login`: all three land on `/dashboard`.
- AC6 directly: the raw session token appears in neither the page source nor any client-visible
  response. Check the document, not only the cookie flag.

**The latency measurement**, which `docs/TODO.md` calls this branch's first job. Run the backend
in cloud mode against Turso and time the blocking verify twice: a first verification, which
provisions the database, migrates it, writes the profile and seeds the categories, and a
returning one, which should be effectively instant. Record both in `docs/TODO.md` and on the
ticket. If the first is small, the plain page-load wait stands as A33 and A19 designed it; if it
is not, a designed waiting state is a conversation with the designer before it is code, because
an in-page loading state is exactly what the design deliberately lacks.

## Known risks and accepted trade-offs

**The live token now reaches the frontend's own access log.** The backend moved verify's token
into a POST body specifically so a live credential never reached *its* logs, and this handler
puts it straight into Next's request log, plus any proxy or CDN in front - the same class of leak
PET-12 removed when it replaced `/check-email?email=`. It is accepted rather than fixable here:
the URL is chosen by `backend/src/mail/login-link.template.ts` and the token has to arrive
somehow. What bounds it is that the token is single-use and is consumed by the very request that
logged it, so the line is dead by the time anyone reads it, and the redirect takes it out of the
address bar immediately. `docs/TODO.md` already names browser history and the `Referer` header as
the accepted magic-link exposure; this extends that note rather than opening a new one.

**The route path is declared in two places and nothing checks they agree.**
`login-link.template.ts` builds `/auth/verify` and `app/auth/verify/route.ts` answers it. Change
either and every login email points at a 404, with no gate failing and no test noticing - the
same shape as the `LOGIN_LINK_TTL_M` coupling `docs/TODO.md` already records, and it gets an
entry beside it.

**Verify's per-IP throttler now sees one address for the whole deployment.** The handler POSTs
from the frontend server, so every verify in the application lands in a single bucket - 15 per 15
minutes on the deployed values. That is the same degradation `docs/TODO.md` records for register
and login-link, arriving at a third route, and the `busy` reason exists because of it. It is not
fixable in a ticket like this one: it needs the frontend to forward the real client address *and*
the backend's hop count decided against the real topology, and doing either half alone makes the
limiter spoofable, which is worse than blind.

**The shell makes two backend requests per render.** Reasoned above; the tidy end state is a
single `requireProfile()` that gates and reads at once, and it belongs to whichever ticket first
measures this as slow, the same way `PeriodService` waits on the backend side.

**A stale session cookie survives a manual revocation.** No clear happens on a 401, for the
Server-Component reason above. The user is redirected correctly every time; the cost is one
wasted round trip per request until the cookie's own `maxAge` runs out. A39 designs no logout, so
no user-facing path produces this state.

**Nothing here proves the `secure` branch.** `next/jest`'s SWC transform can inline
`process.env.NODE_ENV`, so reassigning it in a test does nothing - the trap `lib/pendingEmail.test.ts`
already documents. The suite pins `secure: false` under test, which still proves the expression is
evaluated, and the production branch is covered by inspection with a comment saying why.
