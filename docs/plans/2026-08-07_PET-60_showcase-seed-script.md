# Plan: PET-60 Dummy User for Showcase

## Objective
Create a script to generate a dummy user with a large volume of realistic transaction and category data for an upcoming showcase. The script should run within the NestJS application context to leverage existing services and the database-per-user Turso setup. Instead of cluttering `backend/package.json`, we will register a task in `mise.toml`.

## Context
- The application uses a database-per-user model (Turso SQLite + Drizzle ORM).
- To seed a user, we must first register them in the central database, then connect to their provisioned user database to insert categories and transactions.
- We will use `faker` (or hardcoded realistic arrays) to generate the transaction data.

## Tasks

- [x] Create `backend/src/scripts/seed-showcase.ts`
  - Bootstrap the NestJS application context using `NestFactory.createApplicationContext(AppModule)`.
  - Check if the dummy user (`dummy@spendifico.eu`) already exists. If not, register and verify them via `AuthService`, ensuring the onboarding payload includes `monthlyBudget: 5000` (which is $5000) and `STARTER_CATEGORY_NAMES`.
  - Obtain the user database connection using `UserDatabaseService` and fetch the created categories.
  - Update all categories in the database (including `Uncategorized`) to have a cap (`cap_cents`), distributing the budget so the sum of all caps equals exactly $5000 (500000 cents).
  - Ensure the user's profile is set with the default `month_start_day: 1`.
  - Generate realistic transactions spanning exactly 18 months from the current date.
    - Vary the number of transactions per month between 60 and 80.
    - For 12 months, ensure the total spending remains within the $5000 budget.
    - For 6 randomly selected months, force the total spending to exceed the budget by about 15% (to ~$5750) concentrated in a few categories, to properly showcase the over-budget UI elements and insights.
    - Build a fixed pool of merchants: generate exactly `total_categories * 2` names with `faker`, and append fixed EU merchants (`dm`, `Müller`, `Konzum`, `Lidl`).
    - Map merchants to categories consistently: exactly 80% of merchants map to 1 category only, and the remaining 20% map to exactly 2 categories. **Ensure the fixed EU merchants are exclusively mapped to the `Groceries` category.**
    - Randomly distribute ~95% of the total transactions across the regular default categories and explicitly assign ~5% to the `Uncategorized` fallback category, always ensuring the chosen merchant is allowed for that category.
  - Bulk-insert the transactions using Drizzle ORM.
  - Close the application context cleanly.
- [x] Add a `seed:showcase` task to `mise.toml`
  - Register `[tasks."seed:showcase"]` that changes to the `backend/` directory and runs `npx ts-node src/scripts/seed-showcase.ts`.
- [x] Let the script target either the local SQLite files or Turso Cloud
  - Add `backend/src/scripts/seed-showcase.env.ts`, a side-effect module following the same two-halves pattern as `test/setup-e2e.ts` and `src/openapi.env.ts`, and a `SEED_LOCAL` clause in `AppModule`'s `ignoreEnvFile`.
  - Register a second task, `seed:showcase:cloud`, rather than a flag on the first: local must be the default that a mistake falls back to.
- [x] Document the procedure in `docs/guides/seeding-dummy-data.md`, with the command in `docs/guides/commands.md` and the guide in the README table.

## Amendments made during implementation

Two departures from the tasks above, both recorded rather than silently taken.

- **The six over-budget months are drawn from the 17 complete months, never the current one.**
  The current month is seeded pro-rata instead - transactions stop at today, and both the count
  and the target spend scale with how much of the month has elapsed. Seeding it as a finished
  month is what puts three weeks of transactions in the future, which the dashboard counts:
  `spent` reads a full month on the 7th, `averagePerDay` divides by days *elapsed* and so reads
  four times reality, and the trend chart draws buckets for weeks that have not happened.
- **The caps are distributed against a budget the script writes, not one it assumes.** The
  profile's `monthlyBudgetCents` and `monthStartDay` are re-asserted on every run. On a re-run
  the account is already verified, so nothing else touches the profile, and a budget changed
  through `PATCH /api/profile` in between would leave the caps summing to a number the profile
  no longer holds - which sends the allocation summary's unclamped `unallocated` negative.

## Testing Strategy
- Run `mise run seed:showcase` locally and verify the script executes successfully without errors.
- Query the central database to confirm the user is created.
- Check the generated SQLite user database file to ensure the categories and transactions were correctly inserted.
- Re-run it and confirm the user is not duplicated and the transactions are replaced rather than appended.
- Confirm no transaction is dated after today, and that the caps sum to exactly the stored budget.
