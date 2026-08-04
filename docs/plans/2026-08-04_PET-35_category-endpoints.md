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

Six things this ticket had to settle before any code, all settled with the ticket owner on
2026-08-04. Four of them are gaps between the acceptance criteria and what the schema actually
guarantees, found by reading `backend/src/database/user/starter-categories.ts` and the
`categories` table against AC1 to AC6. **Four acceptance criteria are amended as a result**, and
the amendments are being made on the ticket itself rather than left to live only here.

### 1. A dedicated `Uncategorized` system category, separate from the "Other" chip

AC4 makes a fallback category the target every deletion reassigns to and AC5 makes it
undeletable, so the row has to exist for every user and has to be identifiable. Neither holds
today: `seedStarterCategories` inserts only the chips the user picked during onboarding, and
picking none is explicitly valid (A4), so a user can reach this feature with an empty
`categories` table.

The ticket names "Other" as that fallback, and **that is the part being changed.** "Other" is one
of the ten onboarding chips, so using it as the fallback makes one row serve two masters: a
user-pickable, user-renameable, user-deletable category, and a system invariant. A7 already
records that "Other" sits on a contested seam in the designs. Separating the roles removes every
awkward consequence at once.

So: a system category named **`Uncategorized`**, seeded at provisioning alongside whatever chips
the user picked, never offered on the onboarding screen, and never part of `STARTER_CATEGORIES`.
"Other" goes back to being an ordinary chip that anyone can rename or delete.

- Column `is_fallback integer not null default 0`. The default is what makes the migration safe
  against databases that already hold rows, which `backend/src/database/CLAUDE.md` requires of
  every user-scope migration: they run unattended, one user at a time, on first open.
- A partial unique index, `create unique index categories_fallback_idx on categories (is_fallback)
  where is_fallback = 1`, so "at most one fallback" is enforced by the engine rather than by
  every call site remembering.
- Seeded as `{ name: 'Uncategorized', color: '#98A0AE', monthlyCapCents: null, icon: null,
  note: null, isFallback: 1 }`. There is nothing else to copy from the starter set: a chip
  carries only a name and a color, so every seeded category already has NULL cap, icon and note.
- **The name is immutable**; `PATCH` refuses to change it. Cap, color, icon and note are all
  editable like any other category.
- **Deleting it is a 409.** The request is well-formed and the caller is entitled to make it; it
  conflicts with an invariant of the resource. 403 would suggest a permission the user might one
  day be granted.
- It appears in the category list, in the donut, and in the Add and Edit transaction category
  select, **where it is the default selection**. The list response exposes `isFallback: true` so
  the frontend knows which row to preselect.

The flag is still required even though the name is now immutable, and the reason is circular
otherwise: you have to know a row is the fallback *in order* to refuse the rename. Matching the
string would also make "Uncategorized" a reserved word that `POST` has to block, which is
fragile the day anything is translated.

**No backfill, and no `ensureFallback()`.** Every database that exists today is a test account,
so the ones predating this migration are re-provisioned by hand rather than repaired in code.
That removes the risky part of the migration entirely - there is no one-time name match, and no
chance of the partial unique index failing to apply against live data.

**No API change to `POST /api/transactions`.** "Default" means the frontend preselects the
fallback, not that `categoryId` becomes optional. PET-27's endpoint is untouched and the API
stays explicit.

The color is `#98A0AE`, which is `--color-text-tertiary` in `frontend/src/app/globals.css`. An
existing token rather than a new hex, visible against both the white card and the canvas so no
border workaround is needed, and deliberately muted next to the eight saturated category colors.
White was considered and rejected: it would render the list dot, the legend swatch and the donut
slice as nothing, and since this category is the default it is likely to hold the largest share.

### 2. Caps are optional everywhere, and an uncapped category reports `uncapped`

`monthly_cap_cents` is nullable and every seeded category has it NULL, including `Uncategorized`,
because onboarding captures no per-category cap.

AC3 required a cap greater than zero on **create**, which would have made uncapped categories a
legacy artifact that the API could never produce again. That requirement is dropped: **the user
is not forced to set a cap.** Uncapped is a first-class, ongoing choice - `POST` accepts a
category with no cap at all, and `PATCH` can clear one back to null.

A cap of exactly `0` is still **rejected with a 400**. It is a different state from uncapped -
it means "I intend to spend nothing here", and every transaction would put the category
instantly Over - and it is far more likely a typo or an empty form field coerced to a number
than an intent. What it would express is already better said by leaving the category uncapped.

