import { isNull } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Everything the registration form collected, held until the email owner proves
 * they own it. Written at registration, read once at verification, then set
 * NULL - see the `onboardingPayload` column.
 */
export interface OnboardingPayload {
  /** One field since PET-72; see `profile.full_name` for why. */
  fullName: string;
  /** ISO 4217 from `SUPPORTED_CURRENCIES`, already uppercased by the DTO. */
  currency: string;
  /** MAJOR units, exactly as submitted. Converted to cents at the profile. */
  monthlyBudget: number;
  /**
   * 1-28, already defaulted by the DTO. Still here, and now the day of the
   * user's first paycheck rather than a standing profile column: verification
   * turns it into the account's seed `period_rules` row, anchored to the most
   * recent occurrence of that day.
   */
  monthStartDay: number;
  /**
   * `category_templates.id` values the user picked; may be empty (A4 enforces
   * no minimum). Ids rather than names since PET-64: the offered list is admin
   * data now, so a name is no longer a stable key anything could validate
   * against. Membership was checked against central before this was stashed.
   */
  categories: string[];
}

/**
 * Schema of the *central* database (the user directory), one row per user.
 *
 * This database exists only because identity has to resolve by email before we
 * know which per-user database to open. It therefore holds the bare minimum:
 * the email and a pointer to the user's own database. Everything else about a
 * person (name, currency, budget, categories, transactions) lives in that
 * per-user database - see src/database/user/schema.ts.
 */
