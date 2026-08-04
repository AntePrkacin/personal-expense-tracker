# PET-10: Setup step 2, starter category chips

Figma frame **03 Setup - Starter categories** (node `43:705`), served at `/setup/categories`.

## Context

Onboarding is three nested routes under one layout, settled by PET-9: `/setup` (step 1,
built), `/setup/categories` (step 2, this ticket) and `/setup/register` (step 3, PET-11). Step
1's "Continue" already pushes to `/setup/categories`, which **404s**, so onboarding dead-ends
there today. This ticket is what answers it.

Nothing is persisted server side. The account does not exist until step 3 posts one
`POST /api/auth/register` body (A32), so this step adds a third field to the sessionStorage
draft and writes nothing else. PET-9 left the slot open on purpose: `draft.ts` records that
`categories` is deliberately absent because PET-9 could not know what shape step 2 wanted, and
`parseDraft` already ignores unrecognised keys so a draft stored before this change still
loads. `draft.test.ts` pins that with a literal `{"categories":["Groceries"]}` payload.

Three smaller things fall out of it:

- the **starter category list reaches the frontend for the first time**, and the backend
  already owns it. `RegisterDto.categories` is validated with `@IsIn(STARTER_CATEGORY_NAMES)`,
  which the swagger plugin publishes as a real `enum`, so `frontend/src/types/api.d.ts`
  already carries the ten names as a literal union;

- `SetupShell` hard-codes `w-130` and frame 03 is 600px wide. PET-9 named this as PET-10's one
  class to change;

- it is the repo's **first toggle control**. There is no `aria-pressed`, `aria-checked` or
  `type="checkbox"` anywhere in `frontend/src`, so the semantics chosen here are the precedent
  the category screens inherit.

## What the design actually says

Verified against nodes `43:705`, `43:706` and `43:714` with the Figma MCP, with every chip's
dot fill read from its exported asset rather than eyeballed from the render.

The shell is identical to step 1 - canvas field, centred column, `LogoLockup`, the three-dot
indicator, then the card - with two differences: **the second dot is the pill**, and the
**card is 600px** where frames 02 and 22 are 520 (`43:706` and `43:714` are both 600 wide).
Card treatment, padding and the 20px gap are unchanged, so `SetupShell` needs nothing but the
width.

The card holds three children 20px apart:

1. the header block, a nested 8px stack: overline `STEP 2 OF 3` (`text-overline
   text-brand-accent-pressed`), heading `Pick your categories` (`text-display-s
   text-text-primary`), then the copy in `text-body-m text-text-secondary`.

2. the chip field: `flex flex-wrap` with a **10px gap**. Figma draws three rows, 3 / 3 / 4, but
   they are a consequence of wrapping inside the 520px content box rather than a fixed grid.
   The last row ends 7px short of the edge.

3. the footer row: `items-center justify-between pt-1.5`, "Back" as bare Strong/M
   `text-text-tertiary` and "Continue" as a primary button. That is exactly
   `BUTTON_VARIANTS.text` and `BUTTON_VARIANTS.primary`, both already `px-5 py-3.25` with
   `rounded-md` from `BUTTON_BASE`.

**The chip** is radius 12 (`rounded-md`), `px-3.5 py-2.75` (14 and 11), `gap-2.25` (9), label
Label/L (`text-label-l`), an 11px dot (`size-2.75 rounded-full`) and, when selected, an 8.5x6
checkmark stroked 2 with round caps in `brand-accent`. Selected is `bg-brand-accent-soft`
behind a 1.5px `brand-accent` border with a `text-brand-accent-pressed` label; unselected is
`bg-surface-card` behind a 1px `border-strong` border with a `text-text-primary` label.

That selected pair is byte-identical to `TAG_TONES.indigo`. `ui/Tag` is still not reusable
here - it is a non-interactive `span` at a different radius, padding, type style and dot size,
and its five tones are status tones - but the coincidence is worth a comment so nobody reads
the duplication as an accident.

