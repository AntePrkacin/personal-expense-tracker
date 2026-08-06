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

- [ ] Commit this plan alone and open the draft PR against `feat/PET-22-weekly-spending-trend`
- [ ] `ui/categoryColour.ts`: `categoryDotClass()`, with its cases (the eight, an unpalette hex,
      the fallback grey, a lowercase hex, a prototype key)
- [ ] `(app)/dashboard/donut.ts` and its suite: the sort, the name tiebreak, arcs summing to the
      circumference when the percentages total 100, a short set staying short rather than being
      stretched closed, one hundred percent in a single slice
- [ ] `(app)/dashboard/CategoryDonut.tsx` and its suite: slice count and order, the centre total,
      legend rows largest first, the grey fallback row, the `role="img"` name, dots hidden
- [ ] `(app)/dashboard/page.tsx`: fill the donut slot
- [ ] Stories: `Shell/Spending by category` with the mock's five categories, a single-category
      month, and one unpalette colour; re-check `Screens/04 Dashboard` against node `21:4`
- [ ] Docs: `frontend/src/components/CLAUDE.md` (the second function on `categoryColour`),
      `frontend/src/app/CLAUDE.md` (the sort and its tiebreak, the arc geometry and why the ring is
      allowed not to close), root `CLAUDE.md`
- [ ] Comment on PET-23 with the sort decision, the AC5 note that the backend already filters, and
      the empty-`categories` guard PET-26 owes this card

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
