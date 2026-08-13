# Seeding Dummy Data for Showcases

This guide explains how to fill one account (`slavko@spendifico.eu`) with 36 months of realistic
transaction data, for demos, UI work and showcases.

The data comes from three commands rather than one. A committed fixture
(`backend/src/scripts/showcase/fixture.data.json`) describes the account completely - the profile,
the category caps and every transaction, positioned by calendar month rather than by an absolute
date - and the seed script only resolves that fixture against today and writes it. That split is
what makes seeding **reproducible**: two people demoing the app on the same day see the same
numbers, and a change to the spending model is a diff on a committed file rather than an invisible
change to what a script happens to invent this time.

The seed script boots the real NestJS application context and goes through the real services, so
the showcase user is provisioned exactly the way a registration provisions one: the central
directory row, its own database, the migrations, the profile, the starter categories and the
`Uncategorized` fallback.

## The three commands

| | Command | What it does |
| --- | --- | --- |
| **A** | `mise run seed:fixture` | Regenerates `fixture.data.json` from the spending model. No Nest, no database - only needed after changing the model itself. |
| **B** | `mise run seed` / `:cloud` | Reads the committed fixture, resolves its dates against today, provisions the account and writes it. This is the one most people want. |
| **C** | `mise run seed:check` | Measures the fixture - or `--trials=200` fresh generations - and prints a report. No database, and it changes nothing. |

Most of this guide is about **Command B**, the one that fills the account. Command A only matters
if you are changing the spending model itself (see "When the fixture must be rebuilt" below);
Command C is how the numbers in this guide, and any future change to them, were measured.

## Which target, and why there are two seeding commands

The backend runs in one of two modes, and the seed script has to be told which one you mean:

```bash
mise run seed         # local SQLite files under backend/databases/
mise run seed:cloud   # Turso Cloud, using backend/.env
```

Local is the default and cloud has to be typed out, because the two are not equally forgiving. A
mistaken local run writes a gitignored SQLite file. A mistaken cloud run creates a real database
in the shared Turso organization and pushes thousands of rows into it.

**The account is `slavko@spendifico.eu`, and `--email=` seeds a different one:**

```bash
mise run seed:cloud -- --email=rehearsal@spendifico.eu
```

The address is the only thing separating two seeded accounts, so this is how a rehearsal or a
second demo gets an account of its own without colliding with the showcase one. It is normalized
the way the app stores addresses, so case does not create a duplicate. Everything else about the
run is unchanged, including the profile name the fixture carries.

`seed` ignores `backend/.env` entirely, the same way the e2e suite and the OpenAPI
emitter do. That is deliberate: having cloud credentials in `.env` must not turn a local seed into
a cloud one. Two consequences worth knowing:

- Every other value in `.env` is skipped too, `DATABASE_DIR` included, so the seed lands under the
  `./databases` default. If your local dev server reads somewhere else, export `DATABASE_DIR` in
  the shell - shell variables survive, which is what makes that work.
- No mail is sent. `MAILPACE_API_TOKEN` and `MAIL_FROM` are dropped, so the login link is logged
  rather than delivered. (The script never sends mail in either mode - it verifies the account
  itself rather than emailing a link - but this removes the transport as well.)

Re-running either command is safe. An existing showcase user is reused rather than duplicated, the
profile is re-asserted, and the transactions are replaced wholesale inside one database
transaction rather than appended to. Seeding cloud after seeding local is safe too: an account
provisioned in local mode has no `db_url`, and the script re-provisions it rather than assuming a
cleared onboarding payload means it is ready. **Seeding twice on the same day produces
byte-identical transactions, ids aside** - that is the property the fixture split exists to
guarantee, and it is checked by hand before every release of this work rather than assumed.

**Do not point both modes at the same `DATABASE_DIR` even so - the backend now refuses rather than
corrupting it, but a refusal still stops your seed run cold.** The two modes use the same file
paths - `app.db` and `users/<db-name>.db` - but cloud mode opens them as sync replicas and local
mode as plain SQLite files, and this project was bitten once by the two silently sharing one
directory: PET-60's local seed put a user in the central replica that a later cloud run never
pushed, and the deployed backend could not find the account at all.

`backend/src/database/turso-client.factory.ts` now guards both directions (PET-61): opening a
plain local file in cloud mode, or a sync replica in local mode, fails loudly and names the path
rather than silently adopting or writing to it. If a seed run stops with a `Refusing to open`
error, it means this `DATABASE_DIR` has genuinely been used for the other mode already - the guard
is reporting a real mix, not a false positive. See `backend/src/database/CLAUDE.md` for what the
error names as the fix.

If a `DATABASE_DIR` was mixed before the guard existed, or you want to force a clean slate anyway,
the repair is to delete the central replica (`app.db` and its `-changes`, `-info`, `-log`, `-wal`
siblings) and let it re-bootstrap from the cloud, which is the source of truth, then seed again.
To avoid the situation entirely, give each mode its own directory.

## 1. Seeding the local environment

