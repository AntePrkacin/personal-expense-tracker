import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs before each e2e test file, via `setupFiles` in jest-e2e.json.
 *
 * Two jobs:
 * - point DATABASE_DIR at a fresh temp directory per test file, so tests
 *   never touch the developer's `backend/databases/` and test files cannot
 *   collide, whether they run in parallel workers or share one;
 * - strip every TURSO_* variable inherited from the shell, so the suite runs
 *   in local mode against plain files: no network, no cloud credentials, no
 *   databases created in a real Turso organization.
 *
 * This file alone is NOT enough for the second guarantee, and relying on it
 * was a real bug: ConfigModule also reads backend/.env from disk, which put
 * the deleted variables straight back and pointed the whole suite at live
 * Turso Cloud. AppModule closes that hole with `ignoreEnvFile` under
 * NODE_ENV=test. Both halves are needed - this one covers the shell, that one
 * covers the file.
 */
const dir = mkdtempSync(join(tmpdir(), 'expensa-e2e-'));
process.env.DATABASE_DIR = dir;

for (const key of Object.keys(process.env)) {
  if (key.startsWith('TURSO_')) {
    delete process.env[key];
  }
}

/** Exported so suites can clean the directory up in `afterAll`. */
export const E2E_DATABASE_DIR = dir;
