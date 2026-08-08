# PET-37: Build the Add category modal with color and icon selects

Jira: [PET-37](https://decode.atlassian.net/browse/PET-37) · Figma:
[19 Add category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-878)

**Stacked on `feat/PET-36-categories-tab`, which is PR #67 and not yet merged.** This ticket
replaces the inert "Add category" button that branch shipped and edits four of its files, so it
cannot be cut from `main`. The PR targets that branch and GitHub retargets it when #67 lands.

## Why

`/transactions/categories` shipped in PET-36 with its header's "Add category" button deliberately
inert - a real `<button aria-disabled>` announcing it is not available yet - and
`CategoriesScreen.tsx` names PET-37 as the ticket that replaces it. This is the first write on the
Categories tab and the app's first create beyond transactions.

Everything the write needs already exists server-side. `POST /api/categories` and
`GET /api/templates/palette` both landed with PET-64, and `frontend/src/types/api.d.ts` already
carries their types. **No request or response body is touched, so `npm run api:sync` does not apply
to this ticket** - worth saying out loud, because root `CLAUDE.md` makes it mandatory after any DTO
change and its absence here should read as deliberate rather than forgotten.

## What PET-64 already settled, and what the ticket does not know

`CreateCategoryDto` takes exactly five fields and `forbidNonWhitelisted` rejects a sixth: `name`
(required, max 60), `color` (required, one of 17 tokens), `monthlyCap` (**optional**, greater than
zero, max two decimals, at most 1,000,000,000), `icon` (required as of PET-64, one of **64** lucide
names as of PET-65) and `note` (optional, max 500). `isFallback` is hard-coded false in the service
and is never settable.

The two option lists come from `GET /api/templates/palette`, which is admin-managed data filtered to
`enabled` and ordered by `sort_order`, carrying the label to show for each. That list is deliberately
allowed to be a strict subset of what the API validates: `@IsIn` checks the code-side allowlist and
never the flag, so a category holding a since-disabled colour keeps rendering. As seeded it offers
**16 colours** - all 17 minus `error-content`, which ships disabled because it measures 1.009:1
against the dark card - and all **64 icons**.

Three statements in the ticket predate that work and need amending on the issue:

- **AC2's "the eight category color tokens" is stale.** There are 17 in the allowlist and 16
  offered.
- **The context paragraph's required budget contradicts the DTO**, which rejected that rule on the
  argument its docstring records: every onboarding chip and the seeded `Uncategorized` are uncapped,
  so forcing a cap would make uncapped a state the API could never produce again.
- **A40's open question about the icon set is answered, twice over.** "Repeat" is a real lucide name
  (the installed `lucide-react` 1.29.0 ships 2011 of them) but is not among this app's 64, because
  `lucide-react` resolves by static import and `CATEGORY_ICON` is what makes
  `Record<IconName, LucideIcon>` an exhaustiveness proof. PET-65 then chose the 64 by spending domain
  and signed them off in `docs/explainers/category-icon-set-preview.html`, so nothing here needs
  confirming with the designer.

A fourth is not an amendment but a gap: **AC5's "Settings categories line" is not buildable**,
because that `<main>` is still empty. The tab badge and allocation summary halves are covered by the
refresh. AC6 needs no work at all, since `useCategoryOptions` re-reads on every open of the Add
transaction modal.

## Decisions

**The budget is optional, and a typed `0` or negative is an error.** Blank means "no limit". This
follows the DTO rather than the ticket, and it keeps PET-36's already-built uncapped card reachable:
`CategoryCard` draws "No limit set for this category" with a "Set limit" banner, which under a
required cap would be producible only by onboarding and by PET-38. AC3 narrows accordingly - it is
about a typed zero, not an empty field. The single predicate `isCapValid`, where `''` is valid, is
where this lives.

**The icon shortage this plan was going to defer is already fixed, by PET-65 in `main`.** The first
draft of this plan decided to ship against 13 icons and log the shortage, on the reasoning that a
full onboarding pick consumes all 13 (the 12 templates plus `circle-question-mark` on the fallback),
so the first custom category is *forced* to reuse a glyph. That was true and is now moot: PET-65
merged as `ce40f4f` and took the set to **64**, chosen by spending domain. Nothing in this ticket
changes as a result, because every list here is driven by whatever `GET /api/templates/palette`
answers rather than by a count written down in the frontend - which is the property worth preserving
and the reason no test asserts a length.

Two consequences that are not moot. **A local central database seeded before PET-65 still holds 13**,
because `seedTemplates` guards on "any `category_templates` row exists" and returns early by design;
PET-65's Decision 4 records that the fix is deleting the local central database so it re-seeds, and
production needs nothing because these tables have never been deployed. And **the colour ceiling is
untouched**: 17 tokens, 16 offered, because Tailwind cannot build a class from runtime data, so
colour collisions past the thirteenth category remain possible where icon collisions no longer are.

**The Color field became a control of our own after this plan was approved, and the paragraph below is
now half history.** The request was the list in the reference image: a swatch left of each name and the
tick on the right of the chosen row. Neither half is reachable from a native `<option>` - it cannot
hold markup, and the tick is drawn by the operating system - so `ColourSelect` is a `<button>` trigger
plus a `[popover]` list, built on `TransactionRowMenu`'s platform-popover argument and `DateField`'s
select-styled trigger, with `categoryDotClass()` supplying the swatch it already had for legend dots.
**The Icon field is still `ui/Select`**, because 64 options want a grid rather than a list, which keeps
the paragraph below true of that half. The costs - no arrow keys, no native mobile picker, no anchoring
in Firefox, and an invented panel - are in `docs/TODO.md`.

**The picker stays two native selects, and PET-65's 8x8 grid remark is deliberately not adopted
here.** That plan observes 64 grids as 8x8 and notes PET-37's picker has no design behind it, which
is a fair reading of the frame. But AC1 asks in as many words for "the two selects side by side", so
a grid would fail the criterion this ticket is measured against, and `ui/Select` already exists while
a grid does not. 64 options in a native select is a scrollable platform list with type-ahead, and the
preview tile is what shows the chosen glyph rather than its name. A grid is a reasonable follow-up
against an amended AC, not a silent substitution inside this one.

**Duplicate colours and icons are allowed silently.** The only unique index on `categories` is the
partial `categories_fallback_idx`; there is none on name, colour or icon, and the palette endpoint
reads central only and so cannot know what the caller already uses. Nothing is unidentifiable
meanwhile: every surface draws the name beside the tile, and the donut's existing seam already handles
same-coloured neighbours.

**PET-65 does change what the alternative would cost, and the decision is kept anyway.** Greying out
what is in use was incoherent against 13 icons, because every option would have rendered disabled on
a required field; against 64 it is perfectly buildable. It is declined here as scope rather than as
impossible, which is a weaker reason than the one this paragraph originally carried and is worth
saying plainly. The colour half would still be awkward, since 16 offered against a growing category
list runs out where the icons no longer do.

**The palette is read server-side and passed as a prop**, as a third read in the existing
`Promise.all` in `transactions/categories/page.tsx`. Not `AddTransactionProvider`'s route-handler and
fetch-on-open shape: that exists because ADD-1 lists five triggers across three routes, and this is
one button on one route which already awaits two reads in parallel, so the extra read costs no
latency and saves a route handler, a hook and three loading states. PET-38's Edit category modal is
on the same screen and reuses the same prop. The cost is that the palette is fetched on every
Categories page view whether or not the modal opens; `docs/TODO.md` records it.

**No provider, and the button owns the modal.** `AddTransactionProvider`'s one-instance-per-shell
rule exists because two of its triggers are on the same page, which would mount two dialogs with
duplicate field ids - `ui/FieldShell` requires `id` as a literal prop precisely because `useId` would
force `'use client'` onto the field layer. One trigger means a context with a single consumer, which
expresses no choice.

**Both selects preselect the palette's first entry** rather than opening on a `Select…` placeholder.
The frame draws a value in each and the DTO requires both, so a placeholder would add two forced
interactions and two error messages the design does not draw.

**AC2's preview is a tile plus the typed name**, below the two selects, `aria-hidden` because every
piece of information in it is already in the three fields above. The frame draws no such element, so
this is the cheapest thing that makes the criterion true rather than a reading of the design.

**The Note field is captured in code and not drawn, added after the plan was approved.** Frame 19
draws it and CED-4 specifies it, and it is hidden behind a `SHOWS_NOTE` flag in `AddCategoryModal`
because A42 - restated by `CreateCategoryDto` - says a note **surfaces on no screen once saved**.
A field whose value nothing ever shows back asks the user to write into a void, so it waits for a
category detail page of the kind `/transactions/[id]` already is for a transaction.

Three things about how it is hidden. It is **a flag rather than commented-out JSX**, so the markup
stays typechecked and cannot rot while hidden - a commented block would survive a rename of
`CategoryFormValues.note` with the build green and break for whoever restored it. **Nothing behind
the field was removed**: `categoryForm.ts` still trims and omits `note`, its suite still pins that,
and `CreateCategoryDto.note` and the `categories.note` column are untouched, so no migration is owed
in either direction. And **re-enabling it costs one word plus four assertions**, which
`AddCategoryModal.test.tsx` fails on deliberately rather than leaving the cost to be discovered.

One knock-on: with the Note gone, the budget is the **only** label carrying "(optional)", so it now
carries A12's whole signal by itself. `docs/TODO.md` records the product question this defers.

## Deviations from the frame

Both are visible and both belong in the PR body.

- **The budget field reads "Monthly budget (optional)"**, where node 102:878 draws it bare. Forced by
  the optional cap plus A12, this app's rule that required fields are marked only by the absence of
  "(optional)". Leaving it bare would make the one optional money field in the app look required.
- **Focus opens on Name, not on the budget field the frame rings.** That frame also draws
  `Subscriptions`, `250.00` and a note already typed, so it is a mid-fill snapshot rather than an
  on-open state. `AddTransactionModal` honours its frame's focused field because there it is also
  the first; here honouring it would skip an empty required field.

## Tasks

- [x] Amend the PET-37 Jira description: AC2's colour count, AC3's blank budget, A40's answered icon
      question, and AC5's unbuildable Settings clause
- [x] Add `frontend/src/lib/palette.ts` - `readPalette()` over `authorizedGet`, types read off the
      contract, failure policy left to the caller. A new module rather than an addition to
      `lib/categoryTemplates.ts`, mirroring the backend controller's own public-versus-authed split
- [x] Add `frontend/src/lib/createCategory.ts` - a `'use server'` action shaped like
      `lib/createTransaction.ts`, with **three** failure arms rather than four: the endpoint
      documents 400 and 401 only, with no 404 and no 409
- [x] Add `transactions/categories/categoryForm.ts` and its jsdom-free suite - `CategoryFormValues`,
      `isNameValid`, `isCapValid` (where `''` is valid), `invalidFields` returning both failures at
      once, and `toCreateCategoryBody` omitting `monthlyCap` and `note` entirely when blank
- [x] Build `AddCategoryModal` - four of the five fields in the frame's order (see the Note decision
      below), the two selects side by side,
      the preview tile, a local `MESSAGES` per A29, and the palette-unavailable state
