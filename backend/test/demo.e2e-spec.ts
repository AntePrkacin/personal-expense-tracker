import type { INestApplication } from '@nestjs/common';
import { eq, isNull, ne } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { demoAccounts } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import {
  assistantMessages,
  assistantSessions,
  categories,
  profile,
  transactions,
} from './../src/database/user/schema';
import { DEMO_SECRET_HEADER } from './../src/demo/demo-headers';
import { bootDemoApp, enrolAccount, handOut, whoami } from './demo-pool';

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
    await handOut(app).expect(503);
  });

  /**
   * The direct-URL bypass, closed.
   *
   * The API is on a public Cloud Run URL, so before the shared secret anybody
   * could skip the frontend, call this route from as many addresses as they had
   * and drain the pool - while every real visitor shared the frontend's single
   * egress bucket. **404 rather than 401**, so a caller cannot tell a wrong
   * credential from a deployment that never had a demo.
   */
  it('answers 404 to a caller who is not the frontend', async () => {
    await request(app.getHttpServer()).post('/api/demo/session').expect(404);

    await request(app.getHttpServer())
      .post('/api/demo/session')
      .set(DEMO_SECRET_HEADER, 'not-the-shared-secret')
      .expect(404);
  });

  it('hands out a session on a pooled account', async () => {
    await enrolAccount(app, 'demo-one@example.com');

    const response = await handOut(app).expect(200);

    const body = response.body as { token: string; expiresAt: string };
    expect(typeof body.token).toBe('string');
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    await expect(whoami(app, body.token)).resolves.toBe('demo-one@example.com');
  });

  it('gives two callers two different accounts', async () => {
    await enrolAccount(app, 'demo-two@example.com');
    await enrolAccount(app, 'demo-three@example.com');

    const first = await handOut(app).expect(200);
    const second = await handOut(app).expect(200);

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
    const response = await handOut(app).expect(503);

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

    const response = await handOut(app).expect(200);

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

    await handOut(app).expect(200);

    const [after] = await centralDb
      .select()
      .from(demoAccounts)
      .where(eq(demoAccounts.id, pooled.id));

    // Re-stamped, which only happens on a restore that actually ran.
    expect(after.seededAt!.getTime()).toBeGreaterThan(twoDaysAgo.getTime());
  }, 120_000);

  /**
   * What the previous visitor leaves behind, and what their bearer can still
   * reach afterwards.
   *
   * Both halves of the isolation the pool promises, in one walk because both
   * need the same expensive setup: an account leased, used, reclaimed and
   * handed to somebody else. Every other account is pinned as leased first, so
   * the second hand-out can only pick this one.
   */
  it("ends the last visitor's session and clears what they typed", async () => {
    const userId = await enrolAccount(app, 'demo-four@example.com');

    // Nothing else is claimable, so the hand-out below is this account's.
    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: new Date(Date.now() + 60 * 60_000) })
      .where(ne(demoAccounts.userId, userId));

    const first = await handOut(app).expect(200);
    const staleToken = (first.body as { token: string }).token;
    expect(await whoami(app, staleToken)).toBe('demo-four@example.com');

    // What a visitor actually leaves: a conversation, and a display name.
    const userDb = await app.get(UserDatabaseService).getUserDb(userId);
    await userDb.insert(assistantSessions).values({
      id: 'chat-session-id',
      title: 'How much did I spend on rent?',
    });
    await userDb.insert(assistantMessages).values({
      id: 'chat-message-id',
      sessionId: 'chat-session-id',
      role: 'user',
      content: 'How much did I spend on rent?',
      sortOrder: 0,
    });
    await userDb.update(profile).set({ fullName: 'Somebody Else' });

    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(demoAccounts.userId, userId));

    await handOut(app).expect(200);

    // The bearer the first visitor kept. Dead from the moment the lease was
    // reclaimed, which is the whole point: a 30-day session on an account that
    // changes hands hourly is a 30-day read of everybody who has it next.
    await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${staleToken}`)
      .expect(401);

    expect(await userDb.select().from(assistantMessages)).toEqual([]);
    expect(await userDb.select().from(assistantSessions)).toEqual([]);
    const [restored] = await userDb.select().from(profile);
    expect(restored.fullName).not.toBe('Somebody Else');
  }, 120_000);
  /**
   * The poisoning that used to kill the only door into the deployed app.
   *
   * Renaming a category is something every visitor can do from the Manage
   * categories modal, and the restore used to assert the account's categories
   * against the fixture *before* rewriting anything - so the rename made every
   * later hand-out of that account throw, release the lease and answer 500.
   * Ten renames killed the advertised demo until somebody intervened by hand.
   */
  it('restores a renamed category instead of refusing the account', async () => {
    const userId = await enrolAccount(app, 'demo-five@example.com');

    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: new Date(Date.now() + 60 * 60_000) })
      .where(ne(demoAccounts.userId, userId));

    // Dirty, as a lease that has been held and reclaimed leaves it. Without
    // this the account is untouched and seeded today, so the hand-out below
    // hands it over as it is and proves nothing.
    await centralDb
      .update(demoAccounts)
      .set({ seededAt: null })
      .where(eq(demoAccounts.userId, userId));

    const userDb = await app.get(UserDatabaseService).getUserDb(userId);
    const [renamed, tombstoned] = await userDb
      .select()
      .from(categories)
      .where(eq(categories.isFallback, false))
      .limit(2);
    await userDb
      .update(categories)
      .set({ name: 'Not a fixture category' })
      .where(eq(categories.id, renamed.id));

    // Deleted the way a visitor's delete does it: a tombstone, not a removal,
    // so the row is still there to collide with whatever the restore writes.
    await userDb
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(eq(categories.id, tombstoned.id));

    // A hand-out, and the assertion is simply that it is a 200.
    const response = await handOut(app).expect(200);

    const live = await userDb
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt));
    // The tombstoned row is gone rather than merely filtered: the reconcile
    // deletes it, because a soft-deleted row keeps the name it was written
    // with and would sit beside the one being recreated forever.
    expect(await userDb.select().from(categories)).toHaveLength(13);
    expect(live.map((row) => row.name)).not.toContain('Not a fixture category');
    // Thirteen: the fixture's twelve plus the fallback, and exactly one of the
    // latter, which `categories_fallback_idx` would refuse to have twice.
    expect(live).toHaveLength(13);
    expect(live.filter((row) => row.isFallback)).toHaveLength(1);

    // Every transaction the restore wrote points at a category that exists,
    // which is what binding the fixture's names to freshly minted ids is for.
    const listed = await request(app.getHttpServer())
      .get('/api/transactions?period=all')
      .set(
        'Authorization',
        `Bearer ${(response.body as { token: string }).token}`,
      )
      .expect(200);
    expect((listed.body as { total: number }).total).toBeGreaterThan(1_000);
  }, 120_000);
  /**
   * The demo tier's own Gemini budget, proven on the route rather than in the
   * guard's unit spec.
   *
   * The suite boots with `CHAT_RATE_LIMIT` at its default of 20, so a sixth
   * refusal can only come from the lowered ceiling a pooled account gets.
   * Every answer before it is a **503** - no `GEMINI_API_KEY` here - which is
   * exactly the point: the limiter is a guard, so it counts a turn that the
   * handler then refuses, and an abuser spending the project's quota is
   * stopped at the same number whatever the model does.
   */
  it('gives a pooled account a lower chat budget than a real one', async () => {
    const userId = await enrolAccount(app, 'demo-six@example.com');

    await centralDb
      .update(demoAccounts)
      .set({ leaseExpiresAt: new Date(Date.now() + 60 * 60_000) })
      .where(ne(demoAccounts.userId, userId));

    const leased = await handOut(app).expect(200);
    const token = (leased.body as { token: string }).token;

    const ask = () =>
      request(app.getHttpServer())
        .post('/api/assistant/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'How much did I spend on rent?' });

    for (let turn = 0; turn < 5; turn += 1) {
      await ask().expect(503);
    }

    await ask().expect(429);
  }, 120_000);
});
