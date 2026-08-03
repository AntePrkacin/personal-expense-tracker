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

/** Prefix of every per-user Turso database name: `expensa-user-<uuid>`. */
export const USER_DB_NAME_PREFIX = 'expensa-user-';

/** Sent to Turso as the sync client identity; purely for observability. */
export const SYNC_CLIENT_NAME = 'expensa-backend';

/** Turso database name for a user id. Deterministic, so it never needs a lookup. */
export function userDbName(userId: string): string {
  return `${USER_DB_NAME_PREFIX}${userId}`;
}
