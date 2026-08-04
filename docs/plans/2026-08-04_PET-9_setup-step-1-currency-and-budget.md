# PET-9: Setup step 1, currency and monthly budget

Figma frame **02 Setup - Currency & budget** (node `42:700`), served at `/setup`.

## Context

The frontend has the design system, the app shell, and one of the six access screens: 01
Welcome at `/`. Welcome's "Get started" points at `/setup`, which 404s. This ticket builds
what answers it: step 1 of a three-step onboarding wizard whose step 2 (PET-10, categories)
and step 3 (PET-11, Register) are separate tickets.

Nothing is persisted server side during onboarding. The account does not exist until step 3
posts one `POST /api/auth/register` body, so steps 1 and 2 hold their values client side
(A32). So this ticket does three things beyond drawing a screen:

- it settles the **onboarding route shape**, which PET-8 deliberately left open;
- it introduces the repo's **first stateful form**. There is no `useState`, `useEffect`,
  `<form>` or `'use client'` screen anywhere in `frontend/src` today, so the conventions set
  here are the ones PET-10, PET-11 and PET-12 inherit;
- it adds the **shadow tokens** Foundations never declared, which every remaining card
  screen needs.

This branch is cut from `main`, not from `feat/PET-8-welcome-screen`, because PET-8 merged in
PR #20. It is not a stacked branch.

## What the design actually says

Verified against node `42:700` with the Figma MCP, cross-checked against `43:705` (step 2)
and `129:1128` (step 3).

The page is a `surface-canvas` field with one centred column, gaps 24 and 24: the logo
lockup, a three-dot step indicator, then a 520px card. `globals.css` already paints `body`
with the canvas colour, so the page adds no background of its own.

The card is `surface-card`, a 1px `border-default`, radius 20 (`rounded-xl`), the shadow
`0 12px 32px rgba(13,18,31,0.06)`, and padding 36 top, 32 bottom, 40 each side.

Two details contradict a plain reading of the ticket, and the design wins both:

**The card's gap is not a flat 20.** It has four children 20px apart, and the first of them
is a nested 8px block. Measured from the frame: the text block `42:710` sits at y 36 with
height 91, the select at 147, the budget field at 231, the button row at 330, each exactly
20 after the previous one's lower edge. Inside `42:710` the overline is at y 0 (height 13),
the heading at 21 and the copy at 57 (height 34), which is 8 and 8. Building the ticket's
flat reading would put 20px between the overline and the heading.

**The active step dot is `brand-accent`, not `brand-accent-pressed`.** The overline above it
uses the pressed value, so the two are easy to conflate. The pill is 28x8; the two inactive
dots are 8x8 `border-strong`; the gap is 8 and every corner is `rounded-full`.

The rest maps onto existing tokens with nothing left over: overline `text-overline` in
`text-brand-accent-pressed`, heading Display/S, copy Body/M in `text-text-secondary`. The
budget field's 1.5px `brand-accent` border, `px-4 py-3.5`, and Display/S value behind a
`text-text-tertiary` `$` are exactly what `INPUT_VARIANTS.currency` and
`FIELD_CONTROL_BORDER` already ship. The row is `items-center justify-between pt-1.5`, with
"Back" as bare Strong/M `text-text-tertiary` and "Continue" as a primary Button whose
`px-5 py-3.25` already matches.

Figma writes the select's value with an em dash. The repo normalised that to a hyphen
(`Input.stories.tsx`, and the Jira description itself), so the option label is `USD - $`.

**The shell is identical on frames 02, 03 and 22.** The only things that vary are which dot
is the pill and the column width, 520 / 600 / 520. That answers the question
`frontend/src/app/CLAUDE.md` currently records as open, and it decides the file layout below.

One asset is exported in the design context, the 10x5 select chevron, and `ui/Select.tsx`
already reimplements it as a local `Chevron()` at that viewBox. The cedi glyph and the
wordmark are text nodes `LogoLockup` renders, and the indicator dots are rectangles. Nothing
needs downloading.

## Decisions

