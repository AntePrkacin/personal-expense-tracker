import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Schema of the *central* database (the user directory), one row per user.
 *
 * This database exists only because identity has to resolve by email before we
 * know which per-user database to open. It therefore holds the bare minimum:
 * the email and a pointer to the user's own database. Everything else about a
 * person (name, currency, budget, categories, transactions) lives in that
 * per-user database - see src/database/user/schema.ts.
 *
 * The LoginLink table for the magic-link flow lands here with the auth feature.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),

    // Stored already lowercased and trimmed by the DTO. SQLite could enforce
    // this with `COLLATE NOCASE`, but Drizzle's column builder cannot express
    // it, so normalization is the DTO's job and this index is the backstop.
    email: text('email').notNull(),

    // Turso database name, always `expensa-user-<id>` - in local mode too, so a
    // row provisioned offline stays valid after switching to cloud, and so the
    // name is always derivable from the id alone.
    dbName: text('db_name').notNull(),

    // Cloud mode only. The exact hostname the Turso Platform API returned at
    // creation. Hostnames are region-scoped (e.g.
    // `expensa-user-x-acme.aws-eu-west-1.turso.io`), so this can NOT be
    // reconstructed from the name and must be persisted.
    dbUrl: text('db_url'),

    // Cloud mode only. That one database's data-plane token, minted at
    // provisioning. A server-side secret: never serialized into an API
    // response (see UsersService's response mapping).
    dbAuthToken: text('db_auth_token'),

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
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_db_name_unique').on(table.dbName),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
