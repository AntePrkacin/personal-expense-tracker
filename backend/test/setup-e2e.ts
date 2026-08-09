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
 *   ones and the Gemini key, so the suite runs in local mode against plain
 *   files: no network, no cloud credentials, no databases created in a real
 *   Turso organization, no real login emails sent to whatever addresses the
 *   tests invent, and no real receipt-extraction calls billed to the project.
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

// Same reason, and the same hazard one endpoint further out: with a key in the
// shell - direnv or mise loading backend/.env, or a plain `export` - the six
// scan tests in transactions.e2e-spec.ts stop expecting 503 and start making
// real Gemini calls with four bytes of fake PNG, taking the throttler test's
// 3x503-then-429 sequence down with them. `ignoreEnvFile` covers backend/.env;
// only this covers the shell.
delete process.env.GEMINI_API_KEY;

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

/**
 * Same reasoning as `AUTH_RATE_LIMIT` above, and set here for the same
 * "before any hook" reason: small enough for `transactions.e2e-spec.ts` to
 * trip the `scan` throttler in a few requests. `GEMINI_API_KEY` is deleted
 * above rather than merely left unassigned, so every scan request answers 503
 * before it would ever reach the network - which is what lets the throttler
 * test run with no real Gemini key, on a developer's machine as well as in CI.
 */
process.env.SCAN_RATE_LIMIT = '3';

/** Exported so suites can clean the directory up in `afterAll`. */
export const E2E_DATABASE_DIR = dir;
