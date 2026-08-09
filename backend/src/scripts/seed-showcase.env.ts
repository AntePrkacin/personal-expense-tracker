/**
 * Picks the seed script's target - local files or Turso Cloud - and makes the
 * local choice actually stick. Imported for its side effects only, and it must
 * run before `app.module.ts` is loaded: `ConfigModule.forRoot()` is evaluated
 * inside AppModule's `imports` array, which happens at import time, before any
 * code in `seed-showcase.ts` gets a turn.
 *
 * This is the third caller of the two-halves pattern `test/setup-e2e.ts` and
 * `openapi.env.ts` already use, and it is here for the same reason both of
 * those are. Scrubbing `TURSO_*` out of `process.env` is not enough on its own:
 * ConfigModule reads `backend/.env` from disk and dotenv puts every deleted key
 * straight back, so a developer with cloud credentials in `.env` would find
 * `--local` quietly provisioning a real database in the project's Turso
 * organization. `SEED_LOCAL` is the other half, read by AppModule.
 *
 * Local is the default because the failure directions are not symmetric. A
 * local seed run by mistake writes a gitignored SQLite file; a cloud seed run
 * by mistake creates a real database and thousands of rows in shared
 * infrastructure. Reaching the cloud therefore has to be asked for by name.
 *
 * One thing `--local` inherits from `ignoreEnvFile` and cannot avoid: every
 * other value in `backend/.env` is skipped too, `DATABASE_DIR` included, so the
 * seed lands under the `./databases` default. Export `DATABASE_DIR` in the
 * shell if your local dev server reads somewhere else - `process.env` survives
 * `ignoreEnvFile`, which is what makes that work.
 */

/** Where the seed writes. `--cloud` is opt-in; anything else means local. */
export type SeedMode = 'local' | 'cloud';

function parseMode(argv: readonly string[]): SeedMode {
  if (argv.includes('--cloud')) {
    return 'cloud';
  }
  if (argv.includes('--local')) {
    return 'local';
  }
  return 'local';
}

export const SEED_MODE: SeedMode = parseMode(process.argv.slice(2));

if (SEED_MODE === 'local') {
  // Read by AppModule's `ignoreEnvFile`, which is the half of this that covers
  // the file on disk. Setting it here rather than in the mise task is what
  // keeps the flag and the behaviour in one place.
  process.env.SEED_LOCAL = '1';

  // And this is the half that covers the shell.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('TURSO_')) {
      delete process.env[key];
    }
  }

  // Named explicitly: they share no prefix with TURSO_, so the loop above does
  // not reach them. Without MAILPACE_API_TOKEN, MailModule wires LogMailer, so
  // provisioning the showcase user cannot send a real login email to an address
  // this script invented.
  delete process.env.MAILPACE_API_TOKEN;
  delete process.env.MAIL_FROM;
}
