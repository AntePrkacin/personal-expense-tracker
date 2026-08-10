# PET-46: Build the Settings profile card with avatar initials

Jira: [PET-46](https://decode.atlassian.net/browse/PET-46) · Epic:
[PET-7 Settings](https://decode.atlassian.net/browse/PET-7) · Figma:
[17 Settings](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=40-630)
(frame `40:630`, Profile card `40:682`)

Cut from `main`, stacked on nothing. Every file it touches is already merged.

## Why

Settings is the last of the four routed views whose `<main>` is empty and which fetches nothing.
`frontend/src/app/(app)/settings/page.tsx` is twenty lines - a synchronous Server Component
rendering `PageHeader` over an empty `<main>` - and its own comment names this ticket as the one
that fills it.

The backend half already exists and needs nothing. `PATCH /api/profile` (PET-45) takes
`firstName`, `lastName` and `email` alongside the three preference fields, all optional and none
nullable, and both `UpdateProfileDto` and `ProfileResponseDto` are already in
`frontend/src/types/api.d.ts`. **So no request or response body changes, and `npm run api:sync` is
deliberately not run** - said out loud because the PET-70 plan records the opposite for itself and
the rule is easy to apply by reflex.

What is missing is entirely frontend. There is no `lib/updateProfile.ts`, and `frontend/CLAUDE.md`
still reads "Every **profile** write is still unbuilt". This is the ticket that ends that clause.
It is the app's **eighth** authenticated write and its first outside transactions and categories.

## Scope, against PET-47

The frame draws **one** "Save changes", saving the Profile card, the Preferences card and the
Categories summary together, and PET-47 AC6 says so in as many words. PET-47 is To Do. So this
ticket builds the page's `<form>`, the Profile card and the right-aligned primary button, and
leaves the other two cards out - shaped so PET-47 adds its fields to the same form and the same
single PATCH rather than restructuring anything. What that costs PET-47 is enumerated under
Decisions, because "it will be easy later" is a claim worth writing down before it is tested.

## What the design does not settle, and what this does about it

| #   | The frame shows                                     | What is true                                                          | Disposition                                              |
| --- | --------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | "Your initials are used across Expensa."             | The product was renamed to Spendifico on 2026-08-02 (PET-51)           | **Amended to "Spendifico"**, the third such site          |
| 2   | A 56px avatar, tinted, with initials in it           | The sidebar's own tile is scoped to the dark panel                     | Same daisyUI idiom, recoloured `bg-primary/10 text-primary` |
| 3   | No success, error or unsaved-changes visual (SET-5)  | A save that says nothing is indistinguishable from one that failed     | Three states invented; all three owe A29 a sign-off       |
| 4   | An enabled primary "Save changes"                    | An unchanged form has nothing to send, and an empty body is a 400      | Stays enabled, and a clean press is a **silent no-op**    |
| 5   | An ordinary Email field                              | Editing it moves where every future login link goes, with no re-verify (A39) | Kept ordinary, plus a permanent hint under the field |
| 6   | A fixed 820px column                                 | The frames are 1440px only and draw no narrow viewport                 | `max-w-205` as a ceiling, the standing carve-out          |

All five acceptance criteria are met in full; none is amended. Rows 1, 3 and 5 were put to the
product owner and are decided rather than assumed.

## Decisions

**The `'use client'` boundary is `SettingsForm`, not the screen and not the card.** AC3's live
initials and AC4's inline messages both need state, and nothing above the `<form>` does - so the
boundary is the smallest wrapper, the rule `SidebarNav` and `dashboard/TrendChart.tsx` follow.
`SettingsScreen` staying a **synchronous Server Component** is not a preference either: Storybook
cannot render an async Server Component that reads cookies, and the story harness never applies a
meta's decorators, so the `page.tsx` fetches / `XScreen.tsx` renders split is what makes a story
possible at all. It cannot go lower either. One page-level Save means one `<form>` wrapping every
card, because a footer button cannot read state held inside a sibling card.

**`ProfileCard.tsx` is a separate file for PET-47, not for reuse.** It has exactly one consumer,
which is normally the argument against a file. What earns it one is that `PreferencesCard.tsx` is
a structurally identical sibling one ticket away, and keeping the two symmetrical is what stops
`SettingsForm.tsx` becoming the file that holds both. It carries **no `'use client'` of its own**:
a module imported by a client module is already client, and the directive would advertise a
boundary that is not there.

**Its props are the extension seam, and there is deliberately no slot.** It takes `values`,
`errors`, `disabled` and `onChange` over its own three fields, and PET-47's card takes the same
four over its three. `CategoriesScreen` records the rule this follows: a slot with one possible
occupant expresses no choice. What PET-47 then touches is five things - one key in
`SettingsFormValues`, one case in `invalidFields`, one comparison in `toUpdateProfileBody`, one
entry in `MESSAGES`, one card in the JSX - because `UpdateProfileDto` is one DTO covering all six
fields, so the action, the result union, the submit handler and the footer are already general.

**Validation runs before the diff, and the order is load-bearing.** Blanking First name must show
its message even though the diff would be non-empty; blanking it and restoring it must be silent.
So: validate, return on any problem, diff, return on empty, send. `AllocateBudgetModal.onSubmit`
is the same order.

**An empty diff sends nothing at all.** `PATCH /api/profile` answers **400** to a body with no
keys, for `UpdateTransactionDto`'s documented reason - a bare UPDATE would bump `updated_at`
through `$onUpdateFn`. Unlike the modals there is no dialog to close, so the handler simply
returns: no request, no `router.refresh()`, no message, no state change. **Save is not disabled on
a clean form**, which is the one place this departs from `AllocateBudgetModal`'s `!isDirty`: that
modal has a designed disabled state and this frame does not, and a dead button with nothing beside
it explaining itself is worse than a press that does nothing.

**`original` comes from the prop and only `values` lives in state.** After a successful save,
`router.refresh()` re-runs `(app)/layout.tsx` **and** `settings/page.tsx`, handing this form a
fresh profile. `useState(() => profile)` - `AllocateBudgetModal`'s shape, and the tempting one to
copy - would freeze the diff baseline, so a second press with no further edits would re-send a
body the server already applied. The modals read once on open because a background refresh would
rewrite fields under the user's hands; here `values` is already state, so that protection is had
for free.

**The avatar is announced, where the sidebar's is hidden.** `ui/Sidebar.tsx:248` marks its
initials `aria-hidden` because the full name is read out immediately after them. On this card
there is no name text at all - only inputs, whose values a reader hears only on focus - so "MK" is
genuinely new information rather than a repeat. The divergence gets a comment at the site, because
a reviewer comparing the two files will otherwise read it as an oversight.

**`initials()` is reused, never re-derived.** `lib/format.ts:102` already names SET-6 and this
card as the reason it is a shared function rather than a convenience: the sidebar footer and the
Settings avatar have to agree, which is exactly AC5.

**`@MaxLength(100)` is not mirrored**, the call `categoryForm.isNameValid` already makes about
`@MaxLength(60)`. An over-long name comes back as the generic `invalid` line rather than having
the bound restated in a second place that can drift from the DTO.

**The email hint and the four failure lines are new copy, and the hint is a primitive change.** A
caption under a field has to be programmatically associated with it, so `ui/FieldShell` grows an
optional `hint` rendered as `<p id={`${id}-hint`}>` and `ui/Input` joins that id into
`aria-describedby` beside the error id. This widens a shared primitive for one caller, which
`frontend/src/components/CLAUDE.md` warns about; taken anyway, because the alternative is an
unassociated `<p>` that a screen reader never reaches from the field, and because PET-47's three
Preferences fields are the obvious second consumer.

## The action's classification

`lib/updateProfile.ts` is `lib/updateCategory.ts` with the noun changed, and publishes **four**
reasons off `authorizedPatch('/api/profile', body)`.

- **2xx is `{ ok: true }` and the response body is not read.** `createCategory`'s rule: a 2xx means
  it landed, and `router.refresh()` re-reads the row through the same `GET /api/profile` the
  sidebar footer comes from, so the two cannot disagree.
- **400 is `invalid`**, reachable two ways by construction: a name past `@MaxLength(100)`, which is
  deliberately not mirrored, and an address `lib/email.ts` accepts and validator.js refuses, which
  that module documents as its accepted trade. The copy says to check the values and must never say
  "try again", which is advice that loops forever on a body the DTO rejects. The empty body is
  unreachable rather than handled.
- **401 is `unauthenticated` and does not redirect.** A `redirect()` inside a Server Action throws,
  so the `await` would never resolve and Save would sit disabled forever - and it would discard
  edits the user could still save by signing in in another tab.
- **409 is `taken`, and it is the first 409 in this app the UI can actually reach.**
  `updateCategory`'s `fallback` and `deleteCategory`'s are both classified-but-unreachable, hidden
  behind a control that is not drawn; this one is the ordinary case of two people wanting one
  address. So its copy names the cause rather than hedging. The disclosure is the backend's
  deliberate choice, argued in `backend/CLAUDE.md` under Profile and preferences.
- **Everything else, including a request that never completed, is `failed`.**

**There is no `missing` arm**, and the docblock says so: the profile is always the session's own,
the endpoint takes no id, and it documents 400, 401 and 409 and nothing else.

## The diffed body

`toUpdateProfileBody(original, values)` in `settings/settingsForm.ts`, which is
`toUpdateCategoryBody` with two differences.

- Names are trimmed on the way out and compared against the **untrimmed** stored value, which is
  `toUpdateTransactionBody`'s documented asymmetry for `merchant`: a stored name carrying stray
  whitespace normalises on the first save that touches anything, and that is acceptable precisely
  because the field is on screen with its value in it. The prefill correspondingly does **not**
  trim, or the diff would report a change the user did not make.
- The email is compared **case-insensitively** and the typed casing is what gets sent. The
  backend's `normalizeEmail` is `trim().toLowerCase()` and `ProfileResponseDto.email` already comes
  back normalised, so retyping `MARKO@example.com` over a stored `marko@example.com` is not a
  change and must contribute no key. Lowercasing here instead would be a second normaliser that can
  drift from the first, which is the call `toRegisterBody` already makes.
- **Nothing ever sends `null`.** `UpdateProfileDto` accepts none: every column behind it is NOT
  NULL, and `@ValidateIf(provided)` answers 400 to an explicit null rather than skipping it the way
  `@IsOptional()` would. This is the exact mirror of `toUpdateCategoryBody`, where a blank cap sends
  `null` because that is the only way a capped category becomes uncapped. The two look inconsistent
  and are one rule stated against two DTOs; the docblock says that, because the next person to read
  them side by side will otherwise "fix" one.
- Keys are **assigned, not conditionally spread**, so `Object.keys(body)` is exactly the changed set
  - which is what the caller's empty check reads and what the suite asserts.

## Tasks

- [ ] Plan committed alone as the branch's first commit, draft PR opened against `main` with this
      checklist in the body
- [ ] `lib/profile.ts`: export the `Profile` alias, so nothing downstream restates
      `components['schemas']['ProfileResponseDto']`
- [ ] `lib/updateProfile.ts` and its suite: the Server Action and its four-arm classification
- [ ] `ui/FieldShell.tsx` and `ui/Input.tsx`: the optional `hint` and its `aria-describedby` join,
      plus `Input.test.tsx` and `Input.stories.tsx`
- [ ] `settings/settingsForm.ts` and its suite: values, prefill, validity, the diffed body
- [ ] `settings/ProfileCard.tsx`, `settings/SettingsForm.tsx` and `SettingsForm.test.tsx`
- [ ] `settings/SettingsScreen.tsx` and its suite, `settings/page.tsx` rewritten async, and - in the
      same commit, because the suite is red between them - `(app)/pages.test.tsx`'s `requireProfile`
      mock, its narrowed Settings header assertion and its stale line-42 comment
- [ ] `settings/SettingsScreen.stories.tsx` and its registration in `app/screens.stories.test.tsx`
- [ ] Gates: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`,
      `npm run build-storybook`, `npm run docs:check`
- [ ] Browser walk against every acceptance criterion, in both themes, recorded in the PR
- [ ] Docs: `frontend/CLAUDE.md`'s two gap bullets, `frontend/src/app/CLAUDE.md`'s three dated
      corrections and a Settings section, `docs/TODO.md`
- [ ] Jira: record the copy amendment, the scope boundary against PET-47 and the three invented
      states on PET-46

## Test plan

**`settingsForm.test.ts`**, no DOM. The prefill does not trim. `invalidFields` returns all three
problems at once for a blank form, in draw order, rather than stopping at the first.
`toUpdateProfileBody` returns `{}` for an unchanged form, **exactly** `['firstName']` for one
changed name - the assertion that catches an accidental whole-profile PATCH - `{}` for a
whitespace-only edit and for a case-only email edit, and never a `null` value across a change of
all three.

**`SettingsForm.test.tsx`**, jsdom, with the action injected as a prop and `next/navigation`
mocked, which is `AddCategoryModal.test.tsx`'s shape and needs no module mock (so the `@/` alias
trap never comes up). AC1 the three stored values; AC2 the initials plus the absence of any file
input or upload-named control; AC3 typing updates the tile with no save and no refresh, and
clearing both names empties it; AC4 an empty and a malformed address each show their message with
`save` not called, and a message clears on the next keystroke in **that** field and not another's.
Then the happy path calling `save` once with exactly the changed key and `refresh` once and filling
the status region; a clean form calling neither; each of the four failure arms rendering its copy on
a `role="alert"`; **a rejected RPC rendering the `failed` copy and re-enabling Save**, which is the
frozen-`pending` regression the `try/catch` exists for; Save disabled in flight; and **Enter inside
the Email field submitting the form**, which is the only assertion that catches a missing
`type="submit"` on a `ui/Button` that defaults to `button`.

**The status region is asserted by its text, not its presence.** `AllocateBudgetModal.tsx:485`
records why: a polite region created in the same commit as its content is generally not announced
at all, so it ships mounted and empty and only its text changes, and `getByRole('status')` cannot
tell a working one from a broken one.

**`(app)/pages.test.tsx` needs two changes and both are blocking.** The page becomes async and
calls `requireProfile()`, which reaches `cookies()` and throws outside a request scope, so the
suite needs `jest.mock('../../lib/profile', ...)` with a **relative** specifier. And its "Settings
offers no header action at all" case asserts zero buttons and zero links across the **whole page**,
leaning on the rest of the page being empty; it narrows to the `<header>`, with a comment saying
what changed and that the criterion it pins is unchanged. Its "exactly one page-level heading" case
keeps passing, because the card title is an `h2`.

**Stories** are `Screens/17 Settings`, with a **type-only** Storybook import or the Jest smoke test
dies with an opaque ESM error, and `parameters: { nextjs: { appDirectory: true } }` because
`SettingsForm` calls `useRouter()` and **no gate reports its absence** - `build-storybook` bundles
without running and the smoke suite has `next/navigation` already mocked. `save` is stubbed in
every story, or Storybook's Vite build reaches `cookies()` in the browser. Five: `Default` at the
frame's own values, `WithMessages` as the A29 artifact (built with `AddCategoryModal.stories.tsx`'s
deferred-`requestSubmit()` technique, since submitting in the same tick validates the previous
state), `EmailTaken` for the 409 line, `Saved` for the status line, and `SingleName` for the
one-letter initial.

## Known limitations, recorded rather than fixed

**Settings renders two `GET /api/profile` per view**, the shell's gate and the page's own read.
Both are `cache: 'no-store'`, so Next's per-request memoisation may or may not collapse them; the
browser walk checks. Accepted either way, because there is no profile context and introducing one
to save a request is a far larger change than the request costs - `/transactions/categories`
already fires three reads inside a shell that read a fourth.

**Nothing guards against navigating away with unsaved edits**, by design: SET-5 and A29 draw no
unsaved-changes state, and inventing a `beforeunload` prompt would be a bigger deviation than the
three states already invented.

**Changing the email sends no re-verification and does not disturb the current session** (A39),
and no copy anywhere warns that a typo moves every future login link to an address the user cannot
receive. The hint under the field is the whole of the mitigation.

**AC5 rests entirely on `router.refresh()` re-running the layout.** jsdom can only assert that
`refresh` was called; the footer actually changing is a browser check, and any future caching on
this segment would break it with every gate green.

## Verification

Gates first, in order, from `frontend/`: `npx tsc --noEmit` (CI does not typecheck `*.test.tsx`,
and this ticket adds three prop types and a discriminated union), `npm run lint`, `npm test`,
`npm run build`, `npm run build-storybook`; then `npm run docs:check` from the repo root.

Then a browser walk, signed in, against a running backend, in both themes.

1. **AC1.** `/settings` shows the overline "Manage your account", the title "Settings", and the
   Profile card carrying the three stored values. Diffed against frame `40:682` at 1440px.
2. **AC2.** The circle reads the stored initials. Confirm there is **no** upload affordance at all:
   no file input in the DOM, no hover state, no cursor change on the tile.
3. **AC3.** Typing into First name updates the tile on every keystroke, before any save. Clearing
   both names empties the circle rather than showing a placeholder glyph.
4. **AC4.** Clear Email, press Save: the inline message and the error border appear and the Network
   panel shows **no PATCH**. Then `not-an-address`, Save: the format message, again no request.
   Reload and confirm the stored address is intact.
5. **AC5.** Change First name, Save, and watch the **sidebar footer**: the short name and its 36px
   avatar initials both change with no full reload, and "Changes saved" appears. Reload to confirm
   it persisted, then check the Dashboard and Transactions sidebars agree.
6. **The 409.** Take an address on a second account, type it here, Save: the `taken` line appears,
   the field keeps what was typed, and a reload shows the address unchanged.
7. **The empty diff.** Save on an untouched form sends no PATCH and changes nothing on screen.
8. **A dead backend.** Stop it, press Save: the `failed` line appears and Save is **enabled again**,
   which is the half jsdom can only approximate.
9. **Layout and keyboard.** At ~375px the name row does not overflow the card or clip a focus ring,
   and the drawer sidebar still opens over the form. Tab order runs First, Last, Email, Save. Enter
   inside Email submits.
10. **A screen-reader pass.** The card announces "Profile", the initials, "Your avatar", the
    caption, then the three labelled fields with the Email hint reached from the field itself. A
    failed save is announced assertively and a successful one politely.
