import { BadRequestException, NotFoundException } from '@nestjs/common';
import { argsOf, paramsOf, queryChain, toSql } from '../../test/query-chain';
import type { CategoriesService } from '../categories/categories.service';
import type { CategoryResponseDto } from '../categories/dto/category-response.dto';
import type { UserDatabaseService } from '../database/user-database.service';
import type { TransactionRow } from '../database/user/schema';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let getUserDb: jest.Mock;
  let select: jest.Mock;
  let insert: jest.Mock;
  let update: jest.Mock;
  let currentWindow: jest.Mock;
  let previousWindow: jest.Mock;
  let monthStatsFor: jest.Mock;

  const USER_ID = '0190c3f0-0000-7000-8000-000000000001';
  const TX_ID = '0190c3f0-0000-7000-8000-000000000002';
  const CATEGORY_ID = '0190c3f0-0000-7000-8000-000000000003';
  const OTHER_TX_ID = '0190c3f0-0000-7000-8000-000000000004';

  const CURRENT = { start: '2026-08-01', end: '2026-09-01' };
  const PREVIOUS = { start: '2026-07-01', end: '2026-08-01' };

  /**
   * The uncapped shape, which is the common case rather than the exotic one:
   * caps are optional everywhere and the preselected fallback has none.
   */
  const uncappedStats: CategoryResponseDto = {
    id: CATEGORY_ID,
    name: 'Uncategorized',
    color: '#98A0AE',
    icon: null,
    note: null,
    isFallback: true,
    monthlyCap: null,
    spent: 4.02,
    transactionCount: 1,
    percentUsed: null,
    remaining: null,
    over: null,
    status: 'uncapped',
  };

  const createdAt = new Date('2026-08-03T10:00:00.000Z');
  const updatedAt = new Date('2026-08-03T11:00:00.000Z');

  const row: TransactionRow = {
    id: TX_ID,
    merchant: 'Konzum',
    categoryId: CATEGORY_ID,
    amountCents: 402,
    date: '2026-08-03',
    note: null,
    createdAt,
    updatedAt,
    deletedAt: null,
  };

  /** A live category, so the existence check passes. */
  const categoryFound = () => queryChain([{ id: CATEGORY_ID }]);

  const validCreate = {
    merchant: 'Konzum',
    categoryId: CATEGORY_ID,
    amount: 4.02,
    date: '2026-08-03',
  };

  beforeEach(() => {
    select = jest.fn().mockReturnValue(categoryFound());
    insert = jest.fn().mockReturnValue(queryChain([row]));
    update = jest.fn().mockReturnValue(queryChain([row]));
    currentWindow = jest.fn().mockResolvedValue(CURRENT);
    previousWindow = jest.fn().mockResolvedValue(PREVIOUS);
    monthStatsFor = jest.fn().mockResolvedValue(uncappedStats);

    buildService();
  });

  /**
   * Rebuilds the service around the current `select` mock.
   *
   * `CategoriesService` is mocked rather than composed, which is the point of
   * decision 7: this service must have no month arithmetic of its own left to
   * test here, so a mock that records its arguments is the whole assertion.
   */
  const buildService = () => {
    getUserDb = jest.fn().mockResolvedValue({ select, insert, update });

    service = new TransactionsService(
      { getUserDb } as unknown as UserDatabaseService,
      {
        currentWindow,
        previousWindow,
        monthStatsFor,
      } as unknown as CategoriesService,
    );
  };

  /** The WHERE of the nth `select()` in a flow, rendered for assertion. */
  const whereOf = (nth = 0) =>
    argsOf(select.mock.results[nth].value as never, 'where')[0];

  /** The ORDER BY args of the nth `select()`, as SQL text. */
  const orderOf = (nth = 0) =>
    argsOf(select.mock.results[nth].value as never, 'orderBy').map((column) =>
      toSql(column),
    );

  describe('list', () => {
    beforeEach(() => {
      select = jest.fn().mockReturnValue(queryChain([row]));
      buildService();
    });

    it('sorts newest first by default, which is AC1', async () => {
      await service.list(USER_ID, {});

      expect(orderOf()[0]).toContain('desc');
      expect(orderOf()[0]).toContain('date');
    });

    it('breaks ties on created_at then id, so the order is stable', async () => {
      await service.list(USER_ID, {});

      // Without these two, rows sharing a date come back in whatever order
      // SQLite likes and the list reshuffles between identical requests.
      const order = orderOf();
      expect(order).toHaveLength(3);
      expect(order[1]).toContain('created_at');
      expect(order[2]).toContain('id');
    });

    it('flips only the date column for date_asc, keeping the tiebreaks newest-first', async () => {
      await service.list(USER_ID, { sort: 'date_asc' });

      const order = orderOf();
      expect(order[0]).not.toContain('desc');
      expect(order[1]).toContain('desc');
      expect(order[2]).toContain('desc');
    });

    it('defaults to the current period rather than all history', async () => {
      await service.list(USER_ID, {});

      // TRN-1's overline names one month and TRN-3's filter already reads "This
      // month", so one period is the designed default view.
      expect(currentWindow).toHaveBeenCalledWith(USER_ID);
      expect(previousWindow).not.toHaveBeenCalled();
      expect(paramsOf(whereOf())).toEqual(
        expect.arrayContaining([CURRENT.start, CURRENT.end]),
      );
    });

    it('bounds the current period half-open, matching the window contract', async () => {
      await service.list(USER_ID, { period: 'current' });

      const sql = toSql(whereOf());
      expect(sql).toContain('>=');
      expect(sql).toContain('<');
      // Not `<=`: an inclusive upper bound would double-count the boundary day
      // across two periods.
      expect(sql).not.toContain('<=');
    });

    it('resolves previous through CategoriesService, never by subtracting days', async () => {
      await service.list(USER_ID, { period: 'previous' });

      expect(previousWindow).toHaveBeenCalledWith(USER_ID);
      expect(currentWindow).not.toHaveBeenCalled();
      expect(paramsOf(whereOf())).toEqual(
        expect.arrayContaining([PREVIOUS.start, PREVIOUS.end]),
      );
    });

    it('applies no date predicate at all for all, and reads no profile for one', async () => {
      await service.list(USER_ID, { period: 'all' });

      expect(currentWindow).not.toHaveBeenCalled();
      expect(previousWindow).not.toHaveBeenCalled();
      expect(paramsOf(whereOf())).not.toEqual(
        expect.arrayContaining([CURRENT.start]),
      );
    });

    it('searches the merchant as a case-insensitive substring, which is AC2', async () => {
      await service.list(USER_ID, { period: 'all', search: 'konz' });

      expect(toSql(whereOf())).toContain('like');
      expect(paramsOf(whereOf())).toContain('%konz%');
    });

    it('never searches the note, which appears on no list row', async () => {
      await service.list(USER_ID, { period: 'all', search: 'konz' });

      expect(toSql(whereOf())).not.toContain('note');
    });

    it('escapes % and _ so they match literally rather than as wildcards', async () => {
      // Unescaped, "10%" would also match "1000" and "A_B" would also match
      // "AXB" - `%` and `_` are live LIKE wildcards to SQLite. `escape`
      // pairs with the backslash `escapeLikeTerm` inserts ahead of each one.
      await service.list(USER_ID, { period: 'all', search: '10%' });

      expect(toSql(whereOf())).toContain('escape');
      expect(paramsOf(whereOf())).toContain('%10\\%%');
    });

    it('escapes a literal backslash in the term ahead of the character it precedes', async () => {
      await service.list(USER_ID, { period: 'all', search: 'A\\_B' });

      // Backslash-first is what stops the term's own backslash from
      // swallowing the underscore's escape: "A\_B" must become "A\\\_B", not
      // "A\_B" read back as one escaped underscore.
      expect(paramsOf(whereOf())).toContain('%A\\\\\\_B%');
    });

    it('applies no predicate for a whitespace-only term rather than LIKE %%', async () => {
      // The DTO trims, so a whitespace-only term arrives as the empty string.
      await service.list(USER_ID, { period: 'all', search: '' });

      expect(toSql(whereOf())).not.toContain('like');
      expect(paramsOf(whereOf())).not.toContain('%%');
    });

    it('filters by category when one is given', async () => {
      await service.list(USER_ID, { period: 'all', categoryId: CATEGORY_ID });

      expect(paramsOf(whereOf())).toContain(CATEGORY_ID);
    });

    it('composes every filter into one condition', async () => {
      await service.list(USER_ID, {
        period: 'current',
        categoryId: CATEGORY_ID,
        search: 'konz',
      });

      const params = paramsOf(whereOf());
      expect(params).toEqual(
        expect.arrayContaining([
          CURRENT.start,
          CURRENT.end,
          CATEGORY_ID,
          '%konz%',
        ]),
      );
    });

    it('excludes tombstoned rows whatever the filters are', async () => {
      await service.list(USER_ID, { period: 'all' });

      expect(toSql(whereOf())).toContain('is null');
    });

    it('counts total after filters, not the account total', async () => {
      select.mockReturnValue(queryChain([row, { ...row, id: OTHER_TX_ID }]));

      const result = await service.list(USER_ID, {});

      // Equal to the array length today and returned anyway, so a future page
      // size cannot silently turn TRN-2's badge into a page count.
      expect(result.total).toBe(2);
      expect(result.total).toBe(result.transactions.length);
    });

    it('answers in major units, so nothing downstream sees cents', async () => {
      const result = await service.list(USER_ID, {});

      expect(result.transactions[0].amount).toBe(4.02);
    });

    it('returns an empty list and a zero total rather than throwing', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.list(USER_ID, {})).resolves.toEqual({
        transactions: [],
        total: 0,
      });
    });
  });

  describe('detail', () => {
    const sibling: TransactionRow = {
      ...row,
      id: OTHER_TX_ID,
      merchant: 'Spar',
      date: '2026-06-14',
    };

    /** The row read, then the recent-in-category read. */
    const detailReads = (
      rows: TransactionRow[] = [sibling],
      viewed: TransactionRow = row,
    ) => {
      select = jest
        .fn()
        .mockReturnValueOnce(queryChain([viewed]))
        .mockReturnValueOnce(queryChain(rows));
      buildService();
    };

    beforeEach(() => detailReads());

    it('404s an unknown id, which is AC6', async () => {
      select = jest.fn().mockReturnValue(queryChain([]));
      buildService();

      await expect(service.detail(USER_ID, TX_ID)).rejects.toThrow(
        NotFoundException,
      );
      // Nothing else runs: no stats read for a transaction that is not there.
      expect(monthStatsFor).not.toHaveBeenCalled();
    });

    it('filters tombstoned rows out of the row read, which is what 404s one', async () => {
      await service.detail(USER_ID, TX_ID);

      // A tombstoned id reaches the same empty result as an unknown one, so the
      // 404 above covers both. This is the predicate that makes it so.
      expect(toSql(whereOf())).toContain('is null');
      expect(paramsOf(whereOf())).toContain(TX_ID);
    });

    it('takes the category stats from CategoriesService, computing none itself', async () => {
      const result = await service.detail(USER_ID, TX_ID);

      expect(monthStatsFor).toHaveBeenCalledWith(USER_ID, CATEGORY_ID);
      expect(result.category).toBe(uncappedStats);
    });

    it('turns a dangling categoryId into a broken-invariant error, not the category 404', async () => {
      monthStatsFor.mockRejectedValue(
        new NotFoundException('Category not found.'),
      );

      // `NotFoundException` here would 404 the whole detail read under a
      // message naming the category, contradicting the controller's "404
      // always means the transaction id" claim - see the note on
      // `monthStatsForRow`. A plain Error is what every other broken
      // invariant in this feature throws, and `AllExceptionsFilter` reduces it
      // to a 500 rather than a misleading 404.
      await expect(service.detail(USER_ID, TX_ID)).rejects.toThrow(
        new RegExp(`${TX_ID}.*${CATEGORY_ID}`),
      );
      await expect(service.detail(USER_ID, TX_ID)).rejects.not.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets a non-404 error out of monthStatsFor propagate unchanged', async () => {
      const dbError = new Error('db unreachable');
      monthStatsFor.mockRejectedValue(dbError);

      await expect(service.detail(USER_ID, TX_ID)).rejects.toBe(dbError);
    });

    it('asks for the current period even for a transaction from an older one', async () => {
      detailReads([sibling], { ...row, date: '2026-03-02' });

      await service.detail(USER_ID, TX_ID);

      // AC4 and DET-4's "this month" title: the bar answers where the category
      // stands now, not where it stood in March. `monthStatsFor` takes no date,
      // which is what makes that structural rather than a convention.
      expect(monthStatsFor).toHaveBeenCalledWith(USER_ID, CATEGORY_ID);
      expect(monthStatsFor.mock.calls[0]).toHaveLength(2);
    });

    it('passes the uncapped shape straight through, nulls and all', async () => {
      const result = await service.detail(USER_ID, TX_ID);

      // The common case, not the exotic one.
      expect(result.category.status).toBe('uncapped');
      expect(result.category.monthlyCap).toBeNull();
      expect(result.category.percentUsed).toBeNull();
      expect(result.category.remaining).toBeNull();
      expect(result.category.over).toBeNull();
    });

    it('reads recent-in-category with no date predicate, which is AC5', async () => {
      await service.detail(USER_ID, TX_ID);

      // DET-5's September row is the proof: this list is the latest in the
      // category regardless of month, unlike the stats beside it.
      const params = paramsOf(whereOf(1));
      expect(params).not.toEqual(expect.arrayContaining([CURRENT.start]));
      expect(params).not.toEqual(expect.arrayContaining([CURRENT.end]));
      expect(params).toContain(CATEGORY_ID);
    });

    it('excludes the transaction being viewed from its own sibling list', async () => {
      await service.detail(USER_ID, TX_ID);

      // A deliberate deviation from DET-5, whose first row is the transaction
      // whose page it sits on.
      expect(toSql(whereOf(1))).toContain('<>');
      expect(paramsOf(whereOf(1))).toContain(TX_ID);
    });

    it('caps the sibling list at five and sorts it newest first', async () => {
      await service.detail(USER_ID, TX_ID);

      expect(argsOf(select.mock.results[1].value as never, 'limit')).toEqual([
        5,
      ]);
      expect(orderOf(1)[0]).toContain('desc');
    });

    it('excludes tombstoned siblings too', async () => {
      await service.detail(USER_ID, TX_ID);

      expect(toSql(whereOf(1))).toContain('is null');
    });

    it('returns fewer siblings than the cap without padding anything', async () => {
      detailReads([sibling]);

      const result = await service.detail(USER_ID, TX_ID);

      // A category holding two transactions yields one sibling, because the
      // viewed one is dropped. The card renders what it gets.
      expect(result.recentInCategory).toHaveLength(1);
      expect(result.recentInCategory[0].id).toBe(OTHER_TX_ID);
    });

    it('returns an empty sibling list for a category holding only this row', async () => {
      detailReads([]);

      const result = await service.detail(USER_ID, TX_ID);

      expect(result.recentInCategory).toEqual([]);
    });

    it('answers all three pieces in major units', async () => {
      const result = await service.detail(USER_ID, TX_ID);

      expect(result.transaction.amount).toBe(4.02);
      expect(result.transaction.id).toBe(TX_ID);
      expect(result.recentInCategory[0].amount).toBe(4.02);
    });
  });

  describe('create', () => {
    it('checks the category is live before inserting anything', async () => {
      await service.create(USER_ID, validCreate);

      const where = argsOf(select.mock.results[0].value as never, 'where')[0];
      // The tombstone filter matters here as much as the id: a soft-deleted
      // category must not accept new spending.
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(CATEGORY_ID);
    });

    it('404s an unknown category and never reaches the insert', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(service.create(USER_ID, validCreate)).rejects.toThrow(
        NotFoundException,
      );
      expect(insert).not.toHaveBeenCalled();
    });

    it('converts the amount to cents, rounding float noise away', async () => {
      await service.create(USER_ID, { ...validCreate, amount: 4.02 });

      // 4.02 * 100 is 401.99999999999994 in binary floating point.
      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ amountCents: 402 }));
    });

    it('converts a larger amount without losing a cent', async () => {
      await service.create(USER_ID, { ...validCreate, amount: 2000.5 });

      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ amountCents: 200050 }));
    });

    it('generates a UUID id and stores the date verbatim', async () => {
      await service.create(USER_ID, { ...validCreate, date: '2025-11-05' });

      const values = argsOf(
        insert.mock.results[0].value as never,
        'values',
      )[0] as Record<string, unknown>;

      expect(values.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      // A backdated date is stored as the string it arrived as - no Date round
      // trip, which would shift the day in half the world's timezones.
      expect(values.date).toBe('2025-11-05');
    });

    it('writes an omitted note as null rather than undefined', async () => {
      await service.create(USER_ID, validCreate);

      expect(
        argsOf(insert.mock.results[0].value as never, 'values')[0],
      ).toEqual(expect.objectContaining({ note: null }));
    });

    it('answers in major units and ISO instants', async () => {
      await expect(service.create(USER_ID, validCreate)).resolves.toEqual({
        id: TX_ID,
        merchant: 'Konzum',
        categoryId: CATEGORY_ID,
        amount: 4.02,
        date: '2026-08-03',
        note: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });
  });

  describe('update', () => {
    it('400s an empty body before it even opens the database', async () => {
      await expect(service.update(USER_ID, TX_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      // The point of checking first: a bare UPDATE would still bump updated_at
      // through $onUpdateFn and record an edit that changed nothing.
      expect(getUserDb).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('sets exactly the fields provided, and nothing else', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      expect(argsOf(update.mock.results[0].value as never, 'set')[0]).toEqual({
        merchant: 'Spar',
      });
    });

    it('never sets updatedAt by hand', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      // drizzle's buildUpdateSet applies $onUpdateFn columns itself on every
      // UPDATE. Setting it here too would be a second source for one timestamp.
      expect(
        argsOf(update.mock.results[0].value as never, 'set')[0],
      ).not.toHaveProperty('updatedAt');
    });

    it('converts an updated amount to cents rather than passing majors through', async () => {
      await service.update(USER_ID, TX_ID, { amount: 2000.5 });

      const set = argsOf(update.mock.results[0].value as never, 'set')[0];

      expect(set).toEqual({ amountCents: 200050 });
      expect(set).not.toHaveProperty('amount');
    });

    it('keeps an explicit null note, because null clears it', async () => {
      await service.update(USER_ID, TX_ID, { note: null });

      expect(argsOf(update.mock.results[0].value as never, 'set')[0]).toEqual({
        note: null,
      });
    });

    it('checks the category only when one was sent', async () => {
      await service.update(USER_ID, TX_ID, { categoryId: CATEGORY_ID });
      expect(select).toHaveBeenCalledTimes(1);

      select.mockClear();
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });
      expect(select).not.toHaveBeenCalled();
    });

    it('404s an unknown category and never reaches the update', async () => {
      select.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, TX_ID, { categoryId: CATEGORY_ID }),
      ).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('excludes tombstoned rows from the WHERE', async () => {
      await service.update(USER_ID, TX_ID, { merchant: 'Spar' });

      const where = argsOf(update.mock.results[0].value as never, 'where')[0];

      // Without this a deleted transaction could be edited back into existence.
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(TX_ID);
    });

    it('404s when the conditional update matches no row', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(
        service.update(USER_ID, TX_ID, { merchant: 'Spar' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('tombstones with an UPDATE rather than deleting the row', async () => {
      update.mockReturnValue(queryChain([{ id: TX_ID }]));

      await service.remove(USER_ID, TX_ID);

      expect(update).toHaveBeenCalledTimes(1);
      const set = argsOf(update.mock.results[0].value as never, 'set')[0] as {
        deletedAt?: Date;
      };
      expect(set.deletedAt).toBeInstanceOf(Date);
    });

    it('only tombstones a row that is not already tombstoned', async () => {
      update.mockReturnValue(queryChain([{ id: TX_ID }]));

      await service.remove(USER_ID, TX_ID);

      // One conditional UPDATE, never a read then a write: the await between a
      // check and a mark is where two concurrent deletes would both pass.
      const where = argsOf(update.mock.results[0].value as never, 'where')[0];
      expect(toSql(where)).toContain('is null');
      expect(paramsOf(where)).toContain(TX_ID);
    });

    it('404s when nothing was matched, which covers a repeat delete', async () => {
      update.mockReturnValue(queryChain([]));

      await expect(service.remove(USER_ID, TX_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('opens the caller’s own database for every operation', async () => {
    // This is the whole of cross-user isolation: there is no user column to
    // filter on because another user's rows are in another database.
    update.mockReturnValue(queryChain([row]));

    await service.create(USER_ID, validCreate);
    await service.update(USER_ID, TX_ID, { merchant: 'Spar' });
    await service.remove(USER_ID, TX_ID);

    expect(getUserDb).toHaveBeenCalledTimes(3);
    expect(getUserDb.mock.calls).toEqual([[USER_ID], [USER_ID], [USER_ID]]);
  });
});
