# PET-11: Register, onboarding step 3

Figma frame **22 Register user** (node `129:1128`), served at `/setup/register`.

## Context

Onboarding is three nested routes under one layout, settled by PET-9: `/setup` (step 1, built),
`/setup/categories` (step 2, built) and `/setup/register` (step 3, this ticket). Step 2's
"Continue" already points at `/setup/register`, which **404s**, so onboarding dead-ends there
today. This ticket closes the flow.

Two larger things happen here for the first time.

**The account finally exists.** A32 holds that currency, budget and categories cannot be saved
before there is one, so steps 1 and 2 hold them in sessionStorage and this screen posts all of it
in a single `POST /api/auth/register` body together with the name and email it collects itself
(REG-4). The backend half is built and committed: the endpoint answers `202` with an empty body
whether or not the address already has an account, because a byte-identical response is the
enumeration defense REG-6 and A35 ask for. So **a duplicate email is not an error case on this
screen** - it is indistinguishable from a new one, by design.

**The frontend calls the backend for the first time.** `frontend/CLAUDE.md`'s `## Not built here`
currently lists "Any call to the backend at all, which is the single biggest gap": nothing in
`frontend/src` fetches, and `BACKEND_URL` is read by nobody. Whatever this ticket does becomes
the precedent PET-52 inherits, which is why the mechanism is a decision below rather than an
implementation detail.

The ticket description says "the server side of that request is a separate task". That was
written before PET-14 landed the backend. The endpoint exists now, and AC4's "the request carries
my name and email plus the currency, budget and category selection" is only testable if a request
is actually made, so the call is in scope. Confirmed with the ticket owner before planning.

## What the design actually says

Verified against node `129:1128` with the Figma MCP, screenshot plus metadata.

The chrome is identical to steps 1 and 2 and already exists: canvas field, centred column,
`LogoLockup`, the three-dot indicator with the **third dot as the pill**, then the card at
**520px** - the same width as frame 02. `SetupShell` already records that as
`STEP_WIDTH[3] = 'w-130'`, put there by PET-10 rather than left for this ticket to rediscover, so
**`SetupShell.tsx` needs no change at all**.

The card holds three children 20px apart:

1. the header block, a nested 8px stack at y 0, 21 and 57 (node `129:1138`): overline
   `STEP 3 OF 3`, heading `Register`, then the copy `Create your account to start tracking your
   spending.` Identical structure to both other steps.

2. the fields. Node `129:1156` is a 440px row holding two `Input / Field` instances **214px each
   with a 12px gap**, then node `129:1170` is a single full-width 440px instance. The card's
   content box is 440px (520 minus `px-10`), and `(440 - 12) / 2` is exactly 214, so the row is
   `grid grid-cols-2 gap-3` rather than a set of measured widths. Labels are "First name", "Last
   name" and "Email"; the sample values are the repo's own persona.

3. the footer row (node `129:1148`): `items-center justify-between pt-1.5`, "Back" as
   `BUTTON_VARIANTS.text` and "Finish setup" as `BUTTON_VARIANTS.primary`.

**No password field exists anywhere in the frame**, which is A31 rather than an omission. Only the
default state is drawn: no error visual (A29), and no pending visual for the account-creation
round trip (A19).

## Decisions

**The three new values join `SetupDraft` rather than living in component state.** `draft.ts`'s own
header already says it holds "everything screens 02, 03 and 22 collect", and its choice of
sessionStorage is justified in that file by not wanting to hand the next person on a shared
machine "a half-finished registration carrying somebody's name and email" - so the shape was
written for this. The practical reason is round trips: AC5's Back to step 2 unmounts this route,
and a user who goes back to fix a chip and returns must not find the name fields blank. It is
three more `readString` calls, not new machinery.

**Validity rules go in `draft.ts`, not in the form.** `isBudgetValid` lives there rather than
beside `formatAmountInput` because it is a rule and not display formatting, and that comment is
the precedent. `isNameValid` and `isEmailValid` join it, which also puts every validation rule in
a suite that needs no jsdom.

