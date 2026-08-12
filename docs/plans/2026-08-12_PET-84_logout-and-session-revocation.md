# PET-84: a logout control, and the endpoint that makes it true

Jira: [PET-84](https://decode.atlassian.net/browse/PET-84) · Epic:
[PET-2 App shell, navigation and design system](https://decode.atlassian.net/browse/PET-2) · Design:
**none**. A39 records that no frame draws a logout control anywhere, including Settings, so the
glyph, the label, the placement and the absence of a confirmation step are all invented and owe a
designer. The ticket carries `design-review` for that reason.

Base branch: `main` at `d906937`, PR #92's merge. Nothing to stack on: every file this touches is at
its merged shape, and no open branch is near them.

## Why

The app has sessions and no way out of one. Three facts, each verified rather than assumed:

- `ui/Sidebar.tsx:300` ends the footer with a comment reserving the spot ("No sign-out control,
  deliberately"), and `Sidebar.test.tsx:197` pins the absence as AC5 so it cannot be added by
  reflex. The absence is a recorded decision, not an oversight.
- `AuthController` publishes `register`, `login-link`, `verify` and `GET session`. There is no
  operation that ends a session, and `SessionService` has `issue()` and `validate()` and nothing
  else.
- `SESSION_TTL_D` is 30 days and expiry is absolute, never extended by use. So the only exits today
  are waiting a month or setting `sessions.deleted_at` by hand, which `docs/TODO.md` carries as
  "Revoking a session is a manual tombstone" with the standing instruction to write the tooling
  before an incident needs it.

On a shared machine that leaves clearing cookies as the only way to sign out, and it leaves this repo
with an ops chore where an endpoint belongs.

## What the app already decided, and what this must not re-decide

- **The cookie is `spendifico.session`** and `lib/session.ts` owns it end to end: `SESSION_COOKIE`,
  `sessionCookieOptions`, and the four `authorized*` write helpers that lift it into
  `Authorization: Bearer`. Nothing here re-derives any of that.
- **The guard is global and `@Public()` is the opt-out.** A new route is guarded by writing no
  decorator, which is what `GET /api/auth/session` already relies on.
- **Revocation is already the mechanism.** `validate()` filters on `isNull(sessions.deletedAt)`, so
  a tombstone is what makes a token dead. This ticket adds a caller, not a mechanism.
- **`sessions_user_id_idx` exists** so that "revoke everything this person has" is one statement.
  Decision 1 explains why this ticket does not use it.
- **Server Actions are injected as props, never imported by a component.** Storybook's Vite build
  has no notion of `'use server'`, so an imported action reaches `cookies()` in the browser on a
  press. This has been fixed after the fact twice; it is written correctly the first time here.

## Decision 1: what "log out" revokes

**The presented session only.** The product owner chose server-side revocation over a cookie-only
sign-out, and per-session over account-wide.

The rejected alternatives, both real:

**Cookie-only.** One frontend file, no `api:sync`, ships in an afternoon. It is also a button that
says "log out" while the bearer it just abandoned stays valid for up to 30 days, so anyone holding
the token remains signed in. That is the difference between signing out and forgetting, and the
whole reason the shared-machine case exists.

**Account-wide, over `sessions_user_id_idx`.** One statement, and arguably what a worried user
wants. Rejected because concurrent sessions per device are legitimate by design, so this would sign
a phone out because a laptop was tidied up, with nothing on screen warning that it would. It is the
right shape for a future "sign out everywhere" control on Settings, which is where it should be
offered explicitly rather than as a side effect of the footer.

## Decision 2: how the endpoint learns which session to revoke

This is the one genuine unknown in the ticket, and the answer is not obvious from the outside.
`SessionGuard` extracts the bearer, calls `validate()`, assigns `request.user = principal` and
**discards the token**. `SessionPrincipal` is `{ userId, email, expiresAt }`: no session id, no
token, no hash. So the controller cannot revoke "this session" from what the guard leaves behind.

Three ways out, and the third is the one to build:

1. **Widen `SessionPrincipal` with the session's id or its `tokenHash`.** Cleanest call site, and it
   puts a credential-derived value on every authenticated request in the app to serve one route.
   Rejected on that alone.
2. **Re-parse the header in the controller with a second parser.** Two answers to "how does a header
   become a token" is the drift this repo has paid for repeatedly.
3. **Re-read the header and reuse the existing parser.** `bearerToken()` in `session.guard.ts` is
   already the single answer to that question and is currently module-private; export it, take
   `@Headers('authorization')` in the controller, and hand the raw token to
   `SessionService.revoke(rawToken)`, which hashes it with the same `hashToken` that `validate()`
   uses. `SessionPrincipal` is untouched, the parser stays single-source, and the token-to-key answer
   stays in one place.

**A revoked token cannot reach this route twice, and that is a consequence worth stating.** The
endpoint is guarded and `validate()` filters on the tombstone, so a replayed token answers **401
from the guard**, not a second 204. That is correct and it is the same fact as "a replay is dead",
but it does mean an idempotence criterion is not expressible here. The ticket shipped with an AC
claiming a second call is accepted; it is **amended on PET-84** rather than implemented, because the
only way to satisfy it literally would be making logout `@Public()`, which buys nothing (the
frontend never needs the response) and adds an unauthenticated mutating route.

`revoke()` still writes with an `isNull(deletedAt)` guard and still tolerates affecting zero rows,
because "already revoked" is not a fault and a service should not throw where its own caller cannot
observe the difference.

## Decision 3: the cookie is cleared whichever way the API answers

**Local sign-out is guaranteed; revocation is best effort.** If the action clears the cookie only on
a 2xx, then an unreachable backend leaves a user unable to sign out of their own browser, on the one
screen whose purpose is leaving. That is the worse failure by a distance, so the order is: ask the
API to revoke, ignore the answer, delete the cookie, redirect.

**So this write publishes no failure taxonomy, and it is the only write in the app that does not.**
Every other one names its reasons because a caller does something different per reason. Here there is
nothing to do differently and nowhere to say it: the surface the message would render on is being
navigated away from, and PET-77's own rule is that `failed` and `unauthenticated` leave the form
because they name nothing the user can act on. A toast cannot survive the redirect either.

What this costs, stated rather than hidden: a logout during a backend outage is a local sign-out with
a live token still in the database, and the user is told it worked, because from where they stand it
did. The server-side log is where that asymmetry is recoverable, so the failure is logged rather than
swallowed.

**It must be a Server Action rather than a Server Component.** A Server Component's cookie jar is
read-only and `.delete()` throws `ReadonlyRequestCookiesError` at runtime with nothing in the types
to warn you, which `lib/pendingEmail.ts` already records for `.set`.

## Decision 4: the sidebar footer, and why not Settings

**The footer, as an icon button at the end of the avatar / name / email row.** That row already is
the account identity, it is present on all four routed views, and the file has been holding the slot
open for it. No new route, no new card, no header change.

**Settings was the alternative and it is worse for a mechanical reason.** That page is one `<form>`
with a page-level "Save changes", so a logout button inside it either submits the profile PATCH or
needs a `type="button"` guard for a control that has nothing to do with the form. It would also be a
fourth card on a screen whose suite pins exactly three `h2`s, i.e. a design decision about frame 17
smuggled in as a plumbing change. If a second surface is wanted later, this footer control is what it
reuses, and "sign out everywhere" (Decision 1) is the thing that actually belongs there.

**Below `lg` it is behind the hamburger**, because the whole sidebar is. Accepted: that is where
every app of this shape puts it, and the drawer is one tap.

**It is an icon button rather than a labelled row**, matching the footer's density, so the
accessible name comes from an explicit `aria-label` and the glyph is `LogOut` from `lucide-react`
with `aria-hidden="true"` stated explicitly, per this repo's icon rule. **No confirmation dialog**:
logging out destroys nothing and the recovery is one email away, so a dialog would be ceremony. All
three of those are invented and join what A29 owes.

## Decision 5: the shape of the frontend change

`<form action={logOut}>` around the button, so the control needs no client state and the footer stays
server-rendered markup. The action threads from `(app)/layout.tsx` through `SidebarNav` to
`ui/Sidebar` as a prop, per the injection rule above, which also means `Sidebar.stories.tsx` and both
suites hand in a stub and no story can reach `cookies()`.

`ui/Sidebar` gains one required prop. It already takes `onNavigate` for the drawer, so this is the
second handler-shaped prop on a component that stays free of `'use client'`.

**The redirect goes to `/login`, not `/`.** Both are legitimate for a signed-out visitor and `/login`
is the one with a control on it. No loop: the cookie is gone by then, so `/login`'s own `hasSession()`
gate lets it render rather than bouncing to `/dashboard`.

## The API

`POST /api/auth/logout`, guarded, empty body, **204** on success.

`POST` rather than `DELETE /api/auth/session` reads oddly against the `GET` beside it, and is chosen
anyway: `authorizedDelete` takes no body and the semantics wanted here are "perform this action",
not "remove this resource by id". Either would work; this is the one to write down so the review does
not relitigate it.

No new named throttler. The four are `email`, `ip`, `scan` and `chat`; an authenticated no-body write
is covered by `ip`, and a per-account logout bucket would only ever throttle a user pressing a button
they can press once.

## What this makes stale

Three prose claims and one test comment go from true to false, and each is single-sourced, so each
has exactly one home to fix:

- `backend/CLAUDE.md`, Access and sessions: "no logout by design (A39), so revocation means
  tombstoning the row." The second half survives; the first is what changes.
- `backend/src/database/central/schema.ts:226`: "A39 designs no logout, so killing a session is
  currently an ops action against this column." It is an endpoint now.
- `docs/TODO.md`, "Revoking a session is a manual tombstone": narrowed rather than deleted. A user can
  now end their **own** session; the operator's "revoke everything this person has" is still manual,
  and that is the half the entry should keep.
- `backend/test/profile.e2e-spec.ts:447`: the comment "there is no logout in this design to fall back
  on (A39)". **The assertion is unchanged and still correct** - moving an email address still leaves
  existing sessions working - so only the comment is wrong. Worth flagging because the tempting edit
  is to the test.

`frontend/src/components/CLAUDE.md`'s Sidebar bullet and the shell section of
`frontend/src/app/CLAUDE.md` gain the control; root `CLAUDE.md` gains the feature paragraph.

## Task checklist

- [ ] `SessionService.revoke(rawToken)`: tombstone by `hashToken(rawToken)` under an
      `isNull(deletedAt)` guard, tolerating zero rows. Unit test beside `validate`'s, including that a
      revoked token then fails `validate()`.
- [ ] Export `bearerToken()` from `session.guard.ts` and cover the export in `session.guard.spec.ts`,
      so the parser has one home and a test that says so.
- [ ] `POST /api/auth/logout` on `AuthController`: guarded (no `@Public()`), `@Headers('authorization')`,
      204, with the OpenAPI decorators the neighbouring routes carry.
- [ ] `backend/test/auth.e2e-spec.ts`: logout revokes the presented token (a replay of it answers
      401), a second device's session survives, and an unauthenticated call answers 401. Fix the stale
      comment at `profile.e2e-spec.ts:447` without touching its assertion.
- [ ] `npm run api:sync` from the repo root; commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts`.
- [ ] `frontend/src/lib/logOut.ts`: the Server Action. `authorizedPost('/auth/logout', {})`, log a
      failure, delete `SESSION_COOKIE` unconditionally, `redirect('/login')`. Suite pins that the
      cookie is deleted on both arms.
- [ ] `ui/Sidebar.tsx`: the footer control, replacing the reserved comment. `LogOut` glyph,
      `aria-hidden` on it, `aria-label` on the button, inside `<form action>`.
- [ ] Thread the action through `(app)/layout.tsx` and `SidebarNav.tsx`; extend `layout.test.tsx` so
      the wiring is pinned rather than discovered.
- [ ] **Invert `Sidebar.test.tsx`'s AC5 case** rather than deleting it: it asserted the absence, and
      it should now assert the control's name, its role and that it submits.
- [ ] `Sidebar.stories.tsx`: pass a stub action so no story can reach `cookies()`. Open the story.
- [ ] Browser walk: press it on each of the four routed views in both themes, confirm the landing on
      `/login`, then confirm a signed-in URL cannot be reached by typing it. Below `lg` too, through
      the drawer.
- [ ] Docs: the four stale claims above, plus the shell section of `frontend/src/app/CLAUDE.md`, the
      Sidebar bullet in `frontend/src/components/CLAUDE.md`, and the root `CLAUDE.md` paragraph.
- [ ] Gates: `npm run build` and `npm run lint` in both apps, both suites, `backend` e2e,
      `npx tsc --noEmit` in `frontend` (the suites are out of `build`'s reach), and
      `npm run docs:check`.

## Verification

**The revocation is the criterion, and it is an e2e assertion rather than a unit one.** A unit test
can prove `revoke()` writes a timestamp; only a request replaying the token through the real guard
proves the session is dead. That is why the e2e case is in the checklist above and not optional.

**The second-device case needs two bearers on one account**, which `profile.e2e-spec.ts` already
demonstrates the setup for. Without it, an account-wide `WHERE user_id` slip passes every other
assertion in this ticket.

**Two things cannot be proven under Jest.** The focus restore after the redirect, because there is no
navigation in jsdom to restore from, and the control's appearance in the footer's flex row at both
sidebar widths. Both are browser checks, on the same list as `Modal`'s Escape and `BudgetForm`'s
caret restore.

**And one thing cannot be proven at all from inside the app: that the token is really gone.** The
only honest check is a request with the old bearer after logging out, which is exactly what the e2e
case does, so the walk does not try to reproduce it by hand.
