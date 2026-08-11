import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AssistantCompletionService } from './../src/assistant/assistant-completion.service';
import type { AssistantPromptContext } from './../src/assistant/assistant-context.builder';
import { MAX_MESSAGE_CHARS } from './../src/assistant/assistant.constants';
import type {
  AssistantConversationResponseDto,
  AssistantSessionsResponseDto,
} from './../src/assistant/dto/assistant-sessions-response.dto';
import type { SendMessageResponseDto } from './../src/assistant/dto/send-message-response.dto';
import { LoginTokenService } from './../src/auth/login-token.service';
import { newId } from './../src/common/ids';
import { categoryTemplateIds } from './category-templates';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { MAILER } from './../src/mail/mailer';
import { MemoryMailer } from './memory-mailer';

const CHAT_RATE_LIMIT = Number(process.env.CHAT_RATE_LIMIT);

/**
 * The assistant chat, against real databases and a stubbed model.
 *
 * **The completion service is overridden wholesale rather than left keyless.**
 * `/scan`'s suite can lean on the missing `GEMINI_API_KEY` because every case it
 * has is a failure case; this one has to exercise the success path - one
 * transaction per turn, the session created on a first message, the history
 * re-sent on a second - so the stub stands in for the network and one case flips
 * `isConfigured` back to false to pin the 503.
 *
 * What only this file can prove: that the two tables really take a turn's writes
 * together, that a `sessionId` from another account is a 404 rather than a leak,
 * that the prompt context is built from the caller's own live data, and that the
 * `chat` throttler trips without touching the other three.
 */