AC1 asks for "percent used, remaining or over amount and a status matching the documented
thresholds" for each category. For an uncapped one there is no such answer: percent of nothing
is undefined, and none of On track / Near / Full / Over applies. The response therefore carries
`cap: null`, `percentUsed: null`, `remaining: null`, `over: null` and `status: "uncapped"`, with
`spent` and `transactionCount` still real.

**This amends AC1** (a fifth status) **and AC3** (no cap requirement, `0` rejected).

Two consequences worth carrying to the designer, both of which are the same change surfacing in
two places, and neither of which this ticket invents a design for:

- **No Figma frame draws an uncapped category card.** Frame 13 shows a progress bar and a
  "spent of cap" line on every card, and an uncapped category has neither. This is now on the
  main path rather than an edge case, because `Uncategorized` ships uncapped and is the default.
- **The allocation summary gets softer.** Uncapped categories contribute nothing to `allocated`,
  so a user who caps nothing sees a header reading that almost the whole budget is unallocated
  while real money is being spent. Arithmetically correct, and not a state frame 13 anticipates.

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

**"Today" comes from one configured server timezone, not from UTC and not from the user.** A new
`APP_TIMEZONE` environment variable, defaulting to `Europe/Zagreb`, is what the caller formats
the date against.

UTC was the first instinct and it is wrong for everybody: on the period boundary a transaction
logged just after local midnight falls into the previous period, so the whole dashboard shows the
wrong month for a few hours, twice a month. A timezone on the profile is the properly correct
answer and it is not buildable yet - no Figma frame collects one, so there is nothing to build
against. One configured zone is right for every user this project actually has, and honest about
not solving the general case.

The cost is one documented variable in `docs/guides/configuration.md` and `backend/.env.example`,
which `npm run docs:check` verifies agree, and one silent failure mode: set the zone wrong and
nothing crashes, the months are just quietly off. `docs/TODO.md` carries the per-user fix.

### 5. Allocation ships inside the list response, not as a second endpoint

AC6 describes the allocation summary as its own read. Frame 13 draws it as the header of the same
screen the cards are on, so a separate endpoint means the Categories page makes two round trips,
the second one for two integers derived from rows the first already returned.

`GET /api/categories` therefore returns `{ categories: [...], allocation: {...} }`. AC6 is
satisfied - the summary is read, and its numbers come from the real caps - without paying for a
request that exists only because the ticket used the word "summary". PET-48's Settings card can
call the same endpoint and ignore `categories`.

Note the allocation is the one figure on this screen that is **time-independent**: caps are
monthly by definition, so no month window enters into it and it reads the same on the 1st as on
the 28th.

The honest argument against, weighed and rejected: PET-48 wants only these two integers and
under this design has to pull every category, each carrying a grouped SUM it does not need. That
waste is small in absolute terms - one indexed query over one user's own small database - and
the alternative charges the *primary* consumer a second round trip on every page load.
Optimising the secondary consumer at the primary's expense is the wrong trade, and a
`?stats=false` flag is a smaller change later than splitting the endpoint would be.

`allocated` is the sum of `monthly_cap_cents` over live categories, with uncapped ones
contributing nothing. `unallocated` is the profile's monthly budget minus that, and it **may be
negative**: A43 records that nothing prevents caps from exceeding the budget and that no
over-allocation state is designed. Returning the negative number is what lets the frontend draw
that state whenever the designer specifies one; clamping it to zero would destroy the
information here and be unrecoverable there.

### 6. Delete is two ordered statements, not a transaction

AC4 moves a deleted category's transactions to the fallback rather than deleting them. That is
two writes in **one** database - `categories` and `transactions` are both user-scope - so
`db.transaction()` genuinely is available here and would make the pair atomic. It is deliberately
not used.

What argues against it is narrow but real: `backend/CLAUDE.md` records that
`LoginTokenService.issue()` is the app's only transactional call site on purpose, because the
embedded driver **refuses** overlapping transactions rather than queueing them. A second call
site puts that in play - two quick deletes against the same user's database would collide and the
second would error. It could not collide with `LoginTokenService`, which is on the central
database and a different connection entirely, but it is a new failure mode bought for a problem
that ordering already solves.

So the order is the guarantee: **reassign the transactions first, tombstone the category second.**
A crash between them leaves the transactions on `Uncategorized` and the old category live but
empty, which is visible, harmless and fixed by retrying the delete. The reverse order would
strand rows pointing at a tombstoned category. This choice is only defensible *because*
reassign-first is the safe order; if the two writes were order-independent, the transaction would
be the right call.

**The reassignment sweeps every row, including tombstoned ones.** Deleted transactions are
invisible through the API either way, but leaving them pointed at a category that no longer
exists would put a dangling reference into exactly the record the tombstones exist to serve, the
future offline sync. Slightly more work, no downside.

