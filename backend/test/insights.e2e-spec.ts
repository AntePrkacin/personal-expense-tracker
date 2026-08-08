import { ConflictException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { categoryTemplateIds } from './category-templates';
import { LoginTokenService } from './../src/auth/login-token.service';
import { newId } from './../src/common/ids';
import { monthWindow, todayIn } from './../src/common/month-window';
import type { DashboardResponseDto } from './../src/dashboard/dto/dashboard-response.dto';
import type { InsightSetResponseDto } from './../src/insights/dto/insight-set-response.dto';
import {
  GENERATING_STALE_AFTER_MS,
  InsightsService,
} from './../src/insights/insights.service';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { insightSets, insights } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import { MemoryMailer } from './memory-mailer';

/**
 * The insights read, against real databases.
 *
 * PET-41 owns storage and the read but not generation (PET-40), so this suite
 * seeds `insight_sets`/`insights` rows directly and proves what only a real
 * database can: that `status = 'ready'` skips a failed run, that the newest set
 * wins by `generated_at`, that a `generating` row flips the state while the last
 * ready content still comes back, and that the dashboard teaser reads the same
 * newest set.
 */
describe('Insight endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  const databaseDir = process.env.DATABASE_DIR!;

  let bearer: string;
  let userId: string;
  let otherBearer: string;

  const insightsBody = (response: request.Response) =>
    response.body as InsightSetResponseDto;

  const dashboardBody = (response: request.Response) =>
    response.body as DashboardResponseDto;

  let emailCounter = 0;
  const nextEmail = () => `Insighter${++emailCounter}@Example.COM`;

  const get = (token = bearer) =>
    request(app.getHttpServer())
      .get('/api/insights')
      .set('Authorization', `Bearer ${token}`);

  const dashboard = (token = bearer) =>
    request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);

  const generate = (token = bearer) =>
    request(app.getHttpServer())
      .post('/api/insights/generate')
      .set('Authorization', `Bearer ${token}`);

  const addTransaction = (
    token: string,
    payload: {
      categoryId: string;
      amount: number;
      date: string;
      merchant?: string;
    },
  ) =>
    request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchant: 'Konzum', ...payload })
      .expect(201);

  /** The current period, since registration leaves `monthStartDay` at 1. */
  const window = monthWindow(1, todayIn('Europe/Zagreb'));

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /** Polls the read until the floated run leaves the generating state. */
  const waitForSettled = async (token = bearer) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const body = insightsBody(await get(token).expect(200));
      if (body.state !== 'generating') {
        return body;
      }
      await sleep(20);
    }
    throw new Error('insight generation did not settle');
  };

  /** Inserts one set row and returns its id. Content is null unless given. */
  const seedSet = async (fields: {
    status: 'generating' | 'ready' | 'failed';
    monthLabel?: string;
    summaryHeadline?: string;
    summaryBody?: string;
    generatedAt?: Date;
    createdAt?: Date;
  }) => {
    const db = await userDatabases.getUserDb(userId);
    const id = newId();
    await db.insert(insightSets).values({
      id,
      status: fields.status,
      monthLabel: fields.monthLabel ?? null,
      summaryHeadline: fields.summaryHeadline ?? null,
      summaryBody: fields.summaryBody ?? null,
      generatedAt: fields.generatedAt ?? null,
      // Omitted so the column's $defaultFn stamps "now"; set only when a test
      // needs an aged row, as the stale-run reclaim does.
      ...(fields.createdAt ? { createdAt: fields.createdAt } : {}),
    });
    return id;
  };

  /** Inserts cards for a set, `sortOrder` following array order. */
  const seedCards = async (
    setId: string,
    cards: { tone: string; title: string; body: string }[],
  ) => {
    const db = await userDatabases.getUserDb(userId);
    await db.insert(insights).values(
      cards.map((card, index) => ({
        id: newId(),
        setId,
        tone: card.tone,
        title: card.title,
        body: card.body,
        sortOrder: index,
      })),
    );
  };

  /** A complete ready set, the common seed. */
  const seedReadySet = async (headline: string, generatedAt: Date) => {
    const id = await seedSet({
      status: 'ready',
      monthLabel: 'October 2025',
      summaryHeadline: headline,
      summaryBody: "You've spent $1,240 of your $2,000 budget.",
      generatedAt,
    });
    await seedCards(id, [
      {
        tone: 'warning',
        title: 'Dining out is over budget',
        body: '$312 of $300 - $12 over',
      },
      {
        tone: 'info',
        title: 'On pace for $1,980',
        body: 'Just under your $2,000 target',
      },
    ]);
    return id;
  };

  /** Empties the primary user's insight tables, so each test starts clean. */
  const reset = async () => {
    const db = await userDatabases.getUserDb(userId);
    await db.delete(insights);
    await db.delete(insightSets);
  };

  let mailer: MemoryMailer;

  // Resolved in beforeAll: RegisterDto.categories takes category template
  // ids, and those are minted by the boot seed into this run's own database.
  let pickedCategoryIds: string[] = [];

  const provision = async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        currency: 'eur',
        monthlyBudget: 2000,
        categories: pickedCategoryIds,
      })
      .expect(202);
    await mailer.waitFor(email.toLowerCase(), 1);

    const [user] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    const rawToken = await loginTokens.issue(user.id);
    const response = await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({ token: rawToken })
      .expect(200);

    return { id: user.id, token: (response.body as { token: string }).token };
  };

  beforeAll(async () => {
    mailer = new MemoryMailer();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    pickedCategoryIds = await categoryTemplateIds(app, [
      'Transportation',
      'Groceries',
    ]);

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
    userDatabases = app.get(UserDatabaseService);

    const primary = await provision();
    userId = primary.id;
    bearer = primary.token;
    otherBearer = (await provision()).token;
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(reset);

  it('refuses a request with no bearer', async () => {
    await request(app.getHttpServer()).get('/api/insights').expect(401);
  });

  it('reports the empty state before anything has generated', async () => {
    const body = insightsBody(await get().expect(200));

    expect(body).toEqual({
      state: 'empty',
      monthLabel: null,
      summary: null,
      insights: [],
      generatedAt: null,
    });
  });

  it('returns a ready set with its summary and cards in order', async () => {
    await seedReadySet(
      'You are on track this month',
      new Date('2025-10-20T09:00:00.000Z'),
    );

    const body = insightsBody(await get().expect(200));

    expect(body.state).toBe('ready');
    expect(body.monthLabel).toBe('October 2025');
    expect(body.summary).toEqual({
      headline: 'You are on track this month',
      body: "You've spent $1,240 of your $2,000 budget.",
    });
    expect(body.insights.map((card) => card.title)).toEqual([
      'Dining out is over budget',
      'On pace for $1,980',
    ]);
    expect(body.generatedAt).toBe('2025-10-20T09:00:00.000Z');
  });

  it('reports generating during a regenerate while still returning the last ready content', async () => {
    await seedReadySet(
      'Last month was steady',
      new Date('2025-10-20T09:00:00.000Z'),
    );
    await seedSet({ status: 'generating' });

    const body = insightsBody(await get().expect(200));

    expect(body.state).toBe('generating');
    // The page renders skeletons off `state`; the content is still here so the
    // dashboard teaser does not blank mid-run.
    expect(body.summary?.headline).toBe('Last month was steady');
    expect(body.insights).toHaveLength(2);
  });

  it('reports generating with no content while the very first run is in flight', async () => {
    await seedSet({ status: 'generating' });

    const body = insightsBody(await get().expect(200));

    expect(body).toEqual({
      state: 'generating',
      monthLabel: null,
      summary: null,
      insights: [],
      generatedAt: null,
    });
  });

  it('leaves the previous ready set readable after a failed run (AC6)', async () => {
    await seedReadySet(
      'Groceries held steady',
      new Date('2025-10-20T09:00:00.000Z'),
    );
    // A regenerate that failed: its row is `failed`, not `ready`, and carries no
    // content. Nothing was overwritten, so the read simply skips it.
    await seedSet({ status: 'failed' });

    const body = insightsBody(await get().expect(200));

    expect(body.state).toBe('ready');
    expect(body.summary?.headline).toBe('Groceries held steady');
  });

  it('returns the newest ready set when more than one exists (AC5)', async () => {
    await seedReadySet('Older set', new Date('2025-09-20T09:00:00.000Z'));
    await seedReadySet('Newer set', new Date('2025-10-20T09:00:00.000Z'));

    const body = insightsBody(await get().expect(200));

    expect(body.summary?.headline).toBe('Newer set');
    expect(body.generatedAt).toBe('2025-10-20T09:00:00.000Z');
  });

  it('feeds the dashboard teaser from the newest ready set', async () => {
    await seedReadySet('Older set', new Date('2025-09-20T09:00:00.000Z'));
    await seedReadySet(
      'You are on track this month',
      new Date('2025-10-20T09:00:00.000Z'),
    );

    const body = dashboardBody(await dashboard().expect(200));

    expect(body.insight).toEqual({
      headline: 'You are on track this month',
      body: "You've spent $1,240 of your $2,000 budget.",
    });
  });

  it('gives the dashboard teaser null when nothing has generated', async () => {
    const body = dashboardBody(await dashboard().expect(200));

    expect(body.insight).toBeNull();
  });

  it('does not leak one user’s set to another', async () => {
    await seedReadySet(
      'Private to the first user',
      new Date('2025-10-20T09:00:00.000Z'),
    );

    // The second account provisioned its own database and never generated.
    const body = insightsBody(await get(otherBearer).expect(200));

    expect(body.state).toBe('empty');
  });

  it('generates a ready set from real transactions', async () => {
    // A fresh account so the seeded-row tests above do not interfere, and its
    // own transactions drive a real generation rather than a seeded set.
    const fresh = await provision();
    const listResponse = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    const { categories } = listResponse.body as {
      categories: { id: string; name: string }[];
    };
    const groceries = categories.find((row) => row.name === 'Groceries')!;

    await addTransaction(fresh.token, {
      categoryId: groceries.id,
      amount: 500,
      date: window.start,
    });
    await addTransaction(fresh.token, {
      categoryId: groceries.id,
      amount: 100,
      date: window.start,
    });

    await generate(fresh.token).expect(202);
    const body = await waitForSettled(fresh.token);

    expect(body.state).toBe('ready');
    expect(body.summary?.headline).toBeTruthy();
    expect(body.generatedAt).not.toBeNull();
    // Spend in the current period always yields at least the projection card.
    expect(body.insights.length).toBeGreaterThanOrEqual(1);
    expect(body.insights.some((card) => card.tone === 'info')).toBe(true);
  });

  it('refuses a second run while one is in flight (409)', async () => {
    // A generating row standing in for a run that has not finished.
    await seedSet({ status: 'generating' });

    await generate().expect(409);
  });

  it('lets only one of two concurrent runs start', async () => {
    // Both calls can clear the in-flight check before either insert lands, so the
    // partial unique index on `status = 'generating'` is what decides the winner
    // rather than the check - and this is the only place the driver's real
    // constraint message meets the translation that turns it into the 409. If the
    // check happens to win the interleaving the assertion still holds, because
    // either path is one ConflictException; what must never happen is two runs.
    //
    // Driven through the service rather than two concurrent HTTP requests, which
    // would race supertest's own listen/close on the shared server (ECONNRESET).
    const service = app.get(InsightsService);

    const outcomes = await Promise.allSettled([
      service.generate(userId),
      service.generate(userId),
    ]);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );

    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    await waitForSettled();
  });

  it('reclaims an abandoned generating run past the stale cutoff', async () => {
    const db = await userDatabases.getUserDb(userId);
    // A generating row left behind by a run that died before it could settle,
    // aged past the service's own staleness cutoff.
    const staleId = await seedSet({
      status: 'generating',
      // Derived from the service's own cutoff, not a restated number: raising
      // GENERATING_STALE_AFTER_MS must not quietly stop this test from aging the
      // row past it.
      createdAt: new Date(Date.now() - GENERATING_STALE_AFTER_MS - 60_000),
    });

    // The read no longer treats it as in flight, so the state settles rather
    // than showing skeletons forever.
    expect(insightsBody(await get().expect(200)).state).toBe('empty');

    // And a fresh POST is accepted rather than 409'd against the stale row. The
    // primary account has no transactions, so the new run settles back to empty;
    // the stale row is reclaimed to `failed`, which is what frees the single-run
    // unique index for the new insert.
    await generate().expect(202);
    await waitForSettled();

    const [stale] = await db
      .select({ status: insightSets.status })
      .from(insightSets)
      .where(eq(insightSets.id, staleId));
    expect(stale.status).toBe('failed');
  });

  it('produces no set when the account has no transactions', async () => {
    const fresh = await provision();

    await generate(fresh.token).expect(202);
    const body = await waitForSettled(fresh.token);

    // The placeholder run is removed once the generator finds nothing to say,
    // so the account settles back to empty rather than a bare ready set.
    expect(body.state).toBe('empty');
  });
});
