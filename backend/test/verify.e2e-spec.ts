import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { newId } from './../src/common/ids';
import { loginLinks, sessions, users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type {
  CentralDatabase,
  UserDatabase,
} from './../src/database/database.types';
import { UserDatabaseService } from './../src/database/user-database.service';
import { categories, profile } from './../src/database/user/schema';
import { MAILER } from './../src/mail/mailer';
import { MemoryMailer } from './memory-mailer';

/** Set by setup-e2e.ts; mirrored rather than hardcoded so the two cannot drift. */
const RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT);

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * The second half of the passwordless flow, against the real databases.
 *
 * Mocked queries could only prove the code builds the SQL it builds; what
 * matters here is that a clicked link really provisions a database, really
 * writes a profile in cents, and really cannot be spent twice. The suite runs in
 * local mode (see setup-e2e.ts), so "provisioning" creates a file rather than a
 * cloud database - which is exactly the path CI takes.
 *
 * The user database is inspected through `UserDatabaseService` rather than a
 * second driver instance: the engine allows one connection per file, and opening
 * a competing one would deadlock or read a stale page.
 */
describe('Verification and sessions (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let userDatabases: UserDatabaseService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  // A fresh address per test: the per-email limiter is 3 in e2e, and one test's
  // rows must not be visible to the next.
  let emailCounter = 0;
  const nextEmail = () => `Verifier${++emailCounter}@Example.COM`;

  const registration = (email: string) => ({
    firstName: 'Marko',
    lastName: 'Kovac',
    email,
    currency: 'eur',
    monthlyBudget: 2000.5,
    monthStartDay: 15,
    categories: ['Transport', 'Groceries'],
  });

  // See the note on the same helper in auth.e2e-spec.ts for why this is
  // `object` rather than `unknown`.
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/auth/${path}`).send(body);

  const getSession = (bearer?: string) => {
    const call = request(app.getHttpServer()).get('/api/auth/session');
    return bearer ? call.set('Authorization', bearer) : call;
  };

  const liveUser = async (email: string) => {
    const [row] = await centralDb
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return row;
  };

  const sessionRows = (userId: string) =>
    centralDb.select().from(sessions).where(eq(sessions.userId, userId));

  const userRows = async (userId: string) => {
    const userDb: UserDatabase = await userDatabases.getUserDb(userId);
    return {
      profiles: await userDb.select().from(profile),
      categories: await userDb
        .select()
        .from(categories)
        .orderBy(asc(categories.name)),
    };
  };

  /** The token out of the last email sent to an address. */
  const emailedToken = async (email: string, count = 1) => {
    await mailer.waitFor(email.toLowerCase(), count);
    const messages = mailer.to(email.toLowerCase());
    const match = /token=([A-Za-z0-9_-]+)/.exec(
      messages[messages.length - 1].textbody,
    );
    if (!match) {
      throw new Error('no token in the emailed link');
    }
    return match[1];
  };

  /**
   * Registers, then verifies with a freshly issued token rather than the emailed
   * one - the emailed link is exercised end to end by the journey test, and
   * issuing directly keeps every other test off the mail plumbing.
   */
  const registerAndVerify = async (
    email: string,
    overrides: Record<string, unknown> = {},
  ) => {
    await post('register', { ...registration(email), ...overrides }).expect(
      202,
    );
    await mailer.waitFor(email.toLowerCase(), 1);

    const user = await liveUser(email);
    const rawToken = await loginTokens.issue(user.id);
    const response = await post('verify', { token: rawToken }).expect(200);

    return { user, session: response.body as { token: string } };
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
    // Mirror the global 'api' prefix configured in main.ts.
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

  describe('POST /api/auth/verify', () => {
    it('turns the emailed link into a fully provisioned account', async () => {
      // The mirror image of registration's "provisions nothing" test: every
      // assertion that one makes about absence, this one makes about presence.
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      const rawToken = await emailedToken(email);

      const response = await post('verify', { token: rawToken }).expect(200);

      const body = response.body as { token: string; expiresAt: string };
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
      expect(new Date(body.expiresAt).toISOString()).toBe(body.expiresAt);
      // The raw session token exists here and nowhere else: the row keeps its
      // hash.
      const [session] = await sessionRows((await liveUser(email)).id);
      expect(session.tokenHash).toBe(sha256(body.token));

      const user = await liveUser(email);
      await expect(
        access(join(databaseDir, 'users', `${user.dbName}.db`)),
      ).resolves.toBeUndefined();

      const { profiles, categories: seeded } = await userRows(user.id);
      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        id: user.id,
        firstName: 'Marko',
        lastName: 'Kovac',
        currency: 'EUR',
        // Major units in, cents out. The conversion happens here and nowhere
        // upstream.
        monthlyBudgetCents: 200050,
        monthStartDay: 15,
      });

      // Sorted by name here, so this pins the set and the real Figma colors
      // rather than the insert order - canonical order is the unit test's job.
      // Uncategorized is seeded for everybody and offered to nobody, and its
      // neutral is deliberately not from the eight-color category palette.
      expect(seeded.map((row) => [row.name, row.color])).toEqual([
        ['Groceries', '#57B368'],
        ['Transport', '#3F8EE6'],
        ['Uncategorized', '#98A0AE'],
      ]);
      expect(seeded.filter((row) => row.isFallback)).toHaveLength(1);
      expect(seeded.find((row) => row.isFallback)?.name).toBe('Uncategorized');

      // Verified: the payload is gone, and in local mode the cloud pointer stays
      // null while dbName is untouched.
      expect(user.onboardingPayload).toBeNull();
      expect(user.dbUrl).toBeNull();
      expect(user.dbAuthToken).toBeNull();
      expect(user.dbName).toBe(`spendifico-user-${user.id}`);
    });

    it('refuses the same link a second time, creating no second session', async () => {
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      const rawToken = await emailedToken(email);
      await post('verify', { token: rawToken }).expect(200);

      const response = await post('verify', { token: rawToken }).expect(401);

      expect(Object.keys(errorBody(response)).sort()).toEqual([
        'error',
        'message',
        'path',
        'statusCode',
        'timestamp',
      ]);
      expect(await sessionRows((await liveUser(email)).id)).toHaveLength(1);
    });

    it('answers the older of two links with 409 and the newer with 200', async () => {
      // The Gmail-threading fix: identical login mails collapse into one thread,
      // so clicking the wrong one is ordinary rather than exotic, and 409 lets
      // the frontend say "open the most recent email" instead of "ask again".
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      const user = await liveUser(email);

      const older = await loginTokens.issue(user.id);
      const newer = await loginTokens.issue(user.id);

      const conflict = await post('verify', { token: older }).expect(409);
      // Distinguishable by statusCode alone: the frontend needs no body parsing.
      expect(errorBody(conflict).statusCode).toBe(409);

      await post('verify', { token: newer }).expect(200);
    });

    it('refuses an expired link', async () => {
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      const user = await liveUser(email);

      await centralDb.insert(loginLinks).values({
        id: newId(),
        userId: user.id,
        tokenHash: sha256('expired-link'),
        expiresAt: new Date(Date.now() - 1_000),
      });

      await post('verify', { token: 'expired-link' }).expect(401);
    });

    it('refuses an unknown token with the same body shape', async () => {
      const response = await post('verify', {
        token: 'never-was-issued',
      }).expect(401);

      expect(errorBody(response).statusCode).toBe(401);
      expect(typeof errorBody(response).message).toBe('string');
    });

    it('issues a second session for a returning user, changing nothing else', async () => {
      const email = nextEmail();
      const { user, session: first } = await registerAndVerify(email);

      await post('login-link', { email }).expect(202);
      const second = await loginTokens.issue(user.id);
      const response = await post('verify', { token: second }).expect(200);

      expect(await sessionRows(user.id)).toHaveLength(2);
      // Concurrent sessions are legitimate - one per device - so the first
      // bearer keeps working.
      await getSession(`Bearer ${first.token}`).expect(200);
      await getSession(
        `Bearer ${(response.body as { token: string }).token}`,
      ).expect(200);

      const { profiles, categories: seeded } = await userRows(user.id);
      expect(profiles).toHaveLength(1);
      // The two picked chips plus the fallback, and a second verify re-seeds
      // none of them.
      expect(seeded).toHaveLength(3);
      expect((await liveUser(email)).onboardingPayload).toBeNull();
    });

    it('writes the corrected payload when a registration was resubmitted', async () => {
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      await mailer.waitFor(email.toLowerCase(), 1);

      await post('register', {
        ...registration(email),
        firstName: 'Corrected',
        monthlyBudget: 1500,
      }).expect(202);
      // The second registration supersedes the first link, so the second email
      // is the only one that can still be spent.
      const rawToken = await emailedToken(email, 2);

      await post('verify', { token: rawToken }).expect(200);

      const { profiles } = await userRows((await liveUser(email)).id);
      expect(profiles[0]).toMatchObject({
        firstName: 'Corrected',
        monthlyBudgetCents: 150000,
      });
    });

    it('provisions an account that picked no categories at all', async () => {
      // A4 enforces no minimum, so an empty selection is a valid choice and must
      // not be mistaken for "seeding failed".
      const email = nextEmail();
      const { user } = await registerAndVerify(email, { categories: [] });

      const { profiles, categories: seeded } = await userRows(user.id);
      expect(profiles).toHaveLength(1);
      // Picking nothing used to leave the table empty. It cannot now: deleting
      // a category reassigns its transactions to the fallback, so every
      // database gets one whether or not any chip was chosen.
      expect(seeded.map((row) => row.name)).toEqual(['Uncategorized']);
      expect(seeded[0].isFallback).toBe(true);
    });

    it('is exempt from the per-address limiter', async () => {
      // Verify has no address to key on, so the email tracker would put every
      // caller into one shared `no-email:<ip>` bucket - three requests wide in
      // this suite. A fourth 401 rather than a 429 is what proves the named skip
      // is in place.
      for (let attempt = 0; attempt < RATE_LIMIT + 1; attempt++) {
        await post('verify', { token: `probe-${attempt}` }).expect(401);
      }
    });

    it('rejects a request with no token at all', async () => {
      const response = await post('verify', {}).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('token')]),
      );
    });
  });

  describe('GET /api/auth/session', () => {
    it('answers the identity behind a bearer, repeatedly', async () => {
      const email = nextEmail();
      const { user, session } = await registerAndVerify(email);

      for (const attempt of [1, 2]) {
        const response = await getSession(`Bearer ${session.token}`).expect(
          200,
        );

        expect(response.body).toEqual({
          userId: user.id,
          email: email.toLowerCase(),
          expiresAt: expect.any(String) as string,
        });
        expect(
          Date.parse((response.body as { expiresAt: string }).expiresAt),
        ).toBeGreaterThan(Date.now());
        expect(attempt).toBeLessThan(3);
      }
    });

    it('refuses a missing, malformed or unknown credential', async () => {
      await getSession().expect(401);
      await getSession('Bearer not-a-real-session').expect(401);
      await getSession('Basic dXNlcjpwYXNz').expect(401);
    });

    it('refuses an expired session', async () => {
      const email = nextEmail();
      const { user } = await registerAndVerify(email);

      await centralDb.insert(sessions).values({
        id: newId(),
        userId: user.id,
        tokenHash: sha256('long-dead-session'),
        expiresAt: new Date(Date.now() - 1_000),
      });

      // Expiry lives in the WHERE clause, so a dead session simply matches
      // nothing - there is no sweeper to depend on.
      await getSession('Bearer long-dead-session').expect(401);
    });
  });
});
