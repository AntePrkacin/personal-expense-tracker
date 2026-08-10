import type { CategoriesService } from '../categories/categories.service';
import type { CategoryResponseDto } from '../categories/dto/category-response.dto';
import { todayIn } from '../common/month-window';
import type { PeriodService } from '../periods/period.service';
import { queryChain } from '../../test/query-chain';
import type { UserDatabaseService } from '../database/user-database.service';
import type { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import type { TransactionsService } from '../transactions/transactions.service';
import { RuleBasedInsightGenerator } from './rule-based-insight.generator';

/**
 * The two content rules and the summary, over mocked composition surfaces.
 *
 * `CategoriesService` and `TransactionsService` are mocked rather than composed,
 * the same reason the dashboard spec mocks them: the arithmetic under test is the
 * generator's, and a mock returning a fixture is the whole assertion. The clock
 * is faked because the projection and days-left figures read `today` through
 * `todayIn`. Money renders in USD unless a currency fixture says otherwise.
 */
describe('RuleBasedInsightGenerator', () => {
  const USER_ID = 'user-1';

  let generator: RuleBasedInsightGenerator;
  let currentPeriod: jest.Mock;
  let previousPeriod: jest.Mock;
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

  const tx = (
    overrides: Partial<TransactionResponseDto> = {},
  ): TransactionResponseDto => ({
    id: 'tx-1',
    merchant: 'Konzum',
    categoryId: 'cat-1',
    amount: 10,
    date: '2025-10-10',
    note: null,
    createdAt: '2025-10-10T10:00:00.000Z',
    updatedAt: '2025-10-10T10:00:00.000Z',
    ...overrides,
  });

  /** Builds the generator over the given data, defaulting to October 2025. */
  const build = (options?: {
    window?: { start: string; end: string };
    previousWindow?: { start: string; end: string };
    label?: string;
    previousLabel?: string;
    categories?: CategoryResponseDto[];
    budget?: number;
    currency?: string;
    all?: TransactionResponseDto[];
    current?: TransactionResponseDto[];
    previous?: TransactionResponseDto[];
  }) => {
    // `current()` carries the `today` it was resolved from, so the generator's
    // day counts cannot straddle a midnight boundary; the specs drive it with
    // fake timers.
    const window = options?.window ?? {
      start: '2025-10-01',
      end: '2025-11-01',
    };
    const previous = options?.previousWindow ?? {
      start: '2025-09-01',
      end: '2025-10-01',
    };

    currentPeriod = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ...window,
        label: options?.label ?? 'October 2025',
        today: todayIn('Europe/Zagreb'),
      }),
    );
    previousPeriod = jest.fn().mockResolvedValue({
      ...previous,
      label: options?.previousLabel ?? 'September 2025',
    });
    categoriesList = jest.fn().mockResolvedValue({
      categories: options?.categories ?? [],
      allocation: {
        monthlyBudget: options?.budget ?? 2000,
        allocated: 0,
        unallocated: options?.budget ?? 2000,
      },
    });
    transactionsList = jest
      .fn()
      .mockImplementation((_userId: string, query: { period: string }) => {
        const byPeriod: Record<string, TransactionResponseDto[]> = {
          all: options?.all ?? [],
          current: options?.current ?? [],
          previous: options?.previous ?? [],
        };
        return Promise.resolve({ transactions: byPeriod[query.period] ?? [] });
      });

    const userDatabases = {
      getUserDb: jest.fn().mockResolvedValue({
        select: () => queryChain([{ currency: options?.currency ?? 'USD' }]),
      }),
    } as unknown as UserDatabaseService;

    generator = new RuleBasedInsightGenerator(
      { list: categoriesList } as unknown as CategoriesService,
      {
        current: currentPeriod,
        previous: previousPeriod,
        // Read once and threaded into the two resolutions above, which both
        // ignore it here - the mocks answer fixed periods either way.
        rules: jest.fn().mockResolvedValue([
          {
            effectiveFrom: '2024-10-01',
            monthStartDay: 1,
            transitionStart: null,
          },
        ]),
      } as unknown as PeriodService,
      { list: transactionsList } as unknown as TransactionsService,
      userDatabases,
    );
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2025-10-20T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('produces no set for an account with no transactions (AC7)', async () => {
    build({ all: [] });

    await expect(generator.generate(USER_ID)).resolves.toBeNull();
  });

  it('renders the summary banner with real spent, budget and days-left figures (AC1)', async () => {
    const current = [tx({ id: 't1', amount: 1240, categoryId: 'cat-1' })];
    build({ budget: 2000, all: current, current });

    const set = await generator.generate(USER_ID);

    expect(set?.monthLabel).toBe('October 2025');
    // today is the 20th of a period that started on the 1st: 12 days left.
    expect(set?.summary).toEqual({
      headline: "You're on track this month",
      body: "You've spent $1,240 of your $2,000 budget with 12 days to go.",
    });
  });

  it('names the category furthest over its cap, in the warning tone (AC2)', async () => {
    const current = [tx({ id: 't1', amount: 312, categoryId: 'dining' })];
    build({
      categories: [
        category({
          id: 'dining',
          name: 'Dining out',
          spent: 312,
          monthlyCap: 300,
          over: 12,
          status: 'over',
        }),
      ],
      all: current,
      current,
    });

    const set = await generator.generate(USER_ID);
    const card = set?.cards.find((c) => c.tone === 'warning');

    expect(card).toEqual({
      tone: 'warning',
      title: 'Dining out is over budget',
      body: '$312 of $300 - $12 over',
    });
  });

  it('reports a month-over-month decrease in the positive tone (AC3)', async () => {
    build({
      categories: [category({ id: 'transport', name: 'Transport' })],
      current: [tx({ id: 'c', amount: 223.36, categoryId: 'transport' })],
      previous: [
        tx({
          id: 'p',
          amount: 286.36,
          categoryId: 'transport',
          date: '2025-09-10',
        }),
      ],
      all: [
        tx({ id: 'c', amount: 223.36, categoryId: 'transport' }),
        tx({
          id: 'p',
          amount: 286.36,
          categoryId: 'transport',
          date: '2025-09-10',
        }),
      ],
    });

    const set = await generator.generate(USER_ID);
    const card = set?.cards.find((c) => c.title.startsWith('Transport'));

    expect(card).toEqual({
      tone: 'positive',
      title: 'Transport is down 22%',
      body: 'You spent $63 less than September 2025',
    });
  });

  it('reports a month-over-month increase in the neutral tone', async () => {
    build({
      categories: [category({ id: 'transport', name: 'Transport' })],
      current: [tx({ id: 'c', amount: 122, categoryId: 'transport' })],
      previous: [
        tx({
          id: 'p',
          amount: 100,
          categoryId: 'transport',
          date: '2025-09-10',
        }),
      ],
      all: [
        tx({ id: 'c', amount: 122, categoryId: 'transport' }),
        tx({
          id: 'p',
          amount: 100,
          categoryId: 'transport',
          date: '2025-09-10',
        }),
      ],
    });

    const set = await generator.generate(USER_ID);
    const card = set?.cards.find((c) => c.title.startsWith('Transport'));

    expect(card).toMatchObject({
      tone: 'neutral',
      title: 'Transport is up 22%',
      body: 'You spent $22 more than September 2025',
    });
  });

  // The projection survives PET-42-43-44 as the summary banner's middle
  // headline, and nowhere else. Deleting `projectionCard` without keeping
  // `projectedCents` would have left the banner with two states and no test
  // able to tell, since "trending over" and "on track" only differ by it.
  it('picks the trending-over headline from the projection alone (AC1)', async () => {
    // $1,500 over 20 elapsed days of a 31-day period projects to $2,325: under
    // the $2,000 budget on spend so far, over it at this pace.
    const current = [tx({ id: 't1', amount: 1500, categoryId: 'cat-1' })];
    build({ budget: 2000, all: current, current });

    const set = await generator.generate(USER_ID);

    expect(set?.summary.headline).toBe("You're trending over budget");
  });

  it('picks the over-budget headline from spend, not from the projection', async () => {
    const current = [tx({ id: 't1', amount: 2500, categoryId: 'cat-1' })];
    build({ budget: 2000, all: current, current });

    const set = await generator.generate(USER_ID);

    expect(set?.summary.headline).toBe("You're over budget this month");
  });

  it('returns a ready set with no cards at all when neither rule fires', async () => {
    // One uncapped category, no previous month, spend only in the current
    // period: neither surviving rule has anything to say. Before PET-42-43-44
    // the projection filled this gap, so a set always carried a card - the
    // banner now stands alone, which is the steady state for a first-month user
    // who set no caps rather than an edge case.
    const current = [tx({ id: 't1', amount: 40, categoryId: 'cat-1' })];
    build({ categories: [category()], all: current, current });

    const set = await generator.generate(USER_ID);

    expect(set).not.toBeNull();
    expect(set?.summary.headline).toBeTruthy();
    expect(set?.cards).toEqual([]);
  });

  // The regression test for the cut itself. Both deleted rules fired on data
  // shaped like this, so if either is ever restored by a bad merge it shows up
  // here rather than in a rendered card nobody looked at.
  it('generates neither of the two rules cut in PET-42-43-44', async () => {
    // Netflix at a flat $15 in three distinct months, one charge each: exactly
    // what `recurringMerchantCard` demanded. And $500 of current-period spend,
    // which is all `projectionCard` ever needed.
    const months = ['2025-08-05', '2025-09-05', '2025-10-05'];
    const all = months.map((date, i) =>
      tx({ id: `n${i}`, merchant: 'Netflix', amount: 15, date }),
    );
    const current = [tx({ id: 't1', amount: 500, categoryId: 'cat-1' })];
    build({ budget: 2000, all: [...all, ...current], current });

    const set = await generator.generate(USER_ID);

    expect(set?.cards.some((c) => c.title.includes('recurring'))).toBe(false);
    expect(set?.cards.some((c) => c.body.includes('current pace'))).toBe(false);
    // The narrowed union has no `info`, so this is the type-level cut asserted
    // at runtime: nothing generated can carry the retired tone.
    expect(set?.cards.map((c) => c.tone)).not.toContain('info');
  });

  it('renders money in the user’s currency', async () => {
    const current = [tx({ id: 't1', amount: 1240, categoryId: 'cat-1' })];
    build({ budget: 2000, currency: 'eur', all: current, current });

    const set = await generator.generate(USER_ID);

    expect(set?.summary.body).toContain('€1,240');
  });
});