export const users = sqliteTable(
  'users',
  {
    // SQLite's historic quirk lets a non-INTEGER primary key hold NULLs, and
    // the Turso engine inherits it (verified). notNull() records the intent,
    // but drizzle-kit's sqlite DDL generator currently emits no NOT NULL for
    // a primary-key column, so the constraint is app-side (newId()) until a
    // future drizzle-kit picks this up. See docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // Stored already lowercased and trimmed by the DTO. SQLite could enforce
    // this with `COLLATE NOCASE`, but Drizzle's column builder cannot express
    // it, so normalization is the DTO's job and this index is the backstop.
    email: text('email').notNull(),

    // Turso database name, always `spendifico-user-<id>` - in local mode too,
    // so a row provisioned offline stays valid after switching to cloud, and so
    // the name is always derivable from the id alone.
    dbName: text('db_name').notNull(),

    // Cloud mode only, and NULL until the account is verified: registration
    // deliberately provisions nothing, so an unauthenticated endpoint cannot
    // create real cloud databases. The exact hostname the Turso Platform API
    // returned at creation. Hostnames are region-scoped (e.g.
    // `spendifico-user-x-acme.aws-eu-west-1.turso.io`), so this can NOT be
    // reconstructed from the name and must be persisted.
    dbUrl: text('db_url'),

    // Cloud mode only, NULL until verification for the same reason. That one
    // database's data-plane token, minted at provisioning. A server-side
    // secret: never serialized into an API response.
    dbAuthToken: text('db_auth_token'),

    // A deliberate exception to "central holds only email and a pointer": the
    // registration form is collected before the address is proven, and the
    // profile it becomes lives in a database that does not exist yet.
    //
    // Transient. Written at registration with the DTO's defaults already
    // applied (currency 'EUR' since PET-72, monthStartDay 1) and `monthlyBudget` in MAJOR
    // units exactly as submitted; read once when the login link is verified,
    // which inserts the profile (converting to cents there) and sets this back
    // to NULL. A non-NULL value therefore means "registered, never verified",
    // which is what lets a resubmitted registration overwrite it.
    //
    // Do not read this as a licence to put profile data in central.
    onboardingPayload: text('onboarding_payload', {
      mode: 'json',
    }).$type<OnboardingPayload>(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    // Soft delete. Reads filter on `isNull(deletedAt)`; nothing undeletes.
    // The tombstone is here for future last-write-wins sync, not for the API.
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // Partial: uniqueness holds over live rows only, so a soft-deleted user's
    // email can register again. A full index would keep the tombstone
    // answering 409 forever, for an account that appears not to exist.
    // Renamed from users_email_unique when the where clause was added:
    // drizzle-kit's sqlite differ only sees created and dropped indexes, so an
    // in-place change to an existing name generates no migration at all.
    uniqueIndex('users_email_live_unique')
      .on(table.email)
      .where(isNull(table.deletedAt)),
    // Deliberately NOT partial: names derive from unique ids, so tombstones
    // cannot collide anyway, and a duplicated pointer is always a bug.
    uniqueIndex('users_db_name_unique').on(table.dbName),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * One issued magic link. Central rather than per-user, because a link is
 * consumed before we know - or, for an unverified account, before there even
 * is - the user's own database.
 *
 * Nothing here can be replayed into a token: only the SHA-256 of the raw value
 * is stored, and the raw value exists solely in the email that was sent. See
 * LoginTokenService for why an unsalted single-round hash is the right choice
 * for a 256-bit random secret.
 */
export const loginLinks = sqliteTable(
  'login_links',
  {
    // Same primary-key caveat as `users.id`: notNull() records intent that
    // drizzle-kit does not emit for a text primary key. See docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // Plain text, no references(): this schema declares no foreign keys
    // anywhere and the Turso engine has PRAGMA foreign_keys off per connection
    // by default, so a declared constraint would be decorative. The absence is
    // a decision, not an oversight.
    userId: text('user_id').notNull(),

    // SHA-256 of the raw token, hex. This *is* the lookup key, so verification
    // is an indexed read rather than a comparison against a stored secret.
    tokenHash: text('token_hash').notNull(),

    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),

    // Two distinct invalidation columns rather than one, because A38 designs no
    // screen for a rejected link: "why did this link stop working" has to be
    // answerable from the row itself. `usedAt` means it was clicked and spent;
    // `supersededAt` means a newer link was issued for the same user.
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    supersededAt: integer('superseded_at', { mode: 'timestamp_ms' }),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // Every verification is a lookup by this column alone.
    uniqueIndex('login_links_token_hash_unique').on(table.tokenHash),
    // Issuing supersedes the user's prior live links, which is a write keyed on
    // user_id and runs on every register and every resend.
    index('login_links_user_id_idx').on(table.userId),
  ],
);

export type LoginLinkRow = typeof loginLinks.$inferSelect;
export type NewLoginLinkRow = typeof loginLinks.$inferInsert;

/**
 * One logged-in session. Central for the same reason `login_links` is: the
 * bearer is validated before anything knows which per-user database to open,
 * and the join back to `users` for the caller's email happens right here.
 *
 * Opaque server-side sessions rather than a stateless JWT, deliberately. A JWT
 * would need a signing secret - breaking the "starts with no .env at all"
 * invariant unless it defaulted to something, which is worse - and would give
 * up revocation, which is the one thing a 30-day credential really needs.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    // Same primary-key caveat as `users.id`: notNull() records intent that
    // drizzle-kit does not emit for a text primary key. See docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // Plain text, no references(), like every other id in this schema; see the
    // note on `login_links.user_id` for why the absence is a decision.
    userId: text('user_id').notNull(),

    // SHA-256 of the raw session token, hex - the same scheme as a login link,
    // and for the same reasons. See LoginTokenService's class comment: this is
    // the lookup key, not a secret to compare, so validating a bearer is one
    // indexed read with nothing timing-sensitive in it.
    tokenHash: text('token_hash').notNull(),

    // Fixed at issue and never extended: expiry is absolute, not sliding, so
    // an authenticated read stays a read. A34 asks for a normal persistent
    // session, and re-login costs one email click.
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    // Soft delete as everywhere else, but here the tombstone carries a second
    // job: setting it *is* revocation. A39 designs no logout, so killing a
    // session is currently an ops action against this column.
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // Every authenticated request is a lookup by this column alone.
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    // Revoking every session of one user is the ops operation this serves;
    // concurrent sessions per user are legitimate (one per device), so this is
    // deliberately not unique.
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

/**
 * The three **template** tables, the fourth sanctioned exception to "central
 * holds only an email and a pointer" - and the first one that is not about a
 * credential outliving the database it belongs to.
 *
 * They hold what onboarding *offers* and what the category picker *offers*:
 * which default categories exist, and which colours and icons a user may
 * choose from. That is not user data at all. It belongs to nobody, it is the
 * same for everybody, and a super admin edits it - which is precisely why it
 * cannot be a TypeScript constant any more. `user/schema.ts` says closed sets
 * are constrained in TypeScript rather than in SQLite, and that holds for a set
 * that only changes with a deploy. An admin-editable set is not that: it is
 * data, and central is the only database that can hold it.
 *
 * A user's own database keeps holding only that user's own categories, exactly
 * as before. Provisioning **copies** from here; nothing reads across afterwards,
 * and an admin editing a template does not reach back into anybody's rows.
 *
 * All three follow this file's conventions unchanged: UUIDv7 text primary key
 * from `newId()`, `timestamp_ms` instants, no foreign keys (see the note on
 * `login_links.user_id`), and a partial unique index over the live rows.
 */
export const colourTemplates = sqliteTable(
  'colour_templates',
  {
    // Same primary-key caveat as `users.id`. See docs/TODO.md.
    id: text('id').primaryKey().notNull(),

    // One of `COLOUR_TOKENS` in template-tokens.ts, verbatim as the daisyUI
    // class suffix. NOT constrained here: the DTO's `@IsIn` is the enforcement
    // and the one that publishes an OpenAPI enum, and a CHECK constraint would
    // be a second authority that drifts the day a seventeenth token ships.
    token: text('token').notNull(),

    // What a person picking a colour actually reads. "Accent Content" is not a
    // colour anybody picks, so the human word lives here rather than being
    // derived from the token - and it is the admin's to edit.
    label: text('label').notNull(),

    sortOrder: integer('sort_order').notNull(),

    // Presentation, never validation. The picker offers what is enabled; a
    // category already carrying a since-disabled colour keeps rendering, which
    // is why `@IsIn` checks the allowlist and not this flag.
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // Partial, the `users_email_live_unique` shape: one live row per token, and
    // a deleted one must not keep the token spoken for forever.
    uniqueIndex('colour_templates_token_live_unique')
      .on(table.token)
      .where(isNull(table.deletedAt)),
  ],
);

export type ColourTemplateRow = typeof colourTemplates.$inferSelect;
export type NewColourTemplateRow = typeof colourTemplates.$inferInsert;

/** One offerable icon. Everything on `colour_templates` applies unchanged. */
export const iconTemplates = sqliteTable(
  'icon_templates',
  {
    id: text('id').primaryKey().notNull(),

    // One of `ICON_NAMES`, in lucide's own kebab-case.
    name: text('name').notNull(),

    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('icon_templates_name_live_unique')
      .on(table.name)
      .where(isNull(table.deletedAt)),
  ],
);

export type IconTemplateRow = typeof iconTemplates.$inferSelect;
export type NewIconTemplateRow = typeof iconTemplates.$inferInsert;

/**
 * One default category onboarding may offer, with the presentation an admin
 * controls.
 *
 * **Names are sentence case**: "Dining out", "Personal care", "Loans & debt",
 * not "Dining Out". That is not a new convention, it is the one the seed data
 * has always followed - and it starts mattering once somebody can type a name
 * straight into this table, so it is written down here and enforced on the
 * write endpoint when that ships.
 *
 * `Uncategorized` is deliberately **not** in here. It must never appear as a
 * pickable chip and its name is a system invariant the API answers 409 for, so
 * it stays `FALLBACK_CATEGORY`, a code constant in
 * `src/database/user/starter-categories.ts`.
 */
export const categoryTemplates = sqliteTable(
  'category_templates',
  {
    id: text('id').primaryKey().notNull(),

    name: text('name').notNull(),

    // Plain text, no references(), like every other id in this schema. A
    // colour or icon template that is soft-deleted while a category template
    // points at it resolves to nothing, which the read filters out.
    colourId: text('colour_id').notNull(),
    iconId: text('icon_id').notNull(),

    // Copied into the user's own `categories.description` at provisioning, per
    // the decision that the user scope needs no new column: that column already
    // exists, is editable through both DTOs and is returned by
    // CategoryResponseDto, so a second free-text column would need a stated
    // difference and has none. It was called `note` there until PET-72 renamed
    // it to match this one, the reset having made the rename free.
    // It lives here so an admin can edit the wording centrally; each user gets
    // their own copy the moment they are provisioned, and owns it from then on.
    description: text('description').notNull(),

    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),

    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('category_templates_name_live_unique')
      .on(table.name)
      .where(isNull(table.deletedAt)),
    // Registration resolves the picked ids against this table on the one
    // unauthenticated route in the app, and the public read orders by it.
    index('category_templates_sort_order_idx').on(table.sortOrder),
  ],
);

export type CategoryTemplateRow = typeof categoryTemplates.$inferSelect;
export type NewCategoryTemplateRow = typeof categoryTemplates.$inferInsert;
