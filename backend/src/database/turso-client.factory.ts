import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { connect as connectLocal } from '@tursodatabase/database';
import { connect as connectSync } from '@tursodatabase/sync';
import { drizzle as localDrizzle } from 'drizzle-orm/tursodatabase/database';
import { drizzle as syncDrizzle } from 'drizzle-orm/tursodatabase-sync';
import {
  SYNC_CLIENT_NAME,
  SYNC_DISCRIMINATOR_SIBLING,
} from './database.constants';
import type { DatabaseHandle } from './database.types';

/**
 * The one seam between the two persistence modes.
 *
 * Cloud mode uses `@tursodatabase/sync`: a local file that is kept in step with
 * a Turso Cloud database. Local mode uses `@tursodatabase/database`: the same
 * engine over a plain local file, nothing remote. Both speak the same SQLite
 * dialect, so one schema and one migrations folder serve both.
 *
 * Nothing outside this file and UserDatabaseService knows how a connection is
 * opened.
 */

const logger = new Logger('TursoClientFactory');

export interface CloudConnectionOptions {
  /**
   * Local file backing the synced copy. See `SYNC_ONLY_SIBLINGS` in
   * `database.constants.ts` for the full set of siblings a replica carries
   * beside it; `SYNC_DISCRIMINATOR_SIBLING` below is only one of those.
   */
  path: string;
  /** Remote database URL or bare hostname, as returned by the Platform API. */
  url: string;
  /** Data-plane token for that one database. */
  authToken: string;
  /** How often to push local writes and pull remote ones. */
  syncIntervalS: number;
}

export interface LocalConnectionOptions {
  path: string;
}

/**
 * The sync client accepts `libsql://` and `turso://` and rewrites them to
 * `https://` itself, so the only case needing help is the Platform API's bare
 * `Hostname` (e.g. `spendifico-user-x-acme.aws-eu-west-1.turso.io`), which we
 * store verbatim rather than guessing a scheme at write time.
 */
export function toSyncUrl(urlOrHostname: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(urlOrHostname)
    ? urlOrHostname
    : `https://${urlOrHostname}`;
}

/**
 * Suffix of a sibling file only `@tursodatabase/sync` ever writes, which is
 * what makes it the tell for which engine owns a path. Sourced from
 * `database.constants.ts` so `deleteUserDb`'s cleanup list can share it
 * rather than risk drifting from what this guard actually checks.
 *
 * Observed against `@tursodatabase/sync` 0.7.2 on 2026-08-08: a replica carries
 * `-changes`, `-info` and `-log` beside the main file, all three written by
 * `connect()` rather than by the first push, so this holds for a replica that
 * has never synced. A plain `@tursodatabase/database` file carries only `-wal`,
 * which is why `-wal` cannot be the tell - both engines write one. This is an
 * observation about the engine rather than a documented API, so `package.json`
 * pins that version exactly rather than a `^` range, and `openCloudDatabase`
 * asserts the observation still holds on every successful connect - re-run the
 * check by hand if that pin is ever deliberately moved.
 */
const SYNC_SIBLING = SYNC_DISCRIMINATOR_SIBLING;

/**
 * One `DATABASE_DIR` must not serve both persistence modes. Both use the same
 * paths (`app.db`, `users/<db-name>.db`), so nothing but this stops a directory
 * from being opened by the other engine, and the result is data loss that
 * reports itself nowhere.
 *
 * These refuse rather than warn, deliberately: the whole failure mode is that
 * every local check looks healthy, so a logged warning would be missed exactly
 * as reliably as the original bug was. They run before either client is
 * constructed, so no write is ever accepted against a connection that cannot
 * keep it.
 *
 * A plain `Error` rather than an `HttpException` because neither caller is a
 * request: the central database fails the Nest boot, and a user database fails
 * that one request as a generic 500.
 */
function assertNotPlainFile(path: string): void {
  if (!existsSync(path) || existsSync(`${path}${SYNC_SIBLING}`)) return;

  // Adoption destroys the file rather than merely failing to push it: the
  // bootstrap overwrites it with the cloud's contents, so rows written while it
  // was plain are unreadable locally as well as absent remotely. That is only
  // the quiet variant - with a live WAL the engine throws `Corrupt database`
  // instead, and which one you get turns on whether the plain engine happened
  // to checkpoint, which no caller can see.
  throw new Error(
    `Refusing to open ${path} as a Turso sync replica: it is a plain local ` +
      `database file, with no ${path}${SYNC_SIBLING} beside it. Adopting it ` +
      `would discard everything in it, locally and in the cloud. Either ` +
      `delete ${path} and its siblings and let the replica re-bootstrap from ` +
      `Turso Cloud, which is the source of truth, or point DATABASE_DIR at a ` +
      `directory that cloud mode has to itself.`,
  );
}

