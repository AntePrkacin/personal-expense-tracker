import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { categoryTemplateIds } from './category-templates';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { newId } from './../src/common/ids';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { categories, transactions } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import type { TransactionResponseDto } from './../src/transactions/dto/transaction-response.dto';
import { MemoryMailer } from './memory-mailer';

/**
 * Set by setup-e2e.ts, which is the only place early enough to be read - see
 * the comment there. Mirrored rather than hardcoded so the two cannot drift.
 */
const SCAN_RATE_LIMIT = Number(process.env.SCAN_RATE_LIMIT);

/**
 * The transaction write endpoints, against real databases.
 *
 * What only an e2e can prove here: that a `YYYY-MM-DD` date survives the round
 * trip as the same string, that major units really land as integer cents in the
 * column, that `forbidNonWhitelisted` refuses the display-only fields the detail
 * mock shows, and that a delete leaves a tombstoned row rather than removing it.
 *
 * Two users are provisioned once in `beforeAll` rather than per test. Registering
 * costs an email against the per-address limiter (3 in this suite), and nothing
 * below needs a fresh account - the tests create their own transactions. The
 * second user exists only to prove cross-user isolation.
 *
 * User databases are read through `UserDatabaseService`, never a second driver:
 * the engine allows one connection per file and a competing one would deadlock.
 */
