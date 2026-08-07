# Plan: PET-60 Dummy User for Showcase

## Objective
Create a script to generate a dummy user with a large volume of realistic transaction and category data for an upcoming showcase. The script should run within the NestJS application context to leverage existing services and the database-per-user Turso setup. Instead of cluttering `backend/package.json`, we will register a task in `mise.toml`.

## Context
- The application uses a database-per-user model (Turso SQLite + Drizzle ORM).
- To seed a user, we must first register them in the central database, then connect to their provisioned user database to insert categories and transactions.
- We will use `faker` (or hardcoded realistic arrays) to generate the transaction data.

## Tasks

- [ ] Create `backend/src/scripts/seed-showcase.ts`
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
- [ ] Add a `seed:showcase` task to `mise.toml`
  - Register `[tasks."seed:showcase"]` that changes to the `backend/` directory and runs `npx ts-node src/scripts/seed-showcase.ts`.

## Testing Strategy
- Run `mise run seed:showcase` locally and verify the script executes successfully without errors.
- Query the central database to confirm the user is created.
- Check the generated SQLite user database file to ensure the categories and transactions were correctly inserted.