function assertNotSyncReplica(path: string): void {
  if (!existsSync(`${path}${SYNC_SIBLING}`)) return;

  // The mirror image of assertNotPlainFile, and not the direction PET-60 hit,
  // but every bit as destructive: the plain engine opens a replica and writes
  // to it without complaint, and the write is outside the sync engine's change
  // log, so the next `connectSync` open discards it locally and never pushes
  // it.
  throw new Error(
    `Refusing to open ${path} as a plain local database file: it is a Turso ` +
      `sync replica, with ${path}${SYNC_SIBLING} beside it. Writing to it ` +
      `behind the sync engine would discard the write at the next sync. ` +
      `Either delete ${path} and its siblings, losing whatever has not been ` +
      `pushed, or point DATABASE_DIR at a directory that local mode has to ` +
      `itself.`,
  );
}

/** Opens a synced copy of a Turso Cloud database. */
export async function openCloudDatabase(
  options: CloudConnectionOptions,
): Promise<DatabaseHandle> {
  assertNotPlainFile(options.path);

  const client = await connectSync({
    path: options.path,
    url: toSyncUrl(options.url),
    authToken: options.authToken,
    clientName: SYNC_CLIENT_NAME,
  });

  // The whole guard rests on `connect()` leaving SYNC_SIBLING behind, which is
  // an observed engine behaviour rather than a documented one - see the
  // constant's own comment. Checking it here, once, on every successful
  // connect turns a silent assumption failure (the guard quietly stops
  // telling replicas from plain files) into a loud one at the one place that
  // can still see both sides of it.
  if (!existsSync(`${options.path}${SYNC_SIBLING}`)) {
    throw new Error(
      `@tursodatabase/sync connected to ${options.path} without leaving a ` +
        `${SYNC_SIBLING} sibling beside it. The mixed-persistence guard in ` +
        `this file depends on that sibling to tell a sync replica from a ` +
        `plain local file, so it can no longer do its job - do not deploy ` +
        `until this is investigated.`,
    );
  }

  const db = syncDrizzle({ client });
  await enableForeignKeys(db);

  // The client syncs on demand, not on a timer of its own, so drive it here:
  // push local writes out first, then pull whatever else changed.
  //
  // Coalesced: a caller arriving mid-sync shares the running one instead of
  // racing a second push/pull against the same client, which is what a tick
  // outlasting the interval would otherwise do. Writes landing after a shared
  // run's push started are not lost, only deferred: the local file keeps them
  // until the next run, or the first open after a restart, pushes them.
  let inFlight: Promise<void> | null = null;
  const sync = (): Promise<void> => {
    inFlight ??= (async () => {
      try {
        await client.push();
        await client.pull();
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  // `connect()` already bootstrapped/pulled, so the first tick is a full
  // interval away. `unref` keeps the timer from holding the process open.
  const timer = setInterval(() => {
    void sync().catch((error) => {
      logger.error(
        `Background sync failed for ${options.path}`,
        error as Error,
      );
    });
  }, options.syncIntervalS * 1000);
  timer.unref();

  return {
    db,
    sync,
    close: async () => {
      clearInterval(timer);
      // Best effort: get local writes out before dropping the connection.
      await sync().catch((error) => {
        logger.error(`Final sync failed for ${options.path}`, error as Error);
      });
      await client.close();
    },
  };
}

/** Opens a plain local database file - CI, e2e, and offline development. */
export async function openLocalDatabase(
  options: LocalConnectionOptions,
): Promise<DatabaseHandle> {
  assertNotSyncReplica(options.path);

  const client = await connectLocal(options.path);
  const db = localDrizzle({ client });
  await enableForeignKeys(db);

  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * SQLite (and this engine) leaves foreign-key enforcement off by default, and
 * the setting is per connection rather than per file, so it has to be set on
 * every open.
 */
async function enableForeignKeys(db: {
  run: (query: ReturnType<typeof sql>) => unknown;
}) {
  await db.run(sql`pragma foreign_keys = ON`);
}
