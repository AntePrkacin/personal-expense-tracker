import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the *central* database (the user directory).
 *
 * Only used by the `db:generate:central` / `db:studio:central` scripts. The
 * running app never reads it: migrations are applied programmatically at boot
 * (see src/database/database.module.ts).
 *
 * drizzle-kit reads raw `process.env` and never passes through the Joi schema
 * in src/config/env.validation.ts, so the DATABASE_DIR default is repeated
 * here. Without it these scripts would resolve `undefined/app.db` whenever
 * there is no .env, breaking the "runs with no .env at all" property.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/database/central/schema.ts',
  out: './drizzle/central',
  dbCredentials: {
    url: `${process.env.DATABASE_DIR ?? './databases'}/app.db`,
  },
});