**Three nested routes under one layout.** `/setup` is step 1, `/setup/categories` is PET-10,
`/setup/register` is PET-11. `ACCESS_ROUTES.setup` does not move. The alternative, one route
rendering all three steps from client state, is simpler and keeps the draft inside one
component, but the browser's own Back button then exits onboarding and discards everything
typed, and you cannot fix that without pushing history entries by hand. All three tickets
carry an explicit "Back keeps my values" criterion (PET-9 AC5, PET-10 AC4, PET-11 AC5),
which says back-navigation is a first-class path rather than an edge case.

Continue navigates to `/setup/categories`, which **404s until PET-10**. That is the
precedent `lib/routes.ts` already records for Welcome's two links: the href is the contract,
and an inert control would fail AC4 outright while hiding that it had. The Jira description
is left as written.

**The shared chrome is a component, not the route layout.** The active step differs per
route and an App Router layout cannot read the pathname on the server, which is the exact
trap `ui/Sidebar`'s `active` prop and `SidebarNav` were built around. So `SetupShell` takes
`step` as a prop and the route layout does one thing: hold the draft.

**`layout.tsx` stays a Server Component** whose whole body is the provider wrapped around
`children`. React preserves the provider element across navigation between a layout's own
children either way, so the state guarantee is identical to putting `'use client'` on the
layout, and this keeps the layout out of the client bundle. It is the rule `SidebarNav`
already sets: push the client boundary into the smallest wrapper.

**The draft lives in sessionStorage**, read once on mount, written on change, exposed through
context. Context rather than props because steps 2 and 3 are sibling routes and `children`
in a layout is an opaque server-rendered tree. sessionStorage rather than layout state
because AC5's round trip out to Welcome and back **unmounts the layout**, so no in-memory
option can satisfy it. Per tab, cleared when the tab closes, and it never leaves the
browser, so A32 holds literally.

**The budget field groups digits live and accepts up to two decimals**, matching the
backend's `@IsNumber({ maxDecimalPlaces: 2 })`. It truncates rather than rounds, so a third
decimal keystroke is a no-op.

**Foundations gains three shadow tokens now** rather than a third arbitrary literal:
`--shadow-card` for this card, plus `--shadow-panel` and `--shadow-chip` retro-fitted over
the two literals `DecorativePanel.tsx` has carried since PET-8. `frontend/CLAUDE.md` owns
design tokens, and the remaining access frames plus the dashboard cards all want a shadow,
so a third literal would make the inconsistency harder to unwind. This also applies the
one-character fix to `selector()` in `components/ui/utilities.test.ts`, without which a
shadow class reports "generates no CSS" for a class that generates perfectly.

## Files

New, under `frontend/src/app/setup/`:

| File | What it is |
| --- | --- |
| `draft.ts` | Pure. The key, the type, `parseDraft`, `serializeDraft`, `isBudgetValid`. No React, so PET-11 can build the register body without a client boundary and its test needs no jsdom |
| `SetupDraftProvider.tsx` | `'use client'`. The context, the provider, and `useSetupDraft()` |
| `layout.tsx` | Server Component. The provider around `children`, and nothing else |
| `SetupShell.tsx` | Server Component. The column, the lockup, a private `StepIndicator`, the card box. `children` is the card's contents |
| `SetupBudgetScreen.tsx` | Server Component. The card's copy plus the form, inside `<SetupShell step={1}>` |
| `BudgetForm.tsx` | `'use client'`. The form, both fields, the caret restore, validation, `router.push()` |
| `page.tsx` | Returns the screen. No `export const dynamic` |

Plus `draft.test.ts`, `layout.test.tsx`, `SetupShell.test.tsx`,
`SetupBudgetScreen.test.tsx`, `SetupBudgetScreen.stories.tsx`, and `lib/routes.test.ts`.

Modified: `app/globals.css`, `app/globals.test.ts`, `app/DecorativePanel.tsx`,
`app/WelcomeScreen.stories.tsx`, `app/screens.stories.test.tsx`,
`components/ui/utilities.test.ts`, `lib/format.ts`, `lib/format.test.ts`, `lib/routes.ts`.