**The ten chips, in the designed order, with the colour token each dot's exported SVG actually
carries**: Groceries green, Dining out coral, Transport blue, Shopping yellow, Housing teal,
Health pink, Entertainment violet, Bills orange, Subscriptions blue, Other orange. That is the
same order and the same eight colours the backend's own `STARTER_CATEGORIES` holds, read from
the same variable bindings. Two of them repeat, because the palette has eight colours for ten
chips, which is what the backend file already warns is the design rather than an error. It
also means colour alone cannot identify a category.

**The mock shows seven chips selected** (Groceries, Dining out, Transport, Shopping, Housing,
Entertainment, Bills). By decision this ticket treats that as an illustration of the selected
state rather than a default. See Decisions.

Two strings need a decision, and both go the same way. Figma's copy carries a real em dash, and
the frame draws the wordmark "Expensa". The em dash is **normalised to a spaced hyphen**,
because that is what the repo already did to the currency label (`USD - $` in
`Input.stories.tsx` and in the Jira description) and what the tech spec's own CAT-1
transcription uses, so the copy ships as `Choose what you'd like to track. Tap to toggle - you
can always add or edit categories later.` The wordmark is `LogoLockup`'s and already says
Spendifico: PET-51 renamed it everywhere and the design file is the known holdout.

One asset is exported per chip, an 11px circle, plus one shared checkmark vector. Neither needs
downloading: the circles are `CATEGORY_TILE` backgrounds on a `rounded-full` span, which is
exactly what `DecorativePanel` already draws, and the checkmark is traced as a local glyph the
way every other icon in this repo is.

## Decisions

**No chips are selected on a first visit.** `EMPTY_DRAFT.categories` is `[]`. AC3 explicitly
allows an empty selection, and the product intent is that the user chooses rather than
inherits. An explicitly stored `[]` is preserved rather than falling back to a default, so
deselecting everything survives a Back and a return.

**The chip is a `button` with `aria-pressed`.** The ARIA toggle-button pattern, which is what
the design draws: a chip that presses. Space and Enter both activate it, each chip is one
ordinary tab stop, and the state is announced without inventing copy the design never draws.
The colour dot and the checkmark are both `aria-hidden`, because `aria-pressed` already carries
the state and neither shape says anything a reader is missing. That is the same call `ui/Tag`'s
dot, `ui/Input`'s `$` prefix and `SetupShell`'s indicator all make.

The rejected alternative is recorded in the chip's own comment, the way `SetupShell` records
its two: a visually hidden `input type="checkbox"` per chip inside a `fieldset`. It announces
as "checkbox, checked", which reads more naturally as "pick several from a set", but it needs a
legend duplicating the `h1`, Enter does not toggle it, and the hidden input buys nothing here
because there is no form and nothing submits. Reach for it if a designer or QA asks.

**Both exits are links, and this screen has no `form`.** A4 designs no minimum selection, so
"Continue" is unconditional, and an exit that always navigates is a link - which is
`WelcomeScreen`'s rule. Step 1 is the exception rather than the pattern: `BudgetForm` is a
`form` with a submit button only because its navigation is conditional on validation and an
anchor cannot be blocked. Saying that out loud matters, because copying step 1's form here
would invent a validation seam A4 says does not exist. The consequence is that the client
boundary covers the chips alone and the screen, its header and its footer all stay Server
Components.

**The selection is written on every toggle, not on Continue.** `patchDraft({ categories })`,
which merges: PET-9 added `layout.test.tsx`'s merge coverage for exactly this case, noting that
step 2 writing its categories must not wipe step 1's budget. AC4's "returning to step 2 shows
my chips still toggled" then costs nothing.

