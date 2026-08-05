# Dashboard summary endpoint with month aggregates

**Ticket:** PET-20 · **Branch:** `feat/PET-20-dashboard-summary` · **Written:** 2026-08-04

**Stack position:** top of a three-branch stack, based on `feat/PET-28-transaction-reads`, which
is based on `feat/PET-35-category-endpoints`. Last because it consumes both: `monthWindow()` and
the per-category stats from PET-35, the recent-transactions shape from PET-28.

## Context

One read serves the entire dashboard. Seven distinct things come back from it: budget progress,
the three stat tiles, the weekly buckets behind the trend chart, the per-category totals behind
the donut, the three most recent transactions, and the latest insight teaser (DSH-3 to DSH-9).

Every figure is derived, never stored. A25 records that the mock numbers contradict each other
across frames, so real data wins wherever the design and arithmetic disagree - which is most
places on this screen.

**Figma:** the data behind [04 Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4)
and [05 Dashboard - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706).

## What this branch inherits

Nothing here is re-implemented. Each of these is imported from a branch below it in the stack.

- **`monthWindow(monthStartDay, today)`** (PET-35). Drives the period and, through its exclusive
  end bound, the days-left figure in AC2. `today` is formatted against `APP_TIMEZONE`
  (`Europe/Zagreb` by default), not UTC and not a per-user zone - see `docs/TODO.md` for why the
  per-user version is deferred.
- **The per-category aggregation** (PET-35). The donut's slices are the same grouped SUM the
  Categories list runs, with the cap and status fields dropped.
- **The recent-transactions shape** (PET-28). The dashboard's three rows are that list read,
  sorted `date_desc` with the same tiebreak, limited to three.

**Three of PET-35's settled decisions land visibly on this screen**, and none of them was
anticipated by the design:

- **`Uncategorized` is the default category**, so for a user who never changes the picker it will
  hold most or all of their spend. That makes it the likely **top category** on the stats tile,
  and the dominant donut slice. A tile reading "Top category: Uncategorized" is honest and not
  very useful; whether the design wants the fallback excluded from that tile is a question for
  the designer, and this plan does not exclude it unasked.
- **Its color is `#98A0AE`**, a deliberately muted neutral rather than one of the eight category
  colors, so the largest donut slice may be the greyest one. That is the intended signal.
- **Caps are optional**, so the per-category slices carry no cap or status here anyway - the
  donut never needed them - but it does mean the Categories screen and this one can both be
  dominated by an uncapped category, which no frame draws.

## Decisions made

### 1. Weekly buckets anchor to the period start, not to ISO weeks

AC3 requires that the buckets **sum to the period total**. That single requirement decides the
whole design, because ISO weeks do not: a period starting on the 5th straddles two ISO weeks at
each end, so the first and last buckets would carry days from the neighbouring periods and the
sum would overshoot.

So bucket *n* covers days `start + 7n` up to `start + 7(n+1)`, clipped to the period end. A
28-to-31 day period yields five buckets, the last one short. Buckets with no transactions are
returned as zeroes rather than omitted, because the chart draws a continuous axis and a missing
week would compress it.

The label is the bucket's own date range rather than a week number, since "week 3" is meaningless
against a period that does not start on the 1st. Format is decided at the DTO, not in the
service - the backend returns `startDate` and `endDate` per bucket and the frontend renders the
label it wants. That keeps a formatting decision out of the API contract, where it would be
frozen by `openapi.json`.

### 2. Average per day is spend to date over days elapsed

The design labels the tile "average per day" and its numbers contradict the other frames (A25),
so the arithmetic has to be chosen rather than copied.

Two readings: spend divided by days **elapsed**, or by days **in the period**. Elapsed is the
right one - it is a rate that answers "am I burning too fast", it is comparable day to day, and
dividing by the full period on day 2 of the month produces a number that looks like success and
means nothing.

Days elapsed counts today, so it is never zero and there is no division to guard.

### 3. Days left counts from today to the exclusive end bound

`monthWindow()` returns an exclusive end, so days left is the plain difference between the end
bound and today. On the last day of a period that yields 1, not 0, which is correct: the day is
not over. A caller wanting "0 on the final day" is describing days *remaining after* today, which
is not what the tile says.

### 4. Category percentages are returned unrounded

AC4 wants each nonzero category's total **and its percentage of the period total**. Rounding to
integers server-side means the slices can sum to 99 or 101, and the frontend cannot repair what
it was not given.

So the percentage is returned at full precision and rounding is the frontend's problem, which is
the only place that knows how many digits the donut legend has room for. A25's unresolved
question - whether small categories collapse into an "Other" slice - stays unresolved and every
nonzero category is returned, as the ticket says.

Note the naming collision waiting here. Two things on this screen could reasonably be called
"other": the seeded fallback category, now named `Uncategorized`, and a collapsed remainder slice
if the designer ever asks for one. They are not the same thing - the first is a real row that
holds real transactions, the second is a presentation grouping over several rows. PET-35 renaming
the fallback away from "Other" removes most of the trap, but a remainder slice must still not
reuse either name without saying which it means.