`ui/Input.tsx`, `ui/Select.tsx`, `ui/Field.tsx` and `ui/Button.tsx` are **not** touched. See
step 6 for why the form needs nothing added to them.

### Why the screen is split out of `page.tsx`

The same reason PET-8 split `WelcomeScreen`: Storybook renders the screen, and a route file
is not a component you can hand a decorator. `page.tsx` stays two lines.

### Where the step indicator lives

A non-exported `StepIndicator()` local to `SetupShell.tsx`.

`components/ui/` is wrong: `frontend/CLAUDE.md` mirrors that folder to the nine Figma
Components tiles and declares the library complete, and the indicator has no tile.
`components/` is wrong too: its one child, `LogoLockup`, earns its place by belonging to six
screens, while this belongs to three that all sit under one route segment, which is the
"next to the route that uses them" case `PageHeader` and `MonthPill` already took.

Local rather than its own file follows `Chevron()` inside `Select.tsx` and `TrashGlyph`
inside `Button.tsx`. Only the shell renders it, and keeping it private means no caller can
render an indicator without the shell that positions it. Its `STEP_DOT` map is still
exported for the compile guard, exactly as `Select.tsx` exports `SELECT_CONTROL`. Promote it
to its own file the day something outside the shell needs it.

It is named `StepIndicator` because that is what BUD-1 calls it, which keeps the spec
greppable from the code. `StepDots` would be wrong: the active one is a pill.

### The indicator is `aria-hidden`

The card's overline states "STEP 1 OF 3" **in text**, so three unlabelled shapes carry
nothing a reader is missing. Unhidden they announce as three empty generics. This is the
same call `Input` makes on its `$` prefix, for the same stated reason.

Two alternatives were considered and rejected, recorded in the file comment so nobody
"fixes" it later:

- `role="progressbar"` with `aria-valuenow`. It duplicates the overline, and `ui/ProgressBar`
  is the repo's one progressbar; a second implementation announcing a wizard as a progress
  bar is worse than none.
- An `<ol>` with `aria-current="step"`. Genuinely the textbook wizard pattern, but it invents
  list semantics and three step *names* the design never draws. This is the alternative if a
  designer or QA asks for one.

`frontend/src/app/CLAUDE.md` already records that `aria-hidden` does not remove focusable
descendants from the tab order. There are none here, and a test pins that.

## Steps

### 1. Shadow tokens in `globals.css`

Add `--shadow-card`, `--shadow-panel` and `--shadow-chip` inside the existing
`@theme static` block, and clear the `--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*` and
`--text-shadow-*` namespaces for the same reason `--color-*` and `--text-*` are cleared: so
`shadow-lg` genuinely does not exist rather than silently generating something the design
never asked for.

`rgba(13,18,31,0.06)` is bound to no Figma variable, which puts it one row up from the
`#4F45E6` slip already recorded in `docs/TODO.md`. Worth a designer answer eventually; the
literal matches the design today.

### 2. Retro-fit `DecorativePanel.tsx` and extend the guards

Replace the two arbitrary literals with `shadow-panel` and `shadow-chip` and rewrite both
comments, which currently explain why a literal was necessary.

In `globals.test.ts`: a `SHADOW_TOKENS` table driven by `it.each`, an exhaustiveness case
mirroring the existing colour one so a fourth shadow cannot appear undocumented, the three
utilities added to `EXPECTED`, and Tailwind's own shadow utilities added to `FORBIDDEN` to
prove the namespaces really are cleared.

In `components/ui/utilities.test.ts`: change `selector()`'s character class from
`/[.:/[\]]/g` to `/[.:/[\]().,#]/g`. Tailwind writes a shadow class as
`.shadow-\[0px_10px_24px_0px_rgba\(0\,0\,0\,0\.25\)\]`, so the unescaped parens and commas
made the helper report a false negative. Verified safe: no existing candidate contains any
of the four new characters, so no other candidate's escaping changes. Then delete the
"Two classes are DELIBERATELY absent" block, both of whose claims this step makes false.

`WelcomeScreen.stories.tsx`'s docstring says the two shadows have no token to check them
against. Correct it.

