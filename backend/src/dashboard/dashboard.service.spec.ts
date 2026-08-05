import type { ConfigService } from '@nestjs/config';
import type { CategoriesService } from '../categories/categories.service';
import type { CategoryResponseDto } from '../categories/dto/category-response.dto';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import type { TransactionsService } from '../transactions/transactions.service';
import { DashboardService } from './dashboard.service';

/**
 * `CategoriesService` and `TransactionsService` are mocked rather than
 * composed, the same reason `TransactionsService`'s own spec mocks
 * `CategoriesService`: this file must have no window arithmetic or month
 * aggregation of its own left to test, so a mock that records its arguments
 * and returns a fixture is the whole assertion.
 */
describe('DashboardService', () => {
  const USER_ID = '0190c3f0-0000-7000-8000-000000000001';

  let service: DashboardService;
  let currentWindow: jest.Mock;
  let categoriesList: jest.Mock;
  let transactionsList: jest.Mock;

  const category = (
    overrides: Partial<CategoryResponseDto> = {},
  ): CategoryResponseDto => ({
    id: 'cat-1',
    name: 'Groceries',
    color: '#57B368',
    icon: null,
    note: null,
    isFallback: false,
    monthlyCap: null,
    spent: 0,
    transactionCount: 0,
    percentUsed: null,
    remaining: null,
    over: null,
    status: 'uncapped',
    ...overrides,
  });

  const transaction = (
    overrides: Partial<TransactionResponseDto> = {},
  ): TransactionResponseDto => ({
    id: 'tx-1',
    merchant: 'Konzum',
    categoryId: 'cat-1',
    amount: 10,
    date: '2026-08-03',
    note: null,
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    ...overrides,
  });

  /** Defaults to an empty, uncapped account inside a calendar-month August. */
  const buildService = (options?: {
    window?: { start: string; end: string };
    categories?: CategoryResponseDto[];
    transactions?: TransactionResponseDto[];
    monthlyBudget?: number;
  }) => {
    currentWindow = jest
      .fn()
      .mockResolvedValue(
        options?.window ?? { start: '2026-08-01', end: '2026-09-01' },
      );
    categoriesList = jest.fn().mockResolvedValue({
      categories: options?.categories ?? [],
      allocation: {
        monthlyBudget: options?.monthlyBudget ?? 2000.5,
        allocated: 0,
        unallocated: options?.monthlyBudget ?? 2000.5,
      },
    });
    transactionsList = jest.fn().mockResolvedValue({
      transactions: options?.transactions ?? [],
      total: options?.transactions?.length ?? 0,
    });

    service = new DashboardService(
      { currentWindow, list: categoriesList } as unknown as CategoriesService,
      { list: transactionsList } as unknown as TransactionsService,
      { get: () => 'Europe/Zagreb' } as unknown as ConfigService,
    );
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso) });

  it('matches total spent, remaining and transaction count exactly, which is AC1', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      monthlyBudget: 2000.5,
      transactions: [
        transaction({ id: 'tx-1', amount: 12.5 }),
        transaction({ id: 'tx-2', amount: 44.1, date: '2026-08-04' }),
      ],
    });

    const result = await service.get(USER_ID);

    expect(result.spent).toBe(56.6);
    expect(result.transactionCount).toBe(2);
    expect(result.remaining).toBe(1943.9);
  });

  it('follows the given window rather than recomputing one, which is AC2', async () => {
    at('2026-08-20T12:00:00Z');
    // A non-1st monthStartDay window, exactly as CategoriesService would
    // resolve it - this asserts DashboardService uses it rather than assuming
    // a calendar month starting on the 1st. A transaction keeps the weekly
    // series non-empty, since an empty one is its own special case.
    buildService({
      window: { start: '2026-08-15', end: '2026-09-15' },
      transactions: [
        transaction({ id: 'tx-1', date: '2026-08-15', amount: 5 }),
      ],
    });

    const result = await service.get(USER_ID);

    expect(currentWindow).toHaveBeenCalledWith(USER_ID);
    expect(result.daysLeft).toBe(26);
    expect(result.weeklyBuckets[0]?.startDate).toBe('2026-08-15');
  });

  it('rolls the weekly buckets across the December-to-January boundary', async () => {
    at('2027-01-05T12:00:00Z');
    buildService({
      window: { start: '2026-12-15', end: '2027-01-15' },
      transactions: [
        transaction({ id: 'tx-1', date: '2026-12-16', amount: 5 }),
        transaction({ id: 'tx-2', date: '2027-01-02', amount: 7 }),
      ],
    });

    const result = await service.get(USER_ID);

    // Elapsed counts from the window's own start (Dec 15), not from Jan 1.
    expect(result.daysLeft).toBe(10);
    expect(result.weeklyBuckets[0]).toEqual({
      startDate: '2026-12-15',
      endDate: '2026-12-22',
      total: 5,
    });
    // A bucket spanning the year boundary carries both transactions' worth.
    const spanning = result.weeklyBuckets.find(
      (bucket) =>
        bucket.startDate <= '2027-01-02' && bucket.endDate > '2027-01-02',
    );
    expect(spanning?.total).toBeGreaterThanOrEqual(7);
  });

  it('sums the weekly buckets to the period total, which is AC3', async () => {
    at('2026-08-31T12:00:00Z');
    const transactions = [
      transaction({ id: 'tx-1', date: '2026-08-01', amount: 10 }),
      transaction({ id: 'tx-2', date: '2026-08-08', amount: 20 }),
      transaction({ id: 'tx-3', date: '2026-08-15', amount: 30 }),
      transaction({ id: 'tx-4', date: '2026-08-29', amount: 40 }), // in the short last bucket
    ];
    buildService({ transactions });

    const result = await service.get(USER_ID);

    // A 31-day period yields 5 buckets, the fifth 3 days long.
    expect(result.weeklyBuckets).toHaveLength(5);
    expect(result.weeklyBuckets.at(-1)).toEqual({
      startDate: '2026-08-29',
      endDate: '2026-09-01',
      total: 40,
    });
    const bucketSum = result.weeklyBuckets.reduce((sum, b) => sum + b.total, 0);
    expect(bucketSum).toBe(result.spent);
    expect(bucketSum).toBe(100);
  });

  it('returns every nonzero category with its percentage of the period total, which is AC4', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      categories: [
        category({ id: 'cat-a', name: 'Groceries', spent: 30 }),
        category({ id: 'cat-b', name: 'Transport', spent: 70 }),
        category({ id: 'cat-c', name: 'Zero Spend', spent: 0 }),
      ],
      transactions: [
        transaction({ id: 'tx-1', categoryId: 'cat-a', amount: 30 }),
        transaction({ id: 'tx-2', categoryId: 'cat-b', amount: 70 }),
      ],
    });

    const result = await service.get(USER_ID);

    expect(result.categories).toHaveLength(2);
    expect(result.categories.map((c) => c.name)).toEqual([
      'Groceries',
      'Transport',
    ]);
    expect(result.categories.find((c) => c.name === 'Groceries')?.percent).toBe(
      30,
    );
    expect(result.categories.find((c) => c.name === 'Transport')?.percent).toBe(
      70,
    );
  });

  it('returns zeroes, an empty weekly series, no categories and no top category for an empty account, which is AC5', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      categories: [category({ spent: 0 })],
      transactions: [],
    });

    const result = await service.get(USER_ID);

    expect(result.spent).toBe(0);
    expect(result.remaining).toBe(2000.5);
    expect(result.transactionCount).toBe(0);
    expect(result.averagePerDay).toBe(0);
    expect(result.weeklyBuckets).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.topCategory).toBeNull();
    expect(result.recentTransactions).toEqual([]);
  });

  it('breaks a two-way top-category tie by name ascending, whatever order the rows arrive in', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      // Deliberately NOT name-ascending: the tie is broken on the name in
      // topCategoryOf, not inherited from CategoriesService.list()'s ORDER BY,
      // so a row-order change there cannot silently flip the winner.
      categories: [
        category({ id: 'cat-zebra', name: 'Zebra', spent: 50 }),
        category({ id: 'cat-apple', name: 'Apple', spent: 50 }),
      ],
      transactions: [
        transaction({ id: 'tx-1', categoryId: 'cat-zebra', amount: 50 }),
        transaction({ id: 'tx-2', categoryId: 'cat-apple', amount: 50 }),
      ],
    });

    const result = await service.get(USER_ID);

    expect(result.topCategory?.name).toBe('Apple');
  });

  it('accepts Uncategorized as an ordinary top category, unexcluded', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      categories: [
        category({
          id: 'cat-fallback',
          name: 'Uncategorized',
          color: '#98A0AE',
          isFallback: true,
          spent: 44.1,
        }),
      ],
      transactions: [
        transaction({ id: 'tx-1', categoryId: 'cat-fallback', amount: 44.1 }),
      ],
    });

    const result = await service.get(USER_ID);

    expect(result.topCategory?.name).toBe('Uncategorized');
    expect(result.categories.map((c) => c.name)).toEqual(['Uncategorized']);
  });

  it('divides spent by days elapsed so far, counting today, which is decision 2', async () => {
    at('2026-08-05T12:00:00Z');
    buildService({
      transactions: [transaction({ id: 'tx-1', amount: 50 })],
    });

    const result = await service.get(USER_ID);

    // Elapsed = daysBetween(start, today) + 1 = 4 + 1 = 5.
    expect(result.averagePerDay).toBe(10);
  });

  it('counts 1 day left on the final day of the period, never 0', async () => {
    at('2026-08-31T12:00:00Z');
    buildService();

    const result = await service.get(USER_ID);

    expect(result.daysLeft).toBe(1);
  });

  it('allows remaining to go negative when overspent, unclamped', async () => {
    at('2026-08-15T12:00:00Z');
    buildService({
      monthlyBudget: 100,
      transactions: [transaction({ id: 'tx-1', amount: 150 })],
    });

    const result = await service.get(USER_ID);

    expect(result.remaining).toBe(-50);
  });

  it('returns at most 3 recent transactions, newest first', async () => {
    at('2026-08-15T12:00:00Z');
    const transactions = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      transaction({ id, date: `2026-08-0${5 - i}`, amount: 1 }),
    );
    buildService({ transactions });

    const result = await service.get(USER_ID);

    expect(result.recentTransactions).toHaveLength(3);
    expect(result.recentTransactions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('asks the transaction list for the current period sorted newest-first explicitly', async () => {
    at('2026-08-15T12:00:00Z');
    buildService();

    await service.get(USER_ID);

    expect(transactionsList).toHaveBeenCalledWith(USER_ID, {
      period: 'current',
      sort: 'date_desc',
    });
  });

  it('always answers insight: null', async () => {
    at('2026-08-15T12:00:00Z');
    buildService();

    const result = await service.get(USER_ID);

    expect(result.insight).toBeNull();
  });
});
