# Insight generation service with content rules

**Ticket:** PET-40 · **Branch:** `feat/PET-40-insight-generation` · **Written:** 2026-08-05

**Stack position:** top of a two-branch stack, based on `feat/PET-41-insight-storage-and-read`. It
writes into the `insight_sets`/`insights` tables PET-41 defines and drives them through the
`generating` → `ready`/`failed` lifecycle PET-41's read resolves. It cannot be reviewed meaningfully
until PET-41 merges.

## Context

One asynchronous generate operation turns a user's real transactions into a monthly summary banner
plus four insight cards (INS-2, INS-3, INS-4). The four designed cards are **content rules**, not
separate UI: a category over its cap, a month-over-month comparison, an end-of-month projection
against the budget, and recurring-merchant detection. Each card carries a tone mapping to the Status
palette (warning, positive, info, neutral). The summary banner states the month, a headline and a
body referencing spent, budget and days left.

Generation is asynchronous and failure is not designed, so on failure the previous set stays intact
(INS-6, A26). What triggers the very first generation is not designed; the empty-state copy implies
logging expenses does (A27) - this branch provides the `POST` trigger and leaves *who calls it* to
the frontend and a later decision.

**Figma:** the content behind [14 AI Insights](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=14-0).

## What this branch inherits from PET-41

Nothing here re-implements storage or the read.

- **The `insight_sets` / `insights` tables** and their `generating`/`ready`/`failed` lifecycle.
- **`InsightsService`** and its `getSet`/`latestReadyTeaser` composition surface.
- **The state model**: a run becomes visible as content only when its row reaches `ready`; a
  `failed` row leaves the previous ready set as the read's answer. This branch's whole job is to
  move rows through that lifecycle correctly.

It also composes, as the dashboard does:

- **`CategoriesService`** - `currentWindow`/`previousWindow`, the per-category stats (spent, cap,
  over amount) and the monthly budget. The over-cap and month-over-month rules are built on these.
- **`TransactionsService`** - the current period's transactions for the summary and projection, and
  history with no date predicate for recurring-merchant detection.

## Decisions made

### 1. Rule-based generation now, behind an `InsightGenerator` seam for a future LLM

The epic brands this "AI Insights", but every AC and all four content rules are deterministic
detectors with exact worded outputs ("$312 of $300 - $12 over", "Transport is down 22%"). This
branch implements them as rules and templated copy: no external API, no key, no cost, no
non-determinism, and specs that can assert AC-exact strings.

To keep the branding honest and a later swap cheap, generation sits behind an interface:

- `InsightGenerator { generate(userId): Promise<GeneratedSet> }` - the seam.
- `RuleBasedInsightGenerator` - the implementation this branch ships, composing the two services.

A future `LlmInsightGenerator` can replace it without touching PET-41's storage, the read, the
`POST` trigger, or the frontend. The provider is bound in `InsightsModule`, so swapping is a one-line
provider change plus the new class. This is the "rules now, LLM-ready seam" shape agreed at planning.

### 2. Generation is genuinely asynchronous, following the auth floated-work pattern

The design requires the `generating` state to be **observable** - the page shows skeletons while a
run is in flight (INS-5). A synchronous generate would never let a concurrent read see `generating`.
So `POST /api/insights/generate` returns **202** immediately after inserting a `generating` row,
then floats the actual generation with a `.catch` that logs, exactly the shape `AuthService` uses
for issuing links. The rule-based work is fast, but the async *lifecycle* is a design contract, not
a performance workaround, and it is honoured regardless.

### 3. One run in flight at a time; a second request while generating is a 409

Regenerate is disabled while a run is in flight (A26), so two concurrent runs are a state the design
does not produce. The trigger enforces it server-side: if a `generating` row already exists, `POST
/api/insights/generate` answers **409** rather than starting a second run. This keeps the "newest
generating row" the read keys on unambiguous and avoids two floated writers racing on one cached
connection.

### 4. The set and its cards are written in one transaction, on completion

When generation finishes, the `generating` row is updated to `ready` with its rendered content and
its four cards are inserted, in a single `db.transaction()`. One transaction with several inserts is
fine on the embedded driver - what it refuses is *overlapping* transactions, which decision 3's
single-run rule already prevents. On failure the row is set to `failed` in one statement and nothing
else is touched, so the previous ready set stays the read's answer (AC6).

### 5. The four content rules

Each produces at most one card; a rule with nothing to say is omitted rather than emitting an empty
card, so an account may generate fewer than four (the frontend renders what it gets). Tone is set
per rule.

