import type { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import type { App } from 'supertest/types';
import { bootDemoApp, handOut } from './demo-pool';

/**
 * The fifth named throttler.
 *
 * The route is public, unauthenticated, and rewrites roughly 2,000 rows every
 * time it hands an account over, so what the limiter bounds is not cost but
 * churn: without it one caller can keep the entire pool re-seeding itself for
 * nobody.
 *
 * **The status is the assertion, not which account came back.** The pool is
 * empty here, so the first call is a 503 and the second a 429 - and that
 * ordering is itself the proof, because it shows the limiter running in a guard
 * ahead of the handler rather than after it.
 */
describe('Demo endpoint, rate limited (e2e)', () => {
  let app: INestApplication<App>;
  const databaseDir = process.env.DATABASE_DIR!;

  beforeAll(async () => {
    app = await bootDemoApp({ DEMO_ENABLED: 'true', DEMO_RATE_LIMIT: '1' });
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('refuses a second hand-out inside the window', async () => {
    await handOut(app, '203.0.113.1').expect(503);
    await handOut(app, '203.0.113.1').expect(429);
  });

  /**
   * The bucket is the visitor, not the frontend.
   *
   * Every browser reaches this route through one route handler on Vercel, so
   * `req.ip` is a single egress address for all of them and the limiter used to
   * put the entire internet in one bucket of five an hour. What separates them
   * is a header the frontend sets and `DemoSecretGuard` trusts only after the
   * shared secret has checked out - so this asserts the separation *and*, by
   * going through `handOut`, that it takes the secret to get it.
   */
  it('gives a second visitor their own bucket', async () => {
    // The first visitor's budget is already spent by the test above.
    await handOut(app, '203.0.113.2').expect(503);
  });
});
