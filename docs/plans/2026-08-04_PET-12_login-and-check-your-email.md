# PET-12: Log in and Check your email

Figma **23 Log in** (node `132:1138`) at `/login`, **24 Check your email** (node `134:1142`) at
`/check-email`. Branch `feat/PET-12-login-and-check-your-email`, stacked on
`feat/PET-11-register-onboarding-step-3` (PET-11 is not merged), with the draft PR based on that
branch so GitHub retargets it when [#29](https://github.com/AntePrkacin/personal-expense-tracker/pull/29)
lands.

## Context

These two screens close the six-frame access flow. `/login` and `/check-email` 404 today, so
onboarding creates a real account and then dead-ends on "Finish setup", and Welcome's "I already
have an account" points at nothing. The backend half is complete and is not touched here:
`POST /api/auth/login-link` answers 202 with an empty body whether or not an account exists, which
is the enumeration defense LOG-6 and A35 ask for, so AC4 falls out of the backend rather than
needing anything on the screen.

The ticket's one open decision is **how the submitted address reaches screen 24**, and the answer is
**Option A, a short-lived httpOnly cookie** (confirmed with the ticket owner). PET-11 shipped
`/check-email?email=<encoded>` as the cheapest thing that worked; the argument for replacing it is
the **server access log**, not the address bar. Next's own request log, and any proxy or CDN in
front of it, records the full path including the query string, so as shipped every registration
writes a user's email address into logs on Vercel and anywhere upstream. `history.replaceState`
does not fix that: the value is already logged by the time the page mounts. Replacing it is one line
each in `RegisterForm` and `registerAccount`, and it is cheap only while nothing reads the parameter
yet, which is now.

Three things were decided with the ticket owner while planning:

- **The no-address fallback copy** that AC7 flags as needing an answer: "We've sent you a secure
  login link. Open the link on this device to access your account." The address slot is dropped
  rather than filled with a generic phrase.

- **"Resend link" gets a pending state and a confirmation line**, which VER-2 and A36 do not design.
  Without them a click has no observable effect at all, and repeat clicks silently spend the
  backend's five-per-address budget.

- **The card chrome is extracted** rather than duplicated, because both frames draw the box
  `SetupShell` already owns.

## What the design actually says

Verified against both nodes with the Figma MCP, screenshots plus metadata.

Both columns are **520px**, and the card is the box `SetupShell` already draws: the lockup 38px tall
at y 0, the card at y 62 - 24px, `gap-6` - content inset `x 40` / `y 36` (`px-10 pt-9`), 20px
between card children (`gap-5`), heading to body 8px (`gap-2`), a 49px footer row with its button
inset 6px (`pt-1.5`), and 32px below it (`pb-8`). **Neither frame has a step indicator or an
overline** (LOG-1, VER-1), which is the one thing `SetupShell` cannot express.

Frame 23 holds the heading "Log in", the copy "Enter the email you signed up with and we'll send you
a secure login link.", one `Input type="email"` labelled "Email", and a footer with "Back" as
`BUTTON_VARIANTS.text` at x 0 and "Log in" as `primary` at x 359 to 440 - so `justify-between`, as
on every other access frame.

Frame 24 holds the heading "Check your email", the copy "We've sent a secure login link to
marko@email.com. Open the link on this device to access your account.", and **one control, flush
right**: node `134:1155` sits at x 322 with width 118 in a 440px content box. So with "Back" deleted
the footer is **`justify-end`**, not `justify-between`, which would put a lone child at the start.
"Resend link" is `secondary`.

Two copy notes. Figma uses curly apostrophes ("we'll", "We've"); LOG-1 and VER-1 in the spec use
straight ones, and so does every string in the repo, so follow the spec. And both body strings get
hoisted into module consts the way `SetupRegisterScreen.tsx` does, which keeps each test asserting
one string and sidesteps `react/no-unescaped-entities`.

Note the frame still draws a "Back" button on 24. PET-11 deleted it, amending VER-3, A37 and this
ticket's own AC6, so the design file is the holdout rather than the authority.

## Decisions

**The cookie.** `frontend/src/lib/pendingEmail.ts` owns it end to end:
`PENDING_EMAIL_COOKIE = 'spendifico.pending_email'`, in the namespace `spendifico.setup.draft`
already established, plus `setPendingEmail(email)` and `readPendingEmail()`. Both are `async`,
because `cookies()` returns a promise in Next 16. The cookie is `httpOnly`, `sameSite: 'lax'`,
`path: '/'`, `secure: process.env.NODE_ENV === 'production'`, with a `maxAge` of fifteen minutes in
**seconds**. That lifetime mirrors the login link's own: the comment names `LOGIN_LINK_TTL_M` and
points at `docs/guides/configuration.md` rather than restating its default, because the frontend
cannot read a backend variable and a deployment can move it either way.

Three things that module's doc comment has to say, because nothing else will:

- **`setPendingEmail` may only be called from a Server Action.** `cookies()` resolves to a type
  whose `.set` typechecks inside a Server Component too; the guard is runtime-only
  (`ReadonlyRequestCookiesError`), and it also rejects a write deferred into a `.then` or `after()`.
  Neither `npm run build` nor the types will tell you.

- **`readPendingEmail` validates before it answers.** The value is interpolated into VER-1's copy
  and POSTed as the resend address. `httpOnly` keeps script out, not devtools, which is exactly the
  threat `parseDraft` already handles for sessionStorage - so the value goes through `isEmailValid`
  and anything else answers `null`, on the same "everything this module hands out is something the
  field could have produced" reasoning.

- **`sameSite: 'lax'` is also the value PET-52 needs**, because the emailed verify link arrives as a
  cross-site top-level GET, where `strict` withholds cookies. Recorded so nobody tightens it.

**The register action sets the cookie; it does not redirect.** The ticket suggests "sets the cookie
and redirects", and a `redirect()` inside a Server Action does carry the cookie correctly. But it
throws, so `await register(body)` never resolves in `RegisterForm` and `clearDraft()` never runs -
behaviour PET-11 pins in two tests. So the action stashes and returns its result, and the client
clears the draft and pushes a clean `ACCESS_ROUTES.checkEmail`. That ordering is safe rather than
lucky: `.set()` writes the `Set-Cookie` header synchronously inside the action body, the header
precedes the flight body on the wire, and the browser commits it before the client's `await`
resolves.

**One eight-line fetch, not three.** `frontend/src/lib/backend.ts` gets `postAccepted(path, body)`,
returning the discriminated `{ ok: true } | { ok: false; status? }` that `registerAccount`
established. Both endpoints this ticket touches answer 202 with an empty body and differ only in
path and body type, and `lib/session.ts` already makes this call for its own two callers: "the two
should share whatever helper does the fetch rather than each doing their own". PET-52's verify is
deliberately **not** folded in - it returns a body and reads a 409, so generalising over it now
would bend the helper on the wrong axis with only two real cases in hand.

**Two thin actions over that helper.** `app/login/actions.ts` exports `sendLoginLink(email)`, which
posts and on success stashes. `app/check-email/actions.ts` exports `resendLoginLink()`, which takes
**no argument** and reads the address from the cookie: a Server Action is reachable by anyone who
finds it, and an address parameter would turn it into a link-sender for arbitrary addresses. That
raises the bar to devtools rather than closing the door; the real defenses stay the backend's
always-202 and its per-address throttler. Neither action re-validates the address, because
`@IsEmail()` on the two DTOs is the authority and a second normaliser drifts from the first - the
reasoning `draft.ts` already records for not lowercasing the email.

**`isEmailValid` moves to `frontend/src/lib/email.ts`.** It is three React-free lines in
`app/setup/draft.ts` today, and `/login` sits deliberately outside `/setup`, so importing the
onboarding draft module from it would couple the returning-user flow to onboarding for one regular
expression. `draft.ts` drops it rather than re-exporting it, so there is exactly one import path.

**`AccessCard`.** `frontend/src/components/AccessCard.tsx` takes
`{ width = 'w-130', aboveCard?, children }` and holds the centred column, `LogoLockup` and the card
box. `SetupShell` is rewritten to render it, passing `STEP_WIDTH[step]` and its `StepIndicator` as
`aboveCard`, and keeps owning `SETUP_STEPS`, `STEP_DOT`, `STEP_WIDTH` and the indicator itself:
pulling the step union into `components/` is the coupling the extraction exists to remove. The slot
is named for its position rather than its content, and an omitted `React.ReactNode` renders nothing,
so the column collapses from two `gap-6` gaps to one with no conditional and no second copy of the
column. It sits beside `LogoLockup` for the reason that file already gives - it belongs to five of
the six access frames - which reverses `SetupShell`'s own "not in `components/` either" argument.

**One load-bearing constraint on that extraction:** the width class must stay on the same element
that carries `shadow-card`. `SetupShell.test.tsx` finds the card with
`querySelector('.shadow-card')` and then asserts `STEP_WIDTH[step]` is in its `className`, so an
extra wrapper holding the width is the only way this breaks that suite.

**`LoginForm` follows step 1's form conventions, not step 3's draft.** `'use client'`, a real
`<form noValidate onSubmit>` with `preventDefault()`, `required` with no asterisk (A12),
validation on submit only and clearing on the next change to the field, the submit `disabled` while
the request is out, and one `role="alert"` form-level line - the shape `BudgetForm` and
`RegisterForm` share. The value lives in `useState` and **not** in `SetupDraft`: `/login` is outside
`app/setup/layout.tsx` so there is no provider, and a returning user's address has nothing to do
with an onboarding draft. Its message strings stay local to the file, as both existing forms keep
theirs; there is no copy module in this repo and two overlapping strings are the wrong reason to
invent one.

**Screen 24's server-only imports live in `page.tsx`, not in the screen.** `page.tsx` reads
`readPendingEmail()` and passes both `email` and `resend` down, so `CheckEmailScreen` - the module
Storybook renders and the test mounts - imports nothing that reaches `next/headers`. This diverges
from PET-11's precedent of having `SetupRegisterScreen` import its own action, and the reason is
concrete rather than aesthetic: that precedent is what drags `next/headers` into the Storybook
browser bundle the moment `registerAccount` stashes a cookie. `.storybook/main.ts` also aliases
`next/headers` to `@storybook/nextjs-vite`'s `headers.mock`, which covers that regression in the
already-shipped `Screens/22 Register`. If that export does not resolve, the fallback is the
optional-`register`-prop mitigation PET-11's own plan named.

**The no-address arrival gets an exit, and that amends AC6's wording.** With no cookie there is
nothing to resend, and AC6 as written leaves a screen with no Back, a dead button and no other
control - reachable by a reload twenty minutes later, and a permanently disabled button announces as
"Resend link, dimmed" with no reason given. So `email === null` renders
`<Button href={ACCESS_ROUTES.login} variant="secondary" label="Log in again" />` in the same
right-aligned footer slot. The screen still carries no Back control and still has exactly one
action, which is what AC6 defends; what changes is that the one action is reachable. The
disabled-Resend alternative is rejected, and the new label owes A29 sign-off with the rest.

**No cooldown, and the 429 says so.** A36 mentions a simple cooldown and this ticket does not build
one: the backend's per-address throttler is the real limit, and a client-side timer would be a
second, weaker authority that a reload defeats. Instead the resend surfaces a 429 as its own line
rather than the generic failure, so a user who clicks five times is told to wait rather than told it
failed.

**`/login` is not gated on a session**, for the reason `/setup` is not: a fourth call into the
`lib/session.ts` stubs would be a claim nothing can test, `/` already gates, and LOG-5 makes WEL-3
the only designed entry. Whether it stays reachable with a live session is PET-52's.

**No `export const dynamic` on either page, and no `api:sync`.** The `cookies()` read opts
`/check-email` out of static rendering on its own, which is the note `lib/session.ts` already
carries about `/`; and no DTO, response shape or controller changes, so neither generated artifact
moves.

## Files

New:

| File                                                                     | What it is                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `frontend/src/lib/backend.ts`                                            | `postAccepted`, the shared 202 POST                           |
| `frontend/src/lib/pendingEmail.ts`                                       | the cookie: its name, `setPendingEmail`, `readPendingEmail`   |
| `frontend/src/lib/email.ts`                                              | `isEmailValid`, lifted out of `app/setup/draft.ts`            |
| `frontend/src/components/AccessCard.tsx`                                 | the centred column, the lockup and the card box               |
| `frontend/src/app/login/{page,LoginScreen,LoginForm}.tsx`, `actions.ts`  | screen 23                                                     |
| `frontend/src/app/check-email/{page,CheckEmailScreen,ResendLink}.tsx`, `actions.ts` | screen 24                                          |

Plus a colocated test for every one of those, and `LoginScreen.stories.tsx` and
`CheckEmailScreen.stories.tsx` with **two stories each** - the smoke harness asserts at least two
per registered module.

Modified: `app/setup/SetupShell.tsx`, `app/setup/register/actions.ts`,
`app/setup/register/RegisterForm.tsx`, `app/setup/draft.ts` and their four suites, `lib/routes.ts`,
`lib/routes.test.ts`, `components/ui/utilities.test.ts`, `app/screens.stories.test.tsx`,
`.storybook/main.ts`, `frontend/.env.example`, plus the documentation files in step 7.

Deliberately not touched: everything in `components/ui/`, because `Input` already declares
`type="email"` "for Register and Log in" and `Button`'s `primary`, `secondary` and `text` variants
plus its `disabled` and `href` branches cover both footers; and `lib/session.ts`, which is PET-52's.

## Steps

### 1. This plan

Committed alone as the branch's first commit, with a draft PR opened on it against
`feat/PET-11-register-onboarding-step-3` carrying the checklist below.

### 2. `AccessCard`, and `SetupShell` rewritten onto it

`components/AccessCard.tsx` with the prop shape above, then `SetupShell` rendering it and keeping
the indicator. `AccessCard.test.tsx` covers the two things only it owns: the `width` prop landing on
the `.shadow-card` element, and `aboveCard` rendering between the lockup and the card while adding
nothing when omitted. `SetupShell.test.tsx` should pass **unchanged** - that is the check that the
DOM is byte-identical.

In `utilities.test.ts`: move `border-border-default` from `STORY_CHROME` to `HARDCODED`, since a
shared component hard-codes it now; add `justify-end` for screen 24's footer; and name
`components/AccessCard.tsx` in the coverage comment. Everything else `AccessCard` draws is already
listed, and `STEP_DOT` / `STEP_WIDTH` keep their current import path.

### 3. The handoff, and PET-11's two edits

`lib/backend.ts`, `lib/pendingEmail.ts` and `lib/email.ts` as described above. Then:

- `app/setup/draft.ts` drops `isEmailValid`; `draft.test.ts` loses those cases and
  `lib/email.test.ts` gains them.
- `app/setup/register/actions.ts` goes through `postAccepted`, and on `{ ok: true }` also calls
  `setPendingEmail(body.email)`. Its comment about a route handler being right "because it has to
  set a cookie during a GET" needs the nuance that it is the **navigation** that forces a handler,
  not the cookie - a Server Action sets one perfectly well, which is what this ticket does.
- `RegisterForm.tsx` pushes `ACCESS_ROUTES.checkEmail` with no query string, and takes
  `isEmailValid` from `@/lib/email`.
- `register/actions.test.ts` gains `jest.mock('../../../lib/pendingEmail', ...)`. **Without it six
  or more existing tests throw** `` `cookies` was called outside a request scope ``, because every
  case reaching the 202 path now writes a cookie. Plus two new cases: stashes on 202, does not stash
  on anything else.
- `RegisterForm.test.tsx`: the push assertion loses its query string, and "encodes an address that
  needs it" is **deleted** rather than rewritten, because nothing is encoded any more.

### 4. Screen 23

`app/login/page.tsx` is the three-line default export, with no session gate and no
`export const dynamic`. `LoginScreen.tsx` is `AccessCard` plus the `gap-2` header block - no
overline - plus the form. `LoginForm.tsx` and `actions.ts` as decided; `sendLoginLink` is imported
by the screen and passed to the form as a prop, the way PET-11 does it.

Copy, all owing A29 sign-off alongside PET-11's five:

| Case            | Copy                                                    |
| --------------- | ------------------------------------------------------- |
| Email empty     | `Enter your email address.`                             |
| Email malformed | `Enter a valid email address.`                           |
| Request failed  | `We couldn't send your login link. Please try again.`    |

### 5. Screen 24

`app/check-email/page.tsx` is `async`, reads `readPendingEmail()` and renders
`<CheckEmailScreen email={...} resend={resendLoginLink} />`. `CheckEmailScreen.tsx` interpolates
VER-1's copy or renders the fallback sentence, and puts either `ResendLink` or the "Log in again"
button in a `justify-end` footer. `ResendLink.tsx` is `'use client'` with `useTransition`: disabled
while pending, then one confirmation line or one danger line.

| Case                    | Copy                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| No address              | `We've sent you a secure login link. Open the link on this device to access your account.` |
| No address, the control | `Log in again`                                                                        |
| Resent                  | `A new link is on its way.`                                                           |
| Resend failed           | `We couldn't send a new link. Please try again.`                                       |
| Resend throttled (429)  | `Too many requests. Please wait a few minutes and try again.`                          |

### 6. Routes, the stories and the Storybook alias

`lib/routes.ts`: rewrite the `checkEmail` doc comment, which documents the query parameter and says
the route 404s. In `routes.test.ts`, move `login` and `checkEmail` into `BUILT`, and keep `PENDING`
as an empty array with its comment rewritten rather than deleting the structure, since the next
route needs it - and confirm nothing does `it.each(PENDING)`, which Jest rejects on an empty array.

Two stories per new screen, `title: 'Screens/23 Log in'` and `'Screens/24 Check your email'`,
type-only Storybook imports, everything the screen needs inside `render` because the harness ignores
`decorators`, and `parameters: { nextjs: { appDirectory: true } }` on the Log in story because
`LoginForm` reaches `useRouter` and no CI gate catches its absence. Register both modules in
`screens.stories.test.tsx`'s `MODULES`, and add the `next/headers` alias to `.storybook/main.ts`.

### 7. Docs

- `frontend/src/app/CLAUDE.md`, at the end of The access screens: all six screens exist now, the
  cookie handoff and why it replaced the query parameter, `page.tsx` owning the server-only imports
  and how that diverges from PET-11's prop precedent, the `justify-end` footer, `/login` not being
  gated, and the resend confirmation as the seventh detail with no Figma counterpart.
- `frontend/CLAUDE.md`: delete the "Two of the six access screens" bullet, moving its PET-52 fact
  into the existing "Any _read_ from the backend" bullet rather than merging the two; that bullet's
  "no session cookie" and "the cookie's name is still undecided" need care, because this ticket
  names a **different** cookie. Also rewrite the "`components/` has exactly one direct child"
  paragraph, and `SetupShell.tsx`'s own "not in `components/` either" argument.
- `docs/agents/api-contract.md`: "one write and no reads" and "the one backend call" are both false
  now, and the route-handler sentence needs the navigation-versus-cookie nuance.
- `docs/TODO.md`: the new strings under what A29 owes, the `LOGIN_LINK_TTL_M` coupling, the omitted
  cooldown and its reasoning, PET-52 clearing the cookie on a successful verify, and the AC6
  amendment for the no-address exit.
- `frontend/.env.example`: its `BACKEND_URL` comment names the register action as the only reader.

Then `npm run docs:check` from the repo root, which no hook runs.

## Task checklist

- [ ] Commit this plan alone and open a draft PR carrying this checklist
- [ ] `AccessCard.tsx` and its test; `SetupShell.tsx` rewritten onto it; `utilities.test.ts`
- [ ] `lib/backend.ts`, `lib/pendingEmail.ts`, `lib/email.ts` and their tests
- [ ] PET-11's edits: `draft.ts`, `register/actions.ts`, `RegisterForm.tsx` and their four suites
- [ ] Screen 23: `page.tsx`, `LoginScreen.tsx`, `LoginForm.tsx`, `actions.ts` and their tests
- [ ] Screen 24: `page.tsx`, `CheckEmailScreen.tsx`, `ResendLink.tsx`, `actions.ts` and their tests
- [ ] `lib/routes.ts` and `routes.test.ts`; the four stories; `screens.stories.test.tsx`;
      `.storybook/main.ts`
- [ ] Docs, then `npm run docs:check`
- [ ] Gates: `npm test`, `npm run lint`, `npm run build`, `npm run build-storybook`
- [ ] Open the four new stories **and** `Screens/22 Register`, against nodes `132:1138` and
      `134:1142`
- [ ] Walk both paths against a running backend, including the request-log check for AC8
- [ ] Comment on PET-12: AC7's fallback copy, AC8 satisfied, and AC6's no-address exit

## Commits

1. `docs: plan the Log in and Check your email screens (PET-12)` - this file alone, the branch's
   first commit, with the draft PR opened on it.
2. `refactor(frontend): extract the access card chrome from SetupShell (PET-12)` - step 2. Split out
   because it changes no behaviour on three shipped screens, and a reviewer checks it by confirming
   `SetupShell.test.tsx` did not have to move.
3. `feat(frontend): hand the submitted address over in a short-lived cookie (PET-12)` - step 3. The
   handoff including PET-11's two edits, reviewable before either new screen exists.
4. `feat(frontend): add the Log in and Check your email screens (PET-12)` - steps 4 to 6.
5. `docs: record the two access screens and the pending-email cookie (PET-12)` - step 7.

Read `git branch --show-current` immediately before each commit, and read the `[branch sha]` line
back.

## Verification

**Gates**, from `frontend/`: `npm test`, `npm run lint`, `npm run build` (this repo's typecheck) and
`npm run build-storybook`. From the repo root: `npm run docs:check`. **`npm run api:sync` is not
run**, because nothing a request or response body is made of changed.

**Storybook**, which is where jsdom cannot help: both cards at 520px with the lockup 24px above and
no step indicator, Log in's footer with Back at the left and the primary at the right, screen 24's
single control flush right, and the two-line body copy wrapping as the frames do. Submit Log in
empty for the inline message. **Open `Screens/22 Register` too** - it is the regression the
`next/headers` alias exists to prevent, and neither gate would catch it.

**End to end**, both apps under `npm run dev`:

- The register path: `/`, "Get started", a budget, some chips, Register, "Finish setup". Confirm the
  backend logs a 202, the browser lands on a clean `/check-email` with **no query string**, the body
  shows the address that was submitted, and `sessionStorage` no longer holds
  `spendifico.setup.draft`.

- **AC8 directly**: the dev server's request log shows `/check-email` with no query string, and
  devtools shows `spendifico.pending_email` as httpOnly with a fifteen-minute expiry. The criterion
  names the log, so check the log and not only the address bar.

- The login path: Welcome, "I already have an account", submit empty and then `marko@` for the two
  inline messages, then a valid address for the 202 and the same screen 24.

- AC4: submit an address with no account behind it and confirm byte-identical copy.

- Resend: one click for the confirmation line, then enough clicks to trip the per-address limiter and
  confirm the throttled line rather than the generic one.

- The fallback: delete the cookie in devtools, reload `/check-email`, and confirm the fallback
  sentence and a working "Log in again" rather than a dead screen.

- Browser Back from screen 24 still reaches an empty Register without throwing, which PET-11
  accepted and this ticket does not change.

## Known risks and accepted trade-offs

**The `next/headers` reach into Storybook is real, and only one gate sees it.** `registerAccount`
gaining a cookie write pulls `next/headers` into whatever bundle imports it, and
`Screens/22 Register` already imports it through `SetupRegisterScreen`. `build-storybook` bundles a
story without running it and the Jest smoke suite renders with mocks, so opening the story by hand
is the check - the same trap `frontend/src/app/CLAUDE.md` records for `appDirectory`.

**Asserting the `secure` branch may not be testable.** `next/jest`'s SWC transform can inline
`process.env.NODE_ENV`, in which case reassigning it in a test does nothing and the assertion
silently checks the wrong branch. So pin `secure: false` under test, which still proves the
expression is evaluated, and cover the production branch by inspection with a comment saying why.
Verify the inlining before writing anything stronger.

**The cookie's lifetime and the link's can drift.** A deployment that raises `LOGIN_LINK_TTL_M` gets
a live link whose screen has forgotten the address; one that lowers it gets a cookie outliving the
link. Both degrade to the fallback copy and the "Log in again" exit rather than misleading anybody,
and closing the gap properly means the frontend reading a backend value it has no channel for.

**`postAccepted` is generalised over two endpoints, not three.** PET-52's verify returns a body and
reads a 409, so it will need its own shape; if it turns out to want a shared JSON POST after all,
that refactor is one file.

**Adding a cookie write makes `registerAccount` revalidate its own route**, as a side effect of
Next's cookie plumbing clearing the client Router Cache. Harmless - it removes any staleness worry
about `/check-email` - but no suite can observe it, because every suite injects or mocks the action,
so it belongs in the manual walkthrough rather than in a test.

**Neither action re-validates the address server-side.** A crafted call to `sendLoginLink` reaches
the backend's `@IsEmail()` and its throttler, which are the authorities. `resendLoginLink` takes no
argument at all, which raises the bar to devtools rather than closing it; the always-202 response is
what makes that acceptable, rather than the parameter shape.
