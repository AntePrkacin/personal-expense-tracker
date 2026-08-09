import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
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

  /**
   * `setCaps` is the file's one conditional single statement, so what is worth
   * asserting here is the statement itself - the shape of the SET and the WHERE,
   * read back through the dialect rather than trusted. The e2e suite proves the
   * behaviour those clauses buy; only it can show a rollback.
   *
   * Note `db` still has no `transaction` key, and that absence is the regression
   * test for the no-transaction rule: reaching for `db.transaction()` here fails
   * with "not a function" rather than passing quietly.
   */
  describe('setCaps', () => {
    // v7, like every id this app mints.
    const A = '018f0000-0000-7000-8000-000000000001';
    const B = '018f0000-0000-7000-8000-000000000002';

    /** The update chain, so its recorded arguments can be read back. */
    const written = () =>
      db.update.mock.results[0].value as ReturnType<typeof queryChain>;

    const setExpression = () =>
      (argsOf(written(), 'set')[0] as { monthlyCapCents: unknown })
        .monthlyCapCents;

    /**
     * Runs a save whose guard passes, letting the `list()` re-read fail. The
     * statement is what these cases are about, and stubbing three more selects
     * to reach a response nothing asserts on would only obscure it.
     */
    const save = async (dto: Parameters<typeof service.setCaps>[1]) => {
      // Every id comes back, so the count guard passes and the statement is the
      // only thing under test. The `list()` re-read then fails on the profile.
      db.update.mockReturnValue(
        queryChain(dto.categories.map((item) => ({ id: item.id }))),
      );
      db.select.mockReturnValue(queryChain([]));
      await service.setCaps('user-id', dto).catch(() => undefined);
    };

    it('writes every entry in a single statement', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 250.5 },
          { id: B, monthlyCap: 420 },
        ],
      });

      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('renders one CASE arm per entry, binding caps in cents', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 250.5 },
          { id: B, monthlyCap: 420 },
        ],
      });

      const sqlText = toSql(setExpression());
      expect(sqlText).toMatch(/^case /);
      expect(sqlText.match(/when /g)).toHaveLength(2);
      // Cents, not major units. This is the only cheap place the toCents
      // boundary for this route is pinned.
      expect(paramsOf(setExpression())).toEqual([A, 25050, B, 42000]);
    });

    it('binds a cleared cap as SQL NULL rather than zero', async () => {
      await save({ categories: [{ id: A, monthlyCap: null }] });

      // 0 would be a cap of zero, which the DTO rejects and which means
      // something else entirely - "spend nothing here".
      expect(paramsOf(setExpression())).toEqual([A, null]);
    });

    it('never sets updatedAt by hand', async () => {
      await save({ categories: [{ id: A, monthlyCap: 100 }] });

      // drizzle v1's buildUpdateSet applies $onUpdateFn columns itself, and does
      // so even when the set carries a raw sql expression.
      expect(Object.keys(argsOf(written(), 'set')[0] as object)).toEqual([
        'monthlyCapCents',
      ]);
    });

    it('guards the statement on the live count, so it is all or nothing', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 100 },
          { id: B, monthlyCap: 200 },
        ],
      });

      const where = argsOf(written(), 'where')[0];
      const sqlText = toSql(where);

      expect(sqlText).toContain('"deleted_at" is null');
      expect(sqlText).toContain('select count(*)');
      // The ids appear twice - once for the UPDATE's own filter, once inside the
      // guard subquery - and the count compared against is the payload's length.
      expect(paramsOf(where)).toEqual([A, B, A, B, 2]);
    });

    it('covers the same ids in the CASE arms and the id filter', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 100 },
          { id: B, monthlyCap: null },
        ],
      });

      // Derived from the rendered parameters, not from the input, so this fails
      // if the two halves are ever built from separate sources. That matters
      // more than it looks: a row matched by the WHERE with no arm of its own
      // falls off the end of the CASE and has its cap set to NULL, so the two
      // drifting apart would wipe caps the caller never mentioned - and answer
      // 200 while doing it.
      const armed = paramsOf(setExpression()).filter(
        (param) => typeof param === 'string',
      );
      const filtered = paramsOf(argsOf(written(), 'where')[0]).filter(
        (param) => typeof param === 'string',
      );

      expect(new Set(armed)).toEqual(new Set([A, B]));
      expect(new Set(filtered)).toEqual(new Set(armed));
    });

    it('answers 404 without re-reading the screen when the guard refuses', async () => {
      // The guard matched nothing, so nothing was written.
      db.update.mockReturnValue(queryChain([]));
      db.select.mockReturnValue(queryChain([{ id: A }]));

      await expect(
        service.setCaps('user-id', {
          categories: [
            { id: A, monthlyCap: 100 },
            { id: B, monthlyCap: 200 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);

      // One select: the diagnostic read. `list()` is never reached, so a caller
      // that got a 404 knows the screen it is holding was not changed.
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('names only the ids that are not live', async () => {
      db.update.mockReturnValue(queryChain([]));
      db.select.mockReturnValue(queryChain([{ id: A }]));

      await expect(
        service.setCaps('user-id', {
          categories: [
            { id: A, monthlyCap: 100 },
            { id: B, monthlyCap: 200 },
          ],
        }),
      ).rejects.toThrow(new RegExp(`${B}[^]*No cap was changed`));
    });

    it('throws a plain Error when the guard and the diagnostic read disagree', async () => {
      // Unreachable as far as anything can arrange: a tombstone is never lifted
      // and `create` mints a fresh id. It is a broken invariant if it happens,
      // so it is a 500 rather than a 404 naming nothing.
      db.update.mockReturnValue(queryChain([]));
      db.select.mockReturnValue(queryChain([{ id: A }, { id: B }]));

      await expect(
        service.setCaps('user-id', {
          categories: [
            { id: A, monthlyCap: 100 },
            { id: B, monthlyCap: 200 },
          ],
        }),
      ).rejects.toThrow(/matched no rows, yet every id reads back live/);
    });

    it('has no guard of its own against an empty payload, by design', async () => {
      // The mirror of `update`'s first case, and the opposite answer.
      // `update({})` is rejected here in code because no decorator can say "at
      // least one of these five fields"; an empty array is exactly the shape
      // `@ArrayNotEmpty` expresses, so the DTO owns it and this method opens a
      // database instead of guarding. Asserted so nobody adds a redundant guard
      // on top - and note what it would be guarding: with no entries the count
      // check reads `0 = 0` and passes, so this is the one payload the statement
      // would happily accept.
      db.update.mockReturnValue(queryChain([]));
      db.select.mockReturnValue(queryChain([]));

      await service
        .setCaps('user-id', { categories: [] })
        .catch(() => undefined);

      expect(getUserDb).toHaveBeenCalled();
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

  /**
   * The three methods PET-28's transaction reads and PET-20's dashboard compose.
   *
   * They exist so no other service resolves a window or sums a category's spend
   * for itself, which is why the assertions here are about the arithmetic rather
   * than about the SQL: the SQL is `list`'s, already covered by the e2e suite.
   *
   * The clock is faked because `period` reads it. `monthWindow` itself takes
   * `today` as a parameter precisely to avoid this, but these three go through
   * `todayIn`, so pinning the system time is the only way to assert a boundary.
   */
  describe('the composition surface', () => {
    const CATEGORY_ID = 'cat-id';

    /** Mid-January, so `previousWindow` has to roll back across the year. */
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2027-01-20T12:00:00Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /** A profile whose period starts on the 15th. */
    const profileRow = (monthStartDay = 15) =>
      queryChain([{ monthStartDay, monthlyBudgetCents: 200000 }]);

    const categoryRow = (monthlyCapCents: number | null) => ({
      id: CATEGORY_ID,
      name: 'Groceries',
      color: '#57B368',
      icon: null,
      note: null,
      isFallback: false,
      monthlyCapCents,
    });

    describe('currentWindow', () => {
      it('returns the period containing today, half-open', async () => {
        db.select.mockReturnValue(profileRow());

        await expect(service.currentWindow('user-id')).resolves.toEqual({
          start: '2027-01-15',
          end: '2027-02-15',
        });
      });

      it('returns the window the day before the start day, not the next one', async () => {
        jest.setSystemTime(new Date('2027-01-14T12:00:00Z'));
        db.select.mockReturnValue(profileRow());

        // Before the start day, the current period began in December.
        await expect(service.currentWindow('user-id')).resolves.toEqual({
          start: '2026-12-15',
          end: '2027-01-15',
        });
      });

      it('throws the broken-invariant Error when there is no profile row', async () => {
        db.select.mockReturnValue(queryChain([]));

        await expect(service.currentWindow('user-id')).rejects.toThrow(
          /Profile row missing for user user-id/,
        );
      });
    });

    describe('previousWindow', () => {
      it('steps back one month and rolls across the year boundary', async () => {
        db.select.mockReturnValue(profileRow());

        // One month, never thirty days: a fixed day count drifts and would
        // eventually skip or repeat a period.
        await expect(service.previousWindow('user-id')).resolves.toEqual({
          start: '2026-12-15',
          end: '2027-01-15',
        });
      });

      it('ends exactly where the current window starts, leaving no gap', async () => {
        db.select.mockReturnValue(profileRow());
        const previous = await service.previousWindow('user-id');

        db.select.mockReturnValue(profileRow());
        const current = await service.currentWindow('user-id');

        expect(previous.end).toBe(current.start);
      });

      it('keeps the start day on a 28th boundary without losing days', async () => {
        jest.setSystemTime(new Date('2027-03-01T12:00:00Z'));
        db.select.mockReturnValue(profileRow(28));

        await expect(service.previousWindow('user-id')).resolves.toEqual({
          start: '2027-01-28',
          end: '2027-02-28',
        });
      });
    });

    describe('monthStatsFor', () => {
      it('returns one category with its stats for the current period', async () => {
        db.select.mockReturnValueOnce(profileRow()).mockReturnValueOnce(
          queryChain([
            {
              row: categoryRow(50000),
              spentCents: 39700,
              transactionCount: 4,
            },
          ]),
        );

        await expect(
          service.monthStatsFor('user-id', CATEGORY_ID),
        ).resolves.toEqual(
          expect.objectContaining({
            id: CATEGORY_ID,
            monthlyCap: 500,
            spent: 397,
            transactionCount: 4,
            percentUsed: 79.4,
            remaining: 103,
            over: null,
            status: 'near',
          }),
        );
      });

      it('returns the uncapped shape, which is the common case', async () => {
        db.select
          .mockReturnValueOnce(profileRow())
          .mockReturnValueOnce(
            queryChain([
              { row: categoryRow(null), spentCents: 402, transactionCount: 1 },
            ]),
          );

        // Caps are optional everywhere and the preselected fallback has none, so
        // this is what the transaction detail returns most of the time.
        await expect(
          service.monthStatsFor('user-id', CATEGORY_ID),
        ).resolves.toEqual(
          expect.objectContaining({
            monthlyCap: null,
            spent: 4.02,
            percentUsed: null,
            remaining: null,
            over: null,
            status: 'uncapped',
          }),
        );
      });

      it('404s an unknown or tombstoned category rather than inventing zeros', async () => {
        db.select
          .mockReturnValueOnce(profileRow())
          .mockReturnValueOnce(queryChain([]));

        // `withSpend` filters on `deleted_at IS NULL`, so this one rejection
        // covers an unknown id, a tombstoned one, and a dangling `category_id`.
        await expect(
          service.monthStatsFor('user-id', CATEGORY_ID),
        ).rejects.toThrow(NotFoundException);
      });
    });

    it('is what update() returns, rather than a second copy of the same math', async () => {
      db.select
        // liveCategory
        .mockReturnValueOnce(
          queryChain([{ id: CATEGORY_ID, isFallback: false }]),
        )
        // monthStatsFor: profile, then the grouped join
        .mockReturnValueOnce(profileRow())
        .mockReturnValueOnce(
          queryChain([
            { row: categoryRow(50000), spentCents: 39700, transactionCount: 4 },
          ]),
        );
      db.update.mockReturnValue(queryChain([]));

      const updated = await service.update('user-id', CATEGORY_ID, {
        color: '#8A79F1',
      });

      // No `.returning()` on the UPDATE: the row comes back out of the stats
      // read, so there is one path from a category id to its response shape.
      expect(updated.status).toBe('near');
      expect(updated.percentUsed).toBe(79.4);
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
