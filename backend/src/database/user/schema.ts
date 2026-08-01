import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Schema of a *per-user* database. Every user gets their own Turso database, so
 * this schema is instantiated once per person and its migrations run on first
 * open of each file (see UserDatabaseService).
 *
 * Only `profile` exists so far. The `categories`, `transactions` and `insights`
 * tables arrive with their own features as ordinary later migrations - adding a
 * migration here upgrades every existing user database the next time it opens.
 */
export const profile = sqliteTable('profile', {
  // Single-row table. The id is the user's central `users.id` rather than a
  // second UUID for the same person, which keeps the cross-database
  // correlation explicit and makes lookups unambiguous.
  id: text('id').primaryKey(),

  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),

  // ISO 4217 code. Display concern only: amounts are stored in minor units.
  currency: text('currency').notNull().default('USD'),

  // Money is always integer minor units (cents) - never a float. The API
  // speaks major units and the service converts at the boundary.
  monthlyBudgetCents: integer('monthly_budget_cents').notNull(),

  // Day of month the budgeting period starts on, 1-28 (28 so every month has
  // the day).
  monthStartDay: integer('month_start_day').notNull().default(1),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type ProfileRow = typeof profile.$inferSelect;
export type NewProfileRow = typeof profile.$inferInsert;
