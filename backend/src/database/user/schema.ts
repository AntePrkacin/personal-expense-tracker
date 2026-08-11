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
 * `profile`, `categories`, `transactions`, the insights tables, PET-72's
 * three append-only history tables and PET-73's two assistant tables live here.
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

  // One name field, not two. PET-72 collapsed `first_name`/`last_name`: the app
  // never used them apart - the sidebar wants initials and a short name, both
  // derivable from one string - and asking for a surname to render "M. Kovač"
  // is asking for data to throw away. What the form now says it wants is a
  // display name, which may be a full name or a nickname.
  fullName: text('full_name').notNull(),

  // ISO 4217 code. Display concern only: amounts are stored in minor units.
  // The closed set is `SUPPORTED_CURRENCIES` in `src/common/currency.ts`,
  // restricted to two-decimal currencies because `src/common/money.ts` assumes
  // exponent 2. Defaulted here as well as in the DTO, so a row written by
  // anything that bypasses validation still lands on a real code.
  currency: text('currency').notNull().default('EUR'),

  // NOTE: `monthly_budget_cents` and `month_start_day` used to live here, as
  // single current values, and PET-72 removed them. A budget and a period start
  // day are not facts about the account, they are facts about a span of time:
  // stored as one current value, raising the budget in 2026 silently re-priced
  // every month of 2025, and changing the start day re-bucketed all history.
  // They are now `budget_history` and `period_rules` below, append-only and
  // resolved against the window being asked about. The current values the API
  // still serves on `GET /api/profile` are the newest rows, resolved on read by
  // `PeriodService`.

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
 * PET-72's three history tables are **append-only**, and that is the whole
 * design rather than an implementation detail of it.
 *
 * Nothing updates a row and nothing deletes one. A correction is another row
 * with the same `effective_from`, and resolution takes the greatest
 * `effective_from <= window.start`, breaking ties by `created_at DESC, id DESC`
 * so the newest write wins. That is why they carry `created_at` but no
 * `updated_at` - the `insights` shape further down, for the same reason: a row
 * that is never rewritten has no update to stamp. `deleted_at` is present
 * because every table here carries it for the future sync, and reads filter it,
 * but no code path sets it.
 *
 * Dates are text `YYYY-MM-DD` like `transactions.date`, compared as text against
 * the window bounds, so no `Date` is constructed anywhere near them.
 */

/**
 * One period-shaping rule, in force from `effective_from` until the next rule.
 *
 * `effective_from` is **T**, the first paycheck date under the new schedule, and
 * is always day-`month_start_day` of its own month. A rule tiles plain month
 * arithmetic forward from there; the earliest rule also extends backward, so an
 * account has a period for any date it can hold a transaction on.
 *
 * `transition_start` is the start of the single stretched **transition period**
 * that joins the previous rule's last kept boundary to this rule's T. It is
 * **stored rather than derived**, which is the one non-obvious choice here and
 * is what keeps the period walk dumb: the walk reads a boundary instead of
 * re-deciding, at read time and forever, which of the old rule's boundaries
 * survived a schedule change. It also leaves room for the deferred
 * same-employer pay-date shift, which is the identical schema with the
 * transition anchored one boundary later. NULL on the seed rule, which has no
 * predecessor to bridge from.
 *
 * Why a boundary disappears at all: salaries are paid in arrears, so the old
 * schedule's paycheck immediately before T never arrives. Keeping its boundary
 * would open a period no money was ever paid into. See `common/period-rules.ts`
 * for the walk and `PeriodService` for the read.
 */
