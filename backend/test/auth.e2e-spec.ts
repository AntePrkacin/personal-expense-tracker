import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { LoginTokenService } from './../src/auth/login-token.service';
import type { ErrorResponseDto } from './../src/common/dto/error-response.dto';
import { newId } from './../src/common/ids';
import { loginLinks, users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { MAILER } from './../src/mail/mailer';
import { MemoryMailer } from './memory-mailer';

/**
 * Set by setup-e2e.ts, which is the only place early enough to be read - see
 * the comment there. Mirrored rather than hardcoded so the two cannot drift.
 */
const RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT);

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  const errorBody = (response: request.Response) =>
    response.body as ErrorResponseDto;

  // A fresh address per test, so one test's rows and rate-limit bucket cannot
  // affect the next.
  let emailCounter = 0;
  const nextEmail = () => `Person${++emailCounter}@Example.COM`;

  const registration = (email: string) => ({
    firstName: 'Marko',
    lastName: 'Kovac',
    email,
    monthlyBudget: 2000.5,
    categories: ['Groceries', 'Transport'],
  });

  const post = (path: string, body: unknown) =>
    request(app.getHttpServer()).post(`/api/auth/${path}`).send(body);

  const liveUsers = (email: string) =>
    centralDb.select().from(users).where(eq(users.email, email));

  beforeAll(async () => {
    mailer = new MemoryMailer();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Without this the suite would use LogMailer, which is offline but
      // asserts nothing.
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global 'api' prefix configured in main.ts.
    app.setGlobalPrefix('api');
    await app.init();

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('POST /api/auth/register', () => {
    it('accepts a registration with an empty 202 and emails one link', async () => {
      const email = nextEmail();
      const response = await post('register', registration(email)).expect(202);

      expect(response.text).toBe('');
      expect(response.body).toEqual({});

      await mailer.waitFor(email.toLowerCase(), 1);
      const [message] = mailer.to(email.toLowerCase());
      expect(message.subject).toBe('Your Expensa login link');
      expect(message.tags).toEqual(['login-link']);
      expect(message.textbody).toContain(
        'http://localhost:4200/auth/verify?token=',
      );
    });

    it('stashes the onboarding payload and provisions no database', async () => {
      const email = nextEmail();
      await post('register', {
        ...registration(email),
        currency: 'eur',
        monthStartDay: 15,
      }).expect(202);
      await mailer.waitFor(email.toLowerCase(), 1);

      const [row] = await liveUsers(email.toLowerCase());
      expect(row.onboardingPayload).toEqual({
        firstName: 'Marko',
        lastName: 'Kovac',
        currency: 'EUR',
        // Major units, exactly as submitted: the cents conversion happens at
        // the profile boundary, in verification.
        monthlyBudget: 2000.5,
        monthStartDay: 15,
        categories: ['Groceries', 'Transport'],
      });

      // The cloud pointer waits for verification, and in local mode no file is
      // created either. This is the whole pre-auth cost exposure, asserted.
      expect(row.dbName).toBe(`expensa-user-${row.id}`);
      expect(row.dbUrl).toBeNull();
      expect(row.dbAuthToken).toBeNull();
      await expect(
        access(join(databaseDir, 'users', `${row.dbName}.db`)),
      ).rejects.toThrow();
    });

    it('answers an already-registered address identically, with no second row', async () => {
      const email = nextEmail();
      const first = await post('register', registration(email)).expect(202);
      await mailer.waitFor(email.toLowerCase(), 1);

      const second = await post('register', {
        ...registration(email.toUpperCase()),
        firstName: 'Corrected',
      }).expect(202);
      await mailer.waitFor(email.toLowerCase(), 2);

      // Byte-for-byte identical: nothing here discloses that the account
      // already existed (REG-6, A35).
      expect(second.status).toBe(first.status);
      expect(second.text).toBe(first.text);

      const rows = await liveUsers(email.toLowerCase());
      expect(rows).toHaveLength(1);
      // Never verified, so the resubmitted form wins: they must verify into the
      // profile they last saw.
      expect(rows[0].onboardingPayload?.firstName).toBe('Corrected');
    });

    it('rejects a malformed email with 400', async () => {
      const response = await post('register', {
        ...registration('not-an-email'),
      }).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });

    it('rejects an unknown extra field with 400 (forbidNonWhitelisted)', async () => {
      const response = await post('register', {
        ...registration(nextEmail()),
        isAdmin: true,
      }).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('isAdmin')]),
      );
    });

    it('rejects a registration with no categories field at all', async () => {
      // The field is required rather than optional precisely so a frontend
      // that stops sending it fails loudly instead of silently seeding
      // nothing - this pins that contract.
      const body: Record<string, unknown> = { ...registration(nextEmail()) };
      delete body.categories;

      const response = await post('register', body).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('categories')]),
      );
    });

    it('rejects a category outside the starter set', async () => {
      const response = await post('register', {
        ...registration(nextEmail()),
        categories: ['Yachts'],
      }).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('categories')]),
      );
    });

    it('accepts an empty category selection (A4 enforces no minimum)', async () => {
      const email = nextEmail();
      await post('register', {
        ...registration(email),
        categories: [],
      }).expect(202);

      await mailer.waitFor(email.toLowerCase(), 1);
    });
  });

  describe('POST /api/auth/login-link', () => {
    it('answers an unknown address identically and sends nothing', async () => {
      const known = nextEmail();
      await post('register', registration(known)).expect(202);
      await mailer.waitFor(known.toLowerCase(), 1);

      const unknown = nextEmail();
      const response = await post('login-link', { email: unknown }).expect(202);

      expect(response.text).toBe('');
      expect(response.body).toEqual({});

      await mailer.quiesce();
      expect(mailer.to(unknown.toLowerCase())).toHaveLength(0);
      // And nothing was created for it either: a link is only ever issued for
      // an account that already exists.
      expect(await liveUsers(unknown.toLowerCase())).toHaveLength(0);
    });

    it('supersedes the previous link when a new one is requested', async () => {
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      await mailer.waitFor(email.toLowerCase(), 1);

      await post('login-link', { email }).expect(202);
      await mailer.waitFor(email.toLowerCase(), 2);

      const [user] = await liveUsers(email.toLowerCase());
      const links = await centralDb
        .select()
        .from(loginLinks)
        .where(eq(loginLinks.userId, user.id));

      expect(links).toHaveLength(2);
      expect(links.filter((link) => link.supersededAt !== null)).toHaveLength(
        1,
      );
      expect(
        links.filter(
          (link) => link.supersededAt === null && link.usedAt === null,
        ),
      ).toHaveLength(1);
    });

    it('rejects a malformed email with 400', async () => {
      const response = await post('login-link', {
        email: 'not-an-email',
      }).expect(400);

      expect(errorBody(response).message).toEqual(
        expect.arrayContaining([expect.stringContaining('email')]),
      );
    });
  });

  // Every 429 in here comes from the per-email limiter: the per-IP one is
  // parked at 1000 by setup-e2e.ts, since the whole suite shares 127.0.0.1.
  describe('rate limiting', () => {
    it('returns 429 once the limit is reached, for a known address', async () => {
      const email = nextEmail();
      await post('register', registration(email)).expect(202);
      await mailer.waitFor(email.toLowerCase(), 1);

      // The register above spent a different bucket: Nest's default key
      // includes the handler, so the two routes are throttled independently.
      for (let attempt = 0; attempt < RATE_LIMIT; attempt++) {
        await post('login-link', { email }).expect(202);
      }
      await post('login-link', { email }).expect(429);
    });

    it('throttles an unknown address the same way, so 429 discloses nothing', async () => {
      const email = nextEmail();

      for (let attempt = 0; attempt < RATE_LIMIT; attempt++) {
        await post('login-link', { email }).expect(202);
      }
      await post('login-link', { email }).expect(429);
    });

    it('buckets by the normalized address, not the submitted casing', async () => {
      const email = nextEmail();

      for (let attempt = 0; attempt < RATE_LIMIT; attempt++) {
        await post('login-link', { email: email.toUpperCase() }).expect(202);
      }
      // Guards run before pipes, so this only holds if the tracker normalizes
      // the raw body itself.
      await post('login-link', { email: email.toLowerCase() }).expect(429);
    });
  });

  /**
   * Exercised against the real central database rather than a mock, because
   * these four rejections are the whole security property of a magic link and a
   * mocked query would only prove the code builds the SQL it builds.
   */
  describe('LoginTokenService, against the real database', () => {
    const seedExpired = async (userId: string, rawToken: string) => {
      await centralDb.insert(loginLinks).values({
        id: newId(),
        userId,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() - 1_000),
      });
    };

    it('consumes a fresh token once and never again', async () => {
      const userId = newId();
      const rawToken = await loginTokens.issue(userId);

      await expect(loginTokens.consume(rawToken)).resolves.toEqual({
        status: 'consumed',
        userId,
      });
      // Spent, not superseded: the diagnostic read tells the two apart from the
      // row itself, which is what the 401-versus-409 split rests on.
      await expect(loginTokens.consume(rawToken)).resolves.toEqual({
        status: 'invalid',
      });
    });

    it('rejects a token that a later issue superseded, and says so', async () => {
      const userId = newId();
      const first = await loginTokens.issue(userId);
      const second = await loginTokens.issue(userId);

      await expect(loginTokens.consume(first)).resolves.toEqual({
        status: 'superseded',
      });
      await expect(loginTokens.consume(second)).resolves.toEqual({
        status: 'consumed',
        userId,
      });
    });

    it('rejects an expired token', async () => {
      const userId = newId();
      await seedExpired(userId, 'expired-token');

      await expect(loginTokens.consume('expired-token')).resolves.toEqual({
        status: 'invalid',
      });
    });

    it('rejects an unknown token', async () => {
      await expect(loginTokens.consume('never-issued')).resolves.toEqual({
        status: 'invalid',
      });
    });

    it('reports superseded even for a link that also expired', async () => {
      // Both conditions at once, which the diagnostic read deliberately answers
      // with "a newer link exists" rather than the generic rejection.
      const userId = newId();
      await seedExpired(userId, 'stale-and-superseded');
      await loginTokens.issue(userId);

      await expect(
        loginTokens.consume('stale-and-superseded'),
      ).resolves.toEqual({ status: 'superseded' });
    });

    it('lets only one of two concurrent consumes through', async () => {
      const userId = newId();
      const rawToken = await loginTokens.issue(userId);

      const results = await Promise.all([
        loginTokens.consume(rawToken),
        loginTokens.consume(rawToken),
      ]);

      expect(results.filter((result) => result.status === 'consumed')).toEqual([
        { status: 'consumed', userId },
      ]);
    });

    it('leaves exactly one live link when two issues race', async () => {
      // Without the transaction inside issue(), the two supersedes can both
      // run before either insert, leaving BOTH new links live.
      const userId = newId();
      const [first, second] = await Promise.all([
        loginTokens.issue(userId),
        loginTokens.issue(userId),
      ]);

      const live = await centralDb
        .select()
        .from(loginLinks)
        .where(
          and(
            eq(loginLinks.userId, userId),
            isNull(loginLinks.usedAt),
            isNull(loginLinks.supersededAt),
          ),
        );
      expect(live).toHaveLength(1);

      // And the surviving link is the only consumable one, whichever won.
      const consumed = await Promise.all([
        loginTokens.consume(first),
        loginTokens.consume(second),
      ]);
      expect(consumed.filter((result) => result.status === 'consumed')).toEqual(
        [{ status: 'consumed', userId }],
      );
    });
  });
});
