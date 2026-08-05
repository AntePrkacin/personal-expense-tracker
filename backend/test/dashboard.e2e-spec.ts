import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { monthWindow, todayIn } from './../src/common/month-window';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { categories } from './../src/database/user/schema';
import type { DashboardResponseDto } from './../src/dashboard/dto/dashboard-response.dto';
import { MAILER } from './../src/mail/mailer';
import type { TransactionResponseDto } from './../src/transactions/dto/transaction-response.dto';
import { MemoryMailer } from './memory-mailer';

/**
 * The dashboard read, against real databases.
 *
 * What only an e2e can prove here: that the endpoint really composes
 * `CategoriesService` and `TransactionsService` rather than a mocked version of
 * either, that the weekly buckets it builds from a real window really sum to
 * the real total, and that an account with no transactions at all gets the
 * empty shape rather than an exception.
 *
 * Dates are derived from the live window rather than hard-coded, the same
 * reason `categories.e2e-spec.ts` and `transaction-reads.e2e-spec.ts` do.
 */
describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  // monthStartDay defaults to 1, so the period is the calendar month.
  const window = monthWindow(1, todayIn('Europe/Zagreb'));

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  const dashboardBody = (response: request.Response) =>
    response.body as DashboardResponseDto;

  const dashboard = (token: string) =>
    request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token}`);

  let emailCounter = 0;
  const nextEmail = () => `Reader${++emailCounter}@Example.COM`;

  /** Registers, verifies with a directly issued token, and returns the session. */
  const provision = async (monthlyBudget = 2000.5) => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        currency: 'eur',
        monthlyBudget,
        categories: ['Transport', 'Groceries'],
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

  const seed = async (
    token: string,
    payload: {
      merchant: string;
      categoryId: string;
      amount: number;
      date: string;
    },
  ) => {
    const response = await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    return response.body as TransactionResponseDto;
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

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
    userDatabases = app.get(UserDatabaseService);
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('refuses the read with no bearer, in the shared error envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard')
        .expect(401);

      expect(errorBody(response).statusCode).toBe(401);
    });
  });

  describe('a populated account', () => {
    let bearer: string;
    let userId: string;
    let groceriesId: string;
    let transportId: string;

    beforeAll(async () => {
      const account = await provision(2000.5);
      userId = account.id;
      bearer = account.token;

      const userDb = await userDatabases.getUserDb(userId);
      const seeded = await userDb
        .select()
        .from(categories)
        .orderBy(asc(categories.name));
      groceriesId = seeded.find((row) => row.name === 'Groceries')!.id;
      transportId = seeded.find((row) => row.name === 'Transport')!.id;

      // Four rows: two in Groceries, one in Transport, spread across the
      // period so the weekly buckets have more than one nonzero entry.
      await seed(bearer, {
        merchant: 'Konzum',
        categoryId: groceriesId,
        amount: 30,
        date: window.start,
      });
      await seed(bearer, {
        merchant: 'Spar',
        categoryId: groceriesId,
        amount: 20,
        date: window.start,
      });
      await seed(bearer, {
        merchant: 'Uber',
        categoryId: transportId,
        amount: 8.4,
        date: window.start,
      });
      await seed(bearer, {
        merchant: 'HZPP',
        categoryId: transportId,
        amount: 1.6,
        date: window.start,
      });
    });

    it('matches the stored total, remaining and transaction count, which is AC1', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      expect(body.spent).toBe(60);
      expect(body.transactionCount).toBe(4);
      expect(body.monthlyBudget).toBe(2000.5);
      expect(body.remaining).toBe(1940.5);
    });

    it('sums the weekly buckets to the period total, which is AC3', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      const bucketSum = body.weeklyBuckets.reduce((sum, b) => sum + b.total, 0);
      expect(bucketSum).toBe(body.spent);
      expect(body.weeklyBuckets.length).toBeGreaterThan(0);
    });

    it('returns every nonzero category with its share of the total, which is AC4', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      const groceries = body.categories.find((c) => c.id === groceriesId);
      const transport = body.categories.find((c) => c.id === transportId);
      expect(groceries?.spent).toBe(50);
      expect(groceries?.percent).toBeCloseTo((50 / 60) * 100, 10);
      expect(transport?.spent).toBe(10);
      expect(transport?.percent).toBeCloseTo((10 / 60) * 100, 10);
    });

    it('picks Groceries as the top category, the higher of the two', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      expect(body.topCategory?.id).toBe(groceriesId);
    });

    it('returns at most 3 recent transactions', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      expect(body.recentTransactions.length).toBeLessThanOrEqual(3);
    });

    it('answers insight: null, stubbed until PET-41', async () => {
      const response = await dashboard(bearer).expect(200);
      expect(dashboardBody(response).insight).toBeNull();
    });

    it('shows another account nothing of this one’s', async () => {
      const other = await provision();
      const response = await dashboard(other.token).expect(200);
      const body = dashboardBody(response);

      expect(body.spent).toBe(0);
      expect(body.transactionCount).toBe(0);
    });
  });

  describe('a two-way top-category tie', () => {
    it('breaks the tie by name ascending, through the real category query', async () => {
      const account = await provision();
      const userDb = await userDatabases.getUserDb(account.id);
      const seeded = await userDb
        .select()
        .from(categories)
        .orderBy(asc(categories.name));
      const groceriesId = seeded.find((row) => row.name === 'Groceries')!.id;
      const transportId = seeded.find((row) => row.name === 'Transport')!.id;

      // Equal spend in two categories: the winner must be the alphabetically
      // first ('Groceries' < 'Transport'), decided by the service rather than
      // by whatever order the category query happens to return its rows in.
      await seed(account.token, {
        merchant: 'Konzum',
        categoryId: groceriesId,
        amount: 40,
        date: window.start,
      });
      await seed(account.token, {
        merchant: 'Uber',
        categoryId: transportId,
        amount: 40,
        date: window.start,
      });

      const response = await dashboard(account.token).expect(200);
      expect(dashboardBody(response).topCategory?.id).toBe(groceriesId);
    });
  });

  describe('an empty account, which is AC5', () => {
    let bearer: string;

    beforeAll(async () => {
      bearer = (await provision()).token;
    });

    it('returns zeroes, an empty weekly series, no categories and no top category', async () => {
      const response = await dashboard(bearer).expect(200);
      const body = dashboardBody(response);

      expect(body.spent).toBe(0);
      expect(body.remaining).toBe(body.monthlyBudget);
      expect(body.transactionCount).toBe(0);
      expect(body.averagePerDay).toBe(0);
      expect(body.weeklyBuckets).toEqual([]);
      expect(body.categories).toEqual([]);
      expect(body.topCategory).toBeNull();
      expect(body.recentTransactions).toEqual([]);
      expect(body.insight).toBeNull();
    });

    it('still reports days left in the period rather than failing', async () => {
      const response = await dashboard(bearer).expect(200);
      expect(dashboardBody(response).daysLeft).toBeGreaterThan(0);
    });
  });
});
