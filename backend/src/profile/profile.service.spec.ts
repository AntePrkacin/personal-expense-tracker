import { BadRequestException, ConflictException } from '@nestjs/common';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import type { UserDatabaseService } from '../database/user-database.service';
import type { ProfileRow } from '../database/user/schema';
import type { PeriodService } from '../periods/period.service';
import type { UsersService } from '../users/users.service';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let getUserDb: jest.Mock;
  let select: jest.Mock;
  let update: jest.Mock;
  let insert: jest.Mock;
  let findByEmail: jest.Mock;
  let updateEmail: jest.Mock;
  let rules: jest.Mock;
  let configured: jest.Mock;

  const USER_ID = '0190c3f0-0000-7000-8000-000000000001';
  const OTHER_ID = '0190c3f0-0000-7000-8000-000000000002';
  const EMAIL = 'marko@email.com';

  // Two fields now, plus the instants: the budget and the pay day left this row
  // at PET-72 and are resolved through `PeriodService` instead.
  const row: ProfileRow = {
    id: USER_ID,
    fullName: 'Marko Kovac',
    currency: 'EUR',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    deletedAt: null,
  };

  /** The chain the last `update()` produced, for asserting set/where on it. */
  const lastUpdate = () => update.mock.results.at(-1)!.value as never;
  const lastSelect = () => select.mock.results.at(-1)!.value as never;
  /** The values of the nth insert, for the schedule write's two appends. */
  const insertedAt = (n: number) =>
    argsOf(insert.mock.results[n].value as never, 'values')[0] as Record<
      string,
      unknown
    >;

  beforeEach(() => {
    select = jest.fn().mockReturnValue(queryChain([row]));
    update = jest.fn().mockReturnValue(queryChain([row]));
    // A fresh chain per call, not one shared object: the schedule write inserts
    // twice, and a single shared chain would report the second call's arguments
    // for both.
    insert = jest.fn().mockImplementation(() => queryChain([]));
    getUserDb = jest.fn().mockResolvedValue({ select, update, insert });

    findByEmail = jest.fn().mockResolvedValue(null);
    updateEmail = jest.fn().mockResolvedValue(undefined);

    // Anchored a year back on purpose. A rule starting on the boundary a change
    // removes is the clamp case, which has its own test below - using it as the
    // default would quietly make every other case exercise the clamp instead.
    rules = jest.fn().mockResolvedValue([
      {
        effectiveFrom: '2025-01-01',
        monthStartDay: 1,
        transitionStart: null,
      },
    ]);
    configured = jest
      .fn()
      .mockResolvedValue({ monthStartDay: 1, budgetCents: 200050 });

    service = new ProfileService(
      { getUserDb } as unknown as UserDatabaseService,
      { rules, configured } as unknown as PeriodService,
      { findByEmail, updateEmail } as unknown as UsersService,
    );
  });

  describe('get', () => {
    it('answers the five fields, with the budget in major units', async () => {
      await expect(service.get(USER_ID, EMAIL)).resolves.toEqual({
        fullName: 'Marko Kovac',
        email: EMAIL,
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
      });
    });

    it('resolves the budget and pay day from history, not from the row', async () => {
      // The whole point of PET-72's read: neither is a column any more, so the
      // response has to come from the period service or it would be reporting a
      // value nothing stores. `configured` is the newest rows - a pending
      // future-anchored change included - which is what lets the Settings form
      // round-trip without silently reverting one.
      configured.mockResolvedValue({ monthStartDay: 14, budgetCents: 150000 });

      await expect(service.get(USER_ID, EMAIL)).resolves.toMatchObject({
        monthlyBudget: 1500,
        monthStartDay: 14,
      });
      expect(configured).toHaveBeenCalledWith(USER_ID);
    });

    it('takes the email from the principal, never from the user database', async () => {
      // SessionService.validate joins `users` on every request, so the
      // principal's address cannot be stale - and a second lookup would be a
      // second round trip for a value already in hand.
      await service.get(USER_ID, 'novi@email.com');

      expect(findByEmail).not.toHaveBeenCalled();
      expect((await service.get(USER_ID, 'novi@email.com')).email).toBe(
        'novi@email.com',
      );
    });

    it('reads the caller’s own row and skips tombstones', async () => {
      await service.get(USER_ID, EMAIL);

      const where = argsOf(lastSelect(), 'where')[0];
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(USER_ID);
      expect(getUserDb).toHaveBeenCalledWith(USER_ID);
    });

    it('rejects with a plain Error when the row is missing', async () => {
      select.mockReturnValue(queryChain([]));

      // Not a NotFoundException: a verified session implies a profile row, so
      // this is a broken invariant the global filter turns into a 500.
      const rejection: unknown = await service
        .get(USER_ID, EMAIL)
        .catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).name).toBe('Error');
      expect((rejection as Error).message).toContain(USER_ID);
    });
  });

  describe('update', () => {
    it('400s an empty body before it even opens the database', async () => {
      await expect(service.update(USER_ID, EMAIL, {})).rejects.toThrow(
        BadRequestException,
      );
      // The point of checking first: a bare UPDATE would still bump updated_at
      // through $onUpdateFn and record an edit that changed nothing.
      expect(getUserDb).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(updateEmail).not.toHaveBeenCalled();
    });

    it('sets exactly the fields provided, and nothing else', async () => {
      await service.update(USER_ID, EMAIL, { fullName: 'Ana' });

      expect(argsOf(lastUpdate(), 'set')[0]).toEqual({ fullName: 'Ana' });
    });

    it('never sets updatedAt by hand', async () => {
      await service.update(USER_ID, EMAIL, { fullName: 'Ana' });

      // drizzle's buildUpdateSet applies $onUpdateFn columns itself on every
      // UPDATE. Setting it here too would be a second source for one timestamp.
      expect(argsOf(lastUpdate(), 'set')[0]).not.toHaveProperty('updatedAt');
    });

    it('carries no budget field at all, because the PATCH no longer takes one', async () => {
      // PET-72 moved the budget onto the schedule write. A `monthlyBudget` here
      // is rejected by the DTO before the service is reached, so what this pins
      // is the service half: `buildUpdate` has no branch that could put a cents
      // column back into the SET.
      await service.update(USER_ID, EMAIL, { fullName: 'Ana' });

      const set = argsOf(lastUpdate(), 'set')[0];
      expect(set).not.toHaveProperty('monthlyBudgetCents');
      expect(set).not.toHaveProperty('monthStartDay');
    });

    it('excludes tombstoned rows from the WHERE', async () => {
      await service.update(USER_ID, EMAIL, { fullName: 'Ana' });

      const where = argsOf(lastUpdate(), 'where')[0];
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(USER_ID);
    });

    it('leaves the central directory alone when the email is unchanged', async () => {
      await service.update(USER_ID, EMAIL, {
        fullName: 'Ana',
        email: EMAIL,
      });

      // Nothing to check and nothing to write: the address it would claim is
      // already this account's.
      expect(findByEmail).not.toHaveBeenCalled();
      expect(updateEmail).not.toHaveBeenCalled();
    });

    it('treats a differently-cased address as the same one', async () => {
      // The DTO normalizes, but the comparison normalizes both sides too, so a
      // principal stored unnormalized could not turn into a self-conflict.
      await service.update(USER_ID, 'Marko@Email.com', { email: EMAIL });

      expect(findByEmail).not.toHaveBeenCalled();
      expect(updateEmail).not.toHaveBeenCalled();
    });

    it('409s an address that belongs to somebody else, writing nothing', async () => {
      findByEmail.mockResolvedValue({ id: OTHER_ID, onboardingPayload: null });

      await expect(
        service.update(USER_ID, EMAIL, {
          fullName: 'Ana',
          email: 'zauzeto@email.com',
        }),
      ).rejects.toThrow(ConflictException);

      // The pre-check runs ahead of both writes, so a conflict leaves both
      // stores exactly as they were.
      expect(update).not.toHaveBeenCalled();
      expect(updateEmail).not.toHaveBeenCalled();
    });

    it('proceeds when the matched row is the caller’s own', async () => {
      findByEmail.mockResolvedValue({ id: USER_ID, onboardingPayload: null });

      await expect(
        service.update(USER_ID, EMAIL, { email: 'novi@email.com' }),
      ).resolves.toMatchObject({ email: 'novi@email.com' });
      expect(updateEmail).toHaveBeenCalledWith(USER_ID, 'novi@email.com');
    });

    it('writes the profile before it moves the login identifier', async () => {
      await service.update(USER_ID, EMAIL, {
        fullName: 'Ana',
        email: 'novi@email.com',
      });

      // No cross-database transaction exists, so the order is the guarantee:
      // the riskier write (opening, possibly migrating, a per-user database)
      // happens first, and central moves only once it has succeeded.
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        updateEmail.mock.invocationCallOrder[0],
      );
    });

    it('selects rather than updating when only the email changed', async () => {
      const response = await service.update(USER_ID, EMAIL, {
        email: 'novi@email.com',
      });

      // An empty UPDATE would bump the profile's updated_at for a change that
      // happened in another database entirely.
      expect(update).not.toHaveBeenCalled();
      expect(select).toHaveBeenCalledTimes(1);
      expect(response).toEqual({
        fullName: 'Marko Kovac',
        email: 'novi@email.com',
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
      });
    });

    it('answers the merged profile in major units', async () => {
      update.mockReturnValue(queryChain([{ ...row, fullName: 'Ana' }]));
      configured.mockResolvedValue({ monthStartDay: 1, budgetCents: 150000 });

      await expect(
        service.update(USER_ID, EMAIL, { fullName: 'Ana' }),
      ).resolves.toEqual({
        fullName: 'Ana',
        email: EMAIL,
        currency: 'EUR',
        // Resolved through the period service, so an updated row still reports
        // the budget in force rather than one read off the row it just wrote.
        monthlyBudget: 1500,
        monthStartDay: 1,
      });
    });

    it('rejects a missing row without touching the email', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, EMAIL, {
          fullName: 'Ana',
          email: 'novi@email.com',
        }),
      ).rejects.toThrow(/Profile row missing/);
      // The whole reason central is written last: a failed profile write must
      // not leave the account answering to an address its data never saw.
      expect(updateEmail).not.toHaveBeenCalled();
    });
  });

  describe('changeSchedule', () => {
    const scheduleChange = {
      monthlyBudget: 2500,
      monthStartDay: 14,
      firstPaycheckDate: '2026-01-14',
    };

    it('400s an anchor that is not its own pay day, before any write', async () => {
      await expect(
        service.changeSchedule(USER_ID, EMAIL, {
          ...scheduleChange,
          firstPaycheckDate: '2026-01-05',
        }),
      ).rejects.toThrow(BadRequestException);

      // A period starts on every paycheck, so an anchor off its own pay day would
      // describe a first period beginning on a day no later period begins on.
      expect(insert).not.toHaveBeenCalled();
    });

    it('writes the rule then the budget, both anchored at T', async () => {
      await service.changeSchedule(USER_ID, EMAIL, scheduleChange);

      expect(insert).toHaveBeenCalledTimes(2);
      expect(insertedAt(0)).toMatchObject({
        effectiveFrom: '2026-01-14',
        monthStartDay: 14,
      });
      expect(insertedAt(1)).toMatchObject({
        effectiveFrom: '2026-01-14',
        budgetCents: 250000,
      });
    });

    it('stores the transition boundary rather than leaving it to be re-derived', async () => {
      await service.changeSchedule(USER_ID, EMAIL, scheduleChange);

      // Arrears removes the 1 January boundary, so December stretches to the
      // 14th. Stored on the rule, because deciding it is a write-time question.
      expect(insertedAt(0)).toMatchObject({ transitionStart: '2025-12-01' });
    });

    it('converts the budget to cents rather than passing majors through', async () => {
      await service.changeSchedule(USER_ID, EMAIL, {
        ...scheduleChange,
        monthlyBudget: 4.02,
      });

      // 4.02 * 100 is 401.99999999999994 in binary floating point.
      expect(insertedAt(1)).toMatchObject({ budgetCents: 402 });
    });

    it('writes no rule when only the budget changed', async () => {
      // The pay day already in force at the anchor. Writing a rule here would
      // still remove a boundary - arrears applies to every rule insert - so a
      // user who only raised their budget would silently lose a period.
      await service.changeSchedule(USER_ID, EMAIL, {
        monthlyBudget: 2500,
        monthStartDay: 1,
        firstPaycheckDate: '2026-08-01',
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insertedAt(0)).toMatchObject({ budgetCents: 250000 });
      expect(insertedAt(0)).not.toHaveProperty('monthStartDay');
    });

    it('anchors a budget-only change at the containing period’s start', async () => {
      await service.changeSchedule(USER_ID, EMAIL, {
        monthlyBudget: 2500,
        monthStartDay: 1,
        firstPaycheckDate: '2026-07-01',
      });

      expect(insertedAt(0)).toMatchObject({ effectiveFrom: '2026-07-01' });
    });

    it('clamps the transition at the active rule’s own anchor', async () => {
      // Two changes inside two periods: the boundary a month before the removed
      // one predates this rule entirely, and reaching past its anchor would
      // delete the previous change's own T.
      rules.mockResolvedValue([
        {
          effectiveFrom: '2026-01-01',
          monthStartDay: 1,
          transitionStart: null,
        },
      ]);

      await service.changeSchedule(USER_ID, EMAIL, scheduleChange);

      expect(insertedAt(0)).toMatchObject({ transitionStart: '2026-01-01' });
    });

    it('400s an anchor earlier than the account’s first rule, writing nothing', async () => {
      await expect(
        service.changeSchedule(USER_ID, EMAIL, {
          monthlyBudget: 2500,
          monthStartDay: 1,
          firstPaycheckDate: '2024-06-01',
        }),
      ).rejects.toThrow(/first pay schedule/);

      expect(insert).not.toHaveBeenCalled();
    });

    it('400s a pay-day change anchored behind a later pay-day change', async () => {
      // Inserting a rule *between* two existing ones would leave the later
      // rule's stored transitionStart computed against a predecessor that no
      // longer governs the span - periods ending on a day nobody was paid.
      rules.mockResolvedValue([
        {
          effectiveFrom: '2025-01-01',
          monthStartDay: 1,
          transitionStart: null,
        },
        {
          effectiveFrom: '2026-03-14',
          monthStartDay: 14,
          transitionStart: '2026-02-01',
        },
      ]);

      await expect(
        service.changeSchedule(USER_ID, EMAIL, {
          monthlyBudget: 2500,
          monthStartDay: 20,
          firstPaycheckDate: '2026-01-20',
        }),
      ).rejects.toThrow(
        /anchored behind a later one|pay-schedule change already anchored/,
      );

      expect(insert).not.toHaveBeenCalled();
    });

    it('reads a re-assertion of the newest schedule as a budget-only change', async () => {
      // The Settings form always sends the *configured* day - the newest
      // rule's - so a budget edit backdated across a recent pay-day change
      // arrives carrying a day that differs from the rule in force at the
      // anchor. That must not be read as a schedule change: nothing here asked
      // for a boundary move, and writing one would corrupt the later rule's
      // stored bridge.
      rules.mockResolvedValue([
        {
          effectiveFrom: '2025-01-01',
          monthStartDay: 1,
          transitionStart: null,
        },
        {
          effectiveFrom: '2026-03-14',
          monthStartDay: 14,
          transitionStart: '2026-02-01',
        },
      ]);

      await service.changeSchedule(USER_ID, EMAIL, {
        monthlyBudget: 2500,
        monthStartDay: 14,
        firstPaycheckDate: '2026-01-14',
      });

      // One insert: the budget row, dated at the start of the period the anchor
      // falls in under the rules that really governed it - January under the
      // old day-1 schedule.
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insertedAt(0)).toMatchObject({
        effectiveFrom: '2026-01-01',
        budgetCents: 250000,
      });
      expect(insertedAt(0)).not.toHaveProperty('monthStartDay');
    });

    it('answers the whole profile', async () => {
      await expect(
        service.changeSchedule(USER_ID, EMAIL, scheduleChange),
      ).resolves.toEqual({
        fullName: 'Marko Kovac',
        email: EMAIL,
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
      });
    });
  });
});
