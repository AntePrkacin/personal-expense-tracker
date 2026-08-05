# Insight set storage and read endpoint

**Ticket:** PET-41 · **Branch:** `feat/PET-41-insight-storage-and-read` · **Written:** 2026-08-05

**Stack position:** base of a two-branch stack, cut from `main`. PET-40 (insight generation) is
stacked on top and depends on the table, the service and the state model this branch defines. This
branch stores and reads a set; it does not generate one, so its specs seed rows directly.

## Context

A generated insight set is kept so reopening the AI Insights page shows the same analysis instead
of regenerating on every visit. One read serves three consumers: the AI Insights page in all three
of its designed states (14 ready, 15 generating, 16 empty), and the dashboard teaser card, which
shows content from the most recent set (DSH-9, A27).

A set holds a month label, a summary headline and body, a list of insights (each with a tone, title
and body), a generated-at timestamp, and a lifecycle the read reports as `empty`, `generating` or
`ready` to match the three frames. Because generation is asynchronous (PET-40), the read must be
able to report that a run is in flight so the page can render skeletons (INS-5, INS-6). Failure is
not designed: a failed run leaves the previous set readable (A26).

This ticket is blocked by PET-50 (the API contract pipeline), which is Done.

**Figma:** the data behind [14 AI Insights](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=14-0),
[15 AI Insights - Generating](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=15-0)
and [16 AI Insights - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=16-0).

## What this branch owns, and what it defers to PET-40

This branch is `getInsightSet`: the schema, the read endpoint, the state resolution and the service
methods other features compose. It writes no generated content. PET-40 is `generateInsights`: the
`POST` trigger, the four content rules and the writes that move a set from `generating` to `ready`.
The split follows the epic's own two backend operations, and it is why storage is the base branch:
generation writes into a shape that must already exist.

For its own tests this branch inserts `insight_sets` rows directly (a `generating` row, a `ready`
set with cards, a `failed` row), exactly as PET-20 tested the dashboard against seeded transactions
without owning the write path.

## Decisions made

### 1. Two tables: `insight_sets` and its child `insights`, not a JSON column

A set is a header (month label, summary, timestamp, lifecycle) with one-to-many cards. The repo's
persistence conventions are typed columns throughout - money in `*_cents`, dates as `text`, no JSON
column anywhere yet - and the epic names "four insight cards" as first-class things each carrying a
tone. A normalised child table keeps `tone` a typed, checkable column and reads cleanly in specs.

A JSON `cards` column on the set row was considered and rejected: it would be simpler to write in
one statement, but it introduces the repo's first JSON column for content that is genuinely
relational, and it would push tone/title/body validation out of the schema and into application
code. The one-statement write is not worth a new persistence pattern here.

Both tables are user-scope (`backend/drizzle/user/`), carry UUIDv7 text primary keys
(`src/common/ids.ts`), instants as `integer` epoch-ms, and the nullable `deleted_at` every table in
this database carries, with reads filtering it out.

### 2. The stored lifecycle is a row `status`; the API `state` is derived at read time

Each `insight_sets` row carries a `status` of `generating`, `ready` or `failed`. The API's three
states are **derived** from the rows, never stored as an API field:

- a newest row with `status = 'generating'` present → the read reports `state: 'generating'`;
- else a `ready` set exists → `state: 'ready'`;
- else → `state: 'empty'`.

Keeping the derivation out of storage is what makes the failure path fall out for free (decision 4)
and keeps a regenerate-in-flight (a `generating` row sitting above the last `ready` one) expressible
without a second "is a run happening" flag that could disagree with the rows.

### 3. The read always carries the latest *ready* content, and `state` is separate from it

`GET /api/insights` returns `{ state, monthLabel, summary, insights, generatedAt }` where the
content fields track the most recent **`ready`** set, and `state` reports whether a run is in
flight. This deliberately decouples "what is the last good content" from "is a run happening":

- On a regenerate, the insights page renders skeletons because `state` is `generating`, and it
  ignores the content payload while it does - a frontend decision (PET-42/43), not the backend's.