**`SetupShell` gains `STEP_WIDTH`, a `Record<SetupStep, string>`, rather than flipping one
literal.** PET-9 hard-coded `w-130` with a comment saying PET-10 changes it, "or, if a third
width ever appears, lifts it to a prop". A second width has now appeared, and the map is the
cheaper of the two: it needs no prop, it keeps every class a complete literal string for
Tailwind's scanner, it is guarded by `utilities.test.ts` exactly as `STEP_DOT` beside it is,
and it records frame 22's 520 now so PET-11 has nothing to remember.

**The chip list is type-checked against the generated contract.**
`components['schemas']['RegisterDto']['categories'][number]` is the ten names as a literal
union, so the frontend's list `satisfies` it and an exported `AssertNever<Exclude<...>>` alias
fails `npm run build` if the backend ever offers a name this screen does not. That is
`docs/agents/api-contract.md`'s rule - a caller reads its type out of the contract rather than
declaring one - and it makes this the frontend's **first consumer of `api.d.ts`**. Type-only,
so nothing fetches, and `npm run api:sync` is not involved because no request or response shape
changes.

The colours cannot come from the contract, since the backend publishes names only, so
`STARTER_CATEGORIES` pairs each name with a `CategoryColour` key from
`components/ui/categoryColour.ts` and `CATEGORY_TILE` supplies the dot's background utility.
No hex value enters the frontend.

**`parseDraft` canonicalises the category list, exactly as it already canonicalises the
budget.** Unknown strings are dropped, duplicates collapsed, and the survivors returned in the
designed order rather than the order they were stored in. Not defensiveness: sessionStorage is
writable from that tab's devtools console, and `RegisterDto` carries `@IsIn`, `@ArrayUnique`
and `@ArrayMaxSize`, so an unknown or duplicated name is a guaranteed 400 on a screen with no
error state designed for it (A29). That is the identical failure the stored `'2.000,50'` budget
produced, and the identical remedy. Canonical order also mirrors `seedStarterCategories`, which
inserts in the canonical order whatever the submission order was.

**Chips carry `border-[1.5px]` in both states, and only the colour changes.** This is the one
deviation from the frame, where the unselected chip is 1px. `box-sizing` is `border-box`, but
the chip is auto-sized, so a border that thickens on toggle makes the chip 1px wider and taller
and nudges - or rewraps - the whole row under the pointer. `Field.tsx`'s note that the half
pixel "eats into the padding rather than resizing the field" holds for a `w-full` control, not
for this one. Half a pixel of border is invisible; a row that jumps is not. Same class of
deliberate deviation as the five `ui/` form details `frontend/CLAUDE.md` lists, so it is
written down rather than left to be rediscovered.

**Two class maps, one per CSS property**, per `Field.tsx` and `Sidebar.tsx`:
`border-border-strong` and `border-brand-accent` have equal specificity, so emitting both makes
the winner depend on stylesheet order.

## Files

New, under `frontend/src/app/setup/`:

| File | What it is |
| --- | --- |
| `starterCategories.ts` | Pure. The ten names paired with their `CategoryColour`, the name type derived from `api.d.ts`, the exhaustiveness alias, and `STARTER_CATEGORY_NAMES`. Beside `draft.ts` rather than inside `categories/`, because the draft depends on it |
| `categories/page.tsx` | Returns the screen. No `export const dynamic` |
| `categories/SetupCategoriesScreen.tsx` | Server Component. `SetupShell` at step 2, the header block, the picker, the footer row |
| `categories/CategoryPicker.tsx` | `'use client'`. Reads `useSetupDraft()`, renders the ten chips, toggles |
| `categories/CategoryChip.tsx` | The chip, its two class maps, and a private `CheckGlyph()` |

Plus `starterCategories.test.ts`, `categories/CategoryChip.test.tsx`,
`categories/SetupCategoriesScreen.test.tsx` and
`categories/SetupCategoriesScreen.stories.tsx`.

