import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Schema of a *per-user* database. Every user gets their own Turso database, so
 * this schema is instantiated once per person and its migrations run on first
 * open of each file (see UserDatabaseService).
 *
 * `profile`, `categories` and `transactions` exist so far. `insights` arrives
 * with its own feature as an ordinary later migration - adding a migration here
 * upgrades every existing user database the next time it opens.
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
 * Exactly one row per database is the **fallback**, `is_fallback = 1`. It is
 * seeded as `Uncategorized` at provisioning, its name cannot be changed and it
 * cannot be deleted, because deleting any other category reassigns that
 * category's transactions to it (PET-35, CED-9, A41).
 */
export const categories = sqliteTable(
  'categories',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    name: text('name').notNull(),

    // Hex, `#RRGGBB`. Purely presentational, so it is not constrained here: the
    // categories feature validates the format at its DTO.
    color: text('color').notNull(),

    // Optional per-category spending cap, in minor units like every other money
    // column. NULL means uncapped, which is not the same as a cap of zero: the
    // API accepts a category with no cap and rejects a cap of zero, and an
    // uncapped category reports `status: "uncapped"` with no percentage.
    monthlyCapCents: integer('monthly_cap_cents'),

    // Optional icon name from the frontend's own set; the backend never resolves
    // it to an asset.
    icon: text('icon'),

    note: text('note'),

    // The undeletable reassignment target. A marker column rather than a match
    // on `name = 'Uncategorized'`, because the name would be a reserved word
    // POST has to block and it is circular anyway: refusing the rename requires
    // already knowing the row is special. The partial unique index below is what
    // enforces "at most one"; "at least one" is provisioning's job.
    isFallback: integer('is_fallback', { mode: 'boolean' })
      .notNull()
      .default(false),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Partial, so it
  // constrains only the fallback row and leaves every ordinary category free.
  (table) => [
    uniqueIndex('categories_fallback_idx')
      .on(table.isFallback)
      .where(sql`${table.isFallback} = 1`),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

/**
 * A single spend, the only thing this app really records. Everything the UI
 * shows on top of it - dashboard cards, trend buckets, the donut, per-category
 * totals, the allocation summary - is computed on read from these rows and
 * never stored, so this table is the whole write surface of the feature.
 *
 * That "never stored" rule is why there is no month column, and why there must
 * not be one. Month attribution is `date` read against the profile's
 * `monthStartDay` at query time, which means a backdated transaction lands in
 * the month it belongs to and a later change to `monthStartDay` re-buckets
 * history correctly. A stored month would be a second source of truth that goes
 * stale on both counts.
 */
export const transactions = sqliteTable(
  'transactions',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md. Ids are
    // caller-supplied newId() rather than $defaultFn, matching every other
    // table in both scopes.
    id: text('id').primaryKey().notNull(),

    merchant: text('merchant').notNull(),

    // No .references(): the schema is FK-less throughout, so reads already have
    // to tolerate a dangling id. The service checks the category exists before
    // it writes, which is what turns an unknown id into a 404 instead of a row
    // pointing at nothing.
    categoryId: text('category_id').notNull(),

    // Minor units like every other money column. The API speaks major units and
    // TransactionsService converts at the boundary, through money.ts and
    // nowhere else.
    amountCents: integer('amount_cents').notNull(),

    // Calendar date, `YYYY-MM-DD`, stored and returned verbatim. Deliberately
    // text and never a timestamp: this is the day the user says the money was
    // spent, not an instant, and round-tripping it through a Date would shift
    // it across timezones.
    date: text('date').notNull(),

    note: text('note'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    // Tombstone. The API deletes permanently as far as any client can tell, but
    // the row survives so a future offline sync cannot resurrect it under a
    // delete-update conflict. Every read filters on isNull(deletedAt).
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Both indexes ship
  // in this first migration on purpose: the month-window and per-category scans
  // that need them are already specified, and adding one later would re-open
  // and re-migrate every user database for nothing.
  (table) => [
    index('transactions_date_idx').on(table.date),
    index('transactions_category_id_idx').on(table.categoryId),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