### 3. `lib/format.ts`: the amount input

A fourth part beside money, names and period.

- `formatAmountInput(raw)` keeps only `[0-9.]`, keeps the first `.` and drops the rest,
  truncates the fraction to two digits, collapses a leading run of zeros while leaving a
  bare `'0'` intact, groups the integer part in threes, and preserves a trailing `.`.
- `parseAmountInput(value)` returns the number, or `NaN` when there is none.
- `amountCaret(raw, caret, formatted)` counts significant characters before the old caret,
  clamps, and returns the index just after the nth significant character of the formatted
  string.

Three constraints on the implementation, each of which is a bug if missed:

**Never route through `Number`.** It would force two decimals, round instead of truncate,
drop a trailing `.` mid-keystroke, and lose precision above 2^53.

**`formatAmountInput` must be idempotent.** Reformatting its own output has to be a no-op,
because step 6's caret technique depends on it.

**Truncate, not round.** `2000.555` becomes `2,000.55`. This is also what makes "a third
decimal keystroke does nothing" true, since typing `5` onto `2,000.55` yields the raw
`2000.555` which formats straight back.

`amountCaret` is correct as long as the formatter only ever *drops* significant characters,
never inserts or reorders them, which the clamp covers.

The comma and the absence of a currency symbol are both deliberate. The comma is hard-coded,
matching this file's existing hard-coded `en-US`; the `$` belongs to
`Input variant="currency"`. This does **not** resolve the `docs/TODO.md` item about
`formatCurrency` always emitting cents: that is a different function for a different job,
and the two still disagree.

### 4. `app/setup/draft.ts` and the provider

```ts
export type SetupDraft = {
  currency: string; // ISO 4217 code, not the 'USD - $' label
  budget: string; // the display string, grouped, e.g. '2,000'
};
```

`budget` is the display string rather than a number because AC5 requires the field to come
back showing what was typed, and no number represents `'2000.'` or `'2,000.5'` mid-type.
PET-11 calls `parseAmountInput(draft.budget)` when it builds the register body: one
conversion at the boundary, the rule `backend/src/common/money.ts` follows.

`categories` is deliberately absent. PET-9 cannot know what shape PET-10 wants, and
declaring a field nothing reads is a claim about nothing. `parseDraft` ignores unrecognised
keys, so PET-10 adds a field and a payload written before that change still loads.

`parseDraft` is **total**. It returns the empty draft for `null`, for a `SyntaxError`, and
for JSON that is not a plain object, and it coerces per field. Not defensive theatre:
sessionStorage is writable from that tab's devtools console, and a malformed payload has to
degrade to an empty form rather than white-screen onboarding. The write swallows a throw for
the same class of reason, since a failed persist degrades AC5 but must not break the screen.

The provider reads storage in a `useEffect`, never in a lazy `useState` initialiser behind a
`typeof window` guard, which would make the client's first render disagree with the server
HTML about a controlled input's value. `useEffect` and not `useLayoutEffect`, which warns
during SSR on every request. The write lives inside `patchDraft` rather than a second effect
on `[draft]`, because an effect-based write is only correct if it is *declared after* the
read effect, which makes correctness depend on declaration order.

`patchDraft` takes a `Partial<SetupDraft>` and merges, so step 2 writing categories cannot
clobber step 1's budget. `useSetupDraft()` throws outside a provider rather than returning a
default, the same testability call `matchItem()` makes: a silent default would let AC5 fail
invisibly.

### 5. `SetupShell.tsx`

`SETUP_STEPS` is a literal union, so `npm run build` rejects a fourth step. `STEP_DOT` is a
`Record<'active' | 'inactive', string>` of complete literal class strings, per the rule that
an interpolated class is invisible to Tailwind's scanner.

The card's width is a hard-coded `w-130`, with a comment naming frame 03's 600px column as
the change PET-10 has to make and the node to check. A `width` prop carrying one legal value
is what `LogoLockup` already rejected as worse than no prop.

