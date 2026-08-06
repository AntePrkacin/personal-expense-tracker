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

**AC5 is already served by the API, and reading it the other way was this plan's own mistake.**
The first draft of this plan argued that `weeklyBuckets` carries only the weeks that have spend in
them, so the card had to derive the period's full bucket set and fill the response into it. That is
wrong. It is corrected here rather than quietly deleted, because the misreading is an easy one to
make twice and the fix removes a module rather than adding one.

`weeklyBucketsOf` in `backend/src/dashboard/dashboard.service.ts` computes
`bucketCount = Math.ceil(totalDays / 7)` and pushes **every** bucket in that range, a week with no
spend included, as `total: 0`. Its one early return is for an account with no transactions in the
period at all, which answers `[]`. So a frugal second week arrives as a real bucket carrying zero,
and AC5's "still there with a zero value rather than being dropped from the axis" is satisfied by
rendering the array as it comes.

The evidence was in the contract all along and pointed both ways at once, which is worth naming so
the next reader is not caught by the same sentence. The line the first draft leaned on - "an
**empty array**, not zero-filled buckets, when there is nothing to chart this period" - is about
the *whole period* being empty, not about an individual week; and the same `@ApiProperty` says the
buckets "tile the period without gap or overlap", which no response that dropped a week could do.
`backend/CLAUDE.md`'s Dashboard section then says it outright: "Within an account that does have
spend, a week with none still gets a zero-valued bucket - the chart draws a continuous axis and a
missing week would compress it."

**So there is no fill, and `weeks.ts` is one function rather than two.** What AC5 needs from this
card is not arithmetic but a rendered floor, which the bar-height decision below already carries: a
`total: 0` bucket has zero proportional height and needs a visible minimum track so its week label
is not orphaned under nothing. That is the only thing standing between the response and AC5.

**The empty array is `transactionCount === 0` exactly, and that is what makes the division with
PET-26 clean.** `weeklyBucketsOf` returns `[]` when `periodTransactions.length === 0`, and
`transactionCount` *is* `periodTransactions.length` on the same response - so this card's "nothing
to draw" and PET-26's screen-wide empty condition are the same state rather than two conditions
that might disagree. This card renders nothing for it and PET-26 puts frame 05's bar glyph over
"No spending to chart yet" there. Synthesising a zero axis here would be inventing a fifth state
nobody designed, and it would then have to be removed.

**Today comes from `lib/date.ts`, never from `new Date(iso)`.** With the fill gone this is the
card's only remaining contact with a date, and it is still the trap worth naming. That module owns
the wire form and touches neither `Intl` nor UTC, because a calendar date is a day rather than an
instant. `new Date('2025-10-08')` parses as **UTC midnight**, so any zone behind UTC reads it as the
day before - which would put AC3's highlight on the wrong bar for part of the day. Both
`lib/date.ts` and `lib/format.ts` record this trap in both directions, so `todayIsoDate()` is what
this card calls and the comparison stays string-to-string from there.

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

`(app)/dashboard/weeks.ts` - the current-week index, one pure function over the contract's
`WeeklyBucketDto[]` plus today's date, with its own suite. Still its own module rather than a helper
inside the component, because AC3's range test is the only real arithmetic on this card and the
short-final-bucket case is worth pinning without a render.

`(app)/dashboard/TrendCard.tsx` - the card, the caption, the bars and their two label rows. A
Server Component; nothing on it is interactive, per AC4.

`(app)/dashboard/page.tsx` - one line, the second slot filled.

## Tasks

- [ ] Commit this plan alone and open the draft PR against `feat/PET-21-monthly-budget-card`
- [ ] `(app)/dashboard/weeks.ts` and its suite: the current-week index, a short final bucket, today
      in the first and in the last bucket, an empty array
- [ ] `(app)/dashboard/TrendCard.tsx` and its suite: bars, proportional heights, one highlight, a
      `total: 0` week keeping its label over a minimum track, no interactive role anywhere
- [ ] `(app)/dashboard/page.tsx`: fill the trend slot
- [ ] Stories: `Shell/Spending trend` with a filled month, a month holding a zero week, and a
      short final bucket; re-check `Screens/04 Dashboard` against node `21:4`
- [ ] Docs: `frontend/src/app/CLAUDE.md` (the no-library decision, that the API already zero-fills
      and the card must not, the range test), root `CLAUDE.md`, `docs/TODO.md` if the AC3
      colour-only question is raised
- [ ] Comment on PET-22 with the no-library decision and the correction that AC5 needs no fill

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
3 of the current period and nothing in week 2 - which checks that the card draws the zero bucket
**and** confirms the API really sends it, so the correction this plan rests on is verified against a
running backend rather than only against the source. For the short-final-bucket case, check the
highlight on the last day of the period - which can be reached without waiting by temporarily
setting the profile's `monthStartDay` so that today is the period's last day, then setting it back.

Then `Shell/Spending trend` and `Screens/04 Dashboard` in Storybook. The screen story already
carries `AddTransactionProvider` and the `appDirectory` parameter from PET-21; the card's own
stories need neither, since nothing in this card reaches a hook.
