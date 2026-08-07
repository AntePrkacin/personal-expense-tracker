import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { argsOf, queryChain, type QueryChain } from '../../test/query-chain';
import type { OnboardingPayload } from '../database/central/schema';
import type { UserDatabaseService } from '../database/user-database.service';
import { categories, profile } from '../database/user/schema';
import type {
  ResolvedCategoryTemplate,
  TemplatesService,
} from '../templates/templates.service';
import type { UsersService } from '../users/users.service';
import type { LoginTokenService } from './login-token.service';
import type { SessionService } from './session.service';
import { VerificationService } from './verification.service';

// Template ids since PET-64. The payload no longer carries names, which is why
// the seed reads them back out of central here.
const GROCERIES_ID = '0198f2b0-0000-7000-8000-000000000001';
const TRANSPORT_ID = '0198f2b0-0000-7000-8000-000000000002';

const GROCERIES: ResolvedCategoryTemplate = {
  id: GROCERIES_ID,
  name: 'Groceries',
  color: 'success',
  icon: 'shopping-basket',
  description: 'Food, beverages, and household essentials.',
};

const TRANSPORT: ResolvedCategoryTemplate = {
  id: TRANSPORT_ID,
  name: 'Transportation',
  color: 'info',
  icon: 'car',
  description: 'Gas, public transit, rideshares, parking.',
};

const payload: OnboardingPayload = {
  firstName: 'Marko',
  lastName: 'Kovac',
  currency: 'EUR',
  monthlyBudget: 2000.5,
  monthStartDay: 15,
  categories: [GROCERIES_ID, TRANSPORT_ID],
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
  let resolveTemplates: jest.Mock;
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
    // In sort_order, which is what `resolve()` promises and what the seed
    // relies on for the canonical order.
    resolveTemplates = jest.fn().mockResolvedValue([GROCERIES, TRANSPORT]);

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
      { resolve: resolveTemplates } as unknown as TemplatesService,
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

    it('seeds the fallback first, then exactly the picked categories in canonical order', async () => {
      await service.verify('raw-token');

      const rows = argsOf(inserted.get(categories)!, 'values')[0] as {
        name: string;
        isFallback?: boolean;
      }[];
      expect(rows.map((row) => row.name)).toEqual([
        'Uncategorized',
        'Groceries',
        'Transportation',
      ]);
      // Exactly one fallback, and it is not one of the picked chips.
      expect(rows.filter((row) => row.isFallback === true)).toHaveLength(1);
      expect(rows[0].isFallback).toBe(true);
    });

    it('copies the template’s colour, icon and description into each row', async () => {
      // The description becoming the user's own `note` is what keeps this whole
      // change free of a user-scope migration: no new column, and the copy is
      // theirs from the moment it is written.
      await service.verify('raw-token');

      const rows = argsOf(inserted.get(categories)!, 'values')[0] as {
        name: string;
        color: string;
        icon: string | null;
        note: string | null;
      }[];

      expect(rows).toContainEqual(
        expect.objectContaining({
          name: 'Groceries',
          color: 'success',
          icon: 'shopping-basket',
          note: GROCERIES.description,
        }),
      );
    });

    it('gives the fallback a real theme token and its own note', async () => {
      // Its colour used to be `#98A0AE`, the retired token layer's
      // --color-text-tertiary. There is no off-palette neutral to reach for now.
      await service.verify('raw-token');

      const [fallback] = argsOf(inserted.get(categories)!, 'values')[0] as {
        color: string;
        icon: string | null;
        note: string | null;
      }[];

      expect(fallback.color).toBe('warning-content');
      expect(fallback.icon).toBe('circle-question-mark');
      expect(fallback.note).not.toBeNull();
    });

    it('seeds the fallback even when no categories were picked', async () => {
      findById.mockResolvedValue({
        id: 'user-id',
        email: 'marko@email.com',
        dbUrl: null,
        onboardingPayload: { ...payload, categories: [] },
      });
      resolveTemplates.mockResolvedValue([]);

      await service.verify('raw-token');

      const rows = argsOf(inserted.get(categories)!, 'values')[0] as {
        name: string;
        isFallback?: boolean;
      }[];
      // A4 allows picking nothing. It used to leave the table empty; it cannot
      // now, because deleting a category needs somewhere to reassign to.
      expect(rows.map((row) => row.name)).toEqual(['Uncategorized']);
      expect(rows[0].isFallback).toBe(true);
    });

    it('still finishes when a picked template was deleted after registration', async () => {
      // Registration already rejected unknown ids, so the only way here is a
      // template tombstoned between the form and the click. Refusing to verify
      // a live login link over that would strand the account.
      resolveTemplates.mockResolvedValue([GROCERIES]);

      await expect(service.verify('raw-token')).resolves.toEqual(session);

      const rows = argsOf(inserted.get(categories)!, 'values')[0] as {
        name: string;
      }[];
      expect(rows.map((row) => row.name)).toEqual([
        'Uncategorized',
        'Groceries',
      ]);
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
