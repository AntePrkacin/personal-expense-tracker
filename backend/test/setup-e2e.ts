import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs once per Jest worker, before any test file, via `setupFiles` in
 * jest-e2e.json.
 *
 * Two jobs:
 * - point DATABASE_DIR at a fresh temp directory, so tests never touch the
 *   developer's `backend/databases/` and parallel workers cannot collide;
 * - strip every TURSO_* variable, so a developer with a filled-in .env still
 *   runs the suite in local mode against plain files - no network, no cloud
 *   credentials, no databases created in a real Turso organization.
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