**The request body is built by a pure function in the same file.** `toRegisterBody(draft)` is
where `budget` stops being the display string `'2,000'` and becomes `monthlyBudget: 2000` through
`parseAmountInput`; `draft.ts` already states that the conversion "happens once, at the boundary,
when step 3 builds its request". The three strings are trimmed here rather than on read, because
trimming on read fights a controlled input the moment somebody types a space between two words.
The email is trimmed but **not** lowercased: the DTO's `@Transform(normalizeEmail)` owns
normalisation, and doing it twice invents a second authority that can drift.
`monthStartDay` is not sent, because onboarding never collects it and the backend defaults it.

**The call is a Server Action**, in `app/setup/register/actions.ts`, returning a discriminated
result rather than throwing. It keeps `BACKEND_URL` server-side with no new publicly reachable
frontend endpoint, and it is the idiomatic shape for a form POST. `docs/agents/api-contract.md`
prescribes "an async Server Component (or a route handler)" and never mentions Server Actions;
that sentence is about **reads**, so this ticket extends the file to cover writes rather than
contradicting it silently. A route handler was the alternative, and is what PET-52 will want for
verify, since that one has to set a cookie during a GET navigation. Nothing here blocks it.

**`RegisterForm` takes the action as a prop.** `SetupRegisterScreen` imports `registerAccount` and
passes it down, which is the canonical way to hand a server action to a client component. The
reason it is a prop rather than a direct import is testability: the form's suite passes a
`jest.fn()` and needs no module mocking at all, which sidesteps the `jest.mock` alias trap
`frontend/src/app/CLAUDE.md` documents.

**A 202 clears the draft, and screen 24 gets no "Back" button.** `docs/TODO.md` records that
nothing clears the draft and that PET-11 is "the only natural moment". The conflict is A37 and
VER-3, which say Back on screen 24 returns to whichever screen opened it - and a cleared draft
brings Register back empty, inviting a user who has already registered to re-type everything.
Resolved by deleting that button from screen 24 instead: the account exists and the link is sent
by then, so there is nowhere backwards to go. **This amends A37, VER-3 and PET-12's AC6.**

Deleting the control does not delete the path. The browser's own Back button still reaches
`/setup/register` with the draft gone, so the card renders empty. That is accepted rather than
worked around; see Known risks.

Because nothing needs to know where screen 24 was opened from any more, the navigation carries
only `?email=`.

**Clearing has to go through the provider.** `SetupDraftProvider`'s snapshot cache "is only
invalidated by patchDraft, so it goes stale if anything else clears the key mid-session" - its own
words. A bare `sessionStorage.removeItem` from the form would empty storage while every field kept
rendering the old values. So `clearDraft` becomes a third member of the context, updating
`cache.current` and notifying listeners exactly as `patchDraft` does.

**Failure gets a disabled button and one form-level line.** A19 designs no pending state, A29 no
error surface, and the tech spec says outright that a failed creation has no designed surface. Two
additions, both owing designer sign-off alongside the details `frontend/CLAUDE.md` already lists
as having no Figma counterpart. The submit button is `disabled` while the request is out, because
a double submit spends one of the five-per-address rate-limit attempts for nothing. And a failed
request renders one line of `text-body-s text-status-danger-text` above the footer row, the same
treatment `ui/Field` uses. That line carries `role="alert"`, which `ui/Field` deliberately does
not: Field's message appears synchronously beside the field the user just left, while this one
appears after a network round trip with nothing else on screen changing.

**Comments in the new code stay sparse**, deliberately unlike the neighbouring files under
`app/setup/`. Annotate what a reader cannot infer - the cache-invalidation constraint on
`clearDraft`, why the action returns a result instead of throwing, why the overline is a `<p>` -
and let the rest stand on its names.

**No `api:sync`.** No DTO, response shape or controller changes, so neither generated artifact
moves. `starterCategories.ts` already established that reading `api.d.ts` type-only needs no
regeneration.

## Files

New, all under `frontend/src/app/setup/register/`:

| File                      | What it is                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| `page.tsx`                | Answers `/setup/register`; renders the screen and nothing else    |
| `SetupRegisterScreen.tsx` | Server Component: the shell, the header block, the form           |
| `RegisterForm.tsx`        | `'use client'`: three fields, validation, submit, the footer row  |
| `actions.ts`              | `'use server'`: `registerAccount`, the repo's first backend call  |

Plus colocated `RegisterForm.test.tsx`, `SetupRegisterScreen.test.tsx`, `actions.test.ts` and
`SetupRegisterScreen.stories.tsx`.