Modified: `app/setup/draft.ts` and `draft.test.ts`, `app/setup/SetupShell.tsx` and
`SetupShell.test.tsx`, `lib/routes.ts` and `routes.test.ts`,
`components/ui/utilities.test.ts`, `app/screens.stories.test.tsx`, then the four Markdown files
in step 8.

`components/ui/` is not touched. The chip is feature-local: `frontend/CLAUDE.md` declares that
folder complete against the nine Figma Components tiles, and a new component from here on is a
feature's own. `ui/Button`, `ui/Tag` and `ui/Field` are each considered and each declined for a
stated reason.

## Steps

### 1. `app/setup/starterCategories.ts`

The list is `as const satisfies readonly { name: StarterCategoryName; colour: CategoryColour }[]`
rather than carrying a type annotation, so the literal names survive for the union below while
still being checked against the contract. `STARTER_CATEGORY_NAMES` is derived by `map`, never
restated, which is what the backend file does for the same reason.

The exhaustiveness guard is a `type AssertNever<T extends never> = T` applied to
`Exclude<StarterCategoryName, (typeof STARTER_CATEGORIES)[number]['name']>`, exported so
`no-unused-vars` has nothing to say about it. A non-empty `Exclude` fails the typecheck, which
means a name added to the backend's list cannot land as a chip nobody offers.

The comment block records the three facts worth knowing: the order is part of the contract, two
colours repeat by design, and A7's known conflict, where this set contains Bills and
Subscriptions which never appear again while later screens show Health and Other, each screen
following its own mock until the designer resolves it.

### 2. `draft.ts`: the third field

`categories: StarterCategoryName[]` on `SetupDraft`, `[]` on `EMPTY_DRAFT`, and a
`readCategories(source)` beside `readString` that is total the same way: a value that is not an
array becomes `[]`; otherwise keep the strings that are known names, dedupe through a `Set`,
and return them in `STARTER_CATEGORIES` order. Typing the field as the union rather than
`string[]` is what lets PET-11 hand it straight to the register body.

Replace the "there is deliberately no `categories` field yet" comment with what the field is
and why it is canonicalised, pointing at the budget's identical reasoning directly above it.

`draft.test.ts`: the `carries no categories field yet` case becomes an assertion that the keys
are exactly `budget`, `categories` and `currency`; add an `it.each` table over the reader (not
an array, an array of junk, unknown names, duplicates, wrong order, an explicit `[]`), and
extend the round trip.

### 3. `SetupShell.tsx`: `STEP_WIDTH`

`export const STEP_WIDTH: Record<SetupStep, string>` mapping 1 to `w-130`, 2 to `w-150` and 3
to `w-130`, interpolated into the card's class string beside the existing literals. Rewrite the
`w-130` comment, which currently tells PET-10 to change one class and which this step makes
false.

`SetupShell.test.tsx`: the card-treatment case becomes an `it.each(SETUP_STEPS)` asserting
`STEP_WIDTH[step]` lands on the card, plus a key-count guard on the new map. Its comment saying
PET-10 changes this and the assertion together comes out.

### 4. `CategoryChip.tsx`

`CHIP_SURFACE` maps `on` to `bg-brand-accent-soft border-brand-accent` and `off` to
`bg-surface-card border-border-strong`; `CHIP_LABEL` maps `on` to `text-brand-accent-pressed`
and `off` to `text-text-primary`. Two records, one per property, per the specificity note in
Decisions.

The chip is a `button type="button"` carrying `aria-pressed`, the base
`text-label-l inline-flex items-center gap-2.25 rounded-md border-[1.5px] px-3.5 py-2.75`, and
the focus ring every other component uses (`focus-visible:outline-brand-accent
focus-visible:outline-2 focus-visible:outline-offset-2`) - which is the reason `SetupShell`
deliberately omits `overflow-hidden` on the card. `inline-flex` rather than `flex`, the call
`ui/Tag` records, because Figma auto-layout hugs its contents.

