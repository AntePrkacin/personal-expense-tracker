import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { CategoryResponseDto } from './../src/categories/dto/category-response.dto';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { newId } from './../src/common/ids';
import {
  monthWindow,
  previousMonthWindow,
  todayIn,
} from './../src/common/month-window';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { categories } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import type {
  TransactionDetailResponseDto,
  TransactionsResponseDto,
} from './../src/transactions/dto/transactions-response.dto';
import type { TransactionResponseDto } from './../src/transactions/dto/transaction-response.dto';
import { MemoryMailer } from './memory-mailer';

/**
 * The two transaction read endpoints, against real databases.
 *
 * **A file of its own rather than more cases in `transactions.e2e-spec.ts`**, and
 * that is not tidiness. Every test file gets a fresh `DATABASE_DIR` from
 * `setup-e2e.ts`, so the fixture below is the entire contents of this account's
 * transaction table - which is what lets a test assert an exact `total` instead
 * of a lower bound. Sharing the write suite's account would have meant asserting
 * around whatever rows its tests happened to have left behind, tombstones
 * included.
 *
 * **The windows come from the real `monthWindow`, not from hardcoded dates.**
 * `period=current` resolves against the clock, so a fixture pinned to August 2026
 * would pass today and silently stop covering anything in September. Every date
 * below is derived from the window the app itself would compute, which is also
 * the only way this file keeps working in CI on an arbitrary day.
 *
 * What only an e2e can prove here: that the half-open window really excludes the
 * boundary day, that SQLite's `LIKE` really is case-insensitive for the ASCII the
 * search relies on, that `forbidNonWhitelisted` reaches query strings and not
 * just bodies, and that the detail read's category stats come back from
 * `CategoriesService` correctly rather than merely being asked for.
 */
