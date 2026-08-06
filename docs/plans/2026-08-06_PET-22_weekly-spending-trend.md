# PET-22 — Weekly spending trend chart

[PET-22](https://decode.atlassian.net/browse/PET-22) — `[FE] Build weekly spending trend chart`.
Figma: [04
Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4).

Base branch is `feat/PET-21-monthly-budget-card`, so this is a stacked branch and its PR targets
that branch rather than `main`. Position 2 of 6 in the Dashboard stack.

## Why

PET-21 built the dashboard's data path and its grid and left four slots in it. This fills the
first, and it is the epic's first chart - so it settles how charts are drawn here, which PET-23
then inherits rather than re-deciding.

The card is DSH-6: a "Spending trend" header with the caption "Weekly · October", one bar per week
of the period, each labelled with its value above and its week label below, and the current week's
bar in the accent colour. `$280`, `$410`, `$250`, `$300` over Week 1 to Week 4 in the mock. AC4
says it explicitly: display only, no tooltip, no axis, no interaction.

## Decisions

**No charting library, here or in PET-23.** This is the decision this branch owns for the epic, so
the argument is written out once:

- Both charts are static and non-interactive by their own acceptance criteria. AC4 here forbids
  hover and click outright, and PET-23's donut draws a ring and a legend with nothing on it that
  responds. A library's value is axes, scales, tooltips, legends and transitions - four of which
  are explicitly unwanted and the fifth of which is fourteen lines of markup.
- Every one of them ships its own colour scheme, and `frontend/CLAUDE.md`'s first colour rule is
  that theme-aware colour is daisyUI semantic colour and nothing else. Re-theming a chart library
  onto `--color-accent` is more work than not having one, and the failure mode is the one that file
  warns about: a wrong colour now compiles and quietly bypasses the theme rather than failing.
- It would be the frontend's second runtime dependency after `lucide-react`, added for two cards.

So the bars are `<div>`s with a proportional height and the donut is one SVG `<circle>` per slice.
If a later ticket needs axes, scales or interaction - INS-2's charts on frame 16 are the candidate
- that ticket makes the case with a real requirement behind it.

**AC5 is the whole of the work, because the contract deliberately does not help.**
`weeklyBuckets` is documented as summing to `spent` and as being "an **empty array**, not
zero-filled buckets, when there is nothing to chart this period". So the API returns the buckets
that have spend in them, and AC5 wants a week with no spending "still there with a zero value
rather than being dropped from the axis". Rendering the array as it arrives fails AC5 by
construction: a month whose second week was frugal draws three bars labelled Week 1, Week 3,
Week 4, which reads as a data error.

**So the card derives the period's full bucket set and fills the API's buckets into it.** The
contract gives everything needed and no `monthStartDay` read is involved: each bucket carries
`startDate` inclusive and `endDate` exclusive, they are stated to tile the period without gap or
overlap, and the final one is short rather than overshooting. The period's own bounds are therefore
the first bucket's `startDate` and the last one's `endDate` whenever any bucket exists.

**The empty period is the one case that has no bounds to read**, because `weeklyBuckets` is `[]`
and there is nothing to take a start or an end from. That is exactly frame 05, and it is
**PET-26's**: the trend card's empty treatment is a bar glyph over "No spending to chart yet", not
a zero-filled axis. So this card renders nothing for an empty array and PET-26 puts the designed
treatment there. Deriving a synthetic four-week axis of zeroes here would be building a fifth
state nobody designed, and it would then have to be removed.

**Bucket arithmetic goes through `lib/date.ts`, never `new Date(iso)`.** That module owns the wire
form and touches neither `Intl` nor UTC, because a calendar date is a day rather than an instant.
`new Date('2025-10-08')` parses as **UTC midnight**, so any zone behind UTC reads it as the day
before - which would mis-bucket the boundary days of every week and put AC3's highlight on the
wrong bar for part of the day. Both `lib/date.ts` and `lib/format.ts` record this trap in both
directions.

**AC3's current week is a half-open range test, and the final bucket is why that matters.**
`startDate <= today < endDate`, string-compared on `YYYY-MM-DD`, which sorts correctly as text and
needs no `Date` at all. It must not be written as `startDate + 7 days`: the contract says the last
bucket's `endDate` is the period end, so a final short bucket would leave today outside every
range for the last few days of a month and the highlight would silently vanish. That is the kind of
defect that appears twice a month and passes every test written against a tidy 28-day fixture, so
the suite gets a short-final-bucket case.

**Exactly one bar is highlighted, and `today` is read once.** AC3's second half is that the others
are not, which is what makes a single computed index the right shape rather than a predicate each
bar evaluates. Reading the clock once also keeps the render deterministic across the map.

**The highlight is `bg-accent` and the rest are `bg-primary`.** Both are semantic daisyUI colours,
and the ticket calls the highlight the accent colour directly. Note what this means for
`frontend/CLAUDE.md`'s rule that colour modifiers are semantic state rather than decoration: bar
colour here is neither - it is a chart series, which is a third thing that rule does not cover.
Recorded rather than glossed, because the honest reading is that the rule constrains controls and
status, and a chart's marks are outside it.

**Bar height is a percentage of the tallest bucket, not of the budget.** AC2 says the tallest week
is the tallest bar, which is a statement about the chart being self-scaled. A zero-spend week
therefore has zero height, so it gets a visible minimum track so the week label is not orphaned
under nothing - that is the "still appears" half of AC5, and it is a floor on the rendered height
rather than a floor on the value.

**The chart is not a `<table>` and it is not `aria-hidden` either.** Every bar's value and week
label are real text in the DOM, which is what makes the figure readable without the graphic - so
the container needs no ARIA of its own and the numbers are not duplicated into a `sr-only` table.
This is the opposite of `app/DecorativePanel.tsx`'s call, and the difference is that this one
reports the reader's own money.

**The caption's month comes from `monthLabel`.** "Weekly · October", reusing the function the page
header already draws its overline from, so the two cannot disagree. The `monthStartDay` deviation
that function carries is `frontend/CLAUDE.md`'s existing record, not a new one here.

## Shape

`(app)/dashboard/weeks.ts` - the bucket fill and the current-week index, pure functions over the
contract's `WeeklyBucketDto[]` plus today's date, with its own suite. Separate from the component
because AC5's fill and AC3's range test are the two things worth testing directly and neither needs
a render.

`(app)/dashboard/TrendCard.tsx` - the card, the caption, the bars and their two label rows. A
Server Component; nothing on it is interactive, per AC4.

`(app)/dashboard/page.tsx` - one line, the second slot filled.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `feat/PET-21-monthly-budget-card`
- [ ] `(app)/dashboard/weeks.ts` and its suite: the fill, the current-week index, a short final
      bucket, an empty array
- [ ] `(app)/dashboard/TrendCard.tsx` and its suite: bars, proportional heights, one highlight,
      zero weeks present, no interactive role anywhere
- [ ] `(app)/dashboard/page.tsx`: fill the trend slot
- [ ] Stories: `Shell/Spending trend` with a filled month, a month holding a zero week, and a
      short final bucket; re-check `Screens/04 Dashboard` against node `21:4`
- [ ] Docs: `frontend/src/app/CLAUDE.md` (the no-library decision, the AC5 fill, the range test),
      root `CLAUDE.md`, `docs/TODO.md` if the AC3 colour-only question is raised
- [ ] Comment on PET-22 with the AC5 fill and the no-library decision

No `npm run api:sync`: nothing here changes a request or response body.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo
root: `npm run docs:check`.

Then the app itself, signed in, in **Chrome**:

1. One bar per week of the period, each with its value above and week label below (AC1)
2. Heights are proportional and the biggest week is the tallest bar (AC2)
3. The current week's bar is the only accent one (AC3)
4. Clicking and hovering a bar does nothing at all - no tooltip, no cursor change (AC4)
5. A week with no spending still draws its label and a zero-height bar (AC5)

Two of those need data built for them rather than found. For AC5, log transactions in weeks 1 and
3 of the current period and nothing in week 2. For the short-final-bucket case, check the highlight
on the last day of the period - which can be reached without waiting by temporarily setting the
profile's `monthStartDay` so that today is the period's last day, then setting it back.

Then `Shell/Spending trend` and `Screens/04 Dashboard` in Storybook. The screen story already
carries `AddTransactionProvider` and the `appDirectory` parameter from PET-21; the card's own
stories need neither, since nothing in this card reaches a hook.