describe('Transaction writes (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  /** The primary account: its bearer, its id, and one of its seeded categories. */
  let bearer: string;
  let userId: string;
  let categoryId: string;

  /** A second account, for the isolation tests. */
  let otherBearer: string;

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  const body = (response: request.Response) =>
    response.body as TransactionResponseDto;

  let emailCounter = 0;
  const nextEmail = () => `Spender${++emailCounter}@Example.COM`;

  const create = (token: string, payload: object) =>
    request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  const patch = (token: string, id: string, payload: object) =>
    request(app.getHttpServer())
      .patch(`/api/transactions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  const remove = (token: string, id: string) =>
    request(app.getHttpServer())
      .delete(`/api/transactions/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const valid = () => ({
    merchant: 'Konzum',
    categoryId,
    amount: 12.5,
    date: '2026-08-03',
  });

  /** The stored row, tombstoned or not - so a delete can be inspected. */
  const storedRow = async (id: string, owner = userId) => {
    const userDb = await userDatabases.getUserDb(owner);
    const [row] = await userDb
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    return row;
  };

  const rowCount = async (owner = userId) => {
    const userDb = await userDatabases.getUserDb(owner);
    return (await userDb.select().from(transactions)).length;
  };

  /** Registers, verifies with a directly issued token, and returns the session. */
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
        monthlyBudget: 2000.5,
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

    return {
      id: user.id,
      token: (response.body as { token: string }).token,
    };
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

    // A real seeded category of the primary user's, so create has something
    // legitimate to reference.
    const userDb = await userDatabases.getUserDb(userId);
    const seeded = await userDb
      .select()
      .from(categories)
      .orderBy(asc(categories.name));
    categoryId = seeded[0].id;
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('refuses every route with no bearer at all', async () => {
      // The guard is global now, so this is also the regression net for a
      // @Public() creeping onto the wrong controller.
      await request(app.getHttpServer())
        .post('/api/transactions')
        .send(valid())
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/transactions/${newId()}`)
        .send({ merchant: 'x' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/transactions/${newId()}`)
        .expect(401);
    });

    it('refuses a garbage bearer with the published error shape', async () => {
      const response = await create('not-a-real-session', valid()).expect(401);

      expect(Object.keys(errorBody(response)).sort()).toEqual([
        'error',
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]);
      expect(errorBody(response).statusCode).toBe(401);
    });

    it('rejects the body only after authenticating', async () => {
      // A 401 rather than a 400: an unauthenticated caller learns nothing about
      // what the endpoint would have accepted.
      await create('not-a-real-session', { nonsense: true }).expect(401);
    });
  });

  describe('POST /api/transactions', () => {
    it('records a transaction and echoes it in major units', async () => {
      const response = await create(bearer, valid()).expect(201);

      expect(body(response)).toEqual({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ) as string,
        merchant: 'Konzum',
        categoryId,
        amount: 12.5,
        date: '2026-08-03',
        note: null,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      // Effectively the same instant, but NOT asserted equal. The two columns
      // carry independent `$defaultFn(() => new Date())` calls, so an insert that
      // straddles a millisecond boundary legitimately produces a 1ms gap - a real
      // local run showed .824Z against .825Z. Equality here would be a test that
      // passes by luck.
      const createdMs = Date.parse(body(response).createdAt);
      const updatedMs = Date.parse(body(response).updatedAt);
      expect(updatedMs).toBeGreaterThanOrEqual(createdMs);
      expect(updatedMs - createdMs).toBeLessThan(50);

      // Cents in the column, majors in the API - the whole point of money.ts.
      const row = await storedRow(body(response).id);
      expect(row.amountCents).toBe(1250);
      expect(row.deletedAt).toBeNull();
    });

    it('stores the cent that naive float multiplication would lose', async () => {
      const response = await create(bearer, {
        ...valid(),
        amount: 4.02,
      }).expect(201);

      // 4.02 * 100 is 401.99999999999994.
      expect((await storedRow(body(response).id)).amountCents).toBe(402);
      expect(body(response).amount).toBe(4.02);
    });

    it('stores a backdated date verbatim, with no timezone shift', async () => {
      const response = await create(bearer, {
        ...valid(),
        date: '2025-11-05',
      }).expect(201);

      // The month a transaction belongs to is derived from this string at read
      // time, so it has to survive as the exact day that was sent.
      expect(body(response).date).toBe('2025-11-05');
      expect((await storedRow(body(response).id)).date).toBe('2025-11-05');
    });

    it('keeps a note when one is sent', async () => {
      const response = await create(bearer, {
        ...valid(),
        note: 'weekly shop',
      }).expect(201);

      expect(body(response).note).toBe('weekly shop');
    });

    it('404s an unknown category without inserting anything', async () => {
      const before = await rowCount();

      const response = await create(bearer, {
        ...valid(),
        categoryId: newId(),
      }).expect(404);

      // 404 rather than 400: the id is well-formed, the resource is absent.
      expect(errorBody(response).message).toMatch(/category/i);
      expect(await rowCount()).toBe(before);
    });

    it("404s another user's category, which is simply absent here", async () => {
      // Nothing checks ownership: the other user's rows are in another database,
      // so their category id does not exist in this one.
      await create(otherBearer, valid()).expect(404);
    });

    it.each([
      ['a missing merchant', { merchant: undefined }, 'merchant'],
      ['an empty merchant', { merchant: '' }, 'merchant'],
      ['a missing amount', { amount: undefined }, 'amount'],
      ['a zero amount', { amount: 0 }, 'amount'],
      ['a negative amount', { amount: -5 }, 'amount'],
      ['three decimal places', { amount: 1.005 }, 'amount'],
      ['an amount over the cap', { amount: 1_000_000_001 }, 'amount'],
      ['a missing date', { date: undefined }, 'date'],
      ['a non-existent calendar day', { date: '2026-02-30' }, 'date'],
      ['a day-first date', { date: '03/08/2026' }, 'date'],
      ['a full datetime', { date: '2026-08-03T10:00:00.000Z' }, 'date'],
      ['a non-UUID category', { categoryId: 'not-a-uuid' }, 'categoryId'],
    ])('400s %s, naming the field', async (_case, override, field) => {
      const payload: Record<string, unknown> = { ...valid(), ...override };
      // `undefined` would be dropped by JSON serialization anyway; deleting the
      // key makes the "missing" cases explicit rather than incidental.
      for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
      }

      const response = await create(bearer, payload).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining(field)]),
      );
    });

    it.each(['paymentMethod', 'status', 'time', 'account'])(
      '400s the display-only field %s rather than dropping it',
      async (field) => {
        // These four appear on the transaction detail mock (DET-8) but no form
        // captures them and no column stores them. Refusing them beats accepting
        // and discarding, which would let a frontend believe they were saved.
        const response = await create(bearer, {
          ...valid(),
          [field]: 'anything',
        }).expect(400);

        expect(errorBody(response).message).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
      },
    );
  });

  describe('PATCH /api/transactions/:id', () => {
    /** A fresh transaction to mutate, so tests cannot interfere with each other. */
    const seed = async (overrides: object = {}) => {
      const response = await create(bearer, {
        ...valid(),
        ...overrides,
      }).expect(201);
      return body(response);
    };

    it('changes only what was sent, and bumps updatedAt', async () => {
      const created = await seed();
      // Epoch-millisecond resolution: without a gap, an edit in the same
      // millisecond would leave the two timestamps equal and prove nothing.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const response = await patch(bearer, created.id, {
        merchant: 'Spar',
      }).expect(200);

      expect(body(response)).toMatchObject({
        id: created.id,
        merchant: 'Spar',
        // Untouched fields survive.
        amount: created.amount,
        date: created.date,
        categoryId: created.categoryId,
        createdAt: created.createdAt,
      });
      expect(Date.parse(body(response).updatedAt)).toBeGreaterThan(
        Date.parse(created.createdAt),
      );
    });

    it('converts an updated amount to cents', async () => {
      const created = await seed();

      const response = await patch(bearer, created.id, {
        amount: 2000.5,
      }).expect(200);

      expect(body(response).amount).toBe(2000.5);
      expect((await storedRow(created.id)).amountCents).toBe(200050);
    });

    it('sets a note and then clears it with null', async () => {
      const created = await seed();

      await patch(bearer, created.id, { note: 'refund pending' }).expect(200);
      expect((await storedRow(created.id)).note).toBe('refund pending');

      // The tri-state contract's middle case: null means clear, and it is the
      // only field that accepts one.
      const cleared = await patch(bearer, created.id, { note: null }).expect(
        200,
      );
      expect(body(cleared).note).toBeNull();
      expect((await storedRow(created.id)).note).toBeNull();
    });

    it('moves a transaction to another of your categories', async () => {
      const created = await seed();
      const userDb = await userDatabases.getUserDb(userId);
      const seeded = await userDb
        .select()
        .from(categories)
        .orderBy(asc(categories.name));
      const target = seeded[1].id;

      const response = await patch(bearer, created.id, {
        categoryId: target,
      }).expect(200);

      expect(body(response).categoryId).toBe(target);
    });

    it('404s a category that does not exist, changing nothing', async () => {
      const created = await seed();

      await patch(bearer, created.id, { categoryId: newId() }).expect(404);

      expect((await storedRow(created.id)).categoryId).toBe(categoryId);
    });

    it('400s an explicit null on a field that cannot be cleared', async () => {
      const created = await seed();

      // The @IsOptional trap this DTO exists to avoid: with @IsOptional() here,
      // null would skip validation entirely and reach a NOT NULL column as a 500.
      const response = await patch(bearer, created.id, {
        merchant: null,
      }).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('merchant')]),
      );
    });

    it('400s an empty body, which would record an edit that changed nothing', async () => {
      const created = await seed();
      const before = (await storedRow(created.id)).updatedAt.getTime();
      // Enough of a gap that an UPDATE slipping through would move the timestamp
      // measurably, rather than landing back on the same millisecond.
      await new Promise((resolve) => setTimeout(resolve, 5));

      await patch(bearer, created.id, {}).expect(400);

      // Proof it was refused before the UPDATE: $onUpdateFn would otherwise have
      // moved updatedAt on its own. Compared against its own earlier value rather
      // than against createdAt, which is only within a millisecond of it.
      expect((await storedRow(created.id)).updatedAt.getTime()).toBe(before);
    });

    it('404s an unknown id and 400s a malformed one', async () => {
      await patch(bearer, newId(), { merchant: 'Spar' }).expect(404);
      // ParseUUIDPipe, whose message is a plain string rather than the
      // ValidationPipe's array - both fit ErrorResponseDto.message's oneOf.
      await patch(bearer, 'not-a-uuid', { merchant: 'Spar' }).expect(400);
    });

    it("404s another user's transaction", async () => {
      const created = await seed();

      await patch(otherBearer, created.id, { merchant: 'Spar' }).expect(404);
      // Untouched by the attempt.
      expect((await storedRow(created.id)).merchant).toBe('Konzum');
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    it('answers 204 with no body, and tombstones rather than deleting', async () => {
      const created = body(await create(bearer, valid()).expect(201));

      const response = await remove(bearer, created.id).expect(204);
      expect(response.body).toEqual({});

      // The row survives, so a future offline sync cannot resurrect it under a
      // delete-update conflict - but nothing reads it any more.
      const row = await storedRow(created.id);
      expect(row).toBeDefined();
      expect(row.deletedAt).toBeInstanceOf(Date);
    });

    it('404s a second delete of the same transaction', async () => {
      const created = body(await create(bearer, valid()).expect(201));

      await remove(bearer, created.id).expect(204);
      await remove(bearer, created.id).expect(404);
    });

    it('refuses to edit a deleted transaction back to life', async () => {
      const created = body(await create(bearer, valid()).expect(201));
      await remove(bearer, created.id).expect(204);

      await patch(bearer, created.id, { merchant: 'Spar' }).expect(404);
    });

    it('404s an unknown id and 400s a malformed one', async () => {
      await remove(bearer, newId()).expect(404);
      await remove(bearer, 'not-a-uuid').expect(400);
    });

    it("404s another user's transaction, leaving it live", async () => {
      const created = body(await create(bearer, valid()).expect(201));

      await remove(otherBearer, created.id).expect(404);

      expect((await storedRow(created.id)).deletedAt).toBeNull();
    });
  });

  /**
   * `GEMINI_API_KEY` is never set anywhere in this suite (see setup-e2e.ts),
   * so every one of these answers 503 before it would ever reach the
   * network - which is exactly what lets the throttler test below run
   * without a real key. What an e2e can prove that a unit test cannot: the
   * real multer pipeline (the fileFilter's 400s, the file-count cap) and the
   * real throttler wiring (that `scan` counts a request the auth limiters
   * never see, and vice versa).
   */
  describe('POST /api/transactions/scan', () => {
    // Own account per test, so one test's scan-throttle bucket cannot affect
    // another's - unlike the writes above, which safely share `bearer`.
    let scanBearer: string;

    beforeEach(async () => {
      scanBearer = (await provision()).token;
    });

    const scanRequest = (token: string) =>
      request(app.getHttpServer())
        .post('/api/transactions/scan')
        .set('Authorization', `Bearer ${token}`);

    const scanWithReceipt = (token: string) =>
      scanRequest(token).attach(
        'files',
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        { filename: 'receipt.png', contentType: 'image/png' },
      );

    it('answers 503 with no GEMINI_API_KEY configured', async () => {
      await scanWithReceipt(scanBearer).expect(503);
    });

    it('400s an upload with no files', async () => {
      await scanRequest(scanBearer).expect(400);
    });

    it('400s a file of an unsupported type', async () => {
      await scanRequest(scanBearer)
        .attach('files', Buffer.from('not a receipt'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('400s a PDF sent alongside another file', async () => {
      await scanRequest(scanBearer)
        .attach('files', Buffer.from('%PDF-1.4'), {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .attach('files', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
          filename: 'page2.png',
          contentType: 'image/png',
        })
        .expect(400);
    });

    it('refuses every request with no bearer at all', async () => {
      await scanWithReceipt('').expect(401);
    });

    it('trips its own throttler without touching the auth limiters', async () => {
      for (let i = 0; i < SCAN_RATE_LIMIT; i++) {
        await scanWithReceipt(scanBearer).expect(503);
      }
      await scanWithReceipt(scanBearer).expect(429);

      // Keyed on the session user id, not on the auth routes' email/ip
      // trackers - so a fresh address can still request a login link right
      // after this account's scan bucket is spent.
      await request(app.getHttpServer())
        .post('/api/auth/login-link')
        .send({ email: nextEmail() })
        .expect(202);
    });
  });
});
