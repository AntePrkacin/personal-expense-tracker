import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import { UserDatabaseService } from '../database/user-database.service';
import { categories, transactions } from '../database/user/schema';
import { PeriodService } from '../periods/period.service';
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
  let currentPeriod: jest.Mock;
  let startingAt: jest.Mock;
  let budgetCentsFor: jest.Mock;

  /**
   * The period this service is handed rather than one it resolves.
   *
   * PET-72 took the window arithmetic out of this file entirely, so there is no
   * clock to fake here any more and no profile row to stub: the period arrives
   * from `PeriodService`, whose own walk is pinned by `period-rules.spec.ts`.
   */
  const PERIOD = {
    start: '2027-01-15',
    end: '2027-02-15',
    label: 'January / February 2027',
    today: '2027-01-20',
  };

  const build = async () => {
    getUserDb = jest.fn().mockResolvedValue(db);
    currentPeriod = jest.fn().mockResolvedValue(PERIOD);
    startingAt = jest.fn().mockResolvedValue(PERIOD);
    budgetCentsFor = jest.fn().mockResolvedValue(200000);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: UserDatabaseService, useValue: { getUserDb } },
        {
          provide: PeriodService,
          useValue: {
            current: currentPeriod,
            startingAt,
            budgetCentsFor,
          },
        },
        // A real emitter with nothing listening, rather than a mock:
        // `emitAsync` resolving is what every write here depends on since
        // PET-73 added `CATEGORY_CHANGED`, and a jest.fn() would pass whether
        // or not the call is awaited.
        { provide: EventEmitter2, useValue: new EventEmitter2() },
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
   * asserting here is the statement itself - the values it generates and the
   * guard in its WHERE, read back through the dialect rather than trusted. The
   * e2e suite proves the behaviour those clauses buy; only it can show that
   * nothing was written.
   *
   * **It became an INSERT at PET-72 and the guard survived unchanged**, which is
   * the point of having written it as a conditional statement in the first place.
   * Caps are append-only history now, so the old `UPDATE ... SET cap = CASE id`
   * is `INSERT ... SELECT ... FROM (VALUES ...) WHERE <guard>`. The `CASE`-arms
   * trap the old cases guarded against is gone with it: a row absent from the
   * VALUES list is simply not inserted, where a row absent from a `CASE` used to
   * have its cap silently set to NULL.
   *
   * Note `db` still has no `transaction` key, and that absence is the regression
   * test for the no-transaction rule: reaching for `db.transaction()` here fails
   * with "not a function" rather than passing quietly.
   */
  describe('setCaps', () => {
    // v7, like every id this app mints.
    const A = '018f0000-0000-7000-8000-000000000001';
    const B = '018f0000-0000-7000-8000-000000000002';

    /** The insert chain, so its recorded arguments can be read back. */
    const written = () =>
      db.insert.mock.results[0].value as ReturnType<typeof queryChain>;

    /** The inner select the insert draws its rows from. */
    const source = () =>
      argsOf(written(), 'select')[0] as ReturnType<typeof queryChain>;

    /**
     * Runs a save whose guard passes, letting the `list()` re-read fail. The
     * statement is what these cases are about, and stubbing the selects needed to
     * reach a response nothing asserts on would only obscure it.
     */
    const save = async (dto: Parameters<typeof service.setCaps>[1]) => {
      // Every id comes back, so the count guard passes and the statement is the
      // only thing under test.
      db.insert.mockReturnValue(
        queryChain(dto.categories.map((item) => ({ id: item.id }))),
      );
      db.select.mockImplementation(() => queryChain([]));
      await service.setCaps('user-id', dto).catch(() => undefined);
    };

    it('writes every entry in a single statement', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 250.5 },
          { id: B, monthlyCap: 420 },
        ],
      });

      expect(db.insert).toHaveBeenCalledTimes(1);
      // And never an UPDATE: overwriting a cap is exactly what this ticket
      // removed, so a regression to it would be a silent rewrite of history.
      expect(db.update).not.toHaveBeenCalled();
    });

    it('generates one VALUES row per entry, binding caps in cents', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 250.5 },
          { id: B, monthlyCap: 420 },
        ],
      });

      const from = argsOf(source(), 'from')[0];
      expect(toSql(from)).toMatch(/^\(values /);
      // Cents, not major units. This is the only cheap place the toCents
      // boundary for this route is pinned. Each row is (id, categoryId,
      // effectiveFrom, capCents, createdAt), and the ids are freshly minted so
      // only the bound values that come from the payload are asserted.
      const bound = paramsOf(from);
      expect(bound).toContain(A);
      expect(bound).toContain(B);
      expect(bound).toContain(25050);
      expect(bound).toContain(42000);
    });

    it('dates every row at the current period start, not at today', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 100 },
          { id: B, monthlyCap: 200 },
        ],
      });

      // The Allocate modal is allocating *this* period's budget. Dating the rows
      // anywhere else would either rewrite a closed period or leave this one
      // uncapped.
      const dates = paramsOf(argsOf(source(), 'from')[0]).filter(
        (param) => param === PERIOD.start,
      );
      expect(dates).toHaveLength(2);
    });

    it('binds a cleared cap as SQL NULL rather than zero', async () => {
      await save({ categories: [{ id: A, monthlyCap: null }] });

      // 0 would be a cap of zero, which the DTO rejects and which means
      // something else entirely - "spend nothing here".
      expect(paramsOf(argsOf(source(), 'from')[0])).toContain(null);
    });

    it('guards the statement on the live count, so it is all or nothing', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 100 },
          { id: B, monthlyCap: 200 },
        ],
      });

      const where = argsOf(source(), 'where')[0];
      const sqlText = toSql(where);

      expect(sqlText).toContain('"deleted_at" is null');
      expect(sqlText).toContain('select count(*)');
      // The guard names every id in the payload and compares the live count
      // against its length, so the statement refuses itself unless all of them
      // are live at the instant it runs.
      expect(paramsOf(where)).toEqual([A, B, 2]);
    });

    it('guards on the same ids it is inserting rows for', async () => {
      await save({
        categories: [
          { id: A, monthlyCap: 100 },
          { id: B, monthlyCap: null },
        ],
      });

      // Derived from the rendered parameters, not from the input, so this fails
      // if the two halves are ever built from separate sources. Weaker than it
      // had to be before PET-72 - a row missing from the VALUES list is simply
      // not written, where a row missing from the old CASE had its cap wiped -
      // but still worth pinning: a guard naming ids the insert does not cover
      // would refuse valid payloads.
      const inserted = paramsOf(argsOf(source(), 'from')[0]).filter(
        (param) => param === A || param === B,
      );
      const guarded = paramsOf(argsOf(source(), 'where')[0]).filter(
        (param) => typeof param === 'string',
      );

      expect(new Set(inserted)).toEqual(new Set([A, B]));
      expect(new Set(guarded)).toEqual(new Set(inserted));
    });

    it('answers 404 without re-reading the screen when the guard refuses', async () => {
      // The guard matched nothing, so nothing was written.
      db.insert.mockReturnValue(queryChain([]));
      db.select.mockReturnValue(queryChain([{ id: A }]));

      await expect(
        service.setCaps('user-id', {
          categories: [
            { id: A, monthlyCap: 100 },
            { id: B, monthlyCap: 200 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);

      // `list()` is never reached, so a caller that got a 404 knows the screen it
      // is holding was not changed. Asserted on the budget read rather than on a
      // select count: the statement itself now contains an inner `select` for its
      // VALUES projection, so counting selects would be counting the write.
      expect(budgetCentsFor).not.toHaveBeenCalled();
    });

    it('names only the ids that are not live', async () => {
      db.insert.mockReturnValue(queryChain([]));
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
      db.insert.mockReturnValue(queryChain([]));
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
      // least one of these fields"; an empty array is exactly the shape
      // `@ArrayNotEmpty` expresses, so the DTO owns it and this method opens a
      // database instead of guarding. Asserted so nobody adds a redundant guard
      // on top - and note what it would be guarding: with no entries the count
      // check reads `0 = 0` and passes, so this is the one payload the statement
      // would happily accept.
      db.insert.mockReturnValue(queryChain([]));
      db.select.mockImplementation(() => queryChain([]));

      await service
        .setCaps('user-id', { categories: [] })
        .catch(() => undefined);

      expect(getUserDb).toHaveBeenCalled();
    });
  });

  describe('broken invariants', () => {
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
   * What PET-28's transaction reads and PET-20's dashboard still compose.
   *
   * **`currentWindow` and `previousWindow` used to be tested here and are gone.**
   * They were public only so three other features could reach the private period
   * resolution behind them; `PeriodService` owns that now, its arithmetic is
   * pinned by `period-rules.spec.ts` with literals rather than a faked clock, and
   * the two window cases that used to need `jest.useFakeTimers` here need no clock
   * at all any more. What is left on this service's composition surface is
   * `monthStatsFor`, which really is this feature's business.
   */
  describe('the composition surface', () => {
    const CATEGORY_ID = 'cat-id';

    const categoryRow = () => ({
      id: CATEGORY_ID,
      name: 'Groceries',
      color: 'success',
      icon: 'shopping-basket',
      description: null,
      isFallback: false,
    });

    /**
     * A grouped-join row, with the cap alongside rather than on the category.
     *
     * The cap is resolved by a correlated subquery per period now, so it arrives
     * as its own selected column - which is exactly why `CategoryWithSpend` grew a
     * `capCents` field instead of reading one off the row.
     */
    const withSpend = (
      capCents: number | null,
      spentCents: number,
      transactionCount: number,
    ) =>
      queryChain([
        { row: categoryRow(), capCents, spentCents, transactionCount },
      ]);

    describe('monthStatsFor', () => {
      it('returns one category with its stats for the current period', async () => {
        db.select.mockReturnValueOnce(withSpend(50000, 39700, 4));

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
        db.select.mockReturnValueOnce(withSpend(null, 402, 1));

        // Caps are optional everywhere and the preselected fallback has none, so
        // this is what the transaction detail returns most of the time. A null cap
        // here means either "no history row for this period" or "a row that says
        // uncapped", which are deliberately indistinguishable.
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

      it('reads the cap for the period it was given, not for today', async () => {
        db.select.mockReturnValueOnce(withSpend(50000, 0, 0));

        await service.monthStatsFor('user-id', CATEGORY_ID);

        // The subquery resolves the greatest `effective_from <= period.start`, so
        // the period's start has to reach the statement or every screen would
        // report today's cap against a closed period's spend.
        const [[projection]] = db.select.mock.calls as [
          [{ capCents: unknown }],
        ];
        expect(paramsOf(projection.capCents)).toContain(PERIOD.start);
      });

      it('404s an unknown or tombstoned category rather than inventing zeros', async () => {
        db.select.mockReturnValueOnce(queryChain([]));

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
        // monthStatsFor's grouped join
        .mockReturnValueOnce(withSpend(50000, 39700, 4));
      db.update.mockReturnValue(queryChain([]));

      const updated = await service.update('user-id', CATEGORY_ID, {
        color: 'primary',
      });

      // No `.returning()` on the UPDATE: the row comes back out of the stats
      // read, so there is one path from a category id to its response shape.
      expect(updated.status).toBe('near');
      expect(updated.percentUsed).toBe(79.4);
    });

    it('appends a cap row rather than setting a column', async () => {
      db.select
        .mockReturnValueOnce(
          queryChain([{ id: CATEGORY_ID, isFallback: false }]),
        )
        .mockReturnValueOnce(withSpend(50000, 0, 0));
      db.insert.mockReturnValue(queryChain([]));

      await service.update('user-id', CATEGORY_ID, { monthlyCap: 500 });

      // And no UPDATE at all for a cap-only change: there is nothing to set on
      // the category row, and an empty UPDATE would move `updated_at` for an edit
      // that happened in another table.
      expect(db.update).not.toHaveBeenCalled();
      expect(
        argsOf(db.insert.mock.results[0].value as never, 'values')[0],
      ).toMatchObject({
        categoryId: CATEGORY_ID,
        effectiveFrom: PERIOD.start,
        capCents: 50000,
      });
    });

    it('appends a null cap to clear one, rather than deleting history', async () => {
      db.select
        .mockReturnValueOnce(
          queryChain([{ id: CATEGORY_ID, isFallback: false }]),
        )
        .mockReturnValueOnce(withSpend(null, 0, 0));
      db.insert.mockReturnValue(queryChain([]));

      await service.update('user-id', CATEGORY_ID, { monthlyCap: null });

      // The periods that were capped stay capped; this one is uncapped onward.
      expect(
        argsOf(db.insert.mock.results[0].value as never, 'values')[0],
      ).toMatchObject({
        capCents: null,
      });
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
