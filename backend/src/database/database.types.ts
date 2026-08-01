// An internal path: drizzle-orm v1 RC exports no public name for the shared
// async SQLite base the two drivers extend, so this specifier may move before
// v1 final. If a drizzle bump breaks this import, that is why.
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async/db';

/**
 * The app-facing database type.
 *
 * Cloud mode (`drizzle-orm/tursodatabase-sync`) and local mode
 * (`drizzle-orm/tursodatabase/database`) produce two different concrete Drizzle
 * classes, but both extend this async SQLite base with the same dialect. Coding
 * against the base is what lets every query read identically in both modes.
 *
 * The run-result generic is `any` because the two drivers report different
 * result shapes and nothing here consumes them (inserts use `.returning()`).
 */
export type AppDatabase = SQLiteAsyncDatabase<'async', any>;

/** A connection to the central database (the user directory). */
export type CentralDatabase = AppDatabase;

/** A connection to one user's own database. */
export type UserDatabase = AppDatabase;

/**
 * What turso-client.factory.ts hands back: the Drizzle instance plus the
 * lifecycle operations that differ between the two modes. `sync` is present
 * only in cloud mode - a plain local file has nothing to sync.
 */
export interface DatabaseHandle {
  db: AppDatabase;
  close(): Promise<void>;
  sync?: () => Promise<void>;
}