The dot is an `aria-hidden` span at `size-2.75 shrink-0 rounded-full` plus
`CATEGORY_TILE[colour]`. The checkmark is a private `CheckGlyph()` tracing the exported
`M1 4L4 7L9.5 1` at stroke width 2 with round caps, re-pointed at `currentColor` so it inherits
the label colour, `aria-hidden`, and carrying `overflow-visible` - the trap `ListRow`'s and
`Select`'s glyphs already document, since a round cap on a path drawn to the edge of its
viewBox is otherwise sheared flat. It renders only when selected, which is what AC2 checks.

Two comments the file has to carry: why the selected pair matches `TAG_TONES.indigo` without
reusing `Tag`, and the rejected checkbox alternative.

### 5. `CategoryPicker.tsx`

`'use client'`, the only client file on this screen. It reads `draft` and `patchDraft` from
`useSetupDraft()`, holds no state of its own - the draft **is** the state, which is what makes
AC4 free - and maps `STARTER_CATEGORIES` into chips inside a `div` with `flex flex-wrap
gap-2.5`.

Toggling builds the next list by filtering `STARTER_CATEGORIES` against a `Set` of the current
selection with the clicked name flipped, so the stored order is canonical by construction and
matches what `parseDraft` would return anyway. Never by `push`, which would store click order
and make two identical selections compare unequal.

No `role="group"` and no `aria-label` on the wrapper: the `h1` immediately above says "Pick
your categories", and a group label restating it is the noise `SetupShell`'s indicator comment
already argues against.

### 6. `SetupCategoriesScreen.tsx` and `page.tsx`

The screen mirrors `SetupBudgetScreen`: `SetupShell` at step 2, the `flex flex-col gap-2`
header block with the overline as a `p` rather than a heading (it labels position in the flow,
and it is *why* the indicator can be `aria-hidden`), the screen's single `h1`, the copy hoisted
to a const so one test asserts one string, then the picker and the footer row. Back is
`Button href={ACCESS_ROUTES.setup} variant="text"` and Continue is
`Button href={ACCESS_ROUTES.setupRegister}`.

Back points at the constant, not a literal: step 1's literal `href="/"` is the exception,
because Welcome has no `ACCESS_ROUTES` entry by design. `page.tsx` is two lines with no
`export const dynamic`, since nothing here reads a request, so it prerenders static. That is
the opposite of `(app)/layout.tsx` and must not be copied by reflex.

### 7. `lib/routes.ts`, and the compile guard

Add `setupRegister: '/setup/register'` with a doc comment naming frame 22 and PET-11, and
rewrite `setupCategories`' comment, which says the route 404s today.

`routes.test.ts` moves `setupCategories` from `PENDING` to `BUILT` and adds `setupRegister` to
`PENDING`. The two lists were built so a ticket moves a key rather than deletes a test. Add the
structural case that `setupRegister` also starts with `${setup}/`.

`components/ui/utilities.test.ts`: register `STEP_WIDTH`, `CHIP_SURFACE`, `CHIP_LABEL` and every
new hard-coded class (`w-150`, `gap-2.5`, `gap-2.25`, `size-2.75`, `px-3.5`, `py-2.75`,
`border-[1.5px]`), each with its key-count guard. This is the gate that catches a class Tailwind
silently compiles to nothing, which is the failure mode with no build error and no failing
test.

### 8. Tests and the story

- `starterCategories.test.ts`: the ten names pinned as literals **in order**, which is the
  contract with both the backend and the design; every colour a `CATEGORY_TILE` key; and an
  explicit case that blue and orange each appear twice, so the duplication cannot be quietly
  "fixed".

- `CategoryChip.test.tsx`: it is a `button` and not a link; `aria-pressed` tracks the prop;
  the handler fires on click and on keyboard activation; the checkmark renders only when
  selected; the dot and the glyph are both `aria-hidden`; both maps land per state; and a
  key-count guard so an emptied map cannot pass an `it.each` over itself.

