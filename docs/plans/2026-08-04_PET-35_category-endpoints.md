# Category endpoints with month stats and allocation

**Ticket:** PET-35 · **Branch:** `feat/PET-35-category-endpoints` · **Written:** 2026-08-04

**Stack position:** bottom of a three-branch stack, based on `main`. `feat/PET-28-transaction-reads`
sits on top of this branch and `feat/PET-20-dashboard-summary` on top of that. This branch is
first because it owns three things both of the others consume: the month-window helper, the
per-category month stats, and the guarantee that a fallback category exists.

## Context

`categories` has had a table and a starter set since the access flow landed, and nothing that
reads them. This ticket adds the whole surface: a list carrying per-category month stats, create,
update, delete, and the allocation summary the Categories screen shows above the cards.

Every figure here is derived on read and never stored, which is the same rule
`backend/src/database/user/schema.ts` already states for transactions. There is no month column
and there must not be one: a category's `spent` for a period is a SUM over `transactions.date`
read against the profile's `monthStartDay` at query time.

**Figma:** the data behind [13 Categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=36-423),
[19 Add category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-878)
and [20 Delete confirmation for category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-1078).

## Decisions made

Six things this ticket has to settle before any code. Four of them are gaps between the
acceptance criteria and what the schema actually guarantees, found by reading
`backend/src/database/user/starter-categories.ts` and the `categories` table against AC1 to AC6.

### 1. "Other" gets a real marker column, not a name match

AC4 makes "Other" the category every deletion reassigns to and AC5 makes it undeletable, so the
row has to exist for every user and has to be identifiable. Neither holds today.
`seedStarterCategories` inserts only the chips the user picked during onboarding, and picking
none is explicitly valid (A4), so a user can reach this feature with an empty `categories` table.

Identifying it by `name = 'Other'` is the obvious shortcut and it is wrong in both directions
once this ticket ships: `PATCH` lets a user rename their fallback to anything, and `POST` lets
them create a second category literally called "Other". The marker has to be structural.

So: a nullable-safe `is_fallback` column, a user-scope migration, and the fallback seeded
unconditionally.

- Column `is_fallback integer not null default 0`. The default is what makes the migration safe
  against databases that already hold rows, which `backend/src/database/CLAUDE.md` requires of
  every user-scope migration: they run unattended, one user at a time, on first open.
- A partial unique index, `create unique index categories_fallback_idx on categories (is_fallback)
  where is_fallback = 1`, so "at most one fallback" is enforced by the engine rather than by
  every call site remembering.
- The migration backfills with a **one-time** name match, `update categories set is_fallback = 1
  where name = 'Other' and deleted_at is null`. Name matching is safe here and only here: at
  migration time no rename endpoint has ever existed, so a row named "Other" is necessarily the
  seeded one. This is the single point in the system where the name means anything.
- `seedStarterCategories` always inserts the fallback, whether or not the user picked the "Other"
  chip, marked `isFallback: 1`. When they did pick it, it is inserted once, not twice.
- `CategoriesService.ensureFallback()` covers the remaining hole: a database migrated from a state
  with no "Other" row at all, which the SQL backfill cannot fix because SQLite cannot mint a
  UUIDv7. It selects the fallback and inserts one if there is none, and every operation that
  depends on the fallback existing calls it first.

The name of the fallback stays "Other" at seed time and is not protected afterwards. A user who
renames it to "Uncategorised" keeps a working fallback, because the marker moved off the name.

### 2. An uncapped category reports `uncapped`, and the ticket needs amending to say so

`monthly_cap_cents` is nullable and every seeded category has it NULL, because onboarding
captures no per-category cap. AC3 requires a cap greater than zero on **create**, so every
category made through this API is capped, but the ten starter ones are not and never will be
unless the user edits each.

AC1 asks for "percent used, remaining or over amount and a status matching the documented
thresholds" for each category. For an uncapped one there is no such answer: percent of nothing
is undefined, and none of On track / Near / Full / Over applies.

The response therefore carries `cap: null`, `percentUsed: null`, `remaining: null`, `over: null`
and `status: "uncapped"` for those rows, with `spent` and `transactionCount` still real. The
alternative, backfilling seeded categories with an invented cap, would put a number on the
Categories screen that the user never chose and the design never specifies.