Modified: `app/setup/draft.ts`, `app/setup/SetupDraftProvider.tsx`, `app/setup/draft.test.ts`,
`app/setup/layout.test.tsx`, `lib/routes.ts`, `lib/routes.test.ts`,
`components/ui/utilities.test.ts`, `app/screens.stories.test.tsx`, `frontend/.env.example`, plus
the five documentation files in step 9.

Deliberately not touched: `SetupShell.tsx`, because `STEP_WIDTH[3]` and `STEP_DOT` already cover
step 3; everything in `components/ui/`, because `Input` already declares `type="email"` "for
Register and Log in" and `Field` and `Button` need no new props; and `lib/session.ts`, which is
PET-52's.

## Steps

### 1. `draft.ts`: three fields, three rules, one boundary function

Extend `SetupDraft` and `EMPTY_DRAFT` with `firstName`, `lastName` and `email`, and read them in
`parseDraft` with the existing `readString`. No canonicalisation on read, for the reason above.

Add beside `isBudgetValid`:

- `isNameValid(name)` - `name.trim() !== ''`, matching the DTO's `@IsNotEmpty()`.
- `isEmailValid(email)` - one `@`, a dot in the domain, no whitespace. Deliberately looser than
  the DTO's `@IsEmail()`, which is the authority.
- `toRegisterBody(draft)` - returns `components['schemas']['RegisterDto']`, type-imported from
  `@/types/api` the way `starterCategories.ts` does it.

### 2. `SetupDraftProvider.tsx`: `clearDraft`

A third member of `SetupDraftValue`. Mirror `patchDraft`: set `cache.current` to `{ raw: null }`
**before** the `removeItem`, wrap the storage call in `try`/`catch`, then notify listeners.

### 3. `actions.ts`: the first backend call

`'use server'`. POST to `${process.env.BACKEND_URL}/api/auth/register` with `cache: 'no-store'`,
returning `{ ok: true }` on `202` and `{ ok: false, status }` otherwise, with a network throw
caught into `{ ok: false }`. A result rather than a throw because the caller has to stay on the
screen and render a message, and an unhandled rejection in a server action reaches the client as
an opaque digest.

### 4. `RegisterForm.tsx`

`'use client'`, taking `register` as a prop. Step 1's form conventions, all three of which fail
silently if missed: a real `<form noValidate onSubmit>`, `event.preventDefault()`, and `required`
on all three fields with no asterisk per A12. Values live in the draft through `patchDraft`, so
AC5's round trip needs nothing extra.

`onSubmit` validates all three fields at once and collects every message, so two empty fields
produce two. On `{ ok: true }` it reads the email out of the body, calls `clearDraft()`, then
pushes `` `${ACCESS_ROUTES.checkEmail}?email=${encodeURIComponent(email)}` `` - in that order,
since the draft is gone afterwards. Messages appear on submit only and each clears on the next
change to its own field; the submit error clears on any change.

The five new strings, all owing designer sign-off under A29 and all shaped like the one live
message `Enter an amount greater than 0.`:

| Case                  | Copy                                                 |
| --------------------- | ---------------------------------------------------- |
| First name empty      | `Enter your first name.`                             |
| Last name empty       | `Enter your last name.`                              |
| Email empty           | `Enter your email address.`                          |
| Email malformed       | `Enter a valid email address.`                       |
| Request failed        | `We couldn't create your account. Please try again.` |

### 5. `SetupRegisterScreen.tsx` and `page.tsx`

Mirror `SetupCategoriesScreen.tsx`: `<SetupShell step={3}>`, the `gap-2` header block with the
overline as a `<p>` rather than a heading, `SUPPORTING_COPY` hoisted to a const so the test
asserts one string, then the form. `page.tsx` is the three-line default export, with no
`export const dynamic` and no session gate.

### 6. `lib/routes.ts` and the route check

Add `checkEmail: '/check-email'`, recording that it is **not** nested under `/setup` because
LOG-3 reaches it from Log in too, so it cannot live inside the setup layout - and that it 404s
until PET-12. In `routes.test.ts`, move `setupRegister` from `PENDING` to `BUILT` and add
`checkEmail` to `PENDING`. `NESTED_SETUP_KEYS` needs no change.

### 7. Tests

