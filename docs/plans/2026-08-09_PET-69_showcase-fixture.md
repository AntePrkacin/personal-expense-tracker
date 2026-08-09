# Split the showcase seed into a committed fixture and a date-syncing seeder (PET-69)

Turns the showcase seed from one command that invents data and writes it into three: a generator
that produces a committed fixture, a seeder that resolves that fixture's dates against today and
writes it, and a checker that measures the result without a database. Also widens the history from
18 months to 36.

Tracked as [PET-69](https://decode.atlassian.net/browse/PET-69), under the Leftovers epic.

## Status

**Landed: the restructure, the checker and the unit tests.** `plan.ts`, `generate.ts`, `dates.ts`
and `fixture.ts` exist, `generate()` is pure and reproducible from a seed, `seed-showcase.ts` is a
resolver rather than a generator, `showcase:check` reports, and 50 specs cover the pure functions
and the asserts.

**Not landed: the fixture file itself.** There is no `fixture.json` and no command A, so the seeder
still calls `generate()` in-process. It is already deterministic day-to-day because the seed is
fixed, but the data is not yet a reviewable committed artifact, and the history is still 18 months
rather than 36. That is the rest of this plan.

**One thing came along that the slice did not plan to touch.** The date model had to, because it is
forced: a pure generator cannot know what day it is, so it cannot scale the current month by
`elapsed`, so the current month must be emitted whole and truncated by the seeder. That is the
design this plan already called for; it simply could not be deferred past the extraction.

## What the checker found at 200 trials

Recorded here because it is the tuning input the model change needs, and because it is exactly the
class of thing one seeded account cannot show. Across 200 generated accounts, most categories go
over their cap in 4-11% of months, which is the intended "occasionally over". Two do not:

| Category | Mean spend vs cap | Months over cap |
| --- | --- | --- |
| Gifts | 67.8% | **25.7%** |
| Uncategorized | 87.6% | **22.4%** |

Both average comfortably under cap and still cross it a quarter of the time, because their caps are
small in absolute terms ($100 and $135) so ordinary variance clears them easily. A single seeded
account showed this as 1 month in 6, which reads as noise. It is not noise, and the fix is a cap
rebalance, deferred to the model change rather than done in the extraction.

This is a follow-on from the realism work already on this branch (fixed monthly bills, log-normal
amounts, category weights, uneven caps, a head-and-tail merchant pool). That work stays exactly as
it is; this plan only changes **when** it runs and **where** its output lives.

## Why

Today `mise run seed:showcase` calls faker at seed time, so every run produces a different account.
That is fine for "fill a database with something" and wrong for a showcase: two people demoing the
app see different numbers, a screenshot cannot be reproduced, and a change to the generation model
cannot be reviewed as a diff because there is no artifact to diff.

Splitting the two makes the data a reviewable, committed artifact and makes seeding a mechanical,
deterministic step.

## The date model, which is the crux

The fixture stores no absolute dates. Each transaction carries the **calendar month** it belongs to
(0-11), which **occurrence** of that month it is (0 is the most recent), and the `day` (1-28). The
seeder turns that into `monthsAgo` against today and then into a date, so the account is always
"three years ending today" whenever it is run.

**Keying on the calendar month rather than on `monthsAgo` is what makes the rest of this plan
possible**, and it is worth reading the arithmetic rather than trusting it:

```
monthsAgo = ((anchorMonth - month + 12) % 12) + 12 * occurrence
```

With `anchorMonth` set to today's month, this is a **bijection onto 0..35**. Checked by hand for
`anchorMonth = 7` (August): `(Aug,0) -> 0`, `(Sep,0) -> 11`, `(Aug,2) -> 24`, `(Sep,2) -> 35`. Every
one of the 36 slots maps to exactly one month of history, and no two collide.

It requires `MONTHS % 12 === 0`, which 36 satisfies and 18 did not. Assert it rather than assuming
it, because the failure is a silently lopsided account rather than an error.

The payoff is that **the generator knows each slot's calendar month directly**, so anything
calendar-shaped - which months go over budget, what each month's spending band is - is decided
during generation with no clock involved and no work deferred to the seeder.

**The pro-rata machinery disappears.** Today the current month is scaled by
`elapsed = lastDay / MAX_DAY_OF_MONTH`, applied to both the transaction count and the target spend.
That exists only because generation and seeding happen at the same instant. Once they are split,
the generator emits **every month in full**, including month zero, and the seeder drops rows where
`monthsAgo === 0 && day > today.day`. Because transactions are spread across days 1-28, truncation
yields proportionally fewer of them by itself. Pro-rata stops being code and becomes a consequence.

Two consequences worth stating, both deliberate:

- **Today's transactions are included.** An earlier draft of this cut at `day < today.day` so the
  seeding day had nothing on it. That was rejected because seeding on the 1st then leaves the
  current month completely empty and the Dashboard's current-month cards with nothing to show.
- **A day-29-to-31 seeding date keeps the whole current month**, since `MAX_DAY_OF_MONTH` is 28 and
  the generator never emits a day above it. No clamping case, same reason the profile constrains
  `monthStartDay` to 1-28.

## Every month has a band, and the year has a shape

Two defects in the data, both measured rather than guessed, and both fixed by the same table.

**The bad months follow no pattern.** Four `monthsAgo` values are picked at random, so a demo where
somebody asks "why is this month red" has no answer beyond "the dice".

**The good months never approach the budget.** The 13 under-budget months run **70.7% to 89.9%** of
budget, mean **78.6%**. Months above 90%: zero. Above 95%: zero. So the account jumps from 89.9%
straight to 105.7% with nothing in between, and reads as somebody who set their budget 20% too high
rather than somebody who budgets.

Both go away if the year has a deliberate shape. Each calendar month gets a band, and three of them
sit above 100%:

| Month | Band | Why |
| --- | --- | --- |
| Dec | 108-115% | Christmas |
| Jul | 105-112% | holiday |
| Aug | 105-112% | holiday |
| May | 97-99% | the near-miss showcase - the month they *just* made it |
| Jun | 92-97% | pre-holiday creep |
| Nov | 90-96% | pre-Christmas |
| Mar | 86-93% | |
| Sep | 84-92% | |
| Oct | 84-92% | |
| Apr | 80-88% | |
| Feb | 76-85% | post-Christmas recovery |
| Jan | 74-83% | post-Christmas recovery |

**Three over-budget months, not four.** June was dropped from the earlier draft: four of twelve is a
third of the year, and every over-budget month costs cap headroom (below). Nine of the 36 months end
up over budget, against 4 of 17 today.

An over-budget month is still made over budget by **one major plus one minor irregular expense** on
top of ordinary spending, not by inflating every category 15% - that is both how real months go over
and what leaves one or two categories visibly over their caps for the over-cap insight to find.

### The constraint that governs the tuning

This is arithmetic, not preference. Caps sum to exactly the budget, so **weighted category
utilisation always equals total spend as a share of budget.** The bands above average **93.5%**,
which leaves every category only 6.5% of headroom against ordinary variance.

That is tighter than the 9% which already produced the failure this branch fixed once - Dining out
over its cap in twelve months of eighteen - and `showcase:check --trials=200` already reports Gifts
over cap in **25.7%** of months and Uncategorized in **22.4%** at today's far gentler 86% mean.

So two things are required rather than optional, and the checker is the instrument for both:

- **Shave the mid-table bands** by 2-3 points until the mean lands nearer 91%.
- **Rebalance the caps non-uniformly.** Lumpy low-value categories need proportionally more headroom
  than steady high-value ones. Target 4-11% of months over cap for every category, which is where
  the other eleven already sit.

One thing the shape buys for free: seeding **during** a target month puts a large irregular expense
partway through the current month, so the Dashboard opens on "on pace to go over" rather than on a
quiet month. Better than anything the current seed can produce, and August is a target month.

## Decisions taken

| Decision | Choice | Why |
| --- | --- | --- |
| Fixture committed? | **Yes** | Determinism is only worth having if it is shared. Becomes a fifth entry in root `CLAUDE.md`'s never-hand-edit list. |
| Absolute or relative dates | **Relative** | An absolute date ages; the whole point is that the account is always current. |
| Keyed on `monthsAgo` or on the calendar | **Calendar** (`month`, `occurrence`) | The only key that lets December always be December. Costs `MONTHS % 12 === 0`; buys the whole month-shape table with no seed-time work. |
| Ids in the fixture | **No**, generated at seed time | Ids are opaque, and baking three-year-old UUIDv7s (which embed a timestamp) in is worse than useless. |
| Categories by name or id | **Name** | Ids are per-account and created at provisioning. |
| Regeneration reproducible? | **Yes**, `faker.seed(N)` with a fixed default | Makes a fixture diff mean "the model changed", not "the dice moved". Already possible: every randomness source goes through faker, with no `Math.random` anywhere. |
| JSON layout | One transaction per line | `JSON.stringify(x, null, 2)` turns 2,200 transactions into ~13,000 lines; one per line keeps it diffable at ~2,200. |
| Does command A need a database? | **No** | It generates against `CATEGORY_PLANS`' own key list. Validation against the real templates moves to seed time. |

## What the fixture holds

The complete description of the account, so the seeder is purely mechanical:

```
{
  "seed": 20260809,
  "months": 36,
  "profile": { firstName, lastName, currency, monthlyBudgetCents, monthStartDay },
  "categories": [ { "name": "Groceries", "capCents": 70000 }, ... ],
  "transactions": [ { "month": 11, "occurrence": 2, "day": 1, "merchant": "...", "category": "...", "amountCents": 145000 }, ... ]
}
```

No `generatedAt` field. A timestamp would change on every regeneration and destroy the
byte-identical property the fixed faker seed exists to give.

Transactions are sorted by `occurrence` descending, then `month`, then `day`, then `merchant`, so a
regeneration diff is local rather than scattered.

## Architecture

```
backend/src/scripts/
  seed-showcase.env.ts                 unchanged
  seed-showcase.ts                     command B: fixture -> database
  build-showcase-fixture.ts            command A entry point, no Nest
  check-showcase-fixture.ts            command C entry point, no Nest
  showcase/
    plan.ts                            the model: constants, tables, asserts
    generate.ts                        pure: plan + seeded faker -> Fixture
    fixture.ts                         the Fixture type, load, save, serialise
    check.ts                           pure: Fixture -> a report
    fixture.json                       the committed artifact
```

| | Command | What it does |
| --- | --- | --- |
| **A** | `mise run showcase:fixture` | Seeded faker plus the plan tables produce `fixture.json`. No Nest, no database, milliseconds. |
| **B** | `mise run seed:showcase` / `:cloud` | Reads the fixture, resolves dates against today, provisions the account as now, writes. No faker. |
| **C** | `mise run showcase:check` | Measures the committed fixture, or `--trials=N` fresh generations, and reports. No database. |

**What moves into `plan.ts`**: `BUDGET_CENTS`, `MONTHS`, `OVER_BUDGET_MONTHS`, `ORDINARY_*`,
`OVER_BUDGET_FLOOR_CENTS`, `MIN/MAX_TRANSACTIONS`, `MIN_TRANSACTION_CENTS`, `MAX_DAY_OF_MONTH`,
`FALLBACK_CATEGORY`, `FIXED_BILLS`, `CATEGORY_PLANS`, `MAJOR_IRREGULAR`, `MINOR_IRREGULAR`, and the
three assert functions.

**What moves into `generate.ts`**: `standardNormal`, `drawAmounts`, `pickMerchant`, `shareOut`, and
the month loop.

**What stays in `seed-showcase.ts`**: `SHOWCASE_EMAIL`, `onboardingPayload`, `ensureShowcaseUser`,
`parseDate`, `dateMonthsAgo`, `generateInsights` and `bootstrap`. It loses every trace of faker.

`ONBOARDING_PROFILE` stops being a constant and is derived from `fixture.profile`, so the budget
the caps were computed against and the budget written to the account cannot disagree.

## Checking the model, which is a third command

**The defects this work has actually produced were distributional, and no unit test can see one.**
A `$0.01` transaction is catchable by asserting a floor; `$1,300` of Personal care at 650% of its
cap, or Dining out over its cap in twelve months of eighteen, are not. Both were found by seeding
an account and querying SQLite by hand, which is neither repeatable nor something anybody will
remember to do.

Splitting generation out makes that cheap, because **`generate()` is pure**: a checker needs no
database, no Nest and no seeding, and it does not even need the fixture file. `showcase:check`
therefore does two things:

- **Against the committed fixture** - reports what will actually be seeded. This is the one to run
  after regenerating.
- **Against N fresh generations** (`--trials=200`) - reports the *distribution of outcomes* rather
  than one sample. This is the part that matters: whether Dining out goes over its cap in 5% of
  months or 60% is a property of the model, and one seeded account cannot tell you which.

What it reports, chosen because each line corresponds to a defect that has really happened here or
to an invariant that is silently breakable:

| Group | Reported |
| --- | --- |
| Amounts | min, mean, p10/25/50/75/90/99, max; share under $10; share over $200 |
| Months | total per month against budget; how many complete months are over; the mean as a share of budget |
| Categories | mean monthly spend against cap; **share of months each category exceeds its cap**; transactions per month; mean transaction size |
| Shocks | the largest multiple of its cap any category-month reaches |
| Merchants | distinct count; the head's rate per month; how many appear twice or fewer; that every fixed bill appears exactly once per month |
| Structure | every `day` in 1-28, every `monthsAgo` in 0-35, caps summing to the budget |

**It reports rather than asserts, deliberately.** Thresholds cannot be chosen before the numbers
are known, and a checker that fails the build while the model is being tuned is a checker people
delete. Once the numbers have settled, the handful of lines worth defending become assertions in a
spec - and by then the fixture is committed, so they can be exact rather than statistical.

## What the seeder validates

All three fail loudly, because a showcase that cannot tell its own story should say so:

1. **Every category the fixture names exists in the provisioned account.** A rename or removal in
   `category_templates` lands here. The message must name the category and say
   `mise run showcase:fixture`.
2. **Every category in the account has a fixture entry.** A newly added template lands here, and it
   matters because the caps would otherwise no longer sum to the budget.
3. **The fixture's caps sum to its own profile budget.**

## Behaviour changes to accept

### When the fixture must be rebuilt

**This section is the answer to the question that decided the trade-off, and it must be copied
into `docs/guides/seeding-dummy-data.md` when that guide is rewritten.** It is the first thing
anyone hitting a seed failure will need, and a plan file is not where they will look for it.

Today the seed reads the live category templates out of central at run time, so an admin adding or
renaming a category is picked up automatically on the next run. **A fixture cannot do that and stay
deterministic**, which is the whole point of the change: the data has to be fixed in advance, so it
cannot also follow a table that moves. Determinism costs exactly that adaptability, and the cost is
accepted here deliberately rather than discovered later.

What softens it is that the fixture keys on category **name** alone, so most template edits are
invisible to it:

| Change to a category template | Rebuild needed? |
| --- | --- |
| Category added | **Yes**, and the seeder refuses until you do - the caps would otherwise stop summing to the budget |
| Category renamed | **Yes**, and it refuses - those transactions would have nowhere to go |
| Category removed | **Yes**, and it refuses - same reason |
| Colour changed | No |
| Icon changed | No |
| Description changed | No |
| `enabled` flag toggled | No |

All three failures are loud, name the offending category, and say `mise run showcase:fixture`. None
of them can silently seed a subtly wrong account, which is the property that makes the trade-off
acceptable at all.

For scale: `CATEGORY_SEED` has changed twice in this project's life. PET-64 created it, and PET-65
was an icon-only pass, which by this table would not have needed a rebuild.

### Other changes

- **Scale roughly doubles**: ~2,200 transactions over 36 months, and over-budget months go from
  4-of-17 to **9-of-36** - three calendar months, three times each. A cloud seed pushes ~2,200 rows,
  not the ~1,200 the guide currently states.

## Checklist

**Restructure**

- [x] Create `backend/src/scripts/showcase/plan.ts` and move the constants, the three tables and
      the three assert functions into it, unchanged.
- [x] Create `backend/src/scripts/showcase/fixture.ts` with the `Fixture` type, a `load()` that
      reads `fixture.json` relative to `__dirname`, and a `save()` that writes it one transaction
      per line, sorted.
- [x] Create `backend/src/scripts/showcase/generate.ts` holding the four helpers and the month
      loop, returning a `Fixture`. Delete the `elapsed` scaling: every month is generated in full.
- [ ] Set `MONTHS` to 36, add `OCCURRENCES = MONTHS / 12`, and assert the multiple. 18 would have
      silently produced a lopsided year.
- [ ] Add `MONTH_TARGETS`, twelve entries of `{ minPercent, maxPercent, overBudget }` holding the
      band table above. Assert there are twelve and that exactly three are over budget.
- [ ] Delete `OVER_BUDGET_MONTHS`, `ORDINARY_MIN_CENTS`, `ORDINARY_MAX_CENTS`,
      `ORDINARY_OVER_MIN_CENTS` and `OVER_BUDGET_FLOOR_CENTS`. All five exist only to describe one
      global range and a random draw, which `MONTH_TARGETS` replaces.
- [ ] Rewrite the generator's loop as calendar month x occurrence rather than `monthsAgo`, drawing
      each month's target from its own band and applying the irregular pair only where
      `overBudget`.
- [ ] Rewrite `assertShocksCanClearBudget` against the new bands: the gap a pair must close is now
      `max(band) - ordinaryLevel` for the three over-budget months, roughly $1,250 against today's
      $850 capacity. Widen the irregular ranges until it passes.
- [ ] Shave the mid-table bands until `showcase:check --trials=200` puts the mean near 91% rather
      than the 93.5% the table averages as written.
- [ ] Rebalance the caps **non-uniformly** against the same command, targeting 4-11% of months over
      cap for every category. Lumpy low-value categories need proportionally more headroom than
      steady high-value ones; Gifts and Uncategorized are at 25.7% and 22.4% today and the band
      change makes it worse before it makes it better.
- [ ] Add `monthsAgoFor(month, occurrence, anchorMonth)` to `showcase/dates.ts`, with a spec proving
      it is a bijection onto `0..MONTHS-1` for **every** anchor month 0-11, not just for today's.

**Command A**

- [ ] Create `backend/src/scripts/build-showcase-fixture.ts`: parse an optional `--seed=N`, call
      `faker.seed()`, run the asserts, generate, save, and print the row count and the seed used.
      No Nest, no database, no `.env`.
- [ ] Add the `showcase:fixture` task to `mise.toml`, with a comment saying what regenerating means
      (a committed artifact changes, so it belongs in its own commit).
- [ ] Run it and commit `fixture.json`.

**Command B**

- [ ] Rewrite `seed-showcase.ts` to load the fixture, derive the onboarding payload from
      `fixture.profile`, and write `fixture.categories`' caps.
- [ ] Resolve each transaction through `monthsAgoFor(month, occurrence, today.month)` before
      `dateMonthsAgo`, replacing the `monthsAgo` the fixture no longer carries.
- [x] Resolve dates with `dateMonthsAgo(today, monthsAgo, day)` and drop rows where
      `monthsAgo === 0 && day > today.day`.
- [x] Add the three validations above.
- [x] Keep `generateInsights` exactly as PET-42-43-44 left it, and keep it last. The fixture rows
      still go straight to the `transactions` table rather than through `TransactionsService`, so
      they still emit no transaction-changed event and the set still has to be kicked by hand.
- [ ] Confirm `mise run seed:showcase` and `:cloud` still work unchanged from the caller's side.

**Command C, the checker**

- [x] Create `backend/src/scripts/showcase/check.ts` reporting the table above, taking a `Fixture`
      so it can run against either the committed file or a fresh generation.
- [x] Create `backend/src/scripts/check-showcase-fixture.ts` as its entry point, accepting
      `--trials=N` to generate and aggregate rather than read the committed fixture.
- [x] Add the `showcase:check` task to `mise.toml`.
- [x] Run it at `--trials=200` and record the resulting numbers in the PR, since they are what any
      later assertion thresholds have to be chosen from.

**Tests**

- [x] Unit-test the date resolution and the truncation, which is the only real logic left in
      command B: a fixture row at `monthsAgo: 0, day: 28` seeded on the 9th is dropped, one at
      `day: 9` is kept, one at `monthsAgo: 1, day: 28` is kept whatever the date, and a seeding day
      of the 30th keeps all 28.
- [ ] Unit-test the committed fixture's own coherence: every `category` is a `CATEGORY_PLANS` key,
      every `day` is 1-28, every `month` is 0-11, every `occurrence` is 0 to `OCCURRENCES-1`, all 36
      slots are present exactly once, and caps sum to the budget. This is the drift detector for a
      hand-edited artifact.
- [ ] Unit-test the band shape from a generated fixture: December, July and August are the only
      months over budget, and May lands between 97% and 99%. These are the two claims the whole
      change exists to make true, and neither is visible to any other test.
- [ ] Consider a CI check that regenerating from the committed seed reproduces the committed bytes,
      the same shape as the `api:sync` drift check. Recommended, but call it explicitly in the PR if
      it is left out rather than letting it be an oversight.

**Documentation**

- [ ] Rewrite `docs/guides/seeding-dummy-data.md`'s procedure for three commands rather than two,
      update "18 months" and the ~1,200-row figure throughout, and carry the month-band table into
      it - "which months are red and why" is the first thing anyone demoing will be asked.
- [ ] Copy the **"When the fixture must be rebuilt"** section above into that guide, table and
      reasoning both. Someone hitting the seeder's refusal will look in the guide, not in a plan
      file, and the table is the whole answer to "do I need to regenerate?".
- [ ] Update the two rows in `docs/guides/commands.md:77-78` and add `showcase:fixture`. That file
      owns commands per the fact-ownership table, so the numbers go there and nowhere else.
- [ ] Add `backend/src/scripts/showcase/fixture.json` to root `CLAUDE.md`'s "never hand-edit a
      generated-but-committed artifact" rule, alongside `openapi.json` and `drizzle/**`.

**Gates**

- [ ] `npm run build`, `npm run lint` and `npm test` in `backend/`; `npm run docs:check` from the
      repo root.
- [ ] Seed locally, then check the distribution holds at 36 months: the amount percentiles, the
      per-category spend against caps, the merchant head and tail, and 8 over-budget months.
- [ ] Confirm both surviving insight rules fire. The current run produces one card, and whether the
      month-over-month rule is firing at all needs checking rather than assuming.
- [ ] Seed twice on the same day and diff the two databases' transactions; they must be identical
      bar the ids.
