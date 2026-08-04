import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { connect as connectLocal } from '@tursodatabase/database';
import { connect as connectSync } from '@tursodatabase/sync';
import { drizzle as localDrizzle } from 'drizzle-orm/tursodatabase/database';
import { drizzle as syncDrizzle } from 'drizzle-orm/tursodatabase-sync';
import { SYNC_CLIENT_NAME } from './database.constants';
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
  /** Local file backing the synced copy. Turso writes siblings (-wal, -info). */
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

/** Opens a synced copy of a Turso Cloud database. */
export async function openCloudDatabase(
  options: CloudConnectionOptions,
): Promise<DatabaseHandle> {
  const client = await connectSync({
    path: options.path,
    url: toSyncUrl(options.url),
    authToken: options.authToken,
    clientName: SYNC_CLIENT_NAME,
  });

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