**This amends AC1**, which as written admits only the four documented statuses. Per
`docs/agents/conventions.md` a ticket's acceptance criteria are amendable, and this is the
better design: the gap is in the ticket, not in the code. It also hands PET-36 and PET-38 a
question the design has not answered, since no Figma frame draws an uncapped category card.
Raise it with the designer rather than inventing the card here.

### 3. Status is decided on cents, never on a rounded percent

The thresholds from the four visible examples are On track below 75%, Near 75 to 99%, Full at
exactly 100%, Over above 100% (CTG-5, A23). Read literally that leaves a hole between 99% and
100%: a category at 99.5% is in none of the four bands.

The hole only exists if the band is chosen from a rounded percentage. Deciding on the underlying
cents closes it with no judgement call:

```
over      spentCents >  capCents
full      spentCents === capCents
near      spentCents >= capCents * 0.75
on_track  otherwise
```

`percentUsed` is then a separate, purely presentational number, and rounding it for display
cannot move a category between bands. A category at 99.5% is `near` and displays as 100% if the
frontend rounds, which is a display artefact rather than a wrong status.

`capCents * 0.75` is exact for any cap whose cents are a multiple of 4 and a float otherwise;
`spentCents >= capCents * 0.75` is still correct across the whole integer range in play here,
because IEEE 754 doubles represent every integer up to 2^53 exactly and the product's error is
far below one cent. No rounding helper is needed.

### 4. The month window is a shared helper, and it is this branch's main export

AC1's stats are per category **per month**, PET-28's list period and PET-20's whole dashboard all
resolve the same window from the same preference. Nothing computes it today: `monthStartDay` is
read in `backend/src/profile/` and stored in both schemas, and no file derives a period from it.

New file `backend/src/common/month-window.ts`, one exported function:

```
monthWindow(monthStartDay: number, today: string): { start: string; end: string }
```

Both bounds are `YYYY-MM-DD` strings, `start` inclusive and `end` exclusive, so every query is
`date >= start and date < end`. That shape is deliberate three times over: it compares text
against the `text` column the schema stores, it uses `transactions_date_idx` as a range scan, and
an exclusive upper bound needs no "last day of month" arithmetic.

`monthStartDay` is constrained to 1-28 by the profile, so every month has the day and there is no
clamping case. `today` is a parameter rather than a `new Date()` inside, so the specs pin
behaviour across month boundaries without faking timers.

**Known limitation, worth a `docs/TODO.md` entry rather than a fix here.** The caller formats
"today" from the server clock in UTC. A user far enough east or west sees the period roll over at
the wrong local moment, for a few hours, twice a month. Fixing it properly needs a timezone on
the profile, which no screen collects and no ticket asks for.

### 5. Allocation ships inside the list response, not as a second endpoint

AC6 describes the allocation summary as its own read. Frame 13 draws it as the header of the same
screen the cards are on, so a separate endpoint means the Categories page makes two round trips,
the second one for two integers derived from rows the first already returned.

`GET /api/categories` therefore returns `{ categories: [...], allocation: {...} }`. AC6 is
satisfied - the summary is read, and its numbers come from the real caps - without paying for a
request that exists only because the ticket used the word "summary". PET-48's Settings card can
call the same endpoint and ignore `categories`.

`allocated` is the sum of `monthly_cap_cents` over live categories, with uncapped ones
contributing nothing. `unallocated` is the profile's monthly budget minus that, and it **may be
negative**: A43 records that nothing prevents caps from exceeding the budget and that no
over-allocation state is designed. Returning the negative number is what lets the frontend draw
that state whenever the designer specifies one; clamping it to zero would destroy the
information here and be unrecoverable there.

### 6. Delete reassigns, and both sides of it tombstone

AC4 moves a deleted category's transactions to the fallback rather than deleting them. That is
two writes, and the schema has no cross-table transaction guarantee to lean on, so the order is
the guarantee: reassign the transactions first, tombstone the category second. A crash between
them leaves transactions pointing at the fallback and the old category still live, which is a
visible, correctable state. The reverse order would leave rows pointing at a tombstoned category,
which every read then has to tolerate.

The category tombstones with `deleted_at` like everything else, per
`backend/src/database/CLAUDE.md`. `TransactionsService`'s existing note about check-then-insert
not being a race is now slightly less true - categories gain a delete endpoint here - but the
conclusion holds, because a dangling `category_id` is what an FK-less schema already obliges
every read to tolerate.

