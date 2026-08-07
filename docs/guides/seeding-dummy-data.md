# Seeding Dummy Data for Showcases

This guide explains how to fill one account (`dummy@spendifico.eu`) with 18 months of realistic
transaction data, for demos, UI work and showcases.

The script boots the real NestJS application context and goes through the real services, so the
showcase user is provisioned exactly the way a registration provisions one: the central directory
row, its own database, the migrations, the profile, the starter categories and the `Uncategorized`
fallback.

## Which target, and why there are two commands

The backend runs in one of two modes, and the seed script has to be told which one you mean:

```bash
mise run seed:showcase         # local SQLite files under backend/databases/
mise run seed:showcase:cloud   # Turso Cloud, using backend/.env
```

Local is the default and cloud has to be typed out, because the two are not equally forgiving. A
mistaken local run writes a gitignored SQLite file. A mistaken cloud run creates a real database
in the shared Turso organization and pushes about 1,200 rows into it.

`seed:showcase` ignores `backend/.env` entirely, the same way the e2e suite and the OpenAPI
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
transaction rather than appended to.

## 1. Seeding the local environment

Use this when you are running the backend in local mode - a fresh clone with no `.env`, or one
whose `.env` has no `TURSO_*` values.

1. **Run the seed script**:
   ```bash
   mise run seed:showcase
   ```
   It takes a few seconds and finishes with `Seeded dummy@spendifico.eu with N transactions...`.
2. **Start your dev servers**:
   ```bash
   mise run dev
   ```
3. **Log in**:
   Go to `http://localhost:4200` and enter `dummy@spendifico.eu`. Without MailPace credentials the
   backend prints the login link to its terminal. Click it.

If your `.env` **does** carry the four `TURSO_*` values, `mise run dev` starts the backend in
cloud mode and it will not see any of this - the data is in `backend/databases/` and the server is
reading Turso. Either seed the cloud instead (below), or move `.env` aside so both halves run
locally.

## 2. Seeding your Turso Cloud test environment

This needs `backend/.env` with `TURSO_ORG`, `TURSO_ORG_TOKEN`, `TURSO_CENTRAL_DB_URL` and
`TURSO_CENTRAL_DB_TOKEN`. The script checks for them before it writes anything and stops with a
readable message if they are missing, rather than quietly falling back to local files.

**Stop your dev server first.** Turso's `@tursodatabase/sync` engine locks the local replica file,
so the seed cannot run while the backend is up in cloud mode.

1. **Ensure `backend/.env` is present** and filled in - see `docs/guides/configuration.md`.
2. **Stop the running dev server**: `Ctrl+C` in the terminal running `mise run dev`, which releases
   the lock on the replica.
3. **Run the seed script**:
   ```bash
   mise run seed:showcase:cloud
   ```
   It connects to Turso, creates the user in the central database, provisions a database for them
   through the Platform API, migrates it, and pushes the transactions.
4. **Start your dev servers again**:
   ```bash
   mise run dev
   ```
5. **Log in**:
   Go to `http://localhost:4200` and enter `dummy@spendifico.eu`. `dummy@spendifico.eu` is not a
   real inbox, so take the login link out of the backend terminal logs.

## What gets generated

- **A profile** with a $5,000 monthly budget and `monthStartDay` 1, rewritten on every run so the
  caps below always add up against the budget actually stored.
- **Eleven categories** - the ten starter chips plus `Uncategorized` - each with a monthly cap, the
  caps summing to exactly the $5,000 budget.
- **26 merchants**: 22 generated names dealt round-robin over the categories so every category has
  at least two of its own, plus `dm`, `Müller`, `Konzum` and `Lidl` mapped exclusively to
  Groceries. About 20% of merchants are valid for two categories, the rest for one.
- **Roughly 1,100-1,400 transactions** over 18 months - 60 to 80 per month, so the exact total
  differs on every run. About 5% land on `Uncategorized`.
- **Six over-budget months**, at about 115% of the budget, with the overspend concentrated in two
  categories rather than spread evenly - otherwise no category ends up over its cap and the donut,
  the category cards and the over-cap insight have nothing to show.

Two things about dates. The six over-budget months are drawn from the **17 complete** months only,
and the current month is seeded **pro-rata**: transactions stop at today and both the count and the
target spend are scaled by how much of the month has elapsed. Seeding the current month as if it
were finished is what would make the dashboard read a full month's spending on the 7th, with
`averagePerDay` four times reality and trend buckets for weeks that have not happened yet.

Dates never fall after the 28th, matching the 1-28 range the profile's `monthStartDay` is
constrained to.