Do **not** add `overflow-hidden` even though Figma reports `overflow-clip` on the card:
nothing is positioned out of it, and it would clip the Continue button's
`focus-visible:outline-offset-2`.

Register every new hard-coded class in `components/ui/utilities.test.ts`, including
`STEP_DOT`, and add a key-count assertion so an emptied map cannot pass an `it.each` over
itself.

### 6. `SetupBudgetScreen.tsx`, `BudgetForm.tsx` and `page.tsx`

**`ui/Input` needs no new prop.** `onChange`'s `event.currentTarget` is already the node, so
the caret restore is:

```tsx
const el = event.currentTarget;
const raw = el.value;
const caret = el.selectionStart ?? raw.length;
const formatted = formatAmountInput(raw);
const at = amountCaret(raw, caret, formatted);
// Write the DOM before React does. Its controlled-input commit assigns node.value
// only when it differs from the prop, so making them already equal is what stops
// the caret snapping to the end. This is why formatAmountInput must be idempotent.
el.value = formatted;
el.setSelectionRange(at, at);
patchDraft({ budget: formatted });
```

No `ref`, no `useLayoutEffect`, no `getElementById`. A `ref` prop stays the fallback if this
proves flaky in practice, but adding one means touching a shared primitive plus its test and
its story for a result already in hand. `onBlur` is not needed either, since formatting
happens on change and validation on submit. And `autoFocus` is deliberately absent even
though Figma draws this field focused: `frontend/CLAUDE.md` already records that Figma never
draws it *unfocused*, so the frame is documenting the focus style rather than asking for
autofocus, and AC2 says "when I focus it".

Worth noting the primitive's refusal of `type="number"` now has a third reason:
`selectionStart` throws on a number input, so the caret work would be impossible.

**A real `<form noValidate onSubmit>` with a `type="submit"` Button**, not an `onClick`.
Enter in the budget field has to submit, and an `onClick`-only button leaves Enter dead on a
two-field card. `Button`'s union already supports `submit`, and its default of `'button'`
exists precisely so a form opts in.

Three details of that fail silently if missed:

- **`preventDefault()`.** A form with no `action` does a GET to `/setup` and reloads. Worse,
  sessionStorage would restore the draft, so the defect would look like a flicker.
- **`noValidate`**, which is the pair to putting `required` on the fields. Without it the
  browser's own validation bubble fires first and the designed inline message never renders,
  which reads as broken validation rather than as a missing attribute.
- **`required` stays on both fields** for the semantics it implies, with no asterisk and no
  marker, per A12.

Validation runs on submit only, never while typing, matching `ui/Field.tsx`'s own note that
the message renders on submit alongside every other failed field. It clears on the next
change to the budget field, so it goes away as the user starts fixing it. Currency is never
validated: one option and a non-empty default mean it cannot be empty, so AC4's "valid
currency" holds by construction (A6). The Select is controlled with `value="USD"` and no
placeholder, which also sidesteps the controlled-placeholder trap `Select.tsx` documents.

The message is `Enter an amount greater than 0.` verbatim, which is not invented copy:
`ui/Field.tsx`'s doc comment uses it as *the* example and `Input.stories.tsx`'s `WithError`
story already draws it on a currency field. One message covers both the empty and the zero
case, because A29 designs neither and two shades of copy would invent more than necessary.
This is the first time the A29 pattern ships in a real flow rather than a static story,
which raises the priority of the designer sign-off that item already owes.

**Back is a link, Continue is a button**, which is deliberately the opposite of
`WelcomeScreen`'s rule that both exits are links because both change the page location.
Continue cannot be a link: its navigation is conditional on validation and an anchor cannot
be blocked. That `router.push()` is the only reason `BudgetForm` carries `'use client'`.
Back keeps a literal `href="/"`, because `ACCESS_ROUTES` declares no entry for Welcome by
design, and the comment should point at that decision rather than look like an oversight.

`page.tsx` gets no `export const dynamic`. Nothing in this path reads a request, so it
prerenders static and correctly. That is the opposite of `(app)/layout.tsx`, whose
`force-dynamic` is load-bearing; `frontend/src/app/CLAUDE.md` records why, and it must not be
copied here by reflex.