- `draft.test.ts` - the three fields through `serializeDraft` and `parseDraft`, the three rules at
  their boundaries, and `toRegisterBody` including the `'2,000'` to `2000` conversion and the
  trimming.
- `layout.test.tsx` - `clearDraft` through the existing `DraftProbe` and `DraftEditor` pair,
  including that a patch after a clear starts from empty rather than from a stale snapshot.
- `actions.test.ts` - a `global.fetch` spy: URL, method, headers and serialized body; `202` to
  `{ ok: true }`; `400` and `429` to their status; a rejected fetch to `{ ok: false }`.
- `RegisterForm.test.tsx` and `SetupRegisterScreen.test.tsx` - `describe` blocks named after the
  acceptance criteria, the way `SetupBudgetScreen.test.tsx` does. AC1 the copy, the overline's
  tokens, one `h1`, the third dot active, the two-column row, and no `input[type="password"]`
  per A31. AC2 three empty fields give three messages and `register` is not called. AC3 a
  malformed email gives the format message and nothing is submitted. AC4 `register` receives the
  exact body built from a seeded draft, then the push target and the emptied storage key. AC5
  Back links to `/setup/categories`, and an unmount and remount brings all five values back.
  Plus the two additions: disabled while pending, and a failing action leaves the user on the
  screen with the alert and no navigation.
- `utilities.test.ts` - the new literal class strings.

### 8. The story

`SetupRegisterScreen.stories.tsx`, `title: 'Screens/22 Register'`, type-only `Meta` and
`StoryObj` import, and `parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } }` -
that last one required because the form reaches `useRouter`, and no gate in CI catches its
absence. Keep the provider inside `render`, never in a decorator, since the smoke harness ignores
decorators. Register the module in `app/screens.stories.test.tsx`'s `MODULES`.

### 9. Docs

- `frontend/src/app/CLAUDE.md`, at the end of The access screens: the grid and why 214 falls out
  of it, the draft's three new fields, `clearDraft` and its cache constraint, the
  action-as-a-prop decision, and the two A19 and A29 additions. Correct the built count.
- `frontend/CLAUDE.md`: the access-screens bullet in `## Not built here` loses Register, and the
  "Any call to the backend at all" bullet is no longer true - rewrite it to name the one write
  that now exists and the reads that still do not.
- `docs/agents/api-contract.md`: extend the frontend-to-backend paragraph to cover writes.
- `docs/TODO.md`: close the draft-clearing item; record the screen-24 amendment to A37, VER-3 and
  PET-12's AC6 together with the browser-Back counterpart; add the five strings to what A29 owes;
  note that `@MaxLength(100)` on the names is not enforced client-side.
- `frontend/.env.example`: its `BACKEND_URL` comment still names a Server Component in
  `src/app/page.tsx` that has not fetched since PET-19.

Then `npm run docs:check` from the repo root, which no hook runs.

## Task checklist

- [ ] Commit this plan alone and open a draft PR carrying this checklist
- [ ] `draft.ts`: three fields, `isNameValid`, `isEmailValid`, `toRegisterBody`
- [ ] `SetupDraftProvider.tsx`: `clearDraft`
- [ ] `actions.ts`: `registerAccount`
- [ ] `RegisterForm.tsx`
- [ ] `SetupRegisterScreen.tsx` and `page.tsx`
- [ ] `lib/routes.ts`: `checkEmail`, and reclassify in `routes.test.ts`
- [ ] Tests: `draft.test.ts`, `layout.test.tsx`, `actions.test.ts`, `RegisterForm.test.tsx`,
      `SetupRegisterScreen.test.tsx`, `utilities.test.ts`
- [ ] The story, registered in `screens.stories.test.tsx`
- [ ] Docs, then `npm run docs:check`
- [ ] Gates: `npm test`, `npm run lint`, `npm run build`, `npm run build-storybook`
- [ ] Open `Screens/22 Register` in Storybook and eyeball it against node `129:1128`
- [ ] Walk the flow against a running backend with `npm run dev`
- [ ] Amend PET-12 and the spec's A37 and VER-3 for the deleted Back button on screen 24

## Commits

1. `docs: plan Register as onboarding step 3 (PET-11)` - this file alone, the branch's first
   commit, with the draft PR opened on it.
