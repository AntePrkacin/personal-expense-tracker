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
 * `profile`, `categories`, `transactions` and the insights tables live here.
 * Adding a migration upgrades every existing user database the next time it
 * opens, so a user-scope migration must be safe to apply to live data.
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

    // A daisyUI semantic colour token, verbatim as the class suffix -
    // `success`, `primary-content`, and so on. **Not a hex**, which is what this
    // said until PET-64: a hex is incoherent rather than merely indirect,
    // because `primary` is valued differently per theme and a stored value
    // would record one and paint the other half the time.
    //
    // Not constrained here, and the closed set is not this file's. Central's
    // `database/central/template-tokens.ts` owns `COLOUR_TOKENS`, the categories
    // DTOs validate against it with `@IsIn`, and that is what publishes the
    // OpenAPI enum the frontend's class map is keyed on.
    color: text('color').notNull(),

    // Optional per-category spending cap, in minor units like every other money
    // column. NULL means uncapped, which is not the same as a cap of zero: the
    // API accepts a category with no cap and rejects a cap of zero, and an
    // uncapped category reports `status: "uncapped"` with no percentage.
    monthlyCapCents: integer('monthly_cap_cents'),

    // A lucide icon name in lucide's own kebab-case, from `ICON_NAMES` in
    // `database/central/template-tokens.ts` - **not** "the frontend's own set",
    // which is what this said until PET-64 moved the allowlist here. The
    // backend still never resolves it to an asset.
    //
    // Nullable, though nothing writes a null any more: `CreateCategoryDto`
    // requires an icon and no PATCH can clear one, so only a row predating
    // PET-64 has one - and `user/legacy-colour-backfill.ts` fills those in on
    // the next open. The column stays nullable anyway, because tightening it to
    // NOT NULL is a schema migration that would have to run against live data
    // the backfill has not necessarily reached yet, and the two must not race.
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

/**
 * A generated insight set: the header of one generation run.
 *
 * A set is a **snapshot of generated prose**, not a derived view, which makes it
 * the one table in this database whose text columns hold rendered strings rather
 * than data the API formats on read. `month_label`, `summary_headline` and
 * `summary_body` are what the generator wrote at `generated_at`; re-reading a set
 * must return them byte-for-byte (PET-41 AC2), never re-derive them from
 * transactions that have since moved. See `backend/CLAUDE.md`, Insights.
 *
 * `status` drives a lifecycle the read resolves into the three designed frames:
 * a `generating` run is in flight (skeletons), a `ready` set is the latest good
 * content, a `failed` run is skipped so the previous `ready` set stays the read's
 * answer (AC6). PET-41 stores and reads sets; PET-40 is what moves a row from
 * `generating` to `ready`/`failed`. A `generating` or `failed` row carries null
 * content columns, which is why they are nullable: a run's row exists before its
 * content does.
 */
export const insightSets = sqliteTable(
  'insight_sets',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md. Caller-supplied
    // newId() like every other table in both scopes.
    id: text('id').primaryKey().notNull(),

    // `generating` | `ready` | `failed`. A plain text column, not a DB enum: the
    // repo constrains such closed sets in TypeScript (see the API's InsightState
    // and CategoryStatus) rather than in SQLite.
    status: text('status').notNull(),

    // Rendered content, set when the row reaches `ready` and null until then.
    monthLabel: text('month_label'),
    summaryHeadline: text('summary_headline'),
    summaryBody: text('summary_body'),

    // When the run completed, set as the row flips to `ready`. Null while
    // generating or after a failure.
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    // Tombstone, like every table here. Every read filters isNull(deletedAt).
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Partial, so it
  // constrains only rows currently `generating` and leaves every completed run
  // free: at most one run in flight at a time (the single-run guard, A26),
  // enforced at the database rather than by a racy check-then-insert. Same shape
  // as `categories_fallback_idx`.
  (table) => [
    uniqueIndex('insight_sets_generating_idx')
      .on(table.status)
      .where(sql`${table.status} = 'generating'`),
  ],
);

export type InsightSetRow = typeof insightSets.$inferSelect;
export type NewInsightSetRow = typeof insightSets.$inferInsert;

/**
 * One insight card belonging to a set: its tone, title and body, in render order.
 *
 * Written once with its parent set and never updated on its own, which is why it
 * carries `created_at` but no `updated_at`. Content is rendered prose for the
 * same reason `insight_sets`' is.
 */
export const insights = sqliteTable(
  'insights',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // No .references(): the schema is FK-less throughout, exactly like
    // transactions.categoryId. The index below serves the by-set lookup the read
    // does; cross-set integrity is the service's, since a set and its cards are
    // only ever written together in one transaction.
    setId: text('set_id').notNull(),

    // `warning` | `positive` | `info` | `neutral`, mapping to the Status palette.
    // A plain text column for the same reason as `insight_sets.status`.
    tone: text('tone').notNull(),

    title: text('title').notNull(),
    body: text('body').notNull(),

    // The designed card order (INS-4), stored so the read returns cards as
    // generated rather than in whatever order the query planner picks.
    sortOrder: integer('sort_order').notNull(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object.
  (table) => [index('insights_set_id_idx').on(table.setId)],
);

export type InsightRow = typeof insights.$inferSelect;
export type NewInsightRow = typeof insights.$inferInsert;
