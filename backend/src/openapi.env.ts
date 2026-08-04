import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Makes generating the spec harmless. Imported for its side effects only, and
 * it must run before `app.module.ts` is loaded - `ConfigModule.forRoot()` is
 * evaluated inside AppModule's `imports` array, which happens at import time,
 * before any code in `openapi.ts` gets a turn.
 *
 * Writing a JSON file has no business talking to Turso Cloud, but the emitter
 * boots the real AppModule to read the real routes, and the `APP_DB` factory
 * connects and migrates before Nest finishes assembling the app. With the four
 * cloud variables filled in, `npm run api:spec` would sync against production
 * infrastructure as a side effect.
 *
 * Two halves, and both are needed - the same pair `test/setup-e2e.ts` and
 * `AppModule` split between them. This scrubs the shell; `OPENAPI_EMIT` makes
 * AppModule skip `backend/.env`, without which dotenv would simply put every
 * deleted key straight back.
 */
process.env.OPENAPI_EMIT = '1';

/** Exported so the emitter can delete it again rather than litter /tmp. */
export const SCRATCH_DATABASE_DIR = mkdtempSync(
  join(tmpdir(), 'spendifico-openapi-'),
);

process.env.DATABASE_DIR = SCRATCH_DATABASE_DIR;

for (const key of Object.keys(process.env)) {
  if (key.startsWith('TURSO_')) {
    delete process.env[key];
  }
}
