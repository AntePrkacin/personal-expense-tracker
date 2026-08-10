import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { categoryTemplateIds } from './category-templates';
import { LoginTokenService } from './../src/auth/login-token.service';
import { addDays, todayIn } from './../src/common/month-window';
import { users } from './../src/database/central/schema';
import { APP_DB } from './../src/database/database.constants';
import type { CentralDatabase } from './../src/database/database.types';
import { MAILER } from './../src/mail/mailer';
import type { PeriodsResponseDto } from './../src/periods/dto/period-response.dto';
import type { ProfileResponseDto } from './../src/profile/dto/profile-response.dto';
import type { TransactionsResponseDto } from './../src/transactions/dto/transactions-response.dto';
import { MemoryMailer } from './memory-mailer';

/**
 * Pay-schedule history end to end: `GET /api/periods`,
 * `POST /api/profile/schedule`, and what the period-scoped reads do afterwards.
 *
 * **This is the suite that walks PET-72's user story literally**, which is why it
 * exists rather than more cases in `profile.e2e-spec.ts`. The unit specs pin the
 * walk with literals and the service with mocks; only an e2e can show that a
 * schedule change written through the API actually re-buckets the transactions in
 * a real database, that the stretched transition period keeps the *old* budget,
 * and that the periods before the change are untouched.
 *
 * **Every account here is provisioned on the 1st and every date is relative to
 * today**, resolved through `todayIn` exactly as the app does. A fixture pinned to
 * a literal month would pass on the day it was written and silently stop covering
 * anything a month later - the trap `transaction-reads.e2e-spec.ts` records.
 *
 * One account per scenario, because a schedule change is not reversible through
 * the API: `period_rules` is append-only, so a test that changed the schedule and
 * then "changed it back" would leave three rules and two transition periods rather
 * than the state it started in. Provisioning costs auth requests against the
 * per-IP limiter, so the count is kept to what the scenarios need.
 */