2. `feat(frontend): hold the register fields in the onboarding draft (PET-11)` - `draft.ts`, the
   provider and their tests. Split out because it is the shape change everything else builds on,
   and it is the one part a reviewer can check without reading the screen.
3. `feat(frontend): add Register as onboarding step 3 (PET-11)` - the four new route files, the
   route key, the tests and the story.
4. `docs: record the register screen and the first backend write (PET-11)` - the five doc files.

Read `git branch --show-current` immediately before each commit, and read the `[branch sha]` line
back.

## Verification

Gates, from `frontend/`: `npm test`, `npm run lint`, `npm run build` (this repo's typecheck), and
`npm run build-storybook`. From the repo root: `npm run docs:check`. **`npm run api:sync` is not
run**, because nothing a request or response body is made of changed.

Storybook, which is where jsdom cannot help: the two name fields on one row at equal width with
the email spanning both, the third dot as the filled pill, the card at 520px, and the footer row's
6px offset. Then submit with everything empty and confirm three messages render in the designed
treatment.

End to end with both apps under `npm run dev`, in the user's own path order: `/`, "Get started",
budget `2000`, "Continue", toggle a few chips, "Continue", the Register card. Submit empty for
three messages, submit `marko@` for the format message, then submit valid values and confirm three
things - the backend logs a `202`, the browser lands on `/check-email?email=...` (a 404 page until
PET-12, which is the expected result), and `sessionStorage` no longer holds
`spendifico.setup.draft`. Then press the browser's Back button and confirm Register renders empty
without throwing, which is the accepted outcome rather than a bug. Finally submit the same address
six times inside fifteen minutes to trip the per-email limiter, and confirm the 429 renders the
form-level message instead of navigating.

## Known risks and accepted trade-offs

**The Storybook story pulls a `'use server'` module into a browser bundle.**
`SetupRegisterScreen` imports the action so it can pass it down, and Storybook bundles that
through Vite, which does not transform the directive. It should reduce to an ordinary module whose
`fetch` never fires unless the button is clicked, but that is unverified and neither gate would
catch it: `build-storybook` bundles stories without running one, and the Jest smoke suite renders
with `next/navigation` already mocked. Opening the story is the check. The fallback, if it breaks,
is an optional `register` prop on `SetupRegisterScreen` defaulting to the action, so the story can
pass a stub and never pull the module in.

**Browser Back from screen 24 lands on an empty Register.** Removing that screen's Back button
removes the control, not the history entry, and the draft is cleared by then. Accepted, for three
reasons: the account exists and the link is sent, so nothing is lost; the form's own validation
means an accidental empty re-submit produces three inline messages rather than a bad request; and
a deliberate re-submit of the same address is explicitly safe on the backend, which sends a fresh
link instead of duplicating (REG-6, A35). Both alternatives are worse - keeping the draft alive
defeats the clearing decision, and suppressing the history entry means `router.replace` on the way
to screen 24, which would also swallow the legitimate Back from Register to step 2.

**`@MaxLength(100)` on the two names is not enforced client-side.** A longer name gets a 400 and
the generic form-level message rather than an inline one. No `maxlength` is drawn in the frame,
and inventing a cap reads worse than the generic path.

**The email check is looser than the backend's.** `@IsEmail()` is validator.js and rejects
addresses this rule accepts, so those land on the generic message instead of the inline format
one. Tightening it means either a validation dependency for one field or a copy of validator.js's
expression, and the second is a copy that rots silently.

**A 202 does not mean the mail was sent.** The backend floats the send without awaiting it,
precisely so a mail failure cannot become a 5xx, so screen 24's promise is optimistic by design.
A36 makes "Resend link" the only recovery, and that is PET-12's.

**Nothing stops a signed-in user re-running onboarding.** `/setup` is deliberately not gated,
which was harmless while nothing was persisted and is not any more: submitting from a live session
re-stashes the onboarding payload against an existing address. The backend handles it correctly -
an existing account is sent a link rather than duplicated - so the outcome is right, just
pointless. The gate is already tracked as PET-52's.

**The email travels in a query string.** `/check-email?email=...` puts an address in browser
history and in any referrer that page emits. It is the user's own address on their own device, and
PET-52 accepts the same for the far more sensitive session token, so this is consistent rather
than novel - but it is a choice, not a default.