describe('Assistant endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  const databaseDir = process.env.DATABASE_DIR!;

  let bearer: string;
  let otherBearer: string;

  let mailer: MemoryMailer;
  let pickedCategoryIds: string[] = [];

  let emailCounter = 0;
  const nextEmail = () => `Asker${++emailCounter}@Example.COM`;

  /**
   * The stub standing in for Gemini. `complete` records what it was asked and
   * answers a fixed string; `isConfigured` is a knob so the 503 case can be
   * driven without deleting a key the rest of the file does not need.
   */
  const completion = {
    isConfigured: jest.fn(() => true),
    complete: jest.fn<
      Promise<string>,
      [
        AssistantPromptContext,
        { role: string; content: string }[],
        string,
        AbortSignal?,
      ]
    >(() => Promise.resolve('You spent 12.34 EUR at Konzum.')),
  };

  /** The context the stub was last handed, which is what the prompt is built from. */
  const lastContext = () =>
    completion.complete.mock.calls[
      completion.complete.mock.calls.length - 1
    ][0];

  const lastHistory = () =>
    completion.complete.mock.calls[
      completion.complete.mock.calls.length - 1
    ][1];

  const send = (body: object, token = bearer) =>
    request(app.getHttpServer())
      .post('/api/assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const sessions = (token = bearer) =>
    request(app.getHttpServer())
      .get('/api/assistant/sessions')
      .set('Authorization', `Bearer ${token}`);

  const conversation = (id: string, token = bearer) =>
    request(app.getHttpServer())
      .get(`/api/assistant/sessions/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const sendBody = (response: request.Response) =>
    response.body as SendMessageResponseDto;

  const sessionsBody = (response: request.Response) =>
    response.body as AssistantSessionsResponseDto;

  const conversationBody = (response: request.Response) =>
    response.body as AssistantConversationResponseDto;

  const addTransaction = (
    token: string,
    payload: {
      categoryId: string;
      amount: number;
      date: string;
      merchant: string;
    },
  ) =>
    request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

  const categoryNamed = async (token: string, name: string) => {
    const response = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { categories } = response.body as {
      categories: { id: string; name: string }[];
    };
    return categories.find((row) => row.name === name)!;
  };

  const provision = async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Marko Kovac',
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

  /**
   * A fresh account per test, rather than one for the file with its tables
   * emptied between cases.
   *
   * **The `chat` throttler is what forces this**, and it is worth saying so
   * rather than leaving the next reader to rediscover it. The bucket is keyed on
   * the session user id and the e2e limit is deliberately tiny, so a shared
   * account would spend it three sends into the file and every case after that
   * would fail with a 429 that has nothing to do with what it was testing.
   * `/scan`'s suite gets away with one dedicated account because every case it
   * has is a failure case it can afford to run once; this one sends repeatedly.
   *
   * It also removes the table cleanup entirely - a new database has no rows -
   * and it is what lets the throttler case below simply count to the limit.
   */
  const freshAccount = async () => {
    bearer = (await provision()).token;
  };

  beforeAll(async () => {
    mailer = new MemoryMailer();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .overrideProvider(AssistantCompletionService)
      .useValue(completion)
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

    // `beforeEach` replaces `bearer` with a fresh account per test; this one is
    // only so the file is never mid-setup with an undefined token, and
    // `otherBearer` is the fixed second account the isolation cases read as.
    await freshAccount();
    otherBearer = (await provision()).token;
  });

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    completion.isConfigured.mockReturnValue(true);
    completion.complete.mockClear();
    await freshAccount();
  });

  describe('POST /api/assistant/messages', () => {
    it('refuses a request with no bearer', async () => {
      await request(app.getHttpServer())
        .post('/api/assistant/messages')
        .send({ message: 'Hello' })
        .expect(401);
    });

    it('creates a session on a first message and answers 201 with the whole turn', async () => {
      const body = sendBody(
        await send({ message: 'Where did my money go?' }).expect(201),
      );

      expect(body.sessionId).toEqual(expect.any(String));
      expect(body.title).toBe('Where did my money go?');
      expect(body.message).toMatchObject({
        role: 'user',
        content: 'Where did my money go?',
      });
      expect(body.reply).toMatchObject({
        role: 'assistant',
        content: 'You spent 12.34 EUR at Konzum.',
      });
      expect(body.truncation).toBeNull();
    });

    it('continues a session, re-sending the whole prior conversation', async () => {
      const first = sendBody(
        await send({ message: 'First question' }).expect(201),
      );

      const second = sendBody(
        await send({
          message: 'Second question',
          sessionId: first.sessionId,
        }).expect(201),
      );

      expect(second.sessionId).toBe(first.sessionId);
      // The title is derived from the first message and never rewritten, which
      // is why `assistant_sessions` carries no `updated_at`.
      expect(second.title).toBe('First question');
      expect(lastHistory()).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'You spent 12.34 EUR at Konzum.' },
      ]);
    });

    it('stores both messages of a turn, in render order', async () => {
      const first = sendBody(
        await send({ message: 'First question' }).expect(201),
      );
      await send({
        message: 'Second question',
        sessionId: first.sessionId,
      }).expect(201);

      const body = conversationBody(
        await conversation(first.sessionId).expect(200),
      );

      // `sort_order`, not `created_at`: the two messages of a turn are written
      // in one transaction and share a millisecond.
      expect(body.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
      expect(body.messages[0].content).toBe('First question');
      expect(body.messages[2].content).toBe('Second question');
    });

    it('persists nothing when the model call fails', async () => {
      // The whole reason `assistant_messages` needs no status column and no
      // lifecycle: the write runs only after the reply arrives.
      completion.complete.mockRejectedValueOnce(new Error('the model blew up'));

      await send({ message: 'A question that will not land' }).expect(500);

      expect(sessionsBody(await sessions().expect(200)).sessions).toEqual([]);
    });

    it('answers 404 for a session id naming nothing', async () => {
      await send({ message: 'Hello', sessionId: newId() }).expect(404);
    });

    it('answers 404 for another account’s session, so no id leaks across users', async () => {
      const mine = sendBody(await send({ message: 'Mine' }).expect(201));

      await send(
        { message: 'Yours?', sessionId: mine.sessionId },
        otherBearer,
      ).expect(404);
    });

    it('answers 400 for a non-uuid session id', async () => {
      await send({ message: 'Hello', sessionId: 'not-a-uuid' }).expect(400);
    });

    it('answers 400 for an empty message', async () => {
      await send({ message: '' }).expect(400);
    });

    it('answers 400 for a whitespace-only message', async () => {
      // `@MinLength(1)` measures the untrimmed string, so this passed validation
      // and stored a session whose derived title was the empty string - a History
      // row rendering a link with no accessible name, over a blank question. The
      // DTO trims now, which is what makes this the same case as the one above.
      await send({ message: '   \n\t ' }).expect(400);
    });

    it('answers 400 past the message cap', async () => {
      await send({ message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }).expect(400);
    });

    it('answers 400 for an unknown field, rather than dropping it', async () => {
      await send({ message: 'Hello', tone: 'friendly' }).expect(400);
    });

    it('answers 503 with no key configured, before opening the database', async () => {
      completion.isConfigured.mockReturnValue(false);

      await send({ message: 'Hello' }).expect(503);

      expect(completion.complete).not.toHaveBeenCalled();
    });

    it('trips its own throttler without touching the auth limiters', async () => {
      // This account is this test's own - see `freshAccount` - so the count
      // starts at zero and the limit is reached exactly where it says.
      for (let i = 0; i < CHAT_RATE_LIMIT; i++) {
        await send({ message: `Question ${i}` }).expect(201);
      }
      await send({ message: 'One too many' }).expect(429);

      // Keyed on the session user id, not on the auth routes' email/ip
      // trackers - so a fresh address can still request a login link right
      // after this account's chat bucket is spent.
      await request(app.getHttpServer())
        .post('/api/auth/login-link')
        .send({ email: nextEmail() })
        .expect(202);
    });
  });

  describe('the prompt context', () => {
    it('is built from the caller’s own live transactions, category-resolved', async () => {
      const groceries = await categoryNamed(bearer, 'Groceries');
      await addTransaction(bearer, {
        categoryId: groceries.id,
        amount: 12.34,
        date: new Date().toISOString().slice(0, 10),
        merchant: 'Konzum',
      });

      await send({ message: 'How much on groceries?' }).expect(201);

      const context = lastContext();
      expect(context.transactions).toContainEqual(
        expect.objectContaining({
          merchant: 'Konzum',
          amountCents: 1234,
          categoryName: 'Groceries',
        }),
      );
    });

    it('carries the profile currency, the period and its budget', async () => {
      await send({ message: 'What is my budget?' }).expect(201);

      const context = lastContext();
      expect(context.currency).toBe('EUR');
      expect(context.budgetCents).toBe(200_000);
      expect(context.period.label).toEqual(expect.any(String));
      expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('carries every category with its cap, uncapped ones included', async () => {
      await send({ message: 'What are my caps?' }).expect(201);

      const context = lastContext();
      // The fallback is seeded uncapped and is a real row the model should see:
      // it is where orphaned spend lands.
      expect(context.categories).toContainEqual({
        name: 'Uncategorized',
        cap: null,
      });
    });

    it('sends no transaction note and no category id', async () => {
      // The two deliberate omissions. A note is the one field a user writes for
      // themselves and surfaces on no list row; a name suffices for a category
      // here, unlike a scan where an id has to come back verbatim.
      const groceries = await categoryNamed(bearer, 'Groceries');
      await addTransaction(bearer, {
        categoryId: groceries.id,
        amount: 5,
        date: new Date().toISOString().slice(0, 10),
        merchant: 'Tisak',
      });

      await send({ message: 'Anything?' }).expect(201);

      const serialised = JSON.stringify(lastContext());
      expect(serialised).not.toContain(groceries.id);
      expect(serialised).not.toContain('note');
    });

    it('reports no truncation for an account well under the ceiling', async () => {
      await send({ message: 'Anything?' }).expect(201);

      expect(lastContext().truncation).toBeNull();
    });
  });

  describe('GET /api/assistant/sessions', () => {
    it('refuses a request with no bearer', async () => {
      await request(app.getHttpServer())
        .get('/api/assistant/sessions')
        .expect(401);
    });

    it('is an empty wrapper object before anything is asked', async () => {
      expect(sessionsBody(await sessions().expect(200))).toEqual({
        sessions: [],
        total: 0,
      });
    });

    it('lists conversations newest activity first, with a total', async () => {
      const first = sendBody(
        await send({ message: 'Older question' }).expect(201),
      );
      const second = sendBody(
        await send({ message: 'Newer question' }).expect(201),
      );
      // Reviving the older one must move it to the top, since the list orders on
      // `last_message_at` rather than on creation.
      await send({ message: 'A follow-up', sessionId: first.sessionId }).expect(
        201,
      );

      const body = sessionsBody(await sessions().expect(200));

      expect(body.total).toBe(2);
      expect(body.sessions.map((row) => row.id)).toEqual([
        first.sessionId,
        second.sessionId,
      ]);
      expect(body.sessions[0].title).toBe('Older question');
    });

    it('shows another account nothing of this one’s', async () => {
      await send({ message: 'Private' }).expect(201);

      expect(
        sessionsBody(await sessions(otherBearer).expect(200)).sessions,
      ).toEqual([]);
    });
  });

  describe('GET /api/assistant/sessions/:id', () => {
    it('answers 400 for a non-uuid id', async () => {
      await conversation('not-a-uuid').expect(400);
    });

    it('answers 404 for an unknown id', async () => {
      await conversation(newId()).expect(404);
    });

    it('answers 404 for another account’s conversation', async () => {
      const mine = sendBody(await send({ message: 'Mine' }).expect(201));

      await conversation(mine.sessionId, otherBearer).expect(404);
    });

    it('returns the conversation with its own header fields', async () => {
      const created = sendBody(
        await send({ message: 'A question' }).expect(201),
      );

      const body = conversationBody(
        await conversation(created.sessionId).expect(200),
      );

      expect(body.id).toBe(created.sessionId);
      expect(body.title).toBe('A question');
      expect(body.lastMessageAt).toEqual(expect.any(String));
      expect(body.createdAt).toEqual(expect.any(String));
      expect(body.messages).toHaveLength(2);
    });
  });

  describe('the completion service’s own 503', () => {
    it('surfaces as a 503 rather than a 500 if the check is somehow passed', async () => {
      // The defensive second check inside `complete`. `isConfigured` is what
      // callers are meant to use; this pins that the inner throw still maps to
      // the documented status rather than the generic 500.
      completion.complete.mockRejectedValueOnce(
        new ServiceUnavailableException('The assistant is not configured.'),
      );

      await send({ message: 'Hello' }).expect(503);
    });
  });
});
