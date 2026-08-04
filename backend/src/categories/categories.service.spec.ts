import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { queryChain } from '../../test/query-chain';
import { UserDatabaseService } from '../database/user-database.service';
import { categories, transactions } from '../database/user/schema';
import { CategoriesService } from './categories.service';

/**
 * Unit cover for the paths `test/categories.e2e-spec.ts` cannot reach.
 *
 * The e2e suite is the real proof of this service: it runs the grouped join,
 * the partial unique index and the reassign-then-tombstone delete against a
 * migrated database, which mocks cannot. What is left for here is the handful of
 * branches that need a database in a state the API refuses to produce - the two
 * broken invariants - plus the guards that fire before any database is opened.
 */
describe('CategoriesService', () => {
  let service: CategoriesService;
  let getUserDb: jest.Mock;
  let db: { select: jest.Mock; update: jest.Mock; insert: jest.Mock };

  const build = async () => {
    getUserDb = jest.fn().mockResolvedValue(db);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: UserDatabaseService, useValue: { getUserDb } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('Europe/Zagreb') },
        },
      ],
    }).compile();

    service = moduleRef.get(CategoriesService);
  };

  beforeEach(async () => {
    db = { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
    await build();
  });

  describe('update', () => {
    it('rejects an empty body without opening a database at all', async () => {
      // The guard runs before getUserDb: a bare UPDATE would still bump
      // updated_at through $onUpdateFn and record an edit that changed nothing.
      await expect(service.update('user-id', 'cat-id', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(getUserDb).not.toHaveBeenCalled();
    });

    it('treats a body of only undefined fields as empty', async () => {
      await expect(
        service.update('user-id', 'cat-id', {
          name: undefined,
          color: undefined,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(getUserDb).not.toHaveBeenCalled();
    });

    it('does not treat a null cap as an empty body', async () => {
      // null is a real change - it clears the cap - so this must get past the
      // guard and reach the database.
      db.select.mockReturnValue(
        queryChain([{ id: 'cat-id', isFallback: false }]),
      );
      db.update.mockReturnValue(queryChain([{ id: 'cat-id' }]));

      await service
        .update('user-id', 'cat-id', { monthlyCap: null })
        .catch(() => undefined);

      expect(getUserDb).toHaveBeenCalled();
    });

    it('refuses to rename the fallback', async () => {
      db.select.mockReturnValue(
        queryChain([{ id: 'cat-id', isFallback: true }]),
      );

      await expect(
        service.update('user-id', 'cat-id', { name: 'Misc' }),
      ).rejects.toThrow(ConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('allows a non-name change to the fallback', async () => {
      db.select.mockReturnValue(
        queryChain([{ id: 'cat-id', isFallback: true }]),
      );
      db.update.mockReturnValue(queryChain([{ id: 'cat-id' }]));

      await service
        .update('user-id', 'cat-id', { color: '#8A79F1' })
        .catch(() => undefined);

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('broken invariants', () => {
    it('throws a plain Error when the profile row is missing', async () => {
      // A verified session implies a profile row, so this is not a 404 a client
      // could act on - it is the same call ProfileService makes.
      db.select.mockReturnValue(queryChain([]));

      await expect(service.list('user-id')).rejects.toThrow(
        /Profile row missing for user user-id/,
      );
    });

    it('throws a plain Error when a database has no fallback category', async () => {
      // Only reachable on a database provisioned before PET-35, which is why
      // the checklist re-provisions the test accounts by hand rather than
      // repairing them in code.
      db.select
        // liveCategory: an ordinary, deletable category.
        .mockReturnValueOnce(queryChain([{ id: 'cat-id', isFallback: false }]))
        // fallbackId: nothing.
        .mockReturnValueOnce(queryChain([]));

      await expect(service.remove('user-id', 'cat-id')).rejects.toThrow(
        /No fallback category for user user-id/,
      );
    });

    it('does not reassign anything when the fallback is missing', async () => {
      db.select
        .mockReturnValueOnce(queryChain([{ id: 'cat-id', isFallback: false }]))
        .mockReturnValueOnce(queryChain([]));

      await service.remove('user-id', 'cat-id').catch(() => undefined);

      // Reassign-first is only safe if it never runs without a target.
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('reassigns before it tombstones', async () => {
      // The order is the whole atomicity story: a failure in between leaves
      // transactions on the fallback and the category live but empty, which is
      // recoverable. The reverse strands rows pointing at a tombstone.
      const order: unknown[] = [];
      db.select
        .mockReturnValueOnce(queryChain([{ id: 'cat-id', isFallback: false }]))
        .mockReturnValueOnce(queryChain([{ id: 'fallback-id' }]));
      db.update.mockImplementation((table: unknown) => {
        order.push(table);
        return queryChain([]);
      });

      await service.remove('user-id', 'cat-id');

      expect(order).toEqual([transactions, categories]);
    });
  });
});