- **Over-cap (warning).** From `CategoriesService`'s current-period stats, the category furthest
  over its cap. Names the category with spent, cap and over amount ("Dining out is over budget", "$312
  of $300 - $12 over"). Uncapped categories are ineligible. If nothing is over cap, omitted.
- **Month-over-month (positive / neutral).** The category with the largest signed change between the
  current and previous window (`previousWindow`), reporting direction and size ("Transport is down
  22%", "You spent $63 less than September"). Tone is positive for a decrease, neutral for an
  increase. Needs both windows summed per category.
- **End-of-month projection (info).** Spend-to-date extrapolated over the period by the elapsed-days
  rate the dashboard already uses, compared to the monthly budget ("At your current pace you'll land
  around $1,980 - just under your $2,000 target"). Reuses the `averagePerDay` reasoning rather than
  a second definition of pace.
- **Recurring-merchant detection (neutral).** Merchants appearing in multiple months (history read
  with **no** date predicate, grouped by merchant), reported with a count and combined monthly total
  ("3 recurring subscriptions", "Netflix, Spotify and iCloud total $37/mo"). Recurrence is defined in
  the plan below so it is testable rather than fuzzy.

### 6. Recurrence is a stated rule, not a guess

"Recurring" needs a definition a spec can pin. A merchant counts as recurring when it appears in **at
least three distinct calendar months** with roughly one charge per month; the combined monthly total
is the mean of its recent monthly charges. The threshold and the "monthly total" definition are
written here so the spec asserts them directly and a reviewer can argue the number rather than
reverse-engineer it. This is the rule most likely to be tuned, so it lives behind decision 1's seam
where an LLM could later replace it wholesale.

### 7. The summary banner references real figures

The banner is generated last from the same aggregates: the month label, a headline, and a body
sentence naming spent, budget and days left (AC1). It is rendered prose stored on the set row per
PET-41 decision 8, not re-derived on read.

### 8. An empty account produces no set

With no transactions, generation produces nothing and the read's `empty` state stands (AC7). The
trigger returns 202 and the floated run exits without inserting a `ready` row (it may skip the
`generating` row entirely, or insert-then-remove it - the plan inserts none, so a read during a
no-op generate still reports `empty`). The empty-state frame and its "Add transaction" primary
button are the frontend's (PET-44); this branch just declines to fabricate a set.

## Endpoint

One operation added to `src/insights/` (the module PET-41 created).

| Method | Path                     | Purpose                                          |
| ------ | ------------------------ | ------------------------------------------------ |
| `POST` | `/api/insights/generate` | Start an async generation run; 202, or 409 if one is already in flight |

No request body: the run is over the caller's own current data, resolved from the session, the same
id-less shape as the rest of this feature.

## Tasks

- [ ] **Define the `InsightGenerator` interface** and bind `RuleBasedInsightGenerator` as its
      provider in `InsightsModule` (decision 1)
- [ ] **Add the `POST /api/insights/generate` trigger**: insert the `generating` row, return 202,
      float the run with a logging `.catch`; 409 when a run is already in flight (decisions 2, 3)
- [ ] **Implement the over-cap rule** from `CategoriesService` current-period stats (decision 5)
- [ ] **Implement the month-over-month rule** across current and previous windows (decision 5)
- [ ] **Implement the projection rule** reusing the elapsed-days pace (decision 5)
- [ ] **Implement recurring-merchant detection** over undated history with the stated recurrence
      rule (decisions 5, 6)
- [ ] **Generate the summary banner** from the aggregates (decision 7)
- [ ] **Write the completion path**: update the row to `ready` and insert the four cards in one
      transaction; the failure path sets `failed` and touches nothing else (decision 4)
- [ ] **Handle the empty account**: no set produced, read still reports empty (decision 8)
- [ ] **Write the service spec** covering AC1-AC7: each of the four rules against a seeded account,
      the summary figures, a failed run leaving the previous ready set intact, an empty account
      producing nothing, and the 409 on a second concurrent run
- [ ] **Add e2e coverage**: trigger a generate, read back a ready set, and confirm a failed run
      leaves the previous set readable
- [ ] **Run `npm run api:sync`** from the repo root and commit both artifacts
- [ ] **Document it**: extend `backend/CLAUDE.md`'s `## Insights` section with the generation
      lifecycle, the four rules, the `InsightGenerator` seam and the single-run 409; note the
      recurrence threshold; update root `CLAUDE.md`'s trigger row if the generate endpoint needs its
      own; record the LLM-swap seam in `docs/TODO.md`
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**It cannot be reviewed until PET-41 merges**, the accepted cost of stacking storage under
generation. Both generated artifacts (`openapi.json`, `api.d.ts`) conflict with PET-41's; take the
parent's version and re-run `npm run api:sync`, never hand-edit.

**Floated writes on one cached connection are the delicate part.** Decision 3's single-run rule and
decision 4's single completion transaction exist to keep two writers off one connection; a change
that relaxes either reopens the overlapping-transaction failure the driver punishes.

**The content-rule copy is a product decision surfacing as strings.** The exact wording and the
recurrence threshold (decision 6) are the parts most likely to be tuned. They are the reason for the
`InsightGenerator` seam: tuning or replacing them, including with an LLM, must not touch storage, the
read, or the frontend.

**Projection and month-over-month depend on choices the dashboard already made** (elapsed-days pace,
previous-window aggregation). Reuse them rather than defining a second version, or two screens will
disagree the first time a definition moves.
