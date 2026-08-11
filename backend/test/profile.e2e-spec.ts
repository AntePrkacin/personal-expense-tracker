import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { categoryTemplateIds } from './category-templates';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { profile } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import type { ProfileResponseDto } from './../src/profile/dto/profile-response.dto';
import { MemoryMailer } from './memory-mailer';

/**
 * The profile read and update, against real databases.
 *
 * What only an e2e can prove here: that the response really is stitched from two
 * databases (the address from central, the rest from the caller's own), that
 * major units land as integer cents in the column, that `forbidNonWhitelisted`
 * and the tri-state DTO refuse what they claim to, and that changing the address
 * moves where a later login link is delivered - which is AC6 and cannot be seen
 * from a unit test at all.
 *
 * Three accounts are provisioned once in `beforeAll`. `mover` exists so the
 * email-change tests never disturb the fixtures the rest of the file asserts on,
 * and `other` only to own an address the primary account can collide with.
 * Provisioning costs auth requests against the per-IP limiter (30 per window),
 * so the count is kept deliberately low.
 *
 * User databases are read through `UserDatabaseService`, never a second driver:
 * the engine allows one connection per file and a competing one would deadlock.
 */
describe('Profile (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  /** The primary account. */
  let bearer: string;
  let userId: string;

  /** A second account, whose address the primary one collides with. */
  let otherEmail: string;

  /** A third, used only by the tests that change an address. */
  let moverBearer: string;
  let moverId: string;

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  const body = (response: request.Response) =>
    response.body as ProfileResponseDto;

  let emailCounter = 0;
  const nextEmail = () => `Saver${++emailCounter}@Example.COM`;

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);

  const patch = (token: string, payload: object) =>
    request(app.getHttpServer())
      .patch('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  /** The stored row, so the cents in the column can be inspected directly. */
  const storedRow = async (owner: string) => {
    const userDb = await userDatabases.getUserDb(owner);
    const [row] = await userDb
      .select()
      .from(profile)
      .where(eq(profile.id, owner));
    return row;
  };

  /** The address the central directory currently answers to for an account. */
  const storedEmail = async (id: string) => {
    const [row] = await centralDb.select().from(users).where(eq(users.id, id));
    return row.email;
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
        fullName: 'Marko Kovac',
        email,
        currency: 'eur',
        monthlyBudget: 2000.5,
        monthStartDay: 5,
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
      email: email.toLowerCase(),
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

    otherEmail = (await provision()).email;

    const mover = await provision();
    moverId = mover.id;
    moverBearer = mover.token;
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('refuses both routes with no bearer at all', async () => {
      // The guard is global, so this is also the regression net for a @Public()
      // creeping onto the wrong controller.
      await request(app.getHttpServer()).get('/api/profile').expect(401);
      await request(app.getHttpServer())
        .patch('/api/profile')
        .send({ fullName: 'Ana Anic' })
        .expect(401);
    });

    it('refuses a garbage bearer with the published error shape', async () => {
      const response = await get('not-a-real-session').expect(401);

      expect(Object.keys(errorBody(response)).sort()).toEqual([
        'error',
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]);
    });

    it('rejects the body only after authenticating', async () => {
      // A 401 rather than a 400: an unauthenticated caller learns nothing about
      // what the endpoint would have accepted.
      await patch('not-a-real-session', { nonsense: true }).expect(401);
    });
  });

  describe('GET /api/profile', () => {
    it('answers exactly the five fields, from two databases and two histories', async () => {
      const response = await get(bearer).expect(200);

      expect(body(response)).toEqual({
        fullName: 'Marko Kovac',
        // Central's, normalized at registration. Everything else is the
        // caller's own database.
        email: await storedEmail(userId),
        // Uppercased by the DTO transform on the way in, and stored that way.
        currency: 'EUR',
        // Major units. **Resolved from `budget_history`, not from a column**:
        // PET-72 moved both of these off the profile row, and the read still
        // serves them as single current values so no client can tell.
        monthlyBudget: 2000.5,
        // The pay day onboarding asked for, resolved from `period_rules`.
        monthStartDay: 5,
      });
      expect(body(response).email).toBe(body(response).email.toLowerCase());
      // No timestamps: nothing in the design shows them.
      expect(Object.keys(body(response)).sort()).toEqual([
        'currency',
        'email',
        'fullName',
        'monthStartDay',
        'monthlyBudget',
      ]);
    });
  });

  describe('PATCH /api/profile', () => {
    /** Puts the primary account back, so tests cannot interfere with each other. */
    afterEach(async () => {
      // Only what this endpoint still accepts. The budget and the pay day are the
      // schedule endpoint's, and no test in this block changes them.
      await patch(bearer, {
        fullName: 'Marko Kovac',
        currency: 'EUR',
      }).expect(200);
    });

    it('saves the fields it still owns in one request', async () => {
      const response = await patch(bearer, {
        fullName: 'Ana Anic',
        currency: 'usd',
      }).expect(200);

      expect(body(response)).toEqual({
        fullName: 'Ana Anic',
        email: await storedEmail(userId),
        currency: 'USD',
        // Untouched by this endpoint, and still served: both come out of history.
        monthlyBudget: 2000.5,
        monthStartDay: 5,
      });

      const row = await storedRow(userId);
      expect(row.fullName).toBe('Ana Anic');
    });

    it('400s a budget or a pay day, which have to say from when', async () => {
      // The whole point of PET-72's split. `forbidNonWhitelisted` rejects both
      // rather than dropping them, so a frontend can never believe it saved a
      // budget that went nowhere - which is what the old endpoint did to every
      // period the account had.
      await patch(bearer, { monthlyBudget: 1500.25 }).expect(400);
      await patch(bearer, { monthStartDay: 15 }).expect(400);

      const response = await get(bearer).expect(200);
      expect(body(response)).toMatchObject({
        monthlyBudget: 2000.5,
        monthStartDay: 5,
      });
    });

    it('leaves absent fields alone', async () => {
      await patch(bearer, { fullName: 'Ana Anic' }).expect(200);

      const response = await get(bearer).expect(200);
      expect(body(response)).toMatchObject({
        fullName: 'Ana Anic',
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 5,
      });
    });

    it('bumps updatedAt but never createdAt', async () => {
      const before = await storedRow(userId);
      // Epoch-millisecond resolution: without a gap, an edit in the same
      // millisecond would leave the two timestamps equal and prove nothing.
      await new Promise((resolve) => setTimeout(resolve, 5));

      await patch(bearer, { fullName: 'Ana Anic' }).expect(200);

      const after = await storedRow(userId);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    });
  });

  describe('PATCH /api/profile validation', () => {
    /** Nothing in this block may change a single stored byte. */
    const expectUntouched = async (act: () => Promise<unknown>) => {
      const before = await storedRow(userId);
      await new Promise((resolve) => setTimeout(resolve, 5));

      await act();

      const after = await storedRow(userId);
      expect(after).toEqual(before);
    };

    // The budget and pay-day cases live on the schedule endpoint now; this table
    // covers only what `PATCH /api/profile` still accepts.
    it.each([
      ['a malformed email', { email: 'not-an-email' }, 'email'],
      ['an empty display name', { fullName: '' }, 'fullName'],
      ['an over-long display name', { fullName: 'x'.repeat(101) }, 'fullName'],
      ['an invalid currency code', { currency: 'XYZ' }, 'currency'],
      ['a two-letter currency', { currency: 'EU' }, 'currency'],
      // Real ISO 4217, and rejected anyway: the allowlist is two-decimal
      // currencies only, because money.ts multiplies by 100 unconditionally.
      ['a zero-decimal currency', { currency: 'JPY' }, 'currency'],
      ['a three-decimal currency', { currency: 'KWD' }, 'currency'],
    ])('400s %s, naming the field', async (_case, payload, field) => {
      await expectUntouched(async () => {
        const response = await patch(bearer, payload).expect(400);

        expect(errorBody(response).message).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
      });
    });

    it.each(['fullName', 'email', 'currency'])(
      '400s an explicit null on %s, which no column accepts',
      async (field) => {
        // The @IsOptional trap this DTO exists to avoid: with @IsOptional()
        // here, null would skip validation entirely and reach a NOT NULL column
        // as a 500.
        await expectUntouched(async () => {
          const response = await patch(bearer, { [field]: null }).expect(400);

          expect(errorBody(response).message).toEqual(
            expect.arrayContaining([expect.stringContaining(field)]),
          );
        });
      },
    );

    it('400s an empty body, which would record an edit that changed nothing', async () => {
      // Proof it was refused before the UPDATE: $onUpdateFn would otherwise
      // have moved updatedAt on its own.
      await expectUntouched(async () => {
        await patch(bearer, {}).expect(400);
      });
    });

    // `monthlyBudget` and `monthStartDay` are in this list now rather than in the
    // accepted set: they are real fields of the *schedule* endpoint, so rejecting
    // them here is what keeps "set a budget" from meaning "and for all of time".
    it.each([
      'monthlyBudget',
      'monthStartDay',
      'monthlyBudgetCents',
      'categories',
      'id',
      'createdAt',
    ])('400s the unknown key %s rather than dropping it', async (field) => {
      // forbidNonWhitelisted, so a frontend can never believe it saved
      // something the API silently discarded.
      await expectUntouched(async () => {
        const response = await patch(bearer, { [field]: 'anything' }).expect(
          400,
        );

        expect(errorBody(response).message).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
      });
    });

    it('accepts a lowercase currency and stores it uppercase', async () => {
      const response = await patch(bearer, { currency: 'eur' }).expect(200);

      expect(body(response).currency).toBe('EUR');
      expect((await storedRow(userId)).currency).toBe('EUR');
    });
  });

  describe('changing the email address', () => {
    it('409s an address another account owns, persisting nothing', async () => {
      const before = await storedRow(userId);

      const response = await patch(bearer, {
        fullName: 'Ana Anic',
        email: otherEmail,
      }).expect(409);

      // Deliberately disclosed: an authenticated Settings form cannot tell a
      // typo from a taken address without it. The pre-check runs ahead of both
      // writes, so neither store moved.
      expect(errorBody(response).message).toMatch(/already in use/i);
      expect(await storedRow(userId)).toEqual(before);
      expect(await storedEmail(userId)).not.toBe(otherEmail);
    });

    it('200s a no-op PATCH to the address you already have', async () => {
      const current = await storedEmail(userId);

      const response = await patch(bearer, { email: current }).expect(200);

      // Not a 400 and not a self-conflict: the form resubmits every field, so
      // an unchanged address is the ordinary case rather than an error.
      expect(body(response).email).toBe(current);
      expect(await storedEmail(userId)).toBe(current);
    });

    it('moves the login identifier and sends later links to it (AC6)', async () => {
      const oldEmail = await storedEmail(moverId);
      const newEmail = 'Preseljen@Example.COM';

      const response = await patch(moverBearer, { email: newEmail }).expect(
        200,
      );

      // Normalized on the way in, like every address in this app.
      expect(body(response).email).toBe('preseljen@example.com');
      expect(await storedEmail(moverId)).toBe('preseljen@example.com');

      await request(app.getHttpServer())
        .post('/api/auth/login-link')
        .send({ email: newEmail })
        .expect(202);

      // The point of AC6: the next link is delivered to the new address, and
      // the old one is not written to again.
      await mailer.waitFor('preseljen@example.com', 1);
      expect(mailer.to(oldEmail)).toHaveLength(1);
    });

    it('leaves the existing session working, now answering to the new address', async () => {
      // Sessions key on a token hash and join `users` live, so nothing about
      // them is invalidated by the address moving - and there is no logout in
      // this design to fall back on (A39).
      const session = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${moverBearer}`)
        .expect(200);

      expect((session.body as { email: string }).email).toBe(
        'preseljen@example.com',
      );
      await get(moverBearer).expect(200);
    });

    it('changes the address alongside other fields in one request', async () => {
      const response = await patch(moverBearer, {
        fullName: 'Ivana Ivic',
        email: 'preseljen2@example.com',
      }).expect(200);

      expect(body(response)).toMatchObject({
        fullName: 'Ivana Ivic',
        email: 'preseljen2@example.com',
      });
      // Both stores moved, and the profile one moved first.
      expect((await storedRow(moverId)).fullName).toBe('Ivana Ivic');
      expect(await storedEmail(moverId)).toBe('preseljen2@example.com');
    });
  });
});