describe('Transaction reads (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  let bearer: string;
  let userId: string;

  /** A second account, for the isolation test. */
  let otherBearer: string;

  /** Seeded categories: the two chips picked at registration, plus the fallback. */
  let groceriesId: string;
  let transportId: string;

  /** Ids of the fixture rows, by the name they were created under. */
  const created: Record<string, string> = {};

  // monthStartDay defaults to 1, which registration does not override, so both
  // windows are calendar months.
  const today = todayIn('Europe/Zagreb');
  const current = monthWindow(1, today);
  const previous = previousMonthWindow(1, today);

  /**
   * A day inside a window, as `YYYY-MM-DD`.
   *
   * Only days 1 to 28 are used, so the date exists in every month and no
   * February case arises.
   */
  const dayIn = (window: { start: string }, day: number) =>
    `${window.start.slice(0, 8)}${String(day).padStart(2, '0')}`;

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  const listBody = (response: request.Response) =>
    response.body as TransactionsResponseDto;

  const detailBody = (response: request.Response) =>
    response.body as TransactionDetailResponseDto;

  const list = (query = '', token = bearer) =>
    request(app.getHttpServer())
      .get(`/api/transactions${query}`)
      .set('Authorization', `Bearer ${token}`);

  const detail = (id: string, token = bearer) =>
    request(app.getHttpServer())
      .get(`/api/transactions/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const merchantsOf = (response: request.Response) =>
    listBody(response).transactions.map((row) => row.merchant);

  /** Creates a transaction through the API and remembers its id. */
  const seed = async (payload: {
    merchant: string;
    categoryId: string;
    amount: number;
    date: string;
    note?: string;
  }) => {
    const response = await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${bearer}`)
      .send(payload)
      .expect(201);

    const row = response.body as TransactionResponseDto;
    created[payload.merchant] = row.id;
    return row;
  };

  let emailCounter = 0;
  const nextEmail = () => `Reader${++emailCounter}@Example.COM`;

  /** Registers, verifies with a directly issued token, and returns the session. */
  const provision = async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Marko',
        lastName: 'Kovac',
        email,
        currency: 'eur',
        monthlyBudget: 2000.5,
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

    const primary = await provision();
    userId = primary.id;
    bearer = primary.token;
    otherBearer = (await provision()).token;

    const userDb = await userDatabases.getUserDb(userId);
    const seeded = await userDb
      .select()
      .from(categories)
      .orderBy(asc(categories.name));
    groceriesId = seeded.find((row) => row.name === 'Groceries')!.id;
    transportId = seeded.find((row) => row.name === 'Transport')!.id;

    // Six rows, and every assertion below counts on this being all of them.
    //
    // Two share a date, which is what the tiebreak tests need; one sits on the
    // first day of the current window and one on the first day of the previous,
    // which is what proves the half-open bound; and one is years old, so
    // `period=all` has something only it can return.
    await seed({
      merchant: 'Konzum',
      categoryId: groceriesId,
      amount: 12.5,
      date: dayIn(current, 3),
      note: 'weekly pharmacy run',
    });
    await seed({
      merchant: 'Spar',
      categoryId: groceriesId,
      amount: 44.1,
      date: dayIn(current, 3),
    });
    await seed({
      merchant: 'Boundary',
      categoryId: groceriesId,
      amount: 5,
      date: dayIn(current, 1),
    });
    await seed({
      merchant: 'Uber',
      categoryId: transportId,
      amount: 8.4,
      date: dayIn(current, 2),
    });
    await seed({
      merchant: 'LastMonth',
      categoryId: groceriesId,
      amount: 128.9,
      date: dayIn(previous, 1),
    });
    await seed({
      merchant: 'Ancient',
      categoryId: groceriesId,
      amount: 1,
      date: '2020-02-14',
    });
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('refuses both reads with no bearer at all', async () => {
      // The guard is global, so this is the regression net for a @Public()
      // creeping onto the wrong controller.
      await request(app.getHttpServer()).get('/api/transactions').expect(401);
      await request(app.getHttpServer())
        .get(`/api/transactions/${newId()}`)
        .expect(401);
    });

    it('rejects a bad query string only after authenticating', async () => {
      // A 401 rather than a 400: an unauthenticated caller learns nothing about
      // what the endpoint would have accepted.
      await list('?period=nonsense', 'not-a-real-session').expect(401);
    });
  });

  describe('GET /api/transactions', () => {
    it('defaults to the current period, newest first, which is AC1', async () => {
      const response = await list().expect(200);

      // Konzum and Spar share day 3; Uber is day 2; Boundary is day 1. The two
      // outside the window are absent.
      expect(merchantsOf(response)).toEqual([
        'Spar',
        'Konzum',
        'Uber',
        'Boundary',
      ]);
    });

    it('includes the first day of the window and excludes the previous period', async () => {
      const response = await list('?period=current').expect(200);

      // `start` is inclusive. The adjacent-day case - the very last day before
      // the window opens - is proven under "the window boundary" below, on its
      // own category so it cannot disturb these counts.
      expect(merchantsOf(response)).toContain('Boundary');
      expect(merchantsOf(response)).not.toContain('LastMonth');
    });

    it('counts total after filters rather than the account total, which is AC2', async () => {
      const response = await list().expect(200);

      // Six rows exist; four are in the current period.
      expect(listBody(response).total).toBe(4);
      expect(listBody(response).total).toBe(
        listBody(response).transactions.length,
      );
    });

    it('returns every row for period=all, including one years old', async () => {
      const response = await list('?period=all').expect(200);

      expect(listBody(response).total).toBe(6);
      expect(merchantsOf(response)).toContain('Ancient');
    });

    it('returns only the previous window for period=previous, which is AC3', async () => {
      const response = await list('?period=previous').expect(200);

      // One month back, not thirty days: `Ancient` is much older and must not
      // arrive here.
      expect(merchantsOf(response)).toEqual(['LastMonth']);
    });

    it('sorts oldest first for date_asc, tiebreaks still newest-first', async () => {
      const response = await list('?sort=date_asc').expect(200);

      expect(merchantsOf(response)).toEqual([
        'Boundary',
        'Uber',
        'Spar',
        'Konzum',
      ]);
    });

    it('orders same-date rows identically across two identical requests', async () => {
      const first = await list().expect(200);
      const second = await list().expect(200);

      // Konzum and Spar share a date. Without the created_at and id tiebreaks
      // SQLite is free to return them in either order, and the list would
      // reshuffle for no visible reason.
      expect(merchantsOf(first)).toEqual(merchantsOf(second));
    });

    it('matches the merchant case-insensitively as a substring', async () => {
      const response = await list('?period=all&search=onZU').expect(200);

      // SQLite's LIKE folds ASCII case, which is the whole basis of this filter.
      expect(merchantsOf(response)).toEqual(['Konzum']);
    });

    it('never matches the note, which appears on no list row', async () => {
      // "weekly pharmacy run" is Konzum's note. Searching it must find nothing:
      // a row whose reason the user cannot see is worse than no row.
      const response = await list('?period=all&search=pharmacy').expect(200);

      expect(listBody(response).total).toBe(0);
    });

    it('treats a whitespace-only term as no filter at all', async () => {
      const response = await list('?period=all&search=%20%20').expect(200);

      expect(listBody(response).total).toBe(6);
    });

    it('matches % and _ literally rather than as LIKE wildcards', async () => {
      // A fresh category, so these rows are invisible to every count above.
      const response = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ name: 'Wildcard probe', color: '#8A79F1' })
        .expect(201);
      const probeId = (response.body as CategoryResponseDto).id;

      await seed({
        merchant: 'Save 10% Store',
        categoryId: probeId,
        amount: 1,
        date: current.start,
      });
      await seed({
        merchant: 'Save 1000 Mart',
        categoryId: probeId,
        amount: 1,
        date: current.start,
      });
      await seed({
        merchant: 'A_B Cafe',
        categoryId: probeId,
        amount: 1,
        date: current.start,
      });
      await seed({
        merchant: 'AXB Cafe',
        categoryId: probeId,
        amount: 1,
        date: current.start,
      });

      // Unescaped, "10%" would also match "1000" and "A_B" would also match
      // "AXB": `%` and `_` are live LIKE wildcards to SQLite, not literal
      // characters, unless the query escapes them ahead of sending it.
      const percent = await list(
        `?period=all&categoryId=${probeId}&search=${encodeURIComponent('10%')}`,
      ).expect(200);
      expect(merchantsOf(percent)).toEqual(['Save 10% Store']);

      const underscore = await list(
        `?period=all&categoryId=${probeId}&search=${encodeURIComponent('A_B')}`,
      ).expect(200);
      expect(merchantsOf(underscore)).toEqual(['A_B Cafe']);
    });

    it('filters by category', async () => {
      const response = await list(
        `?period=all&categoryId=${transportId}`,
      ).expect(200);

      expect(merchantsOf(response)).toEqual(['Uber']);
    });

    it('returns nothing for a category id that is not yours', async () => {
      // A filter, not a resource being addressed, so an unknown id filters
      // everything out rather than 404ing.
      const response = await list(`?period=all&categoryId=${newId()}`).expect(
        200,
      );

      expect(listBody(response)).toEqual({ transactions: [], total: 0 });
    });

    it('composes filters, sort and period together', async () => {
      const response = await list(
        `?period=current&categoryId=${groceriesId}&search=s&sort=date_asc`,
      ).expect(200);

      expect(merchantsOf(response)).toEqual(['Spar']);
    });

    it('rejects an unknown enum value with a 400', async () => {
      const response = await list('?period=lastyear').expect(400);

      expect(errorBody(response).statusCode).toBe(400);
    });

    it('rejects an unknown query parameter, not just an unknown body field', async () => {
      // `forbidNonWhitelisted` reaches query strings too, which is what stops a
      // frontend believing `?limit=10` did something.
      await list('?limit=10').expect(400);
    });

    it('rejects a non-UUID category filter', async () => {
      await list('?categoryId=not-a-uuid').expect(400);
    });

    it('shows another account nothing of this one’s', async () => {
      // Structural isolation: the other user's database simply has no such rows.
      const response = await list('?period=all', otherBearer).expect(200);

      expect(listBody(response)).toEqual({ transactions: [], total: 0 });
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('returns the row, its category and its siblings', async () => {
      const response = await detail(created.Konzum).expect(200);

      expect(detailBody(response).transaction).toEqual(
        expect.objectContaining({
          id: created.Konzum,
          merchant: 'Konzum',
          amount: 12.5,
          note: 'weekly pharmacy run',
        }),
      );
      expect(detailBody(response).category.id).toBe(groceriesId);
    });

    it('reports the uncapped shape, which is the common case, not the edge', async () => {
      const response = await detail(created.Konzum).expect(200);
      const category = detailBody(response).category;

      // No onboarding chip arrives with a cap, so this is what frame 08 gets
      // most of the time. PET-34 has to render a progress bar without one.
      expect(category.status).toBe('uncapped');
      expect(category.monthlyCap).toBeNull();
      expect(category.percentUsed).toBeNull();
      expect(category.remaining).toBeNull();
      expect(category.over).toBeNull();
    });

    it('counts only the current period in the category spend, which is AC4', async () => {
      const response = await detail(created.Konzum).expect(200);

      // Groceries holds five rows overall, three of them in the current window
      // (Konzum 12.50, Spar 44.10, Boundary 5.00). LastMonth and Ancient are
      // excluded from the stats even though they are the same category.
      expect(detailBody(response).category.spent).toBe(61.6);
      expect(detailBody(response).category.transactionCount).toBe(3);
    });

    it('keeps the category on the current period for an older transaction', async () => {
      const response = await detail(created.Ancient).expect(200);

      // The bar answers "where is this category now", not "where was it in 2020".
      // Same figures as above, from a transaction five years older.
      expect(detailBody(response).category.spent).toBe(61.6);
      expect(detailBody(response).category.transactionCount).toBe(3);
    });

    it('lists siblings from any month, which is AC5', async () => {
      const response = await detail(created.Konzum).expect(200);
      const siblings = detailBody(response).recentInCategory.map(
        (row) => row.merchant,
      );

      // DET-5's September row is the point: no date predicate at all here, which
      // is the whole difference from the stats above.
      expect(siblings).toContain('LastMonth');
      expect(siblings).toContain('Ancient');
    });

    it('excludes the transaction being viewed from its own sibling list', async () => {
      const response = await detail(created.Konzum).expect(200);
      const siblings = detailBody(response).recentInCategory;

      // A deviation from DET-5, whose first row is the transaction whose page it
      // sits on - already the header and the amount card by then.
      expect(siblings.map((row) => row.id)).not.toContain(created.Konzum);
      expect(siblings.map((row) => row.merchant)).toEqual([
        'Spar',
        'Boundary',
        'LastMonth',
        'Ancient',
      ]);
    });

    it('excludes transactions in other categories', async () => {
      const response = await detail(created.Konzum).expect(200);

      expect(
        detailBody(response).recentInCategory.map((row) => row.merchant),
      ).not.toContain('Uber');
    });

    it('returns an empty sibling list when the category holds only this row', async () => {
      const response = await detail(created.Uber).expect(200);

      expect(detailBody(response).recentInCategory).toEqual([]);
    });

    it('404s an unknown id, which is AC6', async () => {
      await detail(newId()).expect(404);
    });

    it('404s another account’s transaction, structurally', async () => {
      // Not a filter that could be forgotten: the id does not exist in the other
      // user's database at all.
      await detail(created.Konzum, otherBearer).expect(404);
    });

    it('400s an id that is not a UUID', async () => {
      await detail('not-a-uuid').expect(400);
    });
  });

  describe('the stats really come from CategoriesService', () => {
    it('reports the capped shape once a cap is set through the categories API', async () => {
      await request(app.getHttpServer())
        .patch(`/api/categories/${transportId}`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ monthlyCap: 10 })
        .expect(200);

      const response = await detail(created.Uber).expect(200);
      const category = detailBody(response).category;

      // Uber is 8.40 of a 10.00 cap: 84%, which is Near. The band is decided on
      // cents, and this is the composition working end to end - a second copy of
      // the arithmetic in TransactionsService could not have produced it.
      expect(category.monthlyCap).toBe(10);
      expect(category.spent).toBe(8.4);
      expect(category.percentUsed).toBeCloseTo(84);
      expect(category.remaining).toBe(1.6);
      expect(category.over).toBeNull();
      expect(category.status).toBe('near');
    });

    it('agrees with GET /api/categories for the same category', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);

      const fromList = (
        listResponse.body as { categories: CategoryResponseDto[] }
      ).categories.find((row) => row.id === transportId)!;

      const fromDetail = detailBody(
        await detail(created.Uber).expect(200),
      ).category;

      // The same DTO from the same service. If these two ever disagree, one of
      // them grew its own copy of the month aggregation.
      expect(fromDetail).toEqual(fromList);
    });
  });

  /**
   * Two claims that need rows the fixture above cannot hold without breaking its
   * own counts, so each gets a category created here and nothing else touches it.
   *
   * Placed last on purpose: every test above asserts an exact `total`, and these
   * add rows.
   */
  describe('the window boundary and the sibling cap', () => {
    /** The calendar day before `date`, in UTC so no zone can shift it. */
    const dayBefore = (date: string) => {
      const midnight = new Date(`${date}T00:00:00Z`);
      midnight.setUTCDate(midnight.getUTCDate() - 1);
      return midnight.toISOString().slice(0, 10);
    };

    /** A fresh category, so these rows are invisible to every filter above. */
    const newCategory = async (name: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ name, color: '#8A79F1' })
        .expect(201);
      return (response.body as CategoryResponseDto).id;
    };

    it('excludes the day immediately before the window and includes its first', async () => {
      const boundaryId = await newCategory('Boundary probe');

      await seed({
        merchant: 'DayBefore',
        categoryId: boundaryId,
        amount: 1,
        date: dayBefore(current.start),
      });
      await seed({
        merchant: 'FirstDay',
        categoryId: boundaryId,
        amount: 2,
        date: current.start,
      });

      // The half-open bound in its sharpest form: two rows one day apart, one in
      // and one out. An inclusive upper bound anywhere in the chain would put
      // DayBefore in both periods.
      const inCurrent = await list(
        `?period=current&categoryId=${boundaryId}`,
      ).expect(200);
      expect(merchantsOf(inCurrent)).toEqual(['FirstDay']);

      const inPrevious = await list(
        `?period=previous&categoryId=${boundaryId}`,
      ).expect(200);
      expect(merchantsOf(inPrevious)).toEqual(['DayBefore']);
    });

    it('caps the sibling list at five, dropping the oldest', async () => {
      const crowdedId = await newCategory('Crowded');

      // Seven rows on seven consecutive days: one to view and six candidates,
      // which is one more than the cap.
      for (let day = 1; day <= 7; day++) {
        await seed({
          merchant: `Crowd${day}`,
          categoryId: crowdedId,
          amount: day,
          date: dayIn(current, day),
        });
      }

      const response = await detail(created.Crowd7).expect(200);
      const siblings = detailBody(response).recentInCategory;

      // Five, newest first, with the viewed row absent and the oldest cut.
      expect(siblings).toHaveLength(5);
      expect(siblings.map((row) => row.merchant)).toEqual([
        'Crowd6',
        'Crowd5',
        'Crowd4',
        'Crowd3',
        'Crowd2',
      ]);
    });
  });

  describe('tombstones', () => {
    it('drops a deleted transaction from the list and 404s its detail', async () => {
      const doomed = await seed({
        merchant: 'Doomed',
        categoryId: transportId,
        amount: 3,
        date: dayIn(current, 4),
      });

      await request(app.getHttpServer())
        .delete(`/api/transactions/${doomed.id}`)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(204);

      const response = await list('?period=all').expect(200);
      expect(merchantsOf(response)).not.toContain('Doomed');

      await detail(doomed.id).expect(404);
    });

    it('drops a deleted transaction from a sibling list too', async () => {
      const response = await detail(created.Uber).expect(200);

      expect(
        detailBody(response).recentInCategory.map((row) => row.merchant),
      ).not.toContain('Doomed');
    });
  });
});