## Endpoints

Five operations in `backend/src/categories/`, following `src/transactions/` and `src/profile/`
exactly: a module, a controller, a service, and DTOs under `dto/`. All are session-guarded by
the `APP_GUARD` default and none carries `@Public()`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/categories` | Live categories with month stats, plus the allocation summary |
| `POST` | `/api/categories` | Create (201) |
| `PATCH` | `/api/categories/:id` | Update (200) |
| `DELETE` | `/api/categories/:id` | Delete, reassigning transactions to the fallback (204) |

Cross-user isolation is structural, as everywhere else: every method opens the caller's own
database through `UserDatabaseService`, so another user's category id does not exist there and
the ordinary 404 covers it.

Three error cases worth naming up front, because each is a decision rather than a default:

- **Deleting the fallback is 409, not 403.** The request is well-formed and the caller is
  entitled to it; it conflicts with an invariant of the resource. 403 would suggest a permission
  the user might be granted.
- **A cap of zero or less is 400** (AC3), and an absent cap on create is also 400. Uncapped
  categories exist only because onboarding predates this endpoint; the API does not mint new
  ones.
- **`PATCH` is tri-state minus its middle case for everything except `note` and
  `monthlyCap`.** `note` is nullable in the schema and `monthlyCap` is too, so both accept
  `null` to clear. Every other field uses `@ValidateIf((_, v) => v !== undefined)` rather than
  `@IsOptional()`, for the reason `backend/CLAUDE.md` already records: `@IsOptional()` skips
  validation for `null` as well as `undefined`, so a `null` would reach a NOT NULL column as a
  500. An empty body is a 400 before the database is opened.

Note that `PATCH` accepting `monthlyCap: null` reintroduces uncapped categories deliberately -
clearing a cap is a thing a user can want, and decision 2 already defines what the stats look
like for one.

## Tasks

- [ ] **Write the migration**: add `is_fallback` to `categories` with a `0` default, the partial
      unique index, and the one-time `name = 'Other'` backfill. Generate it with the Drizzle MCP
      against `backend/drizzle/user/`, never by hand
- [ ] **Update the schema and the seed**: `isFallback` on the `categories` table in
      `backend/src/database/user/schema.ts`, and `seedStarterCategories` always inserting the
      fallback exactly once whether or not it was picked
- [ ] **Write `backend/src/common/month-window.ts`** and its spec, covering a 1st-of-month
      preference, a mid-month one, the December-to-January roll, and a February window
- [ ] **Scaffold `src/categories/`**: module, controller, service, DTOs, registered in
      `AppModule`
- [ ] **Implement the list read** with per-category `spent` and `transactionCount` from one
      grouped SUM over the month window, the four-band status on cents, and the uncapped shape
- [ ] **Implement the allocation summary** inside the list response, from real caps, unclamped
- [ ] **Implement create, update and delete**, including `ensureFallback()`, the reassign-then-
      tombstone order, and the 409 on deleting the fallback
- [ ] **Write the service spec** covering AC1 to AC6, plus the uncapped shape, the 99.5% band,
      an empty `categories` table, and a delete that moves transactions
- [ ] **Add e2e coverage** for the five operations against a real migrated database in local mode
- [ ] **Run `npm run api:sync`** from the repo root and commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts` together
- [ ] **Document it**: a `## Category endpoints` section in `backend/CLAUDE.md`, delete the
      **Categories have no endpoints** bullet from its `## Not built here`, add the trigger row
      to root `CLAUDE.md`, and record the UTC month-boundary limitation in `docs/TODO.md`
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**The partial unique index can fail the migration.** It is created after the backfill, so a
database that somehow holds two live rows named "Other" would fail to open. No such database can
exist today - the starter set has one "Other" and no endpoint has ever created a category - but
the ordering matters if that ever stops being true. Verify against a copy of a real user database
before this merges.

**Three branches will touch `backend/openapi.json` and `frontend/src/types/api.d.ts`.** Being
bottom of the stack, this branch regenerates them first and the two above rebase onto the result.
Neither file is ever hand-edited; a conflict is resolved by taking the parent's version and
re-running `npm run api:sync`.

**PET-28 and PET-20 are already written against decisions 3 and 4.** Changing the status bands or
the `monthWindow` signature during implementation means updating both plans in the same PR that
changes them, not silently diverging.
