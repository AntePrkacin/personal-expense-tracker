import { BadRequestException, ConflictException } from '@nestjs/common';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import type { UserDatabaseService } from '../database/user-database.service';
import type { ProfileRow } from '../database/user/schema';
import type { UsersService } from '../users/users.service';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let getUserDb: jest.Mock;
  let select: jest.Mock;
  let update: jest.Mock;
  let findByEmail: jest.Mock;
  let updateEmail: jest.Mock;

  const USER_ID = '0190c3f0-0000-7000-8000-000000000001';
  const OTHER_ID = '0190c3f0-0000-7000-8000-000000000002';
  const EMAIL = 'marko@email.com';

  const row: ProfileRow = {
    id: USER_ID,
    firstName: 'Marko',
    lastName: 'Kovac',
    currency: 'EUR',
    monthlyBudgetCents: 200050,
    monthStartDay: 1,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    deletedAt: null,
  };

  /** The chain the last `update()` produced, for asserting set/where on it. */
  const lastUpdate = () => update.mock.results.at(-1)!.value as never;
  const lastSelect = () => select.mock.results.at(-1)!.value as never;

  beforeEach(() => {
    select = jest.fn().mockReturnValue(queryChain([row]));
    update = jest.fn().mockReturnValue(queryChain([row]));
    getUserDb = jest.fn().mockResolvedValue({ select, update });

    findByEmail = jest.fn().mockResolvedValue(null);
    updateEmail = jest.fn().mockResolvedValue(undefined);

    service = new ProfileService(
      { getUserDb } as unknown as UserDatabaseService,
      { findByEmail, updateEmail } as unknown as UsersService,
    );
  });

  describe('get', () => {
    it('answers the six fields, with the budget in major units', async () => {
      await expect(service.get(USER_ID, EMAIL)).resolves.toEqual({
        firstName: 'Marko',
        lastName: 'Kovac',
        email: EMAIL,
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
      });
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
      await service.update(USER_ID, EMAIL, { firstName: 'Ana' });

      expect(argsOf(lastUpdate(), 'set')[0]).toEqual({ firstName: 'Ana' });
    });

    it('never sets updatedAt by hand', async () => {
      await service.update(USER_ID, EMAIL, { firstName: 'Ana' });

      // drizzle's buildUpdateSet applies $onUpdateFn columns itself on every
      // UPDATE. Setting it here too would be a second source for one timestamp.
      expect(argsOf(lastUpdate(), 'set')[0]).not.toHaveProperty('updatedAt');
    });

    it('converts the budget to cents rather than passing majors through', async () => {
      await service.update(USER_ID, EMAIL, { monthlyBudget: 4.02 });

      // 4.02 * 100 is 401.99999999999994 in binary floating point.
      const set = argsOf(lastUpdate(), 'set')[0];
      expect(set).toEqual({ monthlyBudgetCents: 402 });
      expect(set).not.toHaveProperty('monthlyBudget');
    });

    it('excludes tombstoned rows from the WHERE', async () => {
      await service.update(USER_ID, EMAIL, { firstName: 'Ana' });

      const where = argsOf(lastUpdate(), 'where')[0];
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(USER_ID);
    });

    it('leaves the central directory alone when the email is unchanged', async () => {
      await service.update(USER_ID, EMAIL, {
        firstName: 'Ana',
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
          firstName: 'Ana',
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
        firstName: 'Ana',
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
        firstName: 'Marko',
        lastName: 'Kovac',
        email: 'novi@email.com',
        currency: 'EUR',
        monthlyBudget: 2000.5,
        monthStartDay: 1,
      });
    });

    it('answers the merged profile in major units', async () => {
      update.mockReturnValue(
        queryChain([{ ...row, firstName: 'Ana', monthlyBudgetCents: 150000 }]),
      );

      await expect(
        service.update(USER_ID, EMAIL, {
          firstName: 'Ana',
          monthlyBudget: 1500,
        }),
      ).resolves.toEqual({
        firstName: 'Ana',
        lastName: 'Kovac',
        email: EMAIL,
        currency: 'EUR',
        monthlyBudget: 1500,
        monthStartDay: 1,
      });
    });

    it('rejects a missing row without touching the email', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, EMAIL, {
          firstName: 'Ana',
          email: 'novi@email.com',
        }),
      ).rejects.toThrow(/Profile row missing/);
      // The whole reason central is written last: a failed profile write must
      // not leave the account answering to an address its data never saw.
      expect(updateEmail).not.toHaveBeenCalled();
    });
  });
});