Use this when you are running the backend in local mode - a fresh clone with no `.env`, or one
whose `.env` has no `TURSO_*` values.

**Stop your dev server first.** This applies in local mode exactly as it does in cloud mode: the
seed script boots a Nest application of its own, so it opens the same `app.db` the running backend
already holds, and the database engine takes an **exclusive** file lock. Running it against a live
server fails immediately with:

```
Error: failed to open database databases/app.db: Locking error:
Failed locking file 'databases/app.db'. File is locked by another process
```

Nothing is written when that happens, so the repair is only to stop the server and run it again.

1. **Stop the running dev server**: `Ctrl+C` in the terminal running `mise run dev`, which releases
   the lock on `app.db`.
2. **Run the seed script**:
   ```bash
   mise run seed
   ```
   It takes a few seconds and finishes with `Seeded slavko@spendifico.eu with N transactions...`.
3. **Start your dev servers**:
   ```bash
   mise run dev
   ```
4. **Log in**:
   Go to `http://localhost:4200` and enter `slavko@spendifico.eu`. Without MailPace credentials the
   backend prints the login link to its terminal. Click it.

If your `.env` **does** carry the four `TURSO_*` values, `mise run dev` starts the backend in
cloud mode and it will not see any of this - the data is in `backend/databases/` and the server is
reading Turso. Either seed the cloud instead (below), or move `.env` aside so both halves run
locally.

## 2. Seeding your Turso Cloud test environment

This needs `backend/.env` with `TURSO_ORG`, `TURSO_ORG_TOKEN`, `TURSO_CENTRAL_DB_URL` and
`TURSO_CENTRAL_DB_TOKEN`. The script checks for them before it writes anything and stops with a
readable message if they are missing, rather than quietly falling back to local files.

**Stop your dev server first**, the same as in local mode above. The lock is not a property of the
sync engine, which is what this line used to claim: both drivers take an exclusive file lock, so
the seed cannot run while the backend is up in **either** mode. Cloud mode locks the local replica
rather than a plain file, which changes what is locked and nothing about the outcome.

1. **Ensure `backend/.env` is present** and filled in - see `docs/guides/configuration.md`.
2. **Stop the running dev server**: `Ctrl+C` in the terminal running `mise run dev`, which releases
   the lock on the replica.
3. **Run the seed script**:
   ```bash
   mise run seed:cloud
   ```
   It connects to Turso, creates the user in the central database, provisions a database for them
   through the Platform API, migrates it, and pushes the transactions.
4. **Start your dev servers again**:
   ```bash
   mise run dev
   ```
5. **Log in**:
   Go to `http://localhost:4200` and enter `slavko@spendifico.eu`. That is a **deliverable
   address**, not a placeholder: it is an alias on the project's own domain forwarding to
   `spendifico@gmail.com`, the same inbox `login@spendifico.eu` lands in. So with
   `MAILPACE_API_TOKEN` set the login link really arrives and can be clicked, including from a
   phone. Without MailPace credentials the backend logs the link instead, as always.

## What gets generated

- **A profile** in **EUR** with a €5,000 monthly budget and a pay day of 1, rewritten on every run so
  the caps below always add up against the budget actually stored. The budget, the pay schedule and every cap
  are **effective-dated rows** rather than settings, so all three are written at an anchor at or
  before the oldest transaction - which is what makes every period the demo can navigate back to show
  the same budget and the same caps rather than thirteen uncapped categories. The account keeps one
  pay schedule for the whole of its history on purpose: a mid-fixture schedule change would make its
  months incomparable, which is a different demo from the one the caps and the trend chart are for. The
  currency was USD until PET-72 made EUR the app's default and the fixture followed, which is why every
  figure below is in euros - `mise run seed:fixture` regenerates it and the profile block is the only
  part that changed.
- **Thirteen categories** - every category template plus `Uncategorized` - with **uneven** monthly
  caps that still sum to exactly the €5,000 budget, from €1,500 for `Loans & debt` down to €100 for
  `Education`. The templates are read out of central at run time rather than hard-coded, so this
  count follows whatever an admin has enabled; the caps themselves come from the fixture, so a
  template rename or removal is refused rather than silently seeded against a stale cap - see
  "When the fixture must be rebuilt" below.
- **Twelve fixed monthly bills**, about €1,900 combined and roughly 38% of the month: rent €1,450,
  health insurance €145, electricity about €95, internet €55, mobile €40, gym €39, water €30, and
  the five streaming subscriptions (Netflix, Spotify, HBO Max, Strava and iCloud, €46 together).
  Each bills once a month on its own day. The three utility bills move month to month the way real
  ones do; the rest are flat. All twelve are deliberately kept out of the random merchant pool, so
  a bill cannot also draw a second charge at an unrelated amount under the same name - a `Fiberlink`
  at €23.40 beside the real €55 one. The seed fails loudly if an edit puts one of these merchants
  back into the pool.