- `SetupCategoriesScreen.test.tsx`, organised by criterion the way step 1's is, wrapping in
  `SetupDraftProvider` and clearing `sessionStorage` in `beforeEach`:

  - **AC1**: ten buttons whose accessible names are the designed list in order, the overline
    text, the copy asserted against a const that also proves the em dash is absent, and the
    second dot active - found by walking **up** from the pill with `.closest()`, the technique
    `SetupShell.test.tsx` records, because querying `[aria-hidden]` matches the cedi glyph
    first.
  - **AC2**: a click sets `aria-pressed` to true and applies the selected classes, a second
    click returns both, and the stored draft follows each way.
  - **AC3**: Continue is a link to `/setup/register`; with a selection, storage holds it in
    canonical order; with none, Continue is still a link and storage holds `[]`.
  - **AC4**: Back is a link to `/setup`; an unmount and re-render keeps the toggles, which is
    literally what leaving and returning does to this subtree; and a case seeding storage with
    a budget before the first render, asserting a toggle leaves it untouched.
  - **AC5**: a `fetch` spy never called, and `container.querySelector('form')` null, so
    "nothing sent" is falsifiable twice. Plus the no-password-field assertion every access
    screen repeats (A31), and **two links against ten buttons**, the inverted mirror of step
    1's one and one, which is what catches somebody regressing Continue into a submit button
    and inventing the validation A4 forbids.

`SetupCategoriesScreen.stories.tsx` goes under `Screens/03 Setup` with the type-only Storybook
import, at least two exports (`screens.stories.test.tsx` asserts two per module), the
`SetupDraftProvider` **inside `render`** rather than in a decorator, and
`parameters: { nextjs: { appDirectory: true } }`, because `next/link` wants the mock router too
and no gate in CI catches its absence. The second story shows the chip in both states side by
side, which is the part jsdom can never check. Register the module in `screens.stories.test.tsx`.

### 9. Docs

Fact ownership per `docs/agents/conventions.md`: routes and screens in
`frontend/src/app/CLAUDE.md`, the gap list in `frontend/CLAUDE.md`, deferral reasons in
`docs/TODO.md`. Add rather than reflow, and new material goes at the end of its section unless
it corrects the sentence it replaces.

`frontend/src/app/CLAUDE.md` is the main target. Corrections: "Two of them are built", and the
`lib/routes.ts` paragraph saying `/setup/categories` 404s. New material: the chip's
toggle-button semantics with its rejected alternative, `STEP_WIDTH` replacing the hard-coded
width, that step 2 has no form and both exits are links and why that does not contradict step
1, the draft's third field and its canonicalisation, and the first import of `api.d.ts`.

`frontend/CLAUDE.md`: the access-screens bullet edited from four screens to three. Edited
rather than deleted, since only part of it lands. No token changes, because this screen needed
none.

Root `CLAUDE.md`: two of six access screens becomes three, and the sentence naming which exist.

`docs/TODO.md` gains: that the starter list now exists in two files linked only by a generated
union at build time, and that a public backend read serving that list is the preferred
long-term answer, with the constraint that onboarding has no per-user database so it cannot
read the user's own categories; that a first visit shows nothing selected where the mock shows
seven, which owes a designer answer; the `border-[1.5px]` deviation; and that A7's
Bills-and-Subscriptions conflict now ships in a real screen rather than a spec note. The
draft-per-tab item still points at PET-11.

Then `npm run docs:check`, which is why the docs commit goes last: every backticked rooted path
must resolve, so the docs cannot name a file before it exists.

## Task checklist