### 7. `lib/routes.ts` and the route-folder assertion

Add `setupCategories: '/setup/categories'`, rewrite `setup`'s doc comment now that the shape
is settled, and discharge the `TODO(PET-9, PET-12)` asking for an `fs` check.

That check needs a shape that works while `/setup` exists and `/login` does not, so a
blanket `it.each(Object.values(ACCESS_ROUTES))` would fail. Instead a `BUILT` list and a
`PENDING` list, with an exhaustiveness case asserting their union equals
`Object.keys(ACCESS_ROUTES)` so adding a route forces a decision rather than silently
escaping the check; `it.each(BUILT)` asserting a `page.tsx` on disk; and a structural case
that `setupCategories` starts with `${setup}/`, which fails if somebody flattens it to
`/setup-categories`. It never asserts an absence, so PET-10 and PET-12 *move* a key rather
than delete a test.

The test deliberately does not restate the literal `'/setup'`. `WelcomeScreen.test.tsx` is
already the independent half of that contract and records why importing the constant would
let both move together and stay wrong.

### 8. Tests

**Introduce `@testing-library/user-event`.** It is already a devDependency and unused so far.
`fireEvent.change` assigns a value in one shot and jsdom then parks the caret at the end, so
it can neither reproduce incremental typing nor observe a caret, which is precisely what AC2
is about. `userEvent.type()` dispatches per-character events with real selection handling,
and `.click()` covers the rest. Conventions: `setup()` before `render`, every interaction
awaited, no `act()` wrapping.

The caret logic is proved as a pure unit in `format.test.ts` and only *wired up* in the
component test, so if `user-event` fights the controlled reformat in practice the component
test can fall back to `fireEvent.input` with `selectionStart` preset and the coverage is
unaffected.

- `draft.test.ts`: `parseDraft` totality and per-field coercion, unknown keys ignored (the
  forward-compatibility property PET-10 depends on), the round trip, the storage key pinned
  as a literal so a rename is a visible diff, and `isBudgetValid` over both sides.
- `layout.test.tsx`: renders the layout around a probe that calls `useSetupDraft()`, so
  deleting the provider fails. Without it, deleting `layout.tsx` 500s the route at runtime
  with the whole suite green, which is the reasoning `(app)/layout.test.tsx` records for its
  own three lines.
- `SetupShell.test.tsx`: the table-size guards, then `it.each(SETUP_STEPS)` for exactly three
  dots with exactly one active at index `step - 1`; the indicator is `aria-hidden`, found by
  walking **up** from the pill with `.closest()` rather than querying `[aria-hidden]`
  directly, which `WelcomeScreen.test.tsx` records as matching the cedi glyph first; nothing
  focusable in that subtree; the wordmark present and `Expensa` absent; and the card's
  `shadow-card`, since a re-inlined literal would otherwise pass unnoticed.
- `SetupBudgetScreen.test.tsx`: AC1 to AC5. `jest.mock('next/navigation', ...)` with a
  package specifier, so the `@/`-alias trap does not apply. AC3 is asserted through both the
  button and Enter in the field, which is what proves the form wiring and `preventDefault`.
  AC4's "nothing created server side" is made falsifiable twice: a `fetch` spy asserted
  never called, and the form carrying no `action` and no `method`. AC5 is an unmount and
  remount, which is literally what leaving to `/` and returning does to this subtree, plus a
  narrower case seeding storage before the first render. The currency label is asserted
  against an em-dash escape const so a substitution fails loudly instead of reading as an
  identical-looking diff. And exactly one link and exactly one button, the inverted mirror of
  Welcome's assertion, which is what catches somebody regressing Continue to a link and
  silently deleting AC3.

### 9. Storybook

`SetupBudgetScreen.stories.tsx` under `Screens/`, with the type-only
`import type { Meta, StoryObj }` the other story files use because a value import breaks the
Jest smoke tests with an opaque ESM error. At least two exports, since
`screens.stories.test.tsx` asserts `stories.length >= MODULES.length * 2`. Each story's doc
comment says what to eyeball that no test can see.

