# PET-23 — Spending-by-category donut with legend

[PET-23](https://decode.atlassian.net/browse/PET-23) — `[FE] Build spending-by-category donut with
legend`. Figma: [04
Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4).

Base branch is `feat/PET-22-weekly-spending-trend`, so this is a stacked branch and its PR targets
that branch rather than `main`. Position 3 of 6 in the Dashboard stack.

## Why

The third slot in PET-21's grid. DSH-8: a donut whose centre shows the period total over the
caption "Total spent", and under it a legend of rows each carrying a coloured dot, the category
name, its amount and its percentage - `Groceries $397 32%`, `Dining out $298 24%`, `Transport $223
18%`, `Shopping $174 14%`, `Other $148 12%` in the mock.

This is the epic's most contract-served ticket and the one with the least arithmetic in it, which
is worth stating up front because it inverts the usual expectation for a chart.

## Decisions

**The donut is an SVG ring, no library.** PET-22 settled that for both charts and the argument is
in its plan; this branch inherits it rather than restating it. The mechanism is one `<circle>` per
slice sharing a centre and a radius, each with a `stroke-dasharray` of its own arc length against
the circumference and a cumulative `stroke-dashoffset`. `transform="rotate(-90)"` starts the first
slice at twelve o'clock, which is where the frame starts it.

**Nothing here computes a percentage.** `DashboardCategoryDto` publishes `percent` alongside
`spent`, documented as "unrounded and relative to `spent` on this response". So AC4's "computed
from real totals and consistent with the amounts beside them" is satisfied by reading the field,
and computing `spent / total` here would be a fourth place in this codebase that divides a month -
which `backend/src/dashboard/dto/dashboard-response.dto.ts` calls out as a bug by the backend's own
money note. The percentages are rounded for **display** only, and the arc lengths use the unrounded
values.

**The ring is built to tolerate not closing, because the backend documents that it sometimes will
not.** The obvious implementation - give the last slice whatever arc is left over - is wrong here.
`categoriesOf` computes each `percent` against `totalCents`, the account-wide total summed from the
transaction list, rather than against the sum of the slices themselves, and its own comment says why
and what it costs: a transaction whose category was deleted moments after it was created "inflates
`totalCents` without appearing in any row here, so the slices can sum to just under 100%".
`backend/CLAUDE.md`'s Dashboard section makes the same trade explicitly, preferring a visible
shortfall in one slice over one hidden inside every percentage.

So each arc is computed from its own `percent` and the ring is allowed to leave a gap. A gap means
spend that belongs to no live category, which is information rather than a rendering bug, and it
appears in the one place a reader can act on. What must **not** happen is the last slice silently
absorbing that shortfall, which would draw a closed ring that lies. The suite pins arcs summing to
the circumference for the ordinary case where the percentages do total 100, and pins a
deliberately-short set staying short rather than being stretched.

**AC5 is already true and this ticket must not re-implement it.** `dashboard.service.ts` filters
`spent > 0` before responding, and the field is documented as "every nonzero category this period".
So a zero-spend category never arrives and no filter belongs here. Worth writing down because the
natural instinct on reading AC5 is to add one, and a redundant `.filter(c => c.spent > 0)` is the
sort of line that later reads as evidence the API might send zeroes.

**AC3's ordering is the one thing the contract does not promise, so this card sorts.** `categories`
carries no documented order. Reading a sort off an undocumented field is the failure mode this repo
has been careful about elsewhere - it passes today, and it breaks silently the day the backend's
query grows an index or a join. So the card sorts by `spent` descending, and the **donut and the
legend consume the same sorted array**, so a slice's position around the ring and its row's
position in the list cannot disagree.

Ties need a rule or the order is unstable between renders. `spent` descending then `name`
ascending, which is the same tiebreak `topCategory` already documents for the identical question -
so the top legend row and PET-21's "Top category" stat name the same category on a tie rather than
disagreeing on the same screen.

**AC2's consistency with the budget card holds by construction, and that is the point of the
endpoint.** The donut's centre reads the same `spent` field PET-21's readout reads, off the same
response, from the same request. One read serves the whole screen, which is what PET-20 built. It
still gets an assertion, because "cannot disagree" is a property of the current wiring rather than
a law - if a later ticket ever gives this card its own read, the test is what notices.

**The centre total uses `formatWhole`**, PET-21's formatter, which is what makes AC2's equality
visible rather than merely true: `$1,240` in both places. Legend amounts likewise - the mock draws
`$397`, not `$397.00`.

**`ui/categoryColour.ts` gains a second function, and it is a real gap rather than a convenience.**
That file exports `CATEGORY_DOT` (the background alone, for a mark with no content on it),
`CATEGORY_COLOUR_BY_HEX` (the eight stored hexes to colour words) and `categoryTileClass(hex)`,
which resolves a hex to the *tile* pair. There is no function resolving a hex to the *dot*, and the
legend's dots are precisely a mark with no content. So `categoryDotClass(hex)` lands beside it,
with the same two properties that file argues for at length: the `Object.hasOwn` guard, because the
key is a stored value and a plain lookup also finds everything on `Object.prototype`; and the
uppercase normalisation, because `CreateCategoryDto` accepts `#57b368` and the seed writes
`#57B368`.

**Its fallback is `CATEGORY_TILE_NEUTRAL`'s background half, not the tile.** Handing a `status` dot
a `text-*-content` class turns the shadow daisyUI draws from `currentColor` into an opaque coloured
smudge - that is the whole reason `CATEGORY_DOT` exists as a second map rather than a substring of
the first, and a fallback that reintroduces the content half would reintroduce the bug on exactly
the path nobody looks at. `categoryColour.test.ts` already pins the two maps together; the new
function's own cases go beside them.

**The legend is what makes this accessible, and it is why there is no `aria-hidden` on the ring.**
DSH-8 and the tech spec's 5.2 notes both require the chart never to rely on colour alone, and the
legend pairs every dot with a name, an amount and a percentage in real text. So the SVG carries
`role="img"` with a name naming what it shows, the dots are `aria-hidden` because the row's text
already carries the identity - the same call `app/setup/categories/CategoryChip.tsx` and
`ui/Input`'s `$` prefix both make - and nothing is duplicated into a hidden table.

**A category with no resolvable colour renders grey and keeps its row.** Unreachable through the UI
today, since every category is one of the ten starters, but `CreateCategoryDto` accepts any
well-formed hex and the fallback category's `#98A0AE` is deliberately outside the palette. Dropping
such a row would make the legend's percentages sum to less than 100 with nothing explaining why,
which is worse than a grey dot.

**The empty state is PET-26's, and this card renders nothing for an empty `categories`.** Frame 05
draws a specific treatment - a gray ring, a `$0 spent` centre and an explanatory caption - and it
is not what this card produces by rendering zero slices. Same division as PET-22's.

**Unlike PET-22's, though, this card's empty input is not the screen's empty state, and PET-26 has
to know that.** The trend card's `[]` and the recent card's `[]` both occur exactly when
`transactionCount === 0`, because both are derived straight from the period's transaction list. This
card's does not: `categories` comes from `CategoriesService.list()` filtered on `spent > 0`, so
`categories: []` is *implied* by an empty period but also reachable on its own, through the same
dangling-category race the arc decision above is written around, or through amounts small enough to
round to zero cents. An account with transactions but no live category holding any of them yields an
empty `categories` on a screen that is otherwise populated.

The consequence is a **blank card**, not a wrong one, and it lands between two tickets: this card
renders nothing, and PET-26 draws the treatment only when the screen is empty. So PET-26's guard for
this one card is `categories.length === 0` rather than the screen-wide condition. That is a strict
superset - an empty screen always has empty `categories` - so it cannot disagree with the rest of
frame 05 or produce a half-empty screen, and it closes the gap without giving this card a second
opinion about whether the account is new. Recorded here because this is where the divergence is
visible, and carried out there because that is where the designed treatment lives.

## Shape

`(app)/dashboard/donut.ts` - the sort, the tiebreak, and the cumulative arc geometry as pure
functions over `DashboardCategoryDto[]`, with its own suite. Separate from the component for
PET-22's reason: the arithmetic is the part worth testing directly, and it needs no render.

`(app)/dashboard/CategoryDonut.tsx` - the card, the SVG ring, the centre readout and the legend
rows. A Server Component.

`ui/categoryColour.ts` - `categoryDotClass()`, with cases in `categoryColour.test.ts`.

`(app)/dashboard/page.tsx` - one line, the third slot filled.

## Tasks

- [x] Commit this plan alone and open the draft PR against `feat/PET-22-weekly-spending-trend`
- [x] `ui/categoryColour.ts`: `categoryDotClass()`, with its cases (the eight, an unpalette hex,
      the fallback grey, a lowercase hex, a prototype key)
- [x] `(app)/dashboard/donut.ts` and its suite: the sort, the name tiebreak, arcs summing to the
      circumference when the percentages total 100, a short set staying short rather than being
      stretched closed, one hundred percent in a single slice
- [x] `(app)/dashboard/CategoryDonut.tsx` and its suite: slice count and order, the centre total,
      legend rows largest first, the grey fallback row, the `role="img"` name, dots hidden
- [x] `(app)/dashboard/page.tsx`: fill the donut slot
- [x] Stories: `Shell/Spending by category` with the mock's five categories, a single-category
      month, and one unpalette colour; re-check `Screens/04 Dashboard` against node `21:4`
- [x] Docs: `frontend/src/components/CLAUDE.md` (the second function on `categoryColour`),
      `frontend/src/app/CLAUDE.md` (the sort and its tiebreak, the arc geometry and why the ring is
      allowed not to close), root `CLAUDE.md`
- [x] Comment on PET-23 with the sort decision, the AC5 note that the backend already filters, and
      the empty-`categories` guard PET-26 owes this card
- [x] Review round: fold orphaned spend into Uncategorized so the ring always closes
      (AC6), largest-remainder apportionment so the legend sums to 100 (AC4 amended), and a hover
      tooltip naming the slice (AC7, new) - `backend/src/categories/categories.service.ts`,
      `(app)/dashboard/donut.ts`, `CategoryDonut.tsx`, `docs/TODO.md`

No `npm run api:sync`: nothing here changes a request or response body.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo
root: `npm run docs:check`.

Then the app itself, signed in, in **Chrome**, with spending across several categories:

1. One slice per nonzero category, each sized to its share and in that category's colour (AC1)
2. The centre reads the period total over "Total spent", and it is **character-identical** to the
   budget card's spent figure on the same screen (AC2)
3. The legend runs largest to smallest with a dot, name, amount and percentage on every row (AC3)
4. The percentages are consistent with the amounts beside them (AC4). That is AC4's own wording and
   the check stops there: they will normally also total 100, but "must sum to 100" is not a property
   this response guarantees - display rounding can put five slices at 99 or 101, and the arc
   decision above records the rarer case where the unrounded values genuinely fall short. A total
   that is off by a point is not a defect to chase here
5. A category with nothing spent this period appears in neither the ring nor the legend (AC5) -
   which the backend guarantees, so this is confirming the guarantee rather than testing our filter

Then the two things only a browser answers, both of which this repo has been bitten by. Read the
**computed** colour of each dot and confirm it changed with the theme rather than being a fixed hue
- and probe a `text-*-content` class onto one dot first to see the smudge `CATEGORY_DOT` exists to
prevent, so the check is seen to fail before it is trusted. Then check the ring in **dark** mode,
since the slice colours and the card surface are both theme-resolved and the frame only draws one
of the two themes.

Then `Shell/Spending by category` and `Screens/04 Dashboard` in Storybook.

## Reversal: two of the decisions above are superseded, and the ring now always closes

Everything above is the record of how this card was designed before implementation. Two of its
Decisions are no longer what ships, and the second is the more important of the two.

**No charting library becomes Recharts.** PET-22 adopted Recharts 3.10.1 (MIT) for the epic and
retrofitted the trend chart onto it, so this card inherits the library rather than the
prohibition. The argument in that plan was sound about one chart and wrong about its scope; the
full account, including why ApexCharts was rejected on its licence and what the dependency costs
in bundle weight, is in `docs/plans/2026-08-06_PET-22_weekly-spending-trend.md`. The practical
consequence here is that **the cumulative arc geometry this plan called for does not exist**:
Recharts derives every arc from the values it is handed, so `donut.ts` is a sort and a rounding
rather than a `stroke-dasharray` calculation.

**"The ring is built to tolerate not closing" is reversed outright, by product decision.** That
section is the most detailed argument in this plan and it now describes the opposite of the
requirement. The requirement is:

1. the ring is **always** closed, and
2. the centre shows exactly the period's total spend while the category percentages sum to 100%.

The old reasoning was not wrong about the facts. `categoriesOf` really did compute each `percent`
against `totalCents`, and a transaction whose category was tombstoned really could leave the
slices summing to just under 100. Where it went wrong was in concluding that the gap therefore had
to be **shown**. It framed the choice as "a visible shortfall in one slice, or the same shortfall
hidden inside every percentage" and picked the first, when the third option was to stop having a
shortfall.

### Three separate causes, only one of which was the one the plan described

Investigating the requirement turned up that a donut can fail to close for three unrelated
reasons, and the plan above only knew about the rarest:

- **Display rounding, which happens constantly.** Five slices at 32.4 / 24.3 / 18.2 / 14.2 / 10.9
  each round correctly on their own and sum to 99. This has nothing to do with the data and would
  have shipped as a visible defect on most accounts.
- **The underlying values, which were already right.** `totalCents` is the sum of every
  transaction's cents and each category's `spent` is its own transactions' cents, so in the
  ordinary case they match exactly and the percentages already summed to 100.
- **Orphaned spend, the case this plan wrote around**, and rarer than it implied.

### The orphan case is narrower than "a deleted category" and is fixed at source

`DELETE /api/categories/:id` **reassigns** a category's transactions to the Uncategorized fallback
before tombstoning it, so ordinary deletion accounts for everything and never orphans anything.
The fallback is a real `is_fallback = 1` row seeded into every user database. The only genuine
hole is the check-then-write race: `assertCategoryExists` is an unlocked SELECT, so a create can
pass it, have the concurrent delete's reassignment sweep past, and land with the dead id.

So the fix is a backend one. `CategoriesService.withSpend` now folds spend matching no live
category into the fallback row, which restores the invariant *every transaction in the period is
counted in exactly one row* for every reader at once - the categories list and the month stats,
not only this card. `dashboard-response.dto.ts` publishes the guarantee, and
`test/dashboard.e2e-spec.ts` carries the regression guard: it tombstones a category directly,
without the reassignment the API would do, and asserts the percentages still sum to 100. Three of
its four assertions fail without the fold, which is how the guard is known to discriminate.

**Closing the write race is deliberately not part of this**, and `docs/TODO.md` carries it as a
VERY IMPORTANT invariant entry. The obvious fix, wrapping check and write in `db.transaction()`,
is forbidden by a documented constraint in both services: the embedded driver refuses overlapping
transactions rather than queueing them, so a second transactional call site on a user database
trades a rare correctness bug for a common availability one. The conditional-write shape that
would respect the constraint is written down there.

### The percentages are apportioned, not rounded

`donut.ts`'s `apportionPercents` floors every value and hands the leftover points to the largest
fractional remainders, so the column always reads 100. The accepted cost is that a slice can show
one point away from its own rounding: on the frame's own five values the floors give 98, so two
points are handed out and the 32.4 displays 33. The alternative is a legend that visibly sums to
99 under a ring that visibly closes.

The ring itself is closed by a second, independent mechanism: the arcs are driven by `dataKey="spent"`
and Recharts normalises against the sum of the values it holds. So the geometry closes even if a
future response's percentages did not sum to 100, which is deliberate - the ring's correctness
should not depend on a field being well-behaved.

### Two Recharts defaults had to be turned off, and the second was new

`accessibilityLayer` defaults to `true` and puts `role="application"` and `tabindex="0"` on the
svg, which PET-22 already found. **`Pie` then carries a second one**: its own `rootTabIndex`
defaults to 0, so disabling the accessibility layer was not enough and the ring stayed in the tab
order inside an `aria-hidden` subtree. Found by the suite asserting the negative rather than by
listing known defaults, which is the argument for writing that assertion at all.

### The tooltip is new relative to this plan

This plan specified no tooltip, on the grounds that the legend already carries every fact. A
tooltip naming the hovered category was added anyway: the ring is pure colour, so hovering a slice
otherwise means tracing a hue back to the legend by eye, which is the colour-alone problem the
legend exists to solve, reintroduced for the one person pointing directly at the thing. It shows
the **apportioned** percentage, the same integer the legend row shows, so the two surfaces cannot
disagree by a point.

The ring stays `aria-hidden` with the legend as its accessible equivalent. That is safe here in a
way it was not on the trend chart, because the legend is a strict superset of the tooltip: every
name, amount and percentage is already in real text, so nothing needs mirroring into an `sr-only`
line.