describe('Periods and pay-schedule changes (e2e)', () => {
  let app: INestApplication<App>;
  let centralDb: CentralDatabase;
  let loginTokens: LoginTokenService;
  let mailer: MemoryMailer;
  const databaseDir = process.env.DATABASE_DIR!;

  /** Today in the app's own zone, so every derived date agrees with the server. */
  const today = todayIn('Europe/Zagreb');
  const [year, month] = today.split('-').map(Number);

  /** `YYYY-MM-DD` for a day of a month offset from this one. */
  const dayOf = (monthsAhead: number, day: number) => {
    const total = year * 12 + (month - 1) + monthsAhead;
    const y = Math.floor(total / 12);
    const m = total - y * 12 + 1;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  let pickedCategoryIds: string[] = [];
  let emailCounter = 0;
  const nextEmail = () => `Payday${++emailCounter}@Example.COM`;

  /** A fresh account paid on the 1st, with a 2000 budget. */
  const provision = async () => {
    const email = nextEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Marko Kovac',
        email,
        currency: 'eur',
        monthlyBudget: 2000,
        monthStartDay: 1,
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

  const periodsOf = (token: string) =>
    request(app.getHttpServer())
      .get('/api/periods')
      .set('Authorization', `Bearer ${token}`);

  const changeSchedule = (token: string, payload: object) =>
    request(app.getHttpServer())
      .post('/api/profile/schedule')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  const profileOf = (token: string) =>
    request(app.getHttpServer())
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);

  const dashboardFor = (token: string, period?: string) =>
    request(app.getHttpServer())
      .get(`/api/dashboard${period ? `?period=${period}` : ''}`)
      .set('Authorization', `Bearer ${token}`);

  const transactionsFor = (token: string, period: string) =>
    request(app.getHttpServer())
      .get(`/api/transactions?period=${period}`)
      .set('Authorization', `Bearer ${token}`);

  const periodsBody = (response: request.Response) =>
    response.body as PeriodsResponseDto;

  const spend = async (token: string, date: string, amount: number) => {
    const response = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { categories } = response.body as {
      categories: { id: string }[];
    };
    const categoryId = categories[0].id;

    await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchant: 'Konzum', categoryId, amount, date })
      .expect(201);
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
      'Groceries',
      'Transportation',
    ]);

    centralDb = app.get<CentralDatabase>(APP_DB);
    loginTokens = app.get(LoginTokenService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('GET /api/periods', () => {
    it('answers the current period alone for a fresh account', async () => {
      const { token } = await provision();

      const { periods } = periodsBody(await periodsOf(token).expect(200));

      // Bounded by the account's own history: a brand-new account with no
      // transactions spans exactly the period it was provisioned in.
      expect(periods).toHaveLength(1);
      expect(periods[0]).toMatchObject({
        start: dayOf(0, 1),
        end: dayOf(1, 1),
        current: true,
      });
    });

    it('reaches back to the oldest transaction, newest first', async () => {
      const { token } = await provision();
      await spend(token, dayOf(-2, 15), 50);

      const { periods } = periodsBody(await periodsOf(token).expect(200));

      // Three periods: the one the expense is in, the one between, and this one.
      expect(periods.map((period) => period.start)).toEqual([
        dayOf(0, 1),
        dayOf(-1, 1),
        dayOf(-2, 1),
      ]);
      // Exactly one carries the flag, and it is the newest.
      expect(periods.filter((period) => period.current)).toHaveLength(1);
      expect(periods[0].current).toBe(true);
    });

    it('labels a calendar-month period by its single month', async () => {
      const { token } = await provision();

      const { periods } = periodsBody(await periodsOf(token).expect(200));

      // A 1st-to-1st period touches one month, so the label carries one name.
      expect(periods[0].label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    });
  });

  describe('POST /api/profile/schedule, changing the pay day', () => {
    /**
     * The ticket's worked scenario, one month back so the change is unambiguously
     * retroactive: paid on the 1st, moving to the 14th of last month.
     *
     * Arrears removes the 1st-of-last-month boundary, so the month before it
     * stretches to the 14th.
     */
    it('stretches the period before T and starts the new schedule on T', async () => {
      const { token } = await provision();
      const anchor = dayOf(-1, 14);
      // Spent inside what becomes the transition period, so `GET /api/periods`
      // reaches back far enough to enumerate it: the list spans the account's
      // spending rather than its rules.
      await spend(token, dayOf(-2, 15), 20);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: anchor,
      }).expect(200);

      const { periods } = periodsBody(await periodsOf(token).expect(200));
      const starts = periods.map((period) => period.start);

      // The new schedule opens on T itself...
      expect(starts).toContain(anchor);
      // ...the stretched transition runs from two months back to T...
      expect(starts).toContain(dayOf(-2, 1));
      // ...and the boundary immediately before T is gone: that paycheck never
      // arrived, so no period may claim a budget for it.
      expect(starts).not.toContain(dayOf(-1, 1));

      const transition = periods.find(
        (period) => period.start === dayOf(-2, 1),
      );
      expect(transition?.end).toBe(anchor);
    });

    it('keeps the old budget on the stretched period and the new one from T', async () => {
      const { token } = await provision();
      const anchor = dayOf(-1, 14);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: anchor,
      }).expect(200);

      // The money that had to last through the stretch was paid under the old
      // schedule, so the transition period keeps the old budget.
      const transition = await dashboardFor(token, dayOf(-2, 1)).expect(200);
      expect((transition.body as { monthlyBudget: number }).monthlyBudget).toBe(
        2000,
      );

      // The new budget applies from T onward.
      const fromT = await dashboardFor(token, anchor).expect(200);
      expect((fromT.body as { monthlyBudget: number }).monthlyBudget).toBe(
        2500,
      );
    });

    it('leaves every period before the change exactly as it was', async () => {
      const { token } = await provision();
      await spend(token, dayOf(-3, 10), 40);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(-1, 14),
      }).expect(200);

      // Boundaries unchanged, and still on the old budget: a new pay day is a
      // fact about the periods after it.
      const older = await dashboardFor(token, dayOf(-3, 1)).expect(200);
      const body = older.body as {
        monthlyBudget: number;
        spent: number;
        period: { start: string; end: string };
      };
      expect(body.period).toMatchObject({
        start: dayOf(-3, 1),
        end: dayOf(-2, 1),
      });
      expect(body.monthlyBudget).toBe(2000);
      expect(body.spent).toBe(40);
    });

    it('re-buckets a transaction the change moved into another period', async () => {
      const { token } = await provision();
      // Dated between the removed boundary and T, so the change moves it out of
      // its own month and into the stretched period.
      const spentOn = dayOf(-1, 5);
      await spend(token, spentOn, 30);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(-1, 14),
      }).expect(200);

      const inTransition = await transactionsFor(token, dayOf(-2, 1)).expect(
        200,
      );
      const list = inTransition.body as TransactionsResponseDto;
      expect(list.transactions.map((row) => row.date)).toEqual([spentOn]);
      expect(list.period).toMatchObject({
        start: dayOf(-2, 1),
        end: dayOf(-1, 14),
      });
    });

    it('labels a stretched period by both months it touches', async () => {
      const { token } = await provision();
      await spend(token, dayOf(-2, 15), 20);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(-1, 14),
      }).expect(200);

      const { periods } = periodsBody(await periodsOf(token).expect(200));
      const transition = periods.find(
        (period) => period.start === dayOf(-2, 1),
      );

      // Two months, so two names - a single month name over a window running
      // into the next month is exactly what `Period.label` exists to prevent.
      expect(transition?.label).toContain('/');
    });

    it('reports the pay day in force, which mid-transition is still the old one', async () => {
      const { token } = await provision();

      // T next month, so today sits inside the stretched transition period.
      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(1, 14),
      }).expect(200);

      const response = await profileOf(token).expect(200);
      expect((response.body as ProfileResponseDto).monthStartDay).toBe(1);
    });
  });

  describe('POST /api/profile/schedule, with T in the future', () => {
    it('stretches the current period up to T, so the change is visible at once', async () => {
      const { token } = await provision();
      const anchor = dayOf(1, 14);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: anchor,
      }).expect(200);

      const current = await dashboardFor(token).expect(200);
      const body = current.body as {
        monthlyBudget: number;
        period: { start: string; end: string };
      };

      // The period containing today now runs to T rather than to the 1st.
      expect(body.period).toMatchObject({ start: dayOf(0, 1), end: anchor });
      // And still on the old budget, because that is what was paid for it.
      expect(body.monthlyBudget).toBe(2000);
    });

    it('offers no period past the current one, even with T in the future', async () => {
      const { token } = await provision();

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(1, 14),
      }).expect(200);

      const { periods } = periodsBody(await periodsOf(token).expect(200));

      // There is no reason to offer navigation into a future nothing can have
      // been spent in, even though the walk would happily produce it.
      expect(periods.every((period) => period.start <= today)).toBe(true);
    });
  });

  describe('POST /api/profile/schedule, budget only', () => {
    it('moves no boundary and applies from the current period', async () => {
      const { token } = await provision();
      const before = periodsBody(await periodsOf(token).expect(200));

      // Same pay day, so this is a budget change rather than a schedule change.
      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 1,
        firstPaycheckDate: dayOf(0, 1),
      }).expect(200);

      const after = periodsBody(await periodsOf(token).expect(200));
      expect(after.periods.map((period) => period.start)).toEqual(
        before.periods.map((period) => period.start),
      );

      const current = await dashboardFor(token).expect(200);
      expect((current.body as { monthlyBudget: number }).monthlyBudget).toBe(
        2500,
      );
      expect((await profileOf(token).expect(200)).body).toMatchObject({
        monthlyBudget: 2500,
        monthStartDay: 1,
      });
    });

    it('leaves an earlier period on the budget it was spent against', async () => {
      const { token } = await provision();
      await spend(token, dayOf(-1, 10), 60);

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 1,
        firstPaycheckDate: dayOf(0, 1),
      }).expect(200);

      const older = await dashboardFor(token, dayOf(-1, 1)).expect(200);
      expect((older.body as { monthlyBudget: number }).monthlyBudget).toBe(
        2000,
      );
    });
  });

  describe('POST /api/profile/schedule, rejected', () => {
    it('400s an anchor that is not its own pay day', async () => {
      const { token } = await provision();

      // A period starts on every paycheck, so an anchor off its own pay day would
      // describe a first period beginning on a day no later period begins on.
      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(0, 5),
      }).expect(400);

      // And nothing changed.
      const { periods } = periodsBody(await periodsOf(token).expect(200));
      expect(periods[0]).toMatchObject({ start: dayOf(0, 1) });
    });

    it('400s a pay day past 28, which not every month has', async () => {
      const { token } = await provision();

      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 31,
        firstPaycheckDate: dayOf(0, 31),
      }).expect(400);
    });

    it('400s a body missing the anchor, so a budget cannot be set undated', async () => {
      const { token } = await provision();

      // The whole reason this endpoint exists: every field is required, so "set
      // the budget" cannot be expressed without saying from when.
      await changeSchedule(token, {
        monthlyBudget: 2500,
        monthStartDay: 1,
      }).expect(400);
    });

    it('converges rather than duplicating when the identical body is sent twice', async () => {
      const { token } = await provision();
      const payload = {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: dayOf(-1, 14),
      };

      await changeSchedule(token, payload).expect(200);
      const first = periodsBody(await periodsOf(token).expect(200));

      await changeSchedule(token, payload).expect(200);
      const second = periodsBody(await periodsOf(token).expect(200));

      // The rule insert is onConflictDoNothing on the unique index and the budget
      // append resolves to the newest row for the same date, so a retry leaves the
      // account in the same state as a single send.
      expect(second.periods).toEqual(first.periods);
      expect((await profileOf(token).expect(200)).body).toMatchObject({
        monthlyBudget: 2500,
      });
    });
  });

  describe('the period query parameter', () => {
    it('400s a date that starts none of your periods', async () => {
      const { token } = await provision();

      // Not the period containing it: answering anyway would let two different
      // query strings return one page, under an overline disagreeing with one.
      const notAStart = addDays(dayOf(0, 1), 3);
      await dashboardFor(token, notAStart).expect(400);
      await request(app.getHttpServer())
        .get(`/api/categories?period=${notAStart}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await transactionsFor(token, notAStart).expect(400);
    });

    it('answers identically for an omitted period and the current one’s start', async () => {
      const { token } = await provision();
      await spend(token, dayOf(0, 1), 25);

      const omitted = await dashboardFor(token).expect(200);
      const explicit = await dashboardFor(token, dayOf(0, 1)).expect(200);

      // Sending the current period's own start must not take a different path
      // through the service from omitting it.
      expect(explicit.body).toEqual(omitted.body);
    });

    it('reports zero days left for a finished period, never a negative count', async () => {
      const { token } = await provision();
      await spend(token, dayOf(-1, 10), 90);

      const older = await dashboardFor(token, dayOf(-1, 1)).expect(200);
      const body = older.body as { daysLeft: number; averagePerDay: number };

      expect(body.daysLeft).toBe(0);
      // Measured over the whole period rather than against a `today` outside it,
      // so the rate is the period's real one.
      expect(body.averagePerDay).toBeGreaterThan(0);
    });
  });
});