- [x] Build `AddCategoryButton` - a client component owning its own open state
- [x] Wire `transactions/categories/page.tsx` and `CategoriesScreen`, and invert PET-36's two
      now-false assertions in `CategoriesScreen.test.tsx` and `CategoriesScreen.stories.tsx`
- [x] Tests and stories for the modal: one case per acceptance criterion, plus a `WithMessages` story
      under `Screens/19 Add category` for the A29 sign-off - not `Shell`, which is where the empty
      `Modal` box is reviewed
- [x] Record what this leaves owed in `docs/TODO.md`: the palette read on every Categories page view
      whether or not the modal opens, the two deviations from the frame, grey-out-when-in-use declined
      as scope now that PET-65 makes it buildable, and the colour ceiling of 16 that PET-65 did not
      move
- [x] Update `frontend/src/app/CLAUDE.md` with the decisions above
- [x] Verify

## Verification

From `frontend/`: `npm run lint`, `npm run build` (which is the typecheck), `npx tsc --noEmit` for
the suites the build does not read, `npm test`, then `npm run storybook` and diff the new stories
against node 102:878.

Then the real browser walk, which is the only place Escape and the focus trap are observable, since
jsdom implements neither and `jest.setup.ts` deliberately does not fake them:

1. Sign in and go to `/transactions/categories`. Click "Add category": the modal opens over the
   dimmed page with four of the frame's five fields in order (no Note), the two selects side by side,
   and focus on
   Name (AC1).
2. The Colour select lists 16 labels in server order and Icon lists 64, and changing either updates
   the preview tile (AC2). **Delete the local central database first if it was seeded before PET-65**,
   or the palette answers the old 13 and this step reads as a bug in the modal.
3. Submit empty: **one** inline message, on Name, and nothing is created. **Not two, and the
   difference is the optional cap** - a blank budget is valid, so an untouched form is wrong about
   its name alone. Type `0` into the budget and submit to see both at once; a negative gives the
   same budget message (AC3).
4. Save with a name and a blank budget: the card appears uncapped, drawing "No limit set for this
   category" with its "Set limit" banner (AC4, and the optional-cap decision).
5. The Categories tab badge ticks up and the allocation summary moves (AC5, the two buildable
   halves).
6. The new category appears in the Add transaction modal's select (AC6).
7. Cancel, the X, a backdrop click and Escape each close without creating, and focus returns to the
   "Add category" button (AC7).

## Out of scope

PET-38's Edit category modal, an icon grid in place of the select, greying out colours and icons
already in use, any server-side uniqueness on name, colour or icon, raising the 16-colour ceiling,
and AC5's Settings categories line. Growing the icon set is not listed because PET-65 already did it.