- The dashboard teaser, reading the same set, keeps showing the last ready content during a
  regenerate rather than blanking, which is what DSH-9's "most recent set" should mean while a new
  one is still being produced.
- `empty` carries null content and an empty `insights` array.

### 4. A failed run leaves the previous set readable, with no restore step

AC6 and A26 require that a failed run leaves the previous set intact. Because the read resolves
content from the newest `ready` row (decision 3) and a failed run's row is `failed` rather than
`ready`, this is automatic: the failed row is skipped, the read falls back to the last `ready` set,
and no content was ever overwritten because a run only becomes visible as content when it reaches
`ready`. PET-40 marks a failed run's row `failed` (or tombstones it) rather than mutating the
previous set.

### 5. Cards are ordered, and the order is stored

The four cards render in a designed order (INS-4). `insights` carries a `sort_order` integer so the
read returns them as generated rather than in whatever order the query planner picks - the same
reason `transactions` list reads carry an explicit tiebreak.

### 6. The dashboard `insight` field is filled as a string, honouring the committed contract

`DashboardResponseDto.insight` was shipped by PET-20 as `string | null`, documented as always null
until this ticket. This branch fills it with the latest ready set's **summary headline** - literally
"content from the most recent set" (DSH-9) - which satisfies the teaser with no contract change and
no second `api:sync` churn, exactly the outcome PET-20 set up. `DashboardModule` imports
`InsightsModule` and `DashboardService` composes `InsightsService`, replacing the `insight: null`
line and its comment.

**Open question for the designer, recorded not answered:** if frame 04's teaser card needs a tone
or a title as well as a line of text, `insight` would have to be promoted from `string` to a small
object - a cheap contract change, but a change. This branch does not promote it unasked; the
frontend teaser ticket (PET-25) is where that need would surface, and it is a one-field follow-up if
it does.

### 7. One read endpoint, singular resource, no id

`GET /api/insights` returns the one set that matters for the caller, the same singular-resource
shape as `/api/profile` and `/api/dashboard`: exactly one meaningful set per user, resolved from the
session, no id in the path and no cross-user access to police. There is no 404 - a verified session
implies a provisioned database, and `empty` is a first-class state rather than a missing resource.

### 8. The stored month label and summary are rendered content, not live-derived

Unlike every other read in this app, an insight set is a **snapshot** of generated prose. The month
label ("October 2025"), the summary sentences and each card's body are stored as rendered strings,
because that is what a persisted generation *is* - re-reading it must return byte-for-byte what was
generated (AC2), not re-derive it from data that has since moved. This is the one place the "format
at the DTO, never store rendered text" convention does not apply, and the plan says so explicitly so
a later reader does not "fix" it.

## Schema

Two user-scope tables in `src/database/user/schema.ts`, migration generated into
`backend/drizzle/user/` with `drizzle-kit generate` (never hand-written), applied on first open of
each user database per the persistence conventions.

`insight_sets`

| Column             | Type                     | Notes                                             |
| ------------------ | ------------------------ | ------------------------------------------------- |
| `id`               | text PK (UUIDv7)         | `src/common/ids.ts`                               |
| `status`           | text                     | `generating` \| `ready` \| `failed`               |
| `month_label`      | text, nullable           | rendered, set when `ready`                        |
| `summary_headline` | text, nullable           | rendered, set when `ready`                        |
| `summary_body`     | text, nullable           | rendered, set when `ready`                        |
| `generated_at`     | integer ms, nullable     | set when the row reaches `ready`                  |
| `created_at`       | integer ms               | `$defaultFn`, when the run started                |
| `deleted_at`       | integer ms, nullable     | tombstone convention                              |

`insights`

