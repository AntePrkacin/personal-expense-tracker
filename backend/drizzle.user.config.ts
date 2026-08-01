import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for a *per-user* database.
 *
 * There is one schema but N databases, so `dbCredentials.url` here is only
 * meaningful for `db:studio:user`, which inspects whichever single local file
 * USER_DB_URL points at. Generation (`db:generate:user`) only reads the schema
 * and writes to `out`; the app applies the result to every user database on
 * first open (see UserDatabaseService).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/database/user/schema.ts',
  out: './drizzle/user',
  dbCredentials: {
    url:
      process.env.USER_DB_URL ??
      `${process.env.DATABASE_DIR ?? './databases'}/users/dev.db`,
  },
});
