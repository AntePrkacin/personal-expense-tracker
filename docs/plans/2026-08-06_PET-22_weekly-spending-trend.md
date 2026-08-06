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

## Review follow-ups (folded in before implementation)

Three corrections, caught reviewing this plan against PET-21's own review rather than against
running code, and folded in here before a line of the card is written rather than after.

**The caption's month claim above repeats the mistake PET-21's review just fixed, and it is
wrong for the same reason.** "Weekly · October" is not the same case as the page header's
overline: `monthOverline`/`monthLabel` on the header are labels standing alone, so a calendar
month is merely imprecise there while `monthStartDay` is 1. This caption is attached to
`weeklyBuckets`, which `weeklyBucketsOf` anchors to `monthWindow(monthStartDay, today)` in
`backend/src/dashboard/dashboard.service.ts` - the identical window `daysLeft` comes from, which
PET-21's card no longer names a month for. At `monthStartDay: 15` the window runs 15 October to
15 November, and every bucket in it - not just the boundary week - would sit under a caption
naming one month while up to half its bars fall in the other. So the caption is **"Weekly"**,
with no month at all, until a period label exists on the response; `docs/TODO.md`'s existing
PET-21 entry about that field is the one to extend, not a new entry.

**AC3's highlight has the same two-clocks edge PET-21's `daysLeft` does, narrower but not new.**
`todayIsoDate()` reads the frontend host's clock while every bucket boundary comes from
`APP_TIMEZONE` in `monthWindow`, so for up to an hour a day the two disagree - and when that hour
straddles a bucket boundary, the computed current-week index points at the neighbouring bar
instead. Self-healing on the next request, exactly as PET-21's `backend/CLAUDE.md` note already
describes for `daysLeft`, and not fixable here for the same reason: fixing it would mean this card
reading `monthStartDay` itself, which is the second-guessing PET-21's card was written to avoid.
Recorded in `weeks.ts` rather than left implicit, so the next reader does not have to rediscover it.

**Bar height's divide-by-zero has to be an explicit guard, not an implicit one.** "A percentage of
the tallest bucket" is `0/0` the day every bucket in the period is zero. That day cannot arrive
today - `weeklyBucketsOf` returns `[]` outright when `periodTransactions.length === 0`, and every
stored amount is `@IsPositive`, so a non-empty array always contains at least one positive `total`
- but the height calculation is still worth writing as a guarded percentage (falling back to the
same minimum track a zero bucket gets) rather than a bare division, so a future relaxation of
either invariant degrades to a flat chart instead of `NaN%` in every inline style.

## Shape

`(app)/dashboard/weeks.ts` - the current-week index, one pure function over the contract's
`WeeklyBucketDto[]` plus today's date, with its own suite. Still its own module rather than a helper
inside the component, because AC3's range test is the only real arithmetic on this card and the
short-final-bucket case is worth pinning without a render.

`(app)/dashboard/TrendCard.tsx` - the card, the caption, the bars and their two label rows. A
Server Component; nothing on it is interactive, per AC4.

`(app)/dashboard/page.tsx` - one line, the second slot filled.

## Tasks

- [x] Commit this plan alone and open the draft PR against `feat/PET-21-monthly-budget-card`
- [x] `(app)/dashboard/weeks.ts` and its suite: the current-week index, a short final bucket, today
      in the first and in the last bucket, an empty array
- [x] `(app)/dashboard/TrendCard.tsx` and its suite: bars, proportional heights, one highlight, a
      `total: 0` week keeping its label over a minimum track, no interactive role anywhere
- [x] `(app)/dashboard/page.tsx`: fill the trend slot
- [x] Stories: `Shell/Spending trend` with a filled month, a month holding a zero week, and a
      short final bucket; re-check `Screens/04 Dashboard` against node `21:4`
- [x] Docs: `frontend/src/app/CLAUDE.md` (the no-library decision, that the API already zero-fills
      and the card must not, the range test, the caption naming no month, the two-clocks edge on
      the highlight), root `CLAUDE.md`, `docs/TODO.md` (extend the PET-21 period-label entry
      rather than adding a new one)
- [x] Comment on PET-22 with the no-library decision, the correction that AC5 needs no fill, and
      the caption amendment

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

### What was actually verified, and what is still owed

`npm run lint`, `npm test` (75 suites, 1409 tests), `npm run build` and `npx tsc --noEmit` from
`frontend/`, `npm run docs:check` from the root: all green.

Then headless Chromium over CDP against `Shell/Spending trend`'s four stories and
`Screens/04 Dashboard`, with the story fixtures anchored to the real clock (`daysAgo()` helpers
in both story files) rather than a fixed October 2025, so the highlight is checked against
whatever "today" the story actually renders under rather than assumed: all four values render
(AC1), exactly one bar is highlighted and it is the open-ended current bucket (AC3), no
button/link/progressbar role anywhere on the chart (AC4), a zero-total week still renders its
`$0` and `Week 2` label over a visible non-zero floor rather than collapsing (AC5), the
short-final-bucket case highlights the short last bucket rather than missing it, the
whole-period-empty case renders nothing, and the card repaints in the dark theme.

**AC2 was claimed on that list and was false, which is the one thing in this branch worth
reading twice.** The first pass reported "the $410 bucket is the 100%-height bar and the rest
scale under it" by reading each bar's inline `style.height` - the attribute this component
writes, not the box the browser draws - so it confirmed the arithmetic and learned nothing about
the geometry. Review of the PR measured `getBoundingClientRect()` instead and found the bars
rendered **87.41 / 88 / 78.05 / 88** pixels for `$280 / $410 / $250 / $300`: the percentage
resolved against the `h-32` column, but that column also held the value row, the week label and
two `gap-1`s, so only 88px of the 128 was free and every bar that would have exceeded it was
flex-shrunk to exactly that. `$410` and `$300` drew the identical bar, `$280` came within 0.6px
of both, and AC2 failed for every bucket at or above 68.75% of the maximum. The fix gives the
bar its own plot area holding nothing else; the same measurement now reads
**87.41 / 128 / 78.05 / 93.66**, proportional to within half a pixel, and the walk rebuilds the
old markup in the same page to confirm it still clamps - a check that has never been seen to
fail is not evidence.

Two lessons this leaves for PET-23's donut, which has the same shape of risk. **A style
attribute is not a measurement**: assert `getBoundingClientRect()`, since a value that is
correct in the attribute and wrong on screen is exactly what a CSS layout bug looks like. And
**jsdom runs no layout at all**, so `TrendCard.test.tsx` cannot see this class of defect by
construction - it now says so where the percentages are asserted, and carries a structural
regression guard (the bar's parent must contain the bar and nothing else) as the closest thing
to it that Jest can hold.

**Not verified: AC5 and the short-final-bucket case against a running backend with real data.**
The plan asks for both to be confirmed against `GET /api/dashboard` actually sending the shapes
this card assumes - a zero-valued bucket for a spend-free week, and a short final bucket at a
period boundary - not only against Storybook fixtures built by hand to look like them. No backend
was running in this session to do that against. The source-level argument in Decisions above
(`weeklyBucketsOf`'s early return is `periodTransactions.length === 0`, not "any bucket empty",
and the loop pushes every bucket including zero ones) still stands on inspection of
`backend/src/dashboard/dashboard.service.ts`, but it has not been confirmed live the way the plan
asks. Whoever takes this out of draft should run the two backend-dependent checks before merge.
