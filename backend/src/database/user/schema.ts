import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Schema of a *per-user* database. Every user gets their own Turso database, so
 * this schema is instantiated once per person and its migrations run on first
 * open of each file (see UserDatabaseService).
 *
 * `profile` and `categories` exist so far. `transactions` and `insights` arrive
 * with their own features as ordinary later migrations - adding a migration
 * here upgrades every existing user database the next time it opens.
 */
export const profile = sqliteTable('profile', {
  // Single-row table. The id is the user's central `users.id` rather than a
  // second UUID for the same person, which keeps the cross-database
  // correlation explicit and makes lookups unambiguous. notNull() records
  // intent SQLite does not enforce for non-INTEGER primary keys; drizzle-kit
  // currently emits no NOT NULL for it either - see docs/TODO.md.
  id: text('id').primaryKey().notNull(),

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

/**
 * Spending categories, one row per category per user.
 *
 * Only the table lands with the access flow, because onboarding has to seed the
 * starter set the moment a profile is created (see starter-categories.ts). CRUD,
 * per-category stats and the budget allocation summary belong to the categories
 * feature and are deliberately absent here.
 */
export const categories = sqliteTable('categories', {
  // Same primary-key caveat as everywhere else; see docs/TODO.md.
  id: text('id').primaryKey().notNull(),

  name: text('name').notNull(),

  // Hex, `#RRGGBB`. Purely presentational, so it is not constrained here: the
  // categories feature validates the format at its DTO.
  color: text('color').notNull(),

  // Optional per-category spending cap, in minor units like every other money
  // column. NULL means uncapped, which is not the same as a cap of zero.
  monthlyCapCents: integer('monthly_cap_cents'),

  // Optional icon name from the frontend's own set; the backend never resolves
  // it to an asset.
  icon: text('icon'),

  note: text('note'),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