A category with no transactions just tombstones; the UPDATE hits zero rows and needs no special
case. The category tombstones with `deleted_at` like everything else, per
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

Four error cases worth naming up front, because each is a decision rather than a default:

- **Deleting `Uncategorized` is 409, not 403.** The request is well-formed and the caller is
  entitled to it; it conflicts with an invariant of the resource. 403 would suggest a permission
  the user might be granted.
- **Renaming `Uncategorized` is 409 for the same reason.** Every other field on it is editable.
- **A cap of `0` or less is 400**, but an **absent** cap is valid and means uncapped. See
  decision 2.
- **`PATCH` is tri-state minus its middle case for everything except `note` and
  `monthlyCap`.** `note` is nullable in the schema and `monthlyCap` is too, so both accept
  `null` to clear. Every other field uses `@ValidateIf((_, v) => v !== undefined)` rather than
  `@IsOptional()`, for the reason `backend/CLAUDE.md` already records: `@IsOptional()` skips
  validation for `null` as well as `undefined`, so a `null` would reach a NOT NULL column as a
  500. An empty body is a 400 before the database is opened.

## Tasks

- [ ] **Write the migration**: add `is_fallback` to `categories` with a `0` default plus the
      partial unique index, and nothing else - no backfill. Generate it with the Drizzle MCP
      against `backend/drizzle/user/`, never by hand
- [ ] **Update the schema and the seed**: `isFallback` on the `categories` table in
      `backend/src/database/user/schema.ts`, and provisioning always inserting `Uncategorized`
      alongside the picked chips, without adding it to `STARTER_CATEGORIES`
- [ ] **Add `APP_TIMEZONE`** to the Joi schema, `backend/.env.example` and the variable table in
      `docs/guides/configuration.md`, defaulting to `Europe/Zagreb`
- [ ] **Write `backend/src/common/month-window.ts`** and its spec, covering a 1st-of-month
      preference, a mid-month one, the December-to-January roll, and a February window
- [ ] **Scaffold `src/categories/`**: module, controller, service, DTOs, registered in
      `AppModule`
- [ ] **Implement the list read** with per-category `spent` and `transactionCount` from one
      grouped SUM over the month window, the four-band status on cents, the uncapped shape, and
      `isFallback` exposed so the frontend can preselect
- [ ] **Implement the allocation summary** inside the list response, from real caps, unclamped
- [ ] **Implement create, update and delete**, including the optional cap with `0` rejected, the
      immutable name, the reassign-all-then-tombstone order, and the two 409s
- [ ] **Write the service spec** covering AC1 to AC6, plus the uncapped shape, the 99.5% band, a
      cap of `0`, an attempt to rename or delete `Uncategorized`, an empty `categories` table,
      and a delete that moves both live and tombstoned transactions
- [ ] **Add e2e coverage** for the four operations against a real migrated database in local mode
- [ ] **Run `npm run api:sync`** from the repo root and commit `backend/openapi.json` and
      `frontend/src/types/api.d.ts` together
- [ ] **Document it**: a `## Category endpoints` section in `backend/CLAUDE.md`, delete the
      **Categories have no endpoints** bullet from its `## Not built here`, and add the trigger
      row to root `CLAUDE.md`. The timezone entry is already in `docs/TODO.md`
- [ ] **Re-provision the existing test accounts**, since no backfill runs for them
- [ ] **Run the gates**: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` from
      `backend/`, and `npm run docs:check` from the root

## Risks

**Existing databases get no fallback until they are re-provisioned.** This is a deliberate
trade - every account today is a test account, so repairing them in code would be permanent
machinery for a one-off. It stops being acceptable the moment a database exists that cannot be
thrown away, and the checklist item above is the whole mitigation.

**`APP_TIMEZONE` fails silently when wrong.** Nothing crashes; the months are quietly off. Same
failure class as `use_tursodb` in `backend/src/database/CLAUDE.md`, and the reason `docs/TODO.md`
carries the per-user fix rather than treating the config value as the end state.

**Two designer questions are unanswered and now sit on the main path**, both from decision 2: no
frame draws an uncapped category card, and the allocation header reads as almost fully
unallocated for a user who caps nothing. Neither blocks this branch, and both block PET-36.

**Three branches will touch `backend/openapi.json` and `frontend/src/types/api.d.ts`.** Being
bottom of the stack, this branch regenerates them first and the two above rebase onto the result.
Neither file is ever hand-edited; a conflict is resolved by taking the parent's version and
re-running `npm run api:sync`.

**PET-28 and PET-20 are written against decisions 2, 3 and 4.** Changing the status bands, the
uncapped shape or the `monthWindow` signature during implementation means updating both plans in
the same PR that changes them, not silently diverging.