| Column        | Type                 | Notes                                    |
| ------------- | -------------------- | ---------------------------------------- |
| `id`          | text PK (UUIDv7)     |                                          |
| `set_id`      | text FK → insight_sets.id |                                     |
| `tone`        | text                 | `warning` \| `positive` \| `info` \| `neutral` |
| `title`       | text                 | rendered                                 |
| `body`        | text                 | rendered                                 |
| `sort_order`  | integer              | render order (decision 5)                |
| `created_at`  | integer ms           | `$defaultFn`                             |
| `deleted_at`  | integer ms, nullable | tombstone convention                     |

The `generating`/`failed` rows carry null content columns, which is why they are nullable: a run's
row exists before its content does. This satisfies the user-scope migration rule that a new column
must be nullable or defaulted - here the whole additive table is new, so there is no backfill
hazard, but the content columns are nullable by design rather than by accident.

## Endpoint and service

One operation, one new module `backend/src/insights/`, following `src/dashboard/` and `src/profile/`
in shape.

| Method | Path            | Purpose                                             |
| ------ | --------------- | --------------------------------------------------- |
| `GET`  | `/api/insights` | The latest set with its derived `empty`/`generating`/`ready` state |

`InsightsService` exposes, for PET-40 and the dashboard to compose:

- `getSet(userId)` - resolves the state and the latest ready content into `InsightSetResponseDto`.
- `latestReadyTeaser(userId)` - the summary headline string for the dashboard `insight` field, or
  `null` when there is no ready set.

`InsightsModule` exports `InsightsService`, the same reason `CategoriesModule` and
`TransactionsModule` export theirs: `DashboardModule` (and PET-40) inject it.

## Tasks

- [ ] **Add the `insight_sets` and `insights` tables** to `src/database/user/schema.ts`, then
      generate the user-scope migration with `drizzle-kit generate` and commit both `migration.sql`
      and `snapshot.json` (never hand-edit them)
- [ ] **Scaffold `src/insights/`**: module, controller, service and response DTOs, registered in
      `AppModule`
- [ ] **Implement the read**: derive `empty`/`generating`/`ready` from the rows (decision 2),
      resolve content from the newest `ready` set (decision 3), return cards in `sort_order`
- [ ] **Expose `getSet` and `latestReadyTeaser`** as the composition surface for PET-40 and the
      dashboard, and export `InsightsService` from `InsightsModule`
- [ ] **Fill the dashboard teaser**: `DashboardModule` imports `InsightsModule`, `DashboardService`
      composes `InsightsService.latestReadyTeaser`, replacing the `insight: null` line (decision 6)
- [ ] **Write the service spec** covering AC1-AC6: a ready set round-tripping unchanged, a
      `generating` row reporting the generating state while a prior ready set's content still comes
      back, an account that never generated reporting empty, the newest ready set winning over an
      older one, and a `failed` row leaving the previous ready set intact
- [ ] **Add e2e coverage** for the three states through `GET /api/insights`, plus the dashboard
      teaser reading a seeded ready set
- [ ] **Run `npm run api:sync`** from the repo root and commit both artifacts
- [ ] **Document it**: a `## Insights` section in `backend/CLAUDE.md`, update the `## Dashboard`
      "insight is always null" paragraph to say it now reads from the latest ready set, delete the
      `## Not built here` "Insights has no table" bullet (and update the pointer note in
      `backend/src/database/CLAUDE.md`), add the trigger row in root `CLAUDE.md`, and update the
      `docs/TODO.md` note that the teaser was stubbed
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**The state model must be right before PET-40 builds writes on it.** The `generating`/`ready`/
`failed` row statuses and the "read resolves content from the newest ready row" rule are the
contract PET-40's generate operation targets. Getting decision 4 wrong - for instance letting a
generating run overwrite the previous set's content in place - would break AC6 the first time a run
failed, and would do it on PET-40's branch where it looks like a generation bug.

**The dashboard teaser is a string by inheritance, not by design.** Decision 6 honours PET-20's
committed `string | null`, but if the teaser card design wants tone or title, that becomes a
contract change. Worth confirming against frame 04 before PET-25 rather than after.

**Storing rendered prose is deliberate and unusual for this repo** (decision 8). A reviewer used to
the "never store rendered text" convention should read that decision before flagging it.