export const periodRules = sqliteTable(
  'period_rules',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // T: the first paycheck date this rule is anchored to, `YYYY-MM-DD`. Always
    // day-`month_start_day` of its own month, which the service asserts rather
    // than the schema - see the note on closed sets in TypeScript.
    effectiveFrom: text('effective_from').notNull(),

    // Day of month each period starts on under this rule, 1-28 (28 so every
    // month has the day and there is no clamping case).
    monthStartDay: integer('month_start_day').notNull(),

    // Start of the stretched transition period leading into `effective_from`,
    // `YYYY-MM-DD`. NULL on the earliest rule only.
    transitionStart: text('transition_start'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Unique rather than
  // a plain index, unlike the other two history tables: two rules anchored to
  // one date would make the walk ambiguous about where a period *starts*, which
  // is structural, where two budgets for one date merely means the newer wins.
  // It is what lets the schedule write be an `onConflictDoNothing` insert and
  // therefore convergent under a retry.
  (table) => [
    uniqueIndex('period_rules_effective_from_unique').on(table.effectiveFrom),
  ],
);

export type PeriodRuleRow = typeof periodRules.$inferSelect;
export type NewPeriodRuleRow = typeof periodRules.$inferInsert;

/**
 * The monthly budget, effective-dated. Replaces `profile.monthly_budget_cents`.
 *
 * `effective_from` is a period start, so a budget change never splits a period
 * in half. A period older than the account's earliest row resolves to that
 * earliest row rather than to nothing: a transaction backdated before the first
 * budget was ever set still has to be shown against *some* budget, and the
 * first one the user ever chose is the only honest answer available.
 *
 * A schedule change writes a budget row at T, and the stretched transition
 * period before it therefore still resolves to the **old** budget - the money
 * that had to last through it was paid under the old schedule.
 */
export const budgetHistory = sqliteTable(
  'budget_history',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // Period start this budget applies from, `YYYY-MM-DD`.
    effectiveFrom: text('effective_from').notNull(),

    // Money is always integer minor units (cents) - never a float. The API
    // speaks major units and the service converts at the boundary.
    budgetCents: integer('budget_cents').notNull(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Deliberately not
  // unique: a correction is an append with the same date, resolved by
  // `created_at DESC, id DESC`.
  (table) => [
    index('budget_history_effective_from_idx').on(table.effectiveFrom),
  ],
);

export type BudgetHistoryRow = typeof budgetHistory.$inferSelect;
export type NewBudgetHistoryRow = typeof budgetHistory.$inferInsert;

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

    // NOTE: `monthly_cap_cents` used to live here and PET-72 removed it, for the
    // same reason as `profile.monthly_budget_cents`: a cap read as a single
    // current value rewrote every past month the moment it changed. Caps are
    // `category_cap_history` below now, resolved per window.

    // A lucide icon name in lucide's own kebab-case, from `ICON_NAMES` in
    // `database/central/template-tokens.ts` - **not** "the frontend's own set",
    // which is what this said until PET-64 moved the allowlist here. The
    // backend still never resolves it to an asset.
    //
    // NOT NULL since PET-72. It was nullable only so PET-64's icon backfill
    // could not race a tightening migration against live data; the pre-launch
    // database reset removed both the legacy rows and the backfill, so the
    // column now says what `CreateCategoryDto` has always required.
    icon: text('icon').notNull(),

    // Free text the user owns. Named `description` since PET-72, matching the
    // `category_templates.description` it is copied from at provisioning - the
    // rename that column's comment said was avoidable is no longer worth
    // avoiding now that the databases are reset. `transactions.note` is a
    // different field on a different table and keeps its own name.
    description: text('description'),

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
 * One category's cap, effective-dated. Replaces `categories.monthly_cap_cents`.
 *
 * **The history is sparse, and every reader has to expect that.** Provisioning
 * writes no cap rows at all, because starter categories and the fallback are
 * uncapped, and a category created without a cap writes none either. So a
 * category with no row for a window is uncapped for that window - which is the
 * same answer as a row whose `cap_cents` is NULL, and the two are deliberately
 * not distinguished anywhere. `CategoriesService.withSpend` resolves the cap as a
 * correlated scalar subquery, where "no row" and "NULL" both arrive as NULL and
 * both mean uncapped; there is no third state to write a branch for.
 *
 * NULL is how a cap is *removed*, since nothing here is ever deleted: setting a
 * category back to uncapped from a given period appends a row with a NULL
 * `cap_cents`. A cap of exactly `0` is still a 400 at the API - it means "spend
 * nothing here" and is almost always an empty form field coerced to a number -
 * so a zero can never reach this column through a DTO.
 */
export const categoryCapHistory = sqliteTable(
  'category_cap_history',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // No .references(): the schema is FK-less throughout, exactly like
    // `transactions.category_id`. A cap row outliving its category is harmless -
    // every read joins from `categories`, so an orphan is simply never resolved.
    categoryId: text('category_id').notNull(),

    // Period start this cap applies from, `YYYY-MM-DD`.
    effectiveFrom: text('effective_from').notNull(),

    // Minor units like every other money column. NULL means uncapped; see the
    // class comment on why that is indistinguishable from having no row.
    capCents: integer('cap_cents'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Composite and in
  // this order: every read resolves one category's cap for one window, so the
  // category is the equality predicate and the date the range scan. Not unique,
  // for the same reason `budget_history` is not.
  (table) => [
    index('category_cap_history_category_effective_idx').on(
      table.categoryId,
      table.effectiveFrom,
    ),
  ],
);

export type CategoryCapHistoryRow = typeof categoryCapHistory.$inferSelect;
export type NewCategoryCapHistoryRow = typeof categoryCapHistory.$inferInsert;

/**
 * A single spend, the only thing this app really records. Everything the UI
 * shows on top of it - dashboard cards, trend buckets, the donut, per-category
 * totals, the allocation summary - is computed on read from these rows and
 * never stored, so this table is the whole write surface of the feature.
 *
 * That "never stored" rule is why there is no month column, and why there must
 * not be one. Month attribution is `date` read against the period rules in
 * force at query time, which means a backdated transaction lands in the period
 * it belongs to. A stored month would be a second source of truth that goes
 * stale.
 *
 * PET-72 changed what that re-buckets. This comment used to promise that a later
 * change to `monthStartDay` re-buckets *all* history "correctly", which was the
 * feature it turned out to be a bug: a new pay day is a fact about the months
 * after it, not a correction to the months before. `period_rules` is now
 * effective-dated, so a change re-buckets only the periods from its anchor date
 * onward and every earlier period keeps the boundaries it was budgeted under.
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

    // `warning` | `positive` | `neutral`, mapping to the Status palette. A plain
    // text column for the same reason as `insight_sets.status` - which means rows
    // written before PET-42-43-44 retired `info` are still readable here, and the
    // narrowed DTO union is a promise about what is generated rather than about
    // what is stored.
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

/**
 * One assistant conversation: the header of a chat the user held about their
 * own spending (PET-73).
 *
 * The parent-child pair below copies `insight_sets`/`insights` structurally and
 * differs from it in four deliberate ways, each of which is a consequence of a
 * turn being **synchronous and request-scoped** where a generation run is
 * asynchronous and single-flight.
 *
 * **No `status` and no partial unique index.** `insight_sets_generating_idx`
 * exists because a run is in flight across requests and at most one may be; a
 * turn either completes inside its request or writes nothing at all, so there is
 * no in-flight row to guard and nothing to reclaim past a staleness cutoff.
 *
 * **No `updated_at`**, which `insight_sets` also does without. The only mutation
 * a session takes is `last_message_at` moving, and that column *is* the record
 * of it.
 *
 * **Nothing here is exempt from the tombstone convention.** `backend/CLAUDE.md`
 * names exactly two exemptions - the empty-account placeholder removal and the
 * completed-run prune - and this is neither: nothing hard-deletes and nothing
 * prunes, because growth is bounded by how much a human types rather than by how
 * much they spend. `DELETE /sessions/:id` is deferred for the same reason; see
 * docs/TODO.md.
 */
export const assistantSessions = sqliteTable(
  'assistant_sessions',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // Derived from the first user message at creation and never rewritten,
    // which is why this table carries no `updated_at`. It is a label for the
    // History list, not content.
    title: text('title').notNull(),

    // Moved by every completed turn. The History list orders on it, so it is
    // "when this conversation was last alive" rather than when it started.
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    // Tombstone, like every table here. Every read filters isNull(deletedAt).
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object. Serves the
  // History list's one query, which is this table's only read that is not by id.
  (table) => [
    index('assistant_sessions_last_message_at_idx').on(table.lastMessageAt),
  ],
);

export type AssistantSessionRow = typeof assistantSessions.$inferSelect;
export type NewAssistantSessionRow = typeof assistantSessions.$inferInsert;

/**
 * One message in a conversation, user or assistant, in render order.
 *
 * **A stored message is by definition part of a completed turn**, which is the
 * deliberate contrast with `insight_sets` and the reason this table needs no
 * status column and no lifecycle at all: the session row, the question and the
 * answer are written together in one `db.transaction()` *after* the model has
 * answered. A failed or cancelled turn leaves nothing behind, so there is no
 * half-written state for a read to interpret and no orphan for anything to
 * reclaim. What it costs is that a failed call loses the question, which the
 * composer holds client-side and puts back.
 */
export const assistantMessages = sqliteTable(
  'assistant_messages',
  {
    // Same primary-key caveat as everywhere else; see docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // No .references(): the schema is FK-less throughout, exactly like
    // `insights.set_id`. The index below serves the by-session read; integrity
    // is the service's, since a session and its messages are only ever written
    // together in one transaction.
    sessionId: text('session_id').notNull(),

    // `user` | `assistant`. A plain text column for the same reason
    // `insight_sets.status` is one: this repo constrains closed sets in
    // TypeScript rather than in SQLite.
    role: text('role').notNull(),

    content: text('content').notNull(),

    // Copying `insights.sort_order` and adding a reason of its own: the two
    // messages of a turn are written inside one transaction and therefore share
    // a millisecond, so `created_at` is not a tiebreak between a question and
    // its own answer.
    sortOrder: integer('sort_order').notNull(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },

  // The v1 RC third argument returns an ARRAY, not an object.
  (table) => [index('assistant_messages_session_id_idx').on(table.sessionId)],
);

export type AssistantMessageRow = typeof assistantMessages.$inferSelect;
export type NewAssistantMessageRow = typeof assistantMessages.$inferInsert;
