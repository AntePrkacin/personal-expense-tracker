# PET-70: Build the Allocate budget modal with bulk cap saving

Jira: [PET-70](https://decode.atlassian.net/browse/PET-70) · Epic:
[PET-5 Category budgets](https://decode.atlassian.net/browse/PET-5) · Design: the Expensa design
system's `ui_kits/expensa-app/AllocateModal.jsx`, wired from its `CategoriesTab.jsx`. **No Figma
frame exists for this modal** - see What the design does not settle, below.

**Stacked on `feat/PET-38-edit-category-modal` (PR #77), which is itself stacked on
`feat/PET-39-category-row-menu` (#74), `feat/PET-37-add-category-modal` (#68) and
`feat/PET-36-categories-tab` (#67), none of them merged.** Every frontend file this ticket edits was
created by one of those four branches, so it cannot be cut from `main`; the PR targets
`feat/PET-38-edit-category-modal` and GitHub retargets it as each parent lands. The four are GitHub
stack 69, size 4, so this becomes position 5.

## Why

The Categories tab's summary card already tells the user that part of their monthly budget is
unassigned, and offers an "Allocate" action beside that sentence. That action has been inert since
PET-36, because no frame drew where it goes: `CardBanner` receives no `onAction` and ships the
control with `aria-disabled`. PET-38 made the other two of the three inert controls live, and
`frontend/CLAUDE.md` records "Allocate" as the one that stays. It is the last inert control on the
screen and the last unbuilt piece of this epic.

This ticket makes it real, and it is the app's **eighth** authenticated write, its **first bulk
write**, and the **first array-body request** anywhere in the contract. It is also the first use of
the conditional-single-statement shape `docs/TODO.md` has been prescribing since PET-30.

**A request body is added, so `npm run api:sync` from the repo root is mandatory** and both
`backend/openapi.json` and `frontend/src/types/api.d.ts` are committed. That is said out loud
because the PET-38 and PET-39 plans both recorded its *absence* deliberately, and the opposite holds
here.

## What the design does not settle, and what this does about it

| #   | The source shows                                | What is true                                                                                     | Disposition                                              |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | Caps snap down so they never exceed the budget   | The API accepts any cap and returns `unallocated` unclamped, documented as negative-capable (A43) | Kept as drawn, **frontend only**. See Decisions.          |
| 2   | An "Other" row in the category list              | This repo's fallback is `Uncategorized`, and its card already draws no kebab and no banner        | **Excluded from the rows**, extending an existing limit   |
| 3   | Eight capped categories, all with caps           | A cap is optional and the fallback ships without one                                             | Blank field, `No limit` placeholder, clearing sends null  |
| 4   | Figures from a fixture                          | Every figure must come from `GET /api/categories`                                                 | Ledger derived from the contract, never from the rows     |
| 5   | Inline `var(--token)` styles, a private bundle    | daisyUI semantic classes only, per `frontend/CLAUDE.md`                                          | Rebuilt on daisyUI; structure and content follow the source |
| 6   | "Your monthly budget is set in Settings."        | The Settings `<main>` is still empty                                                             | Kept, true but unactionable; noted in `docs/TODO.md`      |

All fourteen acceptance criteria are met in full; none is amended. Row 1 is worth arguing rather
than merely recording, and it is argued below.

## Decisions

**The atomic write is one self-guarding statement, not a transaction and not a loop.**
`categories.service.ts` forbids `db.transaction()` on a user database at the top of the file,
because the embedded Turso driver refuses overlapping transactions rather than queueing them, so a
second transactional call site turns a rare correctness bug into a common availability one.
`docs/TODO.md` names the sanctioned alternative, a conditional single statement, and this is its
first use. The shape is an `UPDATE ... SET monthly_cap_cents = CASE id WHEN ? THEN ? ... END` whose
`WHERE` carries the live filter, the id set, **and** a `(SELECT count(*) ...) = n` subquery, with
`RETURNING id`. That subquery is the whole all-or-nothing story: the database refuses the statement
unless every id is live at the instant it runs, so there is no window between a check and a write
for a concurrent delete to land in. `LoginTokenService.consume()` is the existing instance of the
same shape, with a diagnostic `SELECT` on the miss path only. Verified against the real engine:
`$onUpdateFn` still bumps `updated_at` when `set()` carries a raw `sql` expression, `.returning()`
works on an update, and 36,000 bound parameters execute without complaint, so `@ArrayMaxSize` is a
request-size ceiling rather than a driver limit.

**The CASE arms and the `IN` list are generated from one array, and that is load-bearing rather
than tidy.** Verified by execution: a row matched by the `WHERE` with no CASE arm of its own falls
off the end of the CASE and is set to **NULL**. Assembling the two halves from two sources - arms
from the payload, ids from a prior read - would wipe caps the caller never mentioned and answer 200
while doing it. It gets a comment at the call site and a spec test that derives both halves from the
rendered parameters, so a future refactor cannot separate them quietly.

**A missing id is a 404 with nothing written.** The three obvious alternatives all fail. Writing
first and 404-ing on a short `RETURNING` half-applies, measured at three of five rows. Reading the
live ids, validating, then writing leaves a race whose outcome is a partial application with a 200,
which is the one result the ticket forbids. Silently dropping unknown ids means the confirmation the
user sees describes an allocation the server does not hold, and the only clue would be in a response
body the frontend discards. The message names the missing ids and states that no cap changed, which
is how a client learns the identical payload is safe to retry.

**The over-budget ceiling is a frontend rule, and the endpoint deliberately has no 409.**
`GET /api/categories` documents `allocation.unallocated` as returnable negative (A43), the dashboard
relies on that, and PET-38's Edit category modal carries a test asserting that form "must not invent
a ceiling". A server-side ceiling would retroactively break that modal and leave the two endpoints
disagreeing about what a legal cap is. So the two screens are deliberately asymmetric: a cap can be
pushed over the budget through the card kebab but not through Allocate, because Allocate's whole job
is dividing a fixed pot. An e2e test pins the absence, asserting that caps summing above the budget
succeed and `unallocated` comes back negative.

**Money is computed in integer cents, converted in exactly one place.** Floats drift both ways:
`budget - sum(others)` yields `349.99999999`, and `4.02 * 100` is `401.99999999999994`, so
`Math.round` rather than `Math.trunc`, mirroring `backend/src/common/money.ts`. The fallback is
excluded from the rows but its cap **is** counted in `allocation.allocated`, so the reserved amount
is derived rather than assumed: `reservedCents = allocatedCents - sum(original visible cap cents)`.
That is exact, because dividing a safe integer by 100 is exact to the nearest double, so
`centsOf(fromCents(x)) === x` for every figure the contract can carry. It is also the form that
survives the row filter widening later, which a fallback-specific constant would not.

**Each field's ceiling is written as "the budget less everything that is not this field".** Not as
"the remainder plus this field's own cap", even though the two are equal, because the displayed
remainder is clamped at zero and that clamp must never be able to leak into a ceiling by a later
refactor.

**Opening the modal provably never lowers a cap, and the proof is the reason the invariant is
testable.** On mount each ceiling equals `unallocated + that field's own cap`, and the banner renders
only when `unallocated > 0`, so every ceiling is strictly above its own field. While editing, the
snap is the only writer of a cap and it maintains `assigned <= budget`, so it can only ever clamp
the field being typed into, never retroactively lower one the user is not touching. Both halves get
a test, because a clamp applied on mount rather than on change would break this invisibly.

**The snap fires on keystroke, not on blur, and blur-snapping would be a correctness bug rather
than a worse feel.** `Modal` wraps its children in a real `<form>` so Enter submits, and pressing
Enter does not blur the focused input - so with a blur-snap, typing `4000` into a field whose
ceiling is `349.99` and hitting Enter submits `4000`. The interaction with `reformatAmountInput`'s
caret restore is real but benign: on the snapping keystroke the handler writes the snapped value and
collapses the caret to the end explicitly, because the string the user was editing no longer exists
and every offset within it is meaningless. Leaving that collapse to React's commit would be
browser-dependent. The snap is idempotent, so a further digit typed onto a snapped value is
truncated by `formatAmountInput` and announces nothing a second time.

**The transient footer message reverts through an effect keyed on a fresh object, not a ref and a
manual `clearTimeout`.** Cleanup is then unconditional and co-located, so an unmount leak is
structurally impossible rather than remembered, and the restart-on-retrigger is obtained rather than
coded. Storing an object rather than a bare number is what makes the identity change when the same
ceiling is hit twice. The unmount leak is deliberately **not** given a test: React 19 does not warn
on setState after unmount, so a test asserting no console error would pass with the cleanup deleted.

**The message mixes precision on purpose.** The capped amount uses `formatCurrency`, because it
quotes the value the field now holds and a ceiling routinely carries cents - `formatWhole` would
print `$350` two centimetres from a field reading `349.99`, which is exactly the class of
contradiction `SpendingSummaryCard`'s round-once rule exists to prevent. The budget uses
`formatWhole`, because it must match the summary card behind the modal. The separator character
follows the design file.

**The message is a `<p role="status">` mounted only when present; the ledger figures are in no live
region at all.** "Left to assign" changes on every keystroke and is not new information, so a
polite region over it would be a torrent. The snap is worth announcing because the value the user
typed was overridden. `role="status"` rather than `role="alert"`, per the line `FormError.tsx`
draws. Mounting on demand rather than keeping an empty region also keeps the 3.4s revert silent, and
keeps a closed form contributing no text, which `(app)/pages.test.tsx` depends on.

**The segmented bar is a div, `aria-hidden`, and does not use `barPercent`.** A `<progress>`
publishes `role="progressbar"` whatever you do, and a stacked bar has no single value;
`transactions/[id]/CategoryContextCard.tsx` is the div precedent, with inline `style` width as the
accepted escape from the complete-literal class rule. Each segment takes `categoryDotClass(color)`,
which yields `bg-*` alone from a complete-literal `Record` - no `text-*-content`, because there is
no content, and no radius, because `overflow-hidden rounded-full` on the track gives the bar its
ends. The reserved cap gets a leading neutral segment through the same accessor, so the bar cannot
contradict "left to assign" when the fallback carries a cap, and the unassigned remainder is the
exposed track rather than a node. `barPercent` is not reused: flooring is right for one bar that
must not contradict a chip beside it, and wrong for N segments, where it loses up to N-1 percent
into a phantom gap and takes a genuinely small segment to exactly zero. Sub-pixel segments are
accepted rather than floored at `min-w-px`, because a minimum width pushes the widths past 100% and
flex then shrinks the *large* segments proportionally, so the bar would stop being accurate
everywhere in order to make one invisible segment visible. A story carries the case so a designer
can overrule it.

**The list is bounded; `modal-box` is not touched.** It already carries `max-height: 100vh` and
`overflow-y: auto`. A genuinely sticky summary and footer would mean turning it into a bounded flex
column, dragging all six of the app's modals through a layout change, and adding classes next to the
mandatory `translate-none scale-none` - the last string in this codebase anybody should edit
casually. A `max-height` plus `overscroll-contain` on the list needs nothing from its ancestors, and
`overflow` creates no containing block for `position: fixed`, so the DateField hazard cannot arise.
`Modal` does gain a width seam, because daisyUI fixes `modal-box` at `32rem` and the source draws
620px; per the fixed-1440px carve-out a designed width becomes a `max-w-*` ceiling, added as a
complete-literal `Record`.

**`CardBanner`'s inert branch is removed in this ticket.** After it, both call sites pass
`onAction`, so `aria-disabled` and its Tailwind variants have no reachable caller.
`CardBannerProps` becomes a discriminated union so an inert action is unrepresentable, the technique
`ModalShape` and `ui/Button` already use. Safe: no test asserts `aria-disabled` on Allocate, and
`CategoryCard.test.tsx`'s assertion of its *absence* on Set limit still passes. This makes the
Categories tab the first screen in the app with no inert control.

**No insights regeneration.** `PATCH /api/categories/:id` changes caps today and regenerates
nothing, so emitting only here would make one user action behave differently depending on which
modal performed it, which is not a rule anybody could learn. Reusing `TRANSACTION_CHANGED` would
also lie in its own payload. The clean version is a single `CATEGORY_CHANGED` event from all four
category writes with a listener in `InsightsModule`, and it belongs with the debounce work
`docs/TODO.md` already holds.

**Sequencing is forced, not preferred.** `allocateForm.ts` and `lib/updateCategoryCaps.ts`
reference a generated schema that does not exist until the backend lands and `api:types` runs, and
`docs/agents/api-contract.md` forbids restating a contract locally. So: backend, then
`npm run api:sync`, then frontend. Note `npm run build` does not typecheck `*.test.tsx`, so
`npx tsc --noEmit` is the gate that catches a suite written against a stale contract shape.

## Known limitation, recorded rather than fixed

**The ceiling is enforced only within one open modal.** It reads its figures once on open and does
not resync, so a change to the monthly budget or to another cap made elsewhere while the modal sits
open leaves the ledger stale, and the saved caps can sum above the current budget. There is no error
to raise, because that result is a valid server state by A43 and the summary card behind the modal
renders it. Closing the hole properly would need the server-side ceiling this plan rejects above.
Recorded in `docs/TODO.md`.

## Tasks

- [ ] Cut `feat/PET-70-allocate-budget-modal` from the tip of `feat/PET-38-edit-category-modal`,
      commit this plan alone (`docs:`, no scope), push with `-u`, and open a **draft** PR with
      `--base feat/PET-38-edit-category-modal --assignee @me` and this checklist in the body. Then
      `gh stack link 69 feat/PET-70-allocate-budget-modal` to join the GitHub stack. The untracked
      route is deliberate: `gh stack view` currently reports this branch is not part of a stack
      because layer-3 local tracking is absent, adopting with `gh stack checkout 69` risks the
      divergence prompt, and `gh stack submit --auto` cannot set a PR body.
- [ ] `backend/src/categories/dto/update-category-caps.dto.ts` - `CategoryCapDto` and
      `UpdateCategoryCapsDto`. A wrapper object, not a bare array: `ValidationPipe` skips a body
      whose reflected metatype is `Array`, so a bare array arrives with no uuid check and no cap
      bound, and SQLite's INTEGER affinity would then store a string cap as TEXT. Needs
      `@ValidateNested({ each: true })` **and** `@Type(() => CategoryCapDto)` together, plus
      `@ArrayNotEmpty`, `@ArrayMaxSize`, `@ArrayUnique(item => item.id)`, and `minItems`/`maxItems`
      spelled into `@ApiProperty` because the plugin publishes neither. `monthlyCap` is
      required-and-nullable via `@ValidateIf`, not optional via `@IsOptional`: this endpoint has no
      leave-alone case.
- [ ] `backend/src/categories/categories.service.ts` - `setCaps()` as the single self-guarding
      statement, `missingIds()` on the miss path only, and the new message constants. Amend the class
      docblock: there are now two sanctioned no-transaction shapes, ordered statements and the
      conditional single statement, and that paragraph is where the next person adding a multi-row
      write will look.
- [ ] `backend/src/categories/categories.controller.ts` - a bare `@Patch()` below `@Get()`, with
      `@ApiOkResponse({ type: CategoriesResponseDto })` and `@ApiErrorResponse(400, 401, 404)`. No
      409 on this route, and no literal sub-path: `@Patch('caps')` would match `@Patch(':id')` and
      would add a `spec.paths` key the OpenAPI suite asserts against.
- [ ] `backend/src/categories/categories.service.spec.ts` - `describe('setCaps')`. One `db.update`
      call for N entries; one CASE arm per entry; caps bound in **cents**; `null` binding SQL NULL
      rather than `0`; `set` keys exactly `['monthlyCapCents']`; the `WHERE` rendering both the
      tombstone filter and the count guard; **the arms and the id set covering the same ids, derived
      from the rendered parameters** as the NULL-wipe guard; zero rows meaning 404 with `list()`
      never reached; the 404 naming only the missing ids; the diagnostic `SELECT` running on the miss
      path alone. The mock `db` gains no `transaction` key, and that absence is itself the regression
      test for the no-transaction rule.
- [ ] `backend/test/categories.e2e-spec.ts` - `describe('PATCH /api/categories')`. The atomicity
      cases are the point and no mock can show them: an unknown id, a tombstoned id and another
      account's id each answer 404 with **every other row read back unchanged**. Plus mixed values
      and nulls in one request; integer cents on the row; a cap on the `Uncategorized` fallback
      succeeding, pinning that no 409 leaked onto this route; caps summing above the budget
      succeeding with `unallocated` negative; `updated_at` moved on touched rows only; a cap
      identical to the stored value still a 200; and the 400 table, including an omitted `monthlyCap`
      and a bare array body.
- [ ] `backend/test/openapi.e2e-spec.ts` - add the operation-set assertion for `/api/categories`,
      which does not exist today, so a sixth operation cannot appear unnoticed. Statuses with every
      4xx on the shared error ref and **no 409**, plus the request-body refs. Read the regenerated
      `openapi.json` before asserting `minItems`/`maxItems` rather than assuming the plugin emitted
      them.
- [ ] `npm run api:sync` from the repo root; commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts`.
- [ ] `frontend/src/lib/updateCategoryCaps.ts` - `'use server'`, one fixed route and no path
      interpolation. Reasons `invalid | missing | unauthenticated | failed`. The 200 body is
      discarded deliberately, per the rule `createCategory.ts` records: nothing below a 2xx may turn
      a saved write into a reported failure.
- [ ] `frontend/src/app/(app)/transactions/categories/allocateForm.ts` - pure, jsdom-free, its own
      suite. `allocatableCategories`, `toAllocateLedger`, `toAllocateDraft`, `capCents`,
      `assignedCents`, `unassignedCents`, `ceilingCents`, `applyCap`, `invalidRows`, `isDirty`,
      `toAllocateBody`. Reuse `isCapValid` from `categoryForm.ts` and the amount trio from
      `lib/format.ts` rather than restating either. `isDirty` is derived from `toAllocateBody`, never
      a second comparison. Only changed rows reach the wire, and the diff is compared in cents so
      `250` and `250.00` are not a change.
- [ ] `frontend/src/app/(app)/transactions/categories/AllocationBar.tsx` - the segmented bar.
- [ ] `frontend/src/app/(app)/transactions/categories/AllocateBudgetModal.tsx` - the form over
      `(app)/Modal.tsx`. Rows use `ui/Input` with `variant="currency"` and the shared
      `reformatAmountInput`. The category tile is the inlined six-place idiom with `createElement`,
      **not** `<Icon />`, because `react-hooks/static-components` flags a capitalised local in JSX
      and this repo permits no eslint-disable. Success is `router.refresh()` then
      `modalRef.current?.close()`, in that order, so the browser hands focus back to the trigger;
      `missing` refreshes while staying open; the `try/catch` around the action is mandatory, or a
      transport that never completes leaves `pending` true forever and kills Enter with it.
- [ ] `frontend/src/app/(app)/transactions/categories/AllocateBanner.tsx` - the `'use client'`
      wrapper holding `useState`, mirroring `SetLimitBanner.tsx`. One trigger on one route, so no
      provider, which is `AddCategoryButton`'s documented criterion. No test file of its own,
      following `SetLimitBanner`.
- [ ] `frontend/src/app/(app)/Modal.tsx` - the width seam as a complete-literal `Record`, preserving
      `translate-none scale-none` on every arm.
- [ ] `frontend/src/app/(app)/transactions/categories/SpendingSummaryCard.tsx` - take `categories`
      and the `save` seam, swap the inert `CardBanner` block for `AllocateBanner`, and delete the
      file-header sentence claiming its one control is inert. The banner cannot be hoisted into the
      screen: the overlap effect needs it to be a sibling of `BannerCardBody` inside this file's own
      `<section>`.
- [ ] `frontend/src/app/(app)/transactions/categories/CategoriesScreen.tsx` - thread `categories` and
      the `save` seam down. `page.tsx` needs no change; it already passes the categories through.
- [ ] `frontend/src/app/(app)/transactions/categories/CardBanner.tsx` - discriminated union, removing
      the now-unreachable inert branch and its comment.
- [ ] Tests and stories: `allocateForm.test.ts`, `AllocateBudgetModal.test.tsx` with describes named
      by acceptance criterion, `updateCategoryCaps.test.ts`, and a `describe('the allocate seam')` in
      `CategoriesScreen.test.tsx` beside the existing edit and create seams. Stories: `Default`,
      `NearlyFullyAllocated`, `WithReservedFallbackCap`, `TinySegments`, `ManyCategories`,
      `WithMessages`. Default the new `save` seam inside `CategoriesScreen.stories.tsx`'s `Frame`
      rather than per story, because that file records the seam-unreachable defect happening twice.
      Register the new stories module in `screens.stories.test.tsx` - and while there, register
      `EditCategoryModal.stories` and `DeleteCategoryDialog.stories`, **neither of which is in
      `MODULES` today**, so Storybook builds them without ever running them. Reuse
      `categoryFixture.ts` unchanged.
- [ ] Docs. `backend/CLAUDE.md` Category endpoints: the bulk route's shape and its traps, and name
      the second no-transaction shape in the existing delete bullet. Flag while in there that the
      file is past the 400-line sizing trigger and name `backend/src/categories/CLAUDE.md` as the
      next promotion candidate, which `docs/agents/conventions.md` asks for in advance.
      `docs/agents/api-contract.md`: the first array-body request and first bulk write, the
      `Array`-metatype trap that generalises to every future one, a 404 naming the whole payload, and
      the discarded 200 body. `frontend/CLAUDE.md`: retire the "Allocate is the one that stays inert"
      clause, but **keep** the `Uncategorized` cannot-be-capped clause, which this ticket extends
      rather than resolves. `frontend/src/app/CLAUDE.md`: retire the "Set limit is live and Allocate
      is not" paragraph and the restatement above it; `SetLimitBanner`'s smallest-wrapper rule now
      has a second instance. Root `CLAUDE.md`: retire the sentence claiming all three controls are
      PET-38's, already stale by two on this branch, and add PET-70 as the twelfth entry.
      `docs/TODO.md`: the stale-ledger limitation, insight staleness on a cap change, the modal's new
      invented strings joining the A29 group, the mixed-precision copy decision, sub-pixel segments
      and the rejected `min-w-px`, and an annotation on the conditional-single-statement entry, which
      asked for an error-semantics decision that this ticket now makes.
- [ ] Gates: from `backend/`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`; from
      `frontend/`, `npm run lint`, `npm test`, `npm run build`, `npx tsc --noEmit`,
      `npm run build-storybook`; from the repo root, `npm run docs:check`.
- [ ] The browser walk below, then Jira: no AC amendments, but record the stale-ledger limitation and
      the `CardBanner` cleanup on the ticket.

## Verification

The suites reach none of the following, so each is a real check in a real browser. `jest.setup.ts`
polyfills only `showModal` and `close`, and deliberately fakes neither Escape, the focus trap, nor
the Popover API.

1. **Open and ledger.** With budget unassigned, the Allocate banner is a live control and opens the
   modal. "Left to assign", "Assigned to categories" and the bar all agree with the cards behind it,
   and no field's value changed on open.
2. **The snap.** Type past the remainder: the field lands on the remainder, the footer shows the
   capped message with cents, and "Left to assign" reads zero without going negative or turning red.
   The message reverts after roughly 3.4s. Snap a second field inside that window and confirm the
   window restarts rather than expiring early.
3. **Caret.** Type into the middle of a cap field and confirm the caret holds, which is the shared
   `reformatAmountInput` path. On the snapping keystroke it collapses to the end, deterministically.
4. **Clearing.** Blank a cap: that category becomes uncapped, its segment leaves the bar, and every
   other field's ceiling grows by the freed amount.
5. **`Uncategorized`.** It is not a row. Give it a cap through the API first, reopen, and confirm the
   neutral leading segment appears and the remainder is smaller by exactly that cap. This is the
   derived-reserve proof, and it is the one case a fallback-specific constant would also pass.
6. **Save.** Change two caps and save: the modal closes, focus returns to the Allocate banner, and
   the grid, the chips and the summary card all update. Confirm in DevTools that exactly one request
   went out and that it carried only the two changed rows.
7. **Unchanged form.** Open and save with no edits: no request at all, and the modal closes.
8. **Atomicity, end to end.** With the modal open, delete one of its categories in a second tab,
   then save. Expect the stale-list message, the modal staying open, the page refreshing behind it,
   and **no cap changed** on any category.
9. **Every exit.** Escape, the scrim and Cancel all close the modal, and focus returns to the
   trigger in each case.
10. **Scrolling.** With twelve categories the list scrolls internally while the summary and footer
    stay visible, scroll does not chain out to `modal-box`, and tabbing to a row below the fold
    scrolls it into view without clipping its focus ring.
11. **Width.** Confirm in computed style that the Tailwind `max-w-*` actually beats daisyUI's
    `modal-box` `max-width`, rather than assuming the cascade.
12. **`role="status"`.** With a screen reader, confirm the capped message is announced once on snap
    and that the timed revert is silent.
13. **Tiny caps.** The `TinySegments` story: confirm what a $1 cap against a $2,000 budget actually
    renders as, and that the segment widths never sum past 100%, so no large segment is shrunk to
    make a small one visible.
14. **Both themes**, light and dark, and **Firefox** as well as Chrome.
