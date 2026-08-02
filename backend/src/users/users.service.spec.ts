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

  describe('createPending', () => {
    it('writes the derived db_name but provisions nothing', async () => {
      const chain = queryChain([]);
      insert.mockReturnValue(chain);

      const id = await service.createPending('marko@email.com', payload);

      const values = argsOf(chain, 'values')[0] as Record<string, unknown>;
      expect(values).toEqual({
        id,
        email: 'marko@email.com',
        dbName: `expensa-user-${id}`,
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
});