- [ ] Commit this plan alone and open a draft PR carrying this checklist
- [ ] Add `STEP_WIDTH` to `SetupShell.tsx`, update its test and the compile guard
- [ ] Add `app/setup/starterCategories.ts` with its test
- [ ] Add `categories` to `draft.ts` with the canonicalising reader, and update `draft.test.ts`
- [ ] Add `CategoryChip.tsx` and `CategoryPicker.tsx`
- [ ] Add `SetupCategoriesScreen.tsx` and `categories/page.tsx`
- [ ] Add `setupRegister` to `lib/routes.ts` and move `setupCategories` to `BUILT`
- [ ] Register every new class map in `components/ui/utilities.test.ts`
- [ ] Cover AC1 to AC5 in `CategoryChip.test.tsx` and `SetupCategoriesScreen.test.tsx`
- [ ] Add `SetupCategoriesScreen.stories.tsx` and register it in `screens.stories.test.tsx`
- [ ] Update the four Markdown files in step 9
- [ ] Run the frontend gates and `npm run docs:check`
- [ ] Eyeball Storybook, including that `Screens/02 Setup` is unchanged

## Commits

Four, mirroring PET-9's split for the same reasons.

1. `docs: plan Setup step 2 with starter category chips (PET-10)` - this file alone, the
   standing exception, so the draft PR exists before any code.
2. `refactor(frontend): key the Setup card width by step (PET-10)` - step 3. Separate because
   it changes a component an **existing** screen renders, so it is revertable on its own, and
   it is the one visual-regression risk in this ticket.
3. `feat(frontend): add Setup step 2 with starter category chips (PET-10)` - steps 1, 2 and 4
   to 8. One feature, one working tree.
4. `docs: record Setup step 2 and the starter category list (PET-10)` - step 9, last, because
   `docs:check` requires every backticked rooted path to resolve.

Read `git branch --show-current` immediately before each commit, and read the `[branch sha]`
line back.

## Verification

From `frontend/`: `npm test`, `npm run lint`, `npm run build` (the typecheck gate, and what
exercises the `satisfies`, the `AssertNever` alias and `STEP_WIDTH`'s exhaustive record), then
`npm run build-storybook`. From the root: `npm run docs:check`. `npm run api:sync` is
deliberately **not** run: no request or response shape changes, and importing a generated type
is not editing one.

`npm run storybook`, and eyeball what jsdom cannot see: the card against node `43:705` at
600px, the chips wrapping 3 / 3 / 4, the 11px dots against the eight colours with blue and
orange repeating, the checkmark's round caps, the wash and border on a selected chip, the focus
ring not clipped by the card, and **that `Screens/02 Setup` is unchanged** after the width
refactor.

Then `npm run dev`, with **no backend running**, since nothing here fetches: `/` then Get
started; type a budget and Continue now reaches step 2 rather than a 404; every chip toggles
both ways; Back returns to step 1 with the currency and budget intact; forward again and the
chips are as they were left; deselect everything and Continue still navigates, to a 404 at
`/setup/register`, which is expected until PET-11; devtools shows one session storage key
holding all three fields with `categories` in canonical order however they were clicked; a
**new tab** at `/setup/categories` is empty, as designed; and keyboard only, tab reaches all
ten chips with both Space and Enter toggling.

## Known risks and accepted trade-offs

**AC3 cannot be literally satisfied.** "The Register screen opens" is a 404 until PET-11. The
href is the contract, which is the precedent PET-8 set and PET-9 repeated.

**A first visit does not match the mock.** The frame shows seven chips selected and by decision
none are. This is the one place the screen deliberately differs from frame 03, and it owes a
designer answer.

**The 3 / 3 / 4 rows are not guaranteed.** They come from wrapping, and the designed last row
ends 7px short of the content box, so a browser whose text metrics run wider than Figma's wraps
differently. AC1 asks for the designed **order**, which wrapping preserves; a fixed grid would
satisfy the picture and break the copy.

**The starter list now lives in two files.** The generated union catches a renamed or added
name at build time, but nothing catches a **colour** drifting, because the backend publishes
names only. A public starter-list endpoint is the answer and needs its own ticket.

**Nothing clears the draft**, still. PET-11 should clear it on a successful register, and Back
must not.
