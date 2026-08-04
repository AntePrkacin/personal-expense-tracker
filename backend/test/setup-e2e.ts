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
 * - strip every TURSO_* variable inherited from the shell, plus the two mail
 *   ones, so the suite runs in local mode against plain files: no network, no
 *   cloud credentials, no databases created in a real Turso organization, and
 *   no real login emails sent to whatever addresses the tests invent.
 *
 * This file alone is NOT enough for the second guarantee, and relying on it
 * was a real bug: ConfigModule also reads backend/.env from disk, which put
 * the deleted variables straight back and pointed the whole suite at live
 * Turso Cloud. AppModule closes that hole with `ignoreEnvFile` under
 * NODE_ENV=test. Both halves are needed - this one covers the shell, that one
 * covers the file.
 */
const dir = mkdtempSync(join(tmpdir(), 'spendifico-e2e-'));
process.env.DATABASE_DIR = dir;

for (const key of Object.keys(process.env)) {
  if (key.startsWith('TURSO_')) {
    delete process.env[key];
  }
}

// Named explicitly: they share no prefix with each other or with TURSO_, so the
// loop above does not reach them. Without MAILPACE_API_TOKEN, MailModule wires
// LogMailer and there is no transport that could reach the network.
delete process.env.MAILPACE_API_TOKEN;
delete process.env.MAIL_FROM;

/**
 * A rate limit small enough for a test to reach in a few requests.
 *
 * It has to be set *here* rather than in a suite's `beforeAll`.
 * `ConfigModule.forRoot()` is evaluated inside AppModule's `imports` array,
 * which runs when app.module.ts is imported - before any hook. Setting it later
 * is silently too late: the app keeps the default and the throttle test waits
 * for a 429 that needs five more requests.
 */
process.env.AUTH_RATE_LIMIT = '3';

/**
 * Park the per-IP limiter out of the way. Every supertest request arrives from
 * 127.0.0.1, so the whole suite shares one IP bucket per route; left at its
 * default of 30 it would start answering 429 partway through the file, long
 * before any test that means to trip the per-email limiter. The per-IP
 * dimension is unit-tested instead (auth.module.spec.ts), because e2e cannot
 * vary the caller's address.
 */
process.env.AUTH_RATE_IP_LIMIT = '1000';

/** Exported so suites can clean the directory up in `afterAll`. */
export const E2E_DATABASE_DIR = dir;
