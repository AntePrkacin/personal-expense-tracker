import { argsOf, queryChain, toSql } from '../../test/query-chain';
import type { OnboardingPayload } from '../database/central/schema';
import { UsersService } from './users.service';

const payload: OnboardingPayload = {
  firstName: 'Marko',
  lastName: 'Kovac',
  currency: 'USD',
  monthlyBudget: 2000.5,
  monthStartDay: 1,
  categories: ['Groceries'],
};

describe('UsersService', () => {
  let service: UsersService;
  let select: jest.Mock;
  let insert: jest.Mock;
  let update: jest.Mock;

  beforeEach(() => {
    select = jest.fn();
    insert = jest.fn();
    update = jest.fn();
    service = new UsersService({ select, insert, update } as never);
  });

  describe('findByEmail', () => {
    it('returns the row and ignores soft-deleted ones', async () => {
      const chain = queryChain([{ id: 'user-id', onboardingPayload: payload }]);
      select.mockReturnValue(chain);

      await expect(service.findByEmail('marko@email.com')).resolves.toEqual({
        id: 'user-id',
        onboardingPayload: payload,
      });
      expect(toSql(argsOf(chain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });

    it('returns null when there is no row', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.findByEmail('nobody@email.com')).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('returns what verification needs, and never the db token', async () => {
      const chain = queryChain([
        {
          id: 'user-id',
          email: 'marko@email.com',
          dbUrl: null,
          onboardingPayload: payload,
        },
      ]);
      select.mockReturnValue(chain);

      await expect(service.findById('user-id')).resolves.toEqual({
        id: 'user-id',
        email: 'marko@email.com',
        dbUrl: null,
        onboardingPayload: payload,
      });

      // A secret that is never fetched cannot end up in a log line.
      const [projection] = select.mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(projection).sort()).toEqual([
        'dbUrl',
        'email',
        'id',
        'onboardingPayload',
      ]);
      expect(toSql(argsOf(chain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });

    it('returns null when there is no live row', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.findById('user-id')).resolves.toBeNull();
    });
  });

  describe('createPending', () => {
    it('writes the derived db_name but provisions nothing', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const id = await service.createPending('marko@email.com', payload);

      const values = argsOf(chain, 'values')[0] as Record<string, unknown>;
      expect(values).toEqual({
        id,
        email: 'marko@email.com',
        dbName: `spendifico-user-${id}`,
        onboardingPayload: payload,
      });
      // The cloud pointer columns stay NULL until verification provisions the
      // database; registration must not create one.
      expect(values).not.toHaveProperty('dbUrl');
      expect(values).not.toHaveProperty('dbAuthToken');
    });
  });

  describe('stashOnboardingPayload', () => {
    it('replaces only the payload, on a live row', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.stashOnboardingPayload('user-id', payload);

      expect(argsOf(chain, 'set')[0]).toEqual({ onboardingPayload: payload });
      expect(toSql(argsOf(chain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });
  });

  describe('persistProvisionedDb', () => {
    it('sets exactly the two pointer columns, on a live row', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.persistProvisionedDb('user-id', {
        dbUrl: 'spendifico-user-x-acme.aws-eu-west-1.turso.io',
        dbAuthToken: 'db-token',
      });

      // dbName is not among them: it was written at registration and derives
      // from the id, so there is nothing to update about it.
      expect(argsOf(chain, 'set')[0]).toEqual({
        dbUrl: 'spendifico-user-x-acme.aws-eu-west-1.turso.io',
        dbAuthToken: 'db-token',
      });
      expect(toSql(argsOf(chain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });

    it('writes the nulls local mode provisions', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.persistProvisionedDb('user-id', {
        dbUrl: null,
        dbAuthToken: null,
      });

      expect(argsOf(chain, 'set')[0]).toEqual({
        dbUrl: null,
        dbAuthToken: null,
      });
    });
  });

  describe('updateEmail', () => {
    it('sets exactly the address, on a live row', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.updateEmail('user-id', 'novi@email.com');

      // Only the one column: the profile fields live in the user's own
      // database and central has no business holding a second copy.
      expect(argsOf(chain, 'set')[0]).toEqual({ email: 'novi@email.com' });

      const where = toSql(argsOf(chain, 'where')[0]);
      expect(where).toContain('"id" = ?');
      // Without this a soft-deleted account could have its address changed, and
      // the partial unique index would then let a live row claim it anyway.
      expect(where).toContain('"deleted_at" is null');
    });
  });

  describe('clearOnboardingPayload', () => {
    it('nulls the payload, which is what marks the account verified', async () => {
      const chain = queryChain([]);
      update.mockReturnValue(chain);

      await service.clearOnboardingPayload('user-id');

      expect(argsOf(chain, 'set')[0]).toEqual({ onboardingPayload: null });
      expect(toSql(argsOf(chain, 'where')[0])).toContain(
        '"deleted_at" is null',
      );
    });
  });
});