### 5. Remaining may be negative, and the empty account is not an error

AC1's remaining is the monthly budget minus spend, unclamped, for the same reason PET-35's
`unallocated` is unclamped: overspending is a state the user is in and the frontend needs the
magnitude to draw it.

AC5's empty account returns zeroes, an empty weekly series, no categories and no top category.
"Empty weekly series" means an **empty array**, not five zero buckets: with no transactions there
is nothing to chart and the empty-state frame replaces the chart entirely. Top category is
`null`, not a zero-valued object.

### 6. Top category ties break by name, deliberately

Two categories at the same spend is unlikely and entirely possible with round numbers. Without a
tiebreak the winner is whatever the query planner returns first, which can change between
requests for no reason the user can see. Highest spend, then name ascending.

### 7. AC6 cannot be met on this branch, and the field ships as `null`

AC6 wants the teaser from the most recent stored insight set. **There is no `insights` table.**
`backend/CLAUDE.md` lists it under `## Not built here`, and it arrives with PET-41 as an ordinary
user-scope migration.

Three options, and the third is the one taken:

- Build the table here. It would duplicate PET-41's whole schema decision on a branch that has no
  business making it.
- Omit the field. Then PET-41 changes the dashboard response shape, which is a second
  `api:sync` churn and a frontend change for a field that was always going to exist.
- **Ship `insight: null` with the field in the contract**, documented as always null until PET-41
  lands, and PET-41 fills it in. One line changes there, no shape change anywhere.

**AC6 is therefore not satisfied by this ticket and should be moved to PET-41**, which is the
ticket that can actually satisfy it. Per `docs/agents/conventions.md` the acceptance criteria are
amendable; this one is in the wrong place rather than wrong.

## Endpoint

One operation, one new module `backend/src/dashboard/`, following `src/profile/` in shape: it
owns no table and composes services that do.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Every figure on the dashboard for the current period |

Singular `/dashboard`, not `/dashboards`: it is a screen's worth of data and there is exactly one
per user, the same reasoning that makes `/profile` singular with no id.

`DashboardService` depends on `CategoriesService` and `TransactionsService` rather than querying
`categories` and `transactions` itself. That is the whole reason this branch is third in the
stack, and the alternative - a fourth place computing month spend - is precisely what
`backend/CLAUDE.md` calls a bug in its money note.

One consequence to watch: this endpoint issues more queries than any other in the app. All of
them hit `transactions_date_idx` over one user's own small database, so it is not a problem now;
if it becomes one, the fix is a single grouped query in a shared read model, not caching.

## Tasks

- [ ] **Scaffold `src/dashboard/`**: module, controller, service and response DTOs, registered in
      `AppModule`, importing `CategoriesModule` and `TransactionsModule`
- [ ] **Implement budget progress and the three stat tiles**: spent, remaining unclamped, days
      left from the exclusive end bound, transaction count, average per day over days elapsed,
      and top category with the name tiebreak
- [ ] **Implement the weekly buckets** anchored to the period start, clipped at the end, zero
      buckets included, each carrying `startDate` and `endDate` rather than a rendered label
- [ ] **Implement the donut totals** from PET-35's aggregation, every nonzero category,
      percentages unrounded
- [ ] **Wire the three recent transactions** through PET-28's list read rather than a fresh query
- [ ] **Add `insight: null`** to the response with a DTO comment naming PET-41 as what fills it
- [ ] **Write the service spec** covering AC1 to AC5, the empty account, a period spanning the
      December-to-January roll, a non-1st `monthStartDay`, buckets summing to the period total,
      a two-way top-category tie, and an account whose spend sits entirely in `Uncategorized`
- [ ] **Add e2e coverage** for a populated account and an empty one
- [ ] **Run `npm run api:sync`** from the repo root and commit both artifacts
- [ ] **Document it**: a `## Dashboard` section in `backend/CLAUDE.md`, the trigger row in root
      `CLAUDE.md`, and a `docs/TODO.md` note that the insight teaser is stubbed until PET-41
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**Two hard dependencies below it in the stack**, so this branch cannot be reviewed meaningfully
until both merge. That is the accepted cost of stacking rather than duplicating the aggregation
three times. PET-35's six decisions were settled on 2026-08-04, so what is left is drift during
implementation rather than open questions.

**The top-category tile may permanently read `Uncategorized`.** Not a defect in this endpoint -
it is the arithmetic working - but it is the most visible consequence on the whole app of making
the fallback the default selection, and it is worth putting in front of the designer before the
dashboard is built rather than after.

**AC6 ships unsatisfied.** Recorded above and worth agreeing before implementation, not at review
time.

**The average-per-day and days-left readings are choices the mock contradicts.** If the designer
meant days in the period, two tiles change. Cheap to change, expensive to discover after the
frontend is built on it.

**Both generated artifacts conflict with both neighbours.** Take the parent's version and re-run
`npm run api:sync`; never hand-edit either.
