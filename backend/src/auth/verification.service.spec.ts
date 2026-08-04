import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { argsOf, queryChain, type QueryChain } from '../../test/query-chain';
import type { OnboardingPayload } from '../database/central/schema';
import type { UserDatabaseService } from '../database/user-database.service';
import { categories, profile } from '../database/user/schema';
import type { UsersService } from '../users/users.service';
import type { LoginTokenService } from './login-token.service';
import type { SessionService } from './session.service';
import { VerificationService } from './verification.service';

const payload: OnboardingPayload = {
  firstName: 'Marko',
  lastName: 'Kovac',
  currency: 'EUR',
  monthlyBudget: 2000.5,
  monthStartDay: 15,
  categories: ['Groceries', 'Transport'],
};

describe('VerificationService', () => {
  let service: VerificationService;
  let consume: jest.Mock;
  let findById: jest.Mock;
  let persistProvisionedDb: jest.Mock;
  let clearOnboardingPayload: jest.Mock;
  let provisionUserDb: jest.Mock;
  let getUserDb: jest.Mock;
  let deleteUserDb: jest.Mock;
  let issue: jest.Mock;
  let logError: jest.SpyInstance;

  /** The per-user database, with the chains each table's insert produced. */
  let userInsert: jest.Mock;
  let userSelect: jest.Mock;
  let inserted: Map<unknown, QueryChain>;

  const session = { token: 'session-token', expiresAt: new Date() };

  beforeEach(() => {
    consume = jest.fn().mockResolvedValue({
      status: 'consumed',
      userId: 'user-id',
    });
    findById = jest.fn().mockResolvedValue({
      id: 'user-id',
      email: 'marko@email.com',
      dbUrl: null,
      onboardingPayload: payload,
    });
    persistProvisionedDb = jest.fn().mockResolvedValue(undefined);
    clearOnboardingPayload = jest.fn().mockResolvedValue(undefined);
    provisionUserDb = jest.fn().mockResolvedValue({
      dbName: 'spendifico-user-user-id',
      dbUrl: null,
      dbAuthToken: null,
    });
    deleteUserDb = jest.fn().mockResolvedValue(undefined);
    issue = jest.fn().mockResolvedValue(session);

    inserted = new Map();
    userInsert = jest.fn((table: unknown) => {
      const chain = queryChain([]);
      inserted.set(table, chain);
      return chain;
    });
    // No categories yet, i.e. a first verification.
    userSelect = jest.fn(() => queryChain([]));
    getUserDb = jest
      .fn()
      .mockResolvedValue({ insert: userInsert, select: userSelect });

    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service = new VerificationService(
      { consume } as unknown as LoginTokenService,
      {
        findById,
        persistProvisionedDb,
        clearOnboardingPayload,
      } as unknown as UsersService,
      {
        provisionUserDb,
        getUserDb,
        deleteUserDb,
      } as unknown as UserDatabaseService,
      { issue } as unknown as SessionService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  /** Everything a rejection must not have touched. */
  const expectNothingProvisioned = () => {
    expect(provisionUserDb).not.toHaveBeenCalled();
    expect(persistProvisionedDb).not.toHaveBeenCalled();
    expect(getUserDb).not.toHaveBeenCalled();
    expect(clearOnboardingPayload).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  };

  describe('rejections', () => {
    it('answers an invalid token with 401 and does nothing else', async () => {
      consume.mockResolvedValue({ status: 'invalid' });

      await expect(service.verify('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(findById).not.toHaveBeenCalled();
      expectNothingProvisioned();
    });

    it('answers a superseded link with 409, provisioning nothing', async () => {
      consume.mockResolvedValue({ status: 'superseded' });

      await expect(service.verify('raw-token')).rejects.toThrow(
        ConflictException,
      );
      // The 409 has to be distinguishable from the 401, because it is the one
      // rejection the user can act on ("open the most recent email").
      expectNothingProvisioned();
    });

    it('answers a consumed token whose account is gone with the same 401', async () => {
      findById.mockResolvedValue(null);

      await expect(service.verify('raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      // Soft-deleted accounts must not be distinguishable from bad tokens.
      expectNothingProvisioned();
    });
  });

  describe('first verification', () => {
    it('provisions, writes the profile, seeds and clears - in that order', async () => {
      await expect(service.verify('raw-token')).resolves.toEqual(session);

      const order = [
        provisionUserDb,
        persistProvisionedDb,
        getUserDb,
        userInsert,
        clearOnboardingPayload,
        issue,
      ].map((mock) => mock.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));

      expect(provisionUserDb).toHaveBeenCalledWith('user-id');
      expect(persistProvisionedDb).toHaveBeenCalledWith('user-id', {
        dbName: 'spendifico-user-user-id',
        dbUrl: null,
        dbAuthToken: null,
      });
      expect(issue).toHaveBeenCalledWith('user-id');
    });

    it('converts the budget to cents at the profile boundary', async () => {
      await service.verify('raw-token');

      expect(argsOf(inserted.get(profile)!, 'values')[0]).toEqual({
        id: 'user-id',
        firstName: 'Marko',
        lastName: 'Kovac',
        currency: 'EUR',
        // 2000.50 major units. Nothing upstream of here stores cents.
        monthlyBudgetCents: 200050,
        monthStartDay: 15,
      });
    });

    it('inserts the profile with onConflictDoNothing, so a retry no-ops', async () => {
      await service.verify('raw-token');

      expect(
        inserted.get(profile)!.__calls.map((call) => call.method),
      ).toContain('onConflictDoNothing');
    });

    it('seeds exactly the picked categories, in canonical order', async () => {
      await service.verify('raw-token');

      const rows = argsOf(inserted.get(categories)!, 'values')[0] as {
        name: string;
      }[];
      expect(rows.map((row) => row.name)).toEqual(['Groceries', 'Transport']);
    });

    it('clears the payload only after the seed', async () => {
      await service.verify('raw-token');

      // The payload is the profile's source data as well as the "may be
      // unfinished" marker, so it has to survive until everything it feeds is
      // written.
      expect(
        clearOnboardingPayload.mock.invocationCallOrder[0],
      ).toBeGreaterThan(userInsert.mock.invocationCallOrder.at(-1)!);
      expect(clearOnboardingPayload).toHaveBeenCalledWith('user-id');
    });
  });

  describe('a returning user', () => {
    beforeEach(() => {
      findById.mockResolvedValue({
        id: 'user-id',
        email: 'marko@email.com',
        dbUrl: 'spendifico-user-user-id-acme.turso.io',
        onboardingPayload: null,
      });
    });

    it('only issues a session', async () => {
      await expect(service.verify('raw-token')).resolves.toEqual(session);

      // A cleared payload means everything below has already happened once.
      expect(provisionUserDb).not.toHaveBeenCalled();
      expect(persistProvisionedDb).not.toHaveBeenCalled();
      expect(getUserDb).not.toHaveBeenCalled();
      expect(clearOnboardingPayload).not.toHaveBeenCalled();
      expect(issue).toHaveBeenCalledWith('user-id');
    });
  });

  describe('resuming a half-provisioned account', () => {
    beforeEach(() => {
      // Pointer written, payload never cleared: a previous attempt died
      // somewhere after persisting the pointer.
      findById.mockResolvedValue({
        id: 'user-id',
        email: 'marko@email.com',
        dbUrl: 'spendifico-user-user-id-acme.turso.io',
        onboardingPayload: payload,
      });
    });

    it('skips provisioning but still finishes the account', async () => {
      await expect(service.verify('raw-token')).resolves.toEqual(session);

      // Re-provisioning would collide on the remote name; the pointer being set
      // is exactly what says the database exists.
      expect(provisionUserDb).not.toHaveBeenCalled();
      expect(persistProvisionedDb).not.toHaveBeenCalled();
      expect(getUserDb).toHaveBeenCalledWith('user-id');
      expect(inserted.has(profile)).toBe(true);
      expect(clearOnboardingPayload).toHaveBeenCalledWith('user-id');
    });

    it('skips the seed when the database already has categories', async () => {
      userSelect.mockReturnValue(queryChain([{ id: 'category-id' }]));

      await service.verify('raw-token');

      // The seed is one multi-row INSERT, so any row means all of them landed.
      expect(inserted.has(categories)).toBe(false);
      expect(inserted.has(profile)).toBe(true);
      expect(clearOnboardingPayload).toHaveBeenCalled();
    });
  });

  describe('compensation', () => {
    const boom = new Error('turso said no');

    it('deletes the database when creating it half-succeeded', async () => {
      provisionUserDb.mockRejectedValue(boom);

      await expect(service.verify('raw-token')).rejects.toThrow(boom);

      // A created database whose token mint failed would otherwise be an orphan
      // nothing ever reclaims.
      expect(deleteUserDb).toHaveBeenCalledWith('user-id');
      expect(getUserDb).not.toHaveBeenCalled();
      expect(issue).not.toHaveBeenCalled();
    });

    it('deletes the database when the pointer write failed', async () => {
      persistProvisionedDb.mockRejectedValue(boom);

      await expect(service.verify('raw-token')).rejects.toThrow(boom);

      expect(deleteUserDb).toHaveBeenCalledWith('user-id');
      expect(issue).not.toHaveBeenCalled();
    });

    it('does NOT delete the database once the pointer is persisted', async () => {
      getUserDb.mockRejectedValue(boom);

      await expect(service.verify('raw-token')).rejects.toThrow(boom);

      // Deleting here would strand a row whose non-null dbUrl makes every retry
      // skip provisioning: recovery past this point is forward-only.
      expect(deleteUserDb).not.toHaveBeenCalled();
      expect(clearOnboardingPayload).not.toHaveBeenCalled();
    });

    it('logs loudly and still reports the original failure when cleanup fails', async () => {
      provisionUserDb.mockRejectedValue(boom);
      deleteUserDb.mockRejectedValue(new Error('delete failed too'));

      // The caller must see what actually went wrong, not the cleanup's error.
      await expect(service.verify('raw-token')).rejects.toThrow(boom);

      const [logged] = logError.mock.calls[0] as [string];
      // The actual database name, not the bare user id: this log exists for an
      // operator to find the orphan in `turso db list` and delete it by hand.
      expect(logged).toContain('spendifico-user-user-id');
      // Names the manual fix, because nothing automatic can reclaim the orphan.
      expect(logged).toMatch(/hand|manual/i);
    });
  });
});