Register the module in `screens.stories.test.tsx`, which needs a `next/navigation` mock
because the screen reaches `useRouter`. Worth a comment: this is the **opposite** choice from
`shell.stories.test.tsx`, which records that `SidebarNav` must not get a story because there
is no router in context under Jest. Here the screen *is* the frame to diff, so the router is
mocked rather than the story skipped.

No new Storybook section, so no fifth copy of the story smoke harness. That matches what the
`docs/TODO.md` item about the four existing copies already predicted.

### 10. Docs

Fact ownership per `docs/agents/conventions.md`: design tokens in `frontend/CLAUDE.md`,
routes and screens in `frontend/src/app/CLAUDE.md`, deferral reasons in `docs/TODO.md` with
each `## Not built here` carrying only the warning. Add, do not reflow; new material at the
end of its section unless it corrects the sentence it replaces.

`frontend/src/app/CLAUDE.md` is the main target. Corrections rather than additions: the
paragraph saying `/setup` works "one route for all three steps, or the first of three", the
"PET-9 is the ticket that discovers whether a shared layout exists" paragraph, and the
closing note that the two Welcome shadows are excluded from the compile guard because
Foundations has no tokens and `selector()` cannot escape parens. This ticket makes all of
those false. New material covers the three-route shape, the sessionStorage draft, `SetupShell`
and why it is a component rather than a layout, the `aria-hidden` indicator and its rejected
alternatives, and the first stateful form.

**One stale line to fix while in that file**: it states that `/` is a bare
`redirect('/dashboard')`, which is PET-19's version. `app/page.tsx` has awaited
`hasSession()` since PET-8, and the same file describes it correctly 33 lines later. Two
paragraphs disagreeing about one route is exactly the drift `docs:check` cannot see.

`frontend/CLAUDE.md` gets the shadow-token paragraph, a fourth part in the `lib/format.ts`
paragraph that currently says "in three halves", and its `## Not built here` access-screens
bullet edited from five screens down to four. Rule 4 says delete whole bullets and never
merge them, but only part of this one lands here, so it is edited rather than deleted.

Root `CLAUDE.md` says "the first of the six access screens". Two of six. Nothing else: it is
an index and deliberately keeps no gap summary.

`docs/agents/conventions.md` gains one fact-ownership row. The table says
`frontend/CLAUDE.md` owns design tokens and component conventions and has no row for route
and screen facts, which the restructure recorded only in prose. This ticket is the first to
act on that split.

In `docs/TODO.md`, delete the onboarding-route-shape item and the shadow-token item, both
settled here. Update the story-harness item, the locale item (a third consumer now) and the
`formatCurrency`-cents item (this does not resolve it). Add: the consequences of a
sessionStorage draft; the two known caret imperfections; that `/setup` is not session-gated,
which PET-52 should own; that A29's error pattern is now live and still owes sign-off; and
that nothing clears the draft, which PET-11 has to answer since Back must not.

Then run `npm run docs:check`. Two of its assertions bite here: every backticked rooted path
must resolve, so the docs cannot name a `app/setup/` file before it exists, and every scoped
`CLAUDE.md` must keep its `## Not built here`. No hook runs it.

## Task checklist

- [ ] Cut `feat/PET-9-setup-step-1-currency-and-budget` from `main`
- [ ] Commit this plan alone and open a draft PR carrying this checklist
- [ ] Add the three shadow tokens to `globals.css` and clear the four shadow namespaces
- [ ] Retro-fit `DecorativePanel.tsx`; extend `globals.test.ts`; fix `selector()` and delete
      the stale exclusion block in `utilities.test.ts`; correct the Welcome story docstring
