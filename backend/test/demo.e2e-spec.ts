import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { demoAccounts } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { transactions } from './../src/database/user/schema';
import { bootDemoApp, enrolAccount, whoami } from './demo-pool';

/**
 * Leasing a pooled demo account to a caller who presents no credential at all.
 *
 * Note the absent `import { AppModule }`: the app is booted through
 * `bootDemoApp`, which sets the configuration before importing it. See
 * `demo-pool.ts` for why that ordering is the whole reason this is three files.
 */
describe('Demo endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  const databaseDir = process.env.DATABASE_DIR!;

  beforeAll(async () => {
    app = await bootDemoApp({
      DEMO_ENABLED: 'true',
      // Far above anything here asks for. The limiter has a suite of its own,
      // and tripping it in this one would surface as a confusing 429 in a test
      // about leasing.
      DEMO_RATE_LIMIT: '1000',
    });
    centralDb = app.get<CentralDatabase>(APP_DB);
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('answers 503 while the pool is empty, rather than 500', async () => {
    // The state a deployment is in between enabling the feature and running the
    // pool seed. A pool with no accounts is a pool with none free, so the
    // ordinary busy answer is the right one.
    await request(app.getHttpServer()).post('/api/demo/session').expect(503);
  });

  it('hands out a session on a pooled account', async () => {
    await enrolAccount(app, 'demo-one@example.com');

    const response = await request(app.getHttpServer())
      .post('/api/demo/session')
      .expect(200);

    const body = response.body as { token: string; expiresAt: string };
    expect(typeof body.token).toBe('string');
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    await expect(whoami(app, body.token)).resolves.toBe('demo-one@example.com');
  });

  it('gives two callers two different accounts', async () => {
    await enrolAccount(app, 'demo-two@example.com');
    await enrolAccount(app, 'demo-three@example.com');

    const first = await request(app.getHttpServer())
      .post('/api/demo/session')
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/api/demo/session')
      .expect(200);

    const firstEmail = await whoami(
      app,
      (first.body as { token: string }).token,
    );
    const secondEmail = await whoami(
      app,
      (second.body as { token: string }).token,
    );

    expect(firstEmail).not.toBe(secondEmail);
  });

  it('turns the next caller away once every account is leased', async () => {
    // The three accounts above are leased by now, so this needs no setup: the
    // pool is genuinely exhausted rather than artificially so.
    const response = await request(app.getHttpServer())
      .post('/api/demo/session')
      .expect(503);

    // The header a client can act on, and the whole reason the controller takes
    // `@Res` at all.
    expect(response.headers['retry-after']).toBe('120');
  });

  it('reclaims an elapsed lease and restores what the last visitor did', async () => {
    const [pooled] = await centralDb.select().from(demoAccounts).limit(1);

    // Aged by hand rather than by waiting: the lease is configured in whole
    // minutes, so the alternative is a test that sleeps for one.
    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(demoAccounts.id, pooled.id));

    // Whoever held it emptied it. A hand-out must not pass that on - this is
    // the behaviour the whole pool design exists for.
    const userDb = await app.get(UserDatabaseService).getUserDb(pooled.userId);
    await userDb.delete(transactions);

    const response = await request(app.getHttpServer())
      .post('/api/demo/session')
      .expect(200);

    const token = (response.body as { token: string }).token;
    const listed = await request(app.getHttpServer())
      .get('/api/transactions?period=all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // A thousand rather than zero: the fixture is a few thousand transactions,
    // so this cannot pass on one stray row that escaped the delete above.
    expect((listed.body as { total: number }).total).toBeGreaterThan(1_000);
  }, 120_000);

  /**
   * The failure this whole column exists to prevent, and the one no other gate
   * in this repo can see.
   *
   * The fixture places transactions by (month, occurrence) and resolves them
   * against the day it was written, so an account seeded weeks ago has nothing
   * in its current period however untouched it is. Nothing about it looks
   * broken: the rows are there, the totals are right, and the dashboard the
   * visitor actually lands on is empty.
   */
  it('restores an untouched account whose fixture has gone stale', async () => {
    const [pooled] = await centralDb.select().from(demoAccounts).limit(1);

    // Free, never touched since the seed, and seeded well before today.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000);
    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: null, seededAt: twoDaysAgo })
      .where(eq(demoAccounts.id, pooled.id));

    await request(app.getHttpServer()).post('/api/demo/session').expect(200);

    const [after] = await centralDb
      .select()
      .from(demoAccounts)
      .where(eq(demoAccounts.id, pooled.id));

    // Re-stamped, which only happens on a restore that actually ran.
    expect(after.seededAt!.getTime()).toBeGreaterThan(twoDaysAgo.getTime());
  }, 120_000);
});
