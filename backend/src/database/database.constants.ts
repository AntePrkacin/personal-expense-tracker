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
 * Prefix of every per-user Turso database name: `expenso-user-<uuid>`.
 *
 * Renamed with the product (PET-51) while it was still free, and renamed again
 * at PET-86 to match the Cloud Run service this backend now runs as. Both times
 * the same check made it safe: the name is derived here and then persisted in
 * `users.db_name`, so changing it once real accounts exist strands every one of
 * them silently - `getUserDb` would create a fresh empty file rather than open
 * the synced one. `turso db list` was read before each edit and showed no
 * per-user database at all. **Any future rename is that data migration, not
 * this edit.**
 */
export const USER_DB_NAME_PREFIX = 'expenso-user-';

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

/**
 * Turso's ceiling on a database name, from the Platform API's own rejection:
 * `{"code":"invalid_name","error":"invalid database name: name must contain
 * between 1 and 51 characters"}`.
 *
 * Recorded as a constant so the test beside this file can assert against it,
 * because the failure it guards is invisible everywhere else - see below.
 */
export const TURSO_MAX_DB_NAME_LENGTH = 51;

/**
 * Turso database name for a user id. Deterministic, so it never needs a lookup.
 *
 * **The hyphens come out of the uuid, and that is arithmetic rather than
 * taste.** The prefix this shipped with, `spendifico-user-`, is 16 characters
 * and a UUIDv7 is 36 - which is 52 against a limit of 51, so the obvious form
 * was one character too long and every attempt to provision an account answered
 * 400 from the Platform API.
 *
 * `expenso-user-` is 13, so the dashed form would now fit at 49. It is still
 * stripped, deliberately: 45 leaves six characters of headroom where 49 leaves
 * two, and being two characters from a hard limit is the same fragility that
 * just cost this project every registration. What the dashed form would buy is
 * a name you can grep the user id out of, and nothing needs that -
 * `users.db_name` stores this value, so an operator reads the name out of
 * central rather than deriving it.
 *
 * **How this reached production is the part worth keeping.** The name is built
 * here, stored at registration, and only ever sent to Turso when an account is
 * first verified - so it is not exercised by a build, a lint, a type, or by
 * either test suite, both of which run in local mode where no name is ever sent
 * anywhere. It failed on the first real provisioning attempt after the move to a
 * Turso organization that enforced the limit, with every gate in this repository
 * green. `database.constants.spec.ts` is the cheap guard that now exists.
 */
export function userDbName(userId: string): string {
  return `${USER_DB_NAME_PREFIX}${userId.replaceAll('-', '')}`;
}