- [ ] Add `formatAmountInput`, `parseAmountInput` and `amountCaret` with their tests
- [ ] Add `app/setup/draft.ts` and `SetupDraftProvider.tsx` with `draft.test.ts`
- [ ] Add `app/setup/layout.tsx` with `layout.test.tsx`
- [ ] Add `app/setup/SetupShell.tsx` and register its classes in the compile guard
- [ ] Add `SetupBudgetScreen.tsx`, `BudgetForm.tsx` and `page.tsx`
- [ ] Add `setupCategories` to `lib/routes.ts` and write `lib/routes.test.ts`
- [ ] Cover AC1 to AC5 in `SetupShell.test.tsx` and `SetupBudgetScreen.test.tsx`
- [ ] Add `SetupBudgetScreen.stories.tsx` and register it in `screens.stories.test.tsx`
- [ ] Update the five Markdown files listed in step 10
- [ ] Run the frontend gates and `npm run docs:check`
- [ ] Eyeball Storybook, including that `Screens/01 Welcome` is unchanged

## Commits

Four, per "use the fewest commits that make sense, not one per task".

1. `docs: plan Setup step 1 with currency and monthly budget (PET-9)` - this file alone, the
   standing exception, so the draft PR exists before any code.
2. `feat(frontend): add shadow tokens to Foundations (PET-9)` - steps 1 and 2. Separate
   because it changes an **existing** screen, so it is revertable on its own, and because it
   is the one visual-regression risk in this ticket.
3. `feat(frontend): add Setup step 1 with currency and monthly budget (PET-9)` - steps 3 to
   9. One feature, one working tree; the helpers and the route constant exist only to serve
   it.
4. `docs: record the onboarding route shape and the first stateful form (PET-9)` - step 10.
   Last, because `docs:check` requires every backticked rooted path to resolve.

## Verification

From `frontend/`: `npm test`, then `npm run lint`, `npm run build` (the typecheck gate, and
what exercises `SetupStep`'s literal union, `Button`'s exclusive union and the `satisfies` in
`routes.test.ts`), then `npm run build-storybook`. From the root: `npm run docs:check`.

`npm run storybook`, and eyeball what jsdom cannot see: the card against node `42:700`, the
shadow, the 28x8 pill against the two 8px dots, `2,000` at Display/S behind the `$`, the
1.5px accent focus border, the three indicator states, and **that `Screens/01 Welcome` is
unchanged after the shadow retro-fit**.

Then `npm run dev`, with **no backend running**, since nothing here fetches: `/` then Get
started; type `2000` and see `2,000`; click into the middle of the number and type, and the
caret holds; a third decimal does nothing; Continue on an empty field shows the message and
does not navigate; Enter does the same; fill it in and Continue reaches a 404 at
`/setup/categories`, which is expected; Back to `/` then Get started again, and both values
are still there; a **new tab** at `/setup` is empty, as designed; devtools shows one session
storage key and nothing else.

Read `git branch --show-current` immediately before each commit, and read the `[branch sha]`
line back.

## Known risks and accepted trade-offs

**AC4 cannot be literally satisfied.** "Step 2 opens" is a 404 until PET-10. The href is the
contract, which is the precedent PET-8 set, and the Jira description is left as written by
decision.

**Frame 03 is 600px wide, and `SetupShell` hard-codes 520.** PET-10 changes one class. The
alternatives were a width prop with one legal value, or a width-agnostic column with each
card carrying its own; both cost something today for a benefit PET-10 can take instead.

**The caret has two known imperfections**, both pinned by tests rather than left to be
discovered: typing a leading `0` in front of an existing number moves the caret past the
first digit, and backspacing over a separator collapses `2,000` to `0`. Both need a
deliberate keystroke sequence, and the fix is a separator-aware `keydown` handler.

**`/setup` is not gated on a session.** `/` redirects a signed-in visitor and the `(app)`
shell gates itself, but this route does neither: PET-9 has no session to read, and a third
stub call site would be a claim it cannot test. PET-52 decides whether onboarding is
reachable with a live session.

**Nothing clears the draft.** Back must not, since AC5 forbids it, and no reset control is
designed, so an abandoned onboarding shows stale values in that tab until it closes. PET-11
should clear it on a successful register.

**Four independent hard-codes agree only because USD is the only currency in the design.**
The `USD - $` label, `Input`'s `$` prefix, `formatCurrency`'s `en-US`, and
`formatAmountInput`'s comma. This ticket is where they meet, and A6 is the only thing keeping
them consistent.