- **Merchants are hand-written per category** rather than generated, with weights that give each
  category a few regulars and a long tail - the coffee shop turns up about 3 times a month and the
  main supermarket about 2.5, while a good many names appear once or twice in the whole 36 months.
- **55 to 72 transactions a month** over 36 months, so the exact total differs by seed. Roughly 3%
  land on `Uncategorized`. `mise run seed:fixture` prints the total it wrote.
- **Amounts drawn log-normally, per category**, so the spread looks like real spending rather than
  like arithmetic: a median near €35, roughly 9% of transactions under €10 and roughly 3% over
  €200, with each category's typical size set by its own share of spend against its share of the
  count. Dining out lands near €31 a time, Groceries near €56, Travel near €225.

### Every month has a band, and the year has a shape

Rather than picking a handful of months at random to run over budget, every calendar month is
drawn from its own percentage-of-budget range, and the same twelve bands repeat for every one of
the three years the fixture covers - so December is always over budget, not "over budget in
whichever `monthsAgo` the dice landed on this time":

| Month | Band | Why |
| --- | --- | --- |
| Dec | 108-115% | Christmas |
| Jul | 105-112% | holiday |
| Aug | 105-112% | holiday |
| May | 97-99% | the near-miss - the month the account *just* made it |
| Jun | 88-93% | pre-holiday creep |
| Nov | 86-92% | pre-Christmas |
| Mar | 82-89% | |
| Sep | 80-88% | |
| Oct | 80-88% | |
| Apr | 76-84% | |
| Feb | 72-81% | post-Christmas recovery |
| Jan | 70-79% | post-Christmas recovery |

Only December, July and August ever go over budget - **9 of the 36 months**, each pushed over by
one major plus one minor irregular expense (a car repair, a dentist, a holiday booking) rather
than by inflating every category 15%. That is both how real months go over and what leaves one or
two categories visibly over their caps, which the donut, the category cards and the over-cap
insight all need to have anything to show. May is a deliberate near-miss, landing at 97-99% of
budget every time it recurs - the month somebody *just* made it.

- **Travel, `Education` and `Gifts` do not happen every month.** They fire in roughly 45%, 50% and
  60% of them, and a category that sits out has its share redistributed over the ones that did not.
- **Every category's over-cap rate is measured, not assumed**, and the categories do not all land
  in the same place: `Healthcare`, `Utilities`, `Entertainment`, `Education` and `Transportation`
  sit in a 4-11%-of-months-over-cap range, mostly from being the occasional target of one of the
  irregular expenses above. `Groceries`, `Dining out`, `Family & pets`, `Personal care`,
  `Uncategorized`, `Travel` and `Gifts` run higher than that even after two rounds of rebalancing
  the caps - a property of a €5,000 budget with a €1,450 rent payment in it, not an unturned
  number. `Loans & debt` sits at essentially 0%: it is 30% of the whole budget and dominated by
  that same near-fixed rent, so it has almost no room to go over on ordinary variance at all. Run
  `mise run seed:check --trials=200` for the exact current figures - they are the tuning input
  for any future change to the model, not a table to copy here and let go stale.

Dates never fall after the 28th, matching the 1-28 range the profile's `monthStartDay` is
constrained to.

Between them, these make both content rules fire on a freshly seeded account: a category over its
cap, and a month-over-month move.

The seed also gives the summary banner all three of its headline states across the history, since
that is driven by the projected end-of-month pace rather than by a card.

## When the fixture must be rebuilt

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
| `enabled` flag toggled | **Yes, for an account that does not exist yet** - see below |

The `enabled` row is the subtle one. `GET /api/templates/categories` serves only enabled
templates, and that is the list the seed hands to onboarding - so a template disabled before the
showcase account is first provisioned is never seeded as a category, and the seeder refuses. An
account provisioned earlier already has the category and is unaffected, which is why re-running
against an existing showcase user keeps working while a fresh one fails.

Every one of these failures is loud and names the offending category. None of them can silently
seed a subtly wrong account, which is the property that makes the trade-off acceptable at all.

**Regenerating alone does not fix any of them**, and the error says so. The fixture's categories
come from the hand-written `CATEGORY_PLANS` table in
`backend/src/scripts/showcase/plan.ts`, so `mise run seed:fixture` reproduces exactly the same
names and the next run refuses identically. Edit that table first - add, rename or remove the
row, then rebalance `spendPercent`, `countPercent` and `capCents` until `assertPlanIsCoherent`
passes - and regenerate after.

To rebuild: run `mise run seed:fixture`, then `mise run seed:check --trials=200` against
the result before committing - the fixture command has no opinion on whether the numbers it
produced are good, only on producing them reproducibly. Commit the regenerated
`backend/src/scripts/showcase/fixture.data.json` on its own, since it is a generated-but-committed
artifact (see root `CLAUDE.md`'s never-hand-edit list) and a regeneration diff should read as
exactly that rather than be buried in an unrelated change.

For scale: `CATEGORY_SEED` has changed twice in this project's life. PET-64 created it, and PET-65
was an icon-only pass, which by this table would not have needed a rebuild.
