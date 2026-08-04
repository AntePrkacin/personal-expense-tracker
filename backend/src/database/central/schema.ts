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
  firstName: string;
  lastName: string;
  /** ISO 4217, already uppercased and defaulted by the DTO. */
  currency: string;
  /** MAJOR units, exactly as submitted. Converted to cents at the profile. */
  monthlyBudget: number;
  /** 1-28, already defaulted by the DTO. */
  monthStartDay: number;
  /** Starter category names the user picked; may be empty (A4 enforces none). */
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
    // applied (currency 'USD', monthStartDay 1) and `monthlyBudget` in MAJOR
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
