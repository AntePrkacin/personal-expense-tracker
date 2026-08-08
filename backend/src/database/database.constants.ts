import { join } from 'node:path';

/** DI token for the central (user directory) Drizzle instance. */
export const APP_DB = 'APP_DB';

/**
 * Migration folders, resolved against the process working directory rather than
 * `__dirname`, because `nest build` emits only JS into dist/ and leaves the SQL
 * behind. In production `drizzle/` therefore has to sit next to the process cwd
 * (a future Dockerfile must COPY it alongside dist/).
 */
export const CENTRAL_MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'central');
export const USER_MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'user');

/** File name of the central database inside DATABASE_DIR. */
export const CENTRAL_DB_FILE = 'app.db';

/** Sub-directory of DATABASE_DIR holding the per-user database files. */
export const USER_DB_SUBDIR = 'users';

/**
 * Prefix of every per-user Turso database name: `spendifico-user-<uuid>`.
 *
 * Renamed with the product (PET-51) while it was still free: the name is
 * derived here and then persisted in `users.db_name`, so changing it once real
 * accounts exist strands every one of them silently - `getUserDb` would create
 * a fresh empty file rather than open the synced one. It was verified against
 * live Turso first that no per-user database and no named row existed yet. Any
 * future rename is that data migration, not this edit.
 */
export const USER_DB_NAME_PREFIX = 'spendifico-user-';

/** Sent to Turso as the sync client identity; purely for observability. */
export const SYNC_CLIENT_NAME = 'spendifico-backend';

/**
 * Suffix of the sibling file that `turso-client.factory.ts` checks for to tell
 * a sync replica from a plain local file - see that file for why `-info`
 * alone is the discriminator.
 */
export const SYNC_DISCRIMINATOR_SIBLING = '-info';

/**
 * Every sibling file only `@tursodatabase/sync` ever writes beside its main
 * file, never `@tursodatabase/database`. `deleteUserDb` removes all three so
 * a cloud-mode teardown leaves nothing behind; only the first is load-bearing
 * for the mixed-mode guard itself.
 *
 * Observed against `@tursodatabase/sync` 0.7.2, pinned in package.json for
 * exactly this reason - re-verify this list if that pin ever moves.
 */
export const SYNC_ONLY_SIBLINGS = [
  '-changes',
  SYNC_DISCRIMINATOR_SIBLING,
  '-log',
] as const;

/** Turso database name for a user id. Deterministic, so it never needs a lookup. */
export function userDbName(userId: string): string {
  return `${USER_DB_NAME_PREFIX}${userId}`;
}
