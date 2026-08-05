import type { TransactionFilters } from '../../../lib/transactions';

import {
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  filterHref,
  parseTransactionFilters,
  PERIOD_OPTIONS,
  SORT_OPTIONS,
} from './filters';

// The four filters arrive in a query string, so they are typed by whoever holds the address
// bar - the threat model `parseReason` handles for its own parameter. What is different here
// is the consequence: every one of these keys is validated by the backend and answers 400 when
// it fails, `authorizedGet` reports that as `unavailable`, `readTransactions` throws, and no
// `error.tsx` exists in this app. So a value that slips through is not a filter that does
// nothing, it is the whole screen replaced by an error page.

const UUID = '018f4a1e-2c3b-7d4e-8f90-a1b2c3d4e5f6';

describe('parseTransactionFilters', () => {
  it('reads all four filters from a full query', () => {
    expect(
      parseTransactionFilters({
        search: 'Whole Foods',
        categoryId: UUID,
        period: 'previous',
        sort: 'date_asc',
      }),
    ).toEqual({ search: 'Whole Foods', categoryId: UUID, period: 'previous', sort: 'date_asc' });
  });

  it('parses a bare /transactions to no filters at all', () => {
    // The backend's own defaults then apply. This is the app's most common URL, so it is
    // the one case worth pinning as an empty object rather than as a filled-in default.
    expect(parseTransactionFilters({})).toEqual({});
  });

  describe('drops anything the API would reject with a 400', () => {
    it.each([
      ['a period that does not exist', { period: 'yearly' }],
      ['a near-miss period', { period: 'Current' }],
      ['a sort that does not exist', { sort: 'amount_desc' }],
      ['a category that is not a UUID', { categoryId: 'groceries' }],
      ['a category that is nearly a UUID', { categoryId: `${UUID}-extra` }],
      ['an empty value', { period: '' }],
    ])('%s', (_label, params) => {
      expect(parseTransactionFilters(params)).toEqual({});
    });

    it('a search longer than the DTO allows, by cutting it to 200', () => {
      const parsed = parseTransactionFilters({ search: 'a'.repeat(250) });

      // Cut rather than dropped: the user typed something, and 200 characters of it is a
      // search that works where the whole string is an error page.
      expect(parsed.search).toHaveLength(200);
    });

    it('keeps the valid keys beside an invalid one', () => {
      // The failure mode this rules out is one junk key taking the rest of the bar with it.
      expect(parseTransactionFilters({ search: 'Uber', sort: 'sideways' })).toEqual({
        search: 'Uber',
      });
    });
  });

  describe('normalises what a URL can legally carry', () => {
    it('takes the first value of a repeated key', () => {
      // `?period=all&period=current` arrives as an array and would serialize back out as
      // "all,current", which fails @IsIn. Note app/auth/verify/failed/page.tsx types its own
      // searchParams as if this could not happen; that narrowing is deliberately not copied.
      expect(parseTransactionFilters({ period: ['all', 'current'] })).toEqual({ period: 'all' });
    });

    it('trims a search and drops one that is only whitespace', () => {
      expect(parseTransactionFilters({ search: '  Uber  ' })).toEqual({ search: 'Uber' });
      expect(parseTransactionFilters({ search: '   ' })).toEqual({});
    });

    it('ignores a key that is not a filter', () => {
      expect(parseTransactionFilters({ tab: 'categories', page: '3' })).toEqual({});
    });
  });
});

describe('the option lists', () => {
  it('offers every period the contract accepts', () => {
    expect(PERIOD_OPTIONS.map((option) => option.value)).toEqual(['current', 'previous', 'all']);
  });

  it('offers every sort the contract accepts, and no sort it does not', () => {
    // Two rather than four: the backend orders by date only, so an amount sort would be an
    // option the API cannot serve.
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual(['date_desc', 'date_asc']);
  });

  it('draws the labels the design draws for the closed controls', () => {
    // The only two strings in either list that were read off frame 06 rather than chosen.
    expect(PERIOD_OPTIONS[0].label).toBe('This month');
    expect(SORT_OPTIONS[0].label).toBe('Newest first');
  });

  it('defaults to the option each select is drawn showing', () => {
    expect(DEFAULT_PERIOD).toBe(PERIOD_OPTIONS[0].value);
    expect(DEFAULT_SORT).toBe(SORT_OPTIONS[0].value);
  });
});

describe('filterHref', () => {
  it('writes the filters as a query string', () => {
    expect(filterHref({ search: 'Uber', sort: 'date_asc' })).toBe(
      '/transactions?search=Uber&sort=date_asc',
    );
  });

  it('leaves a default out rather than spelling it', () => {
    // One view, one URL. `?period=current` renders exactly what `/transactions` renders, so
    // shipping both would mean a shared link and a freshly reset bar differing by a string
    // with no visible effect.
    expect(filterHref({})).toBe('/transactions');
    expect(filterHref({ period: DEFAULT_PERIOD, sort: DEFAULT_SORT })).toBe(
      '/transactions?period=current&sort=date_desc',
    );
  });

  it('drops a cleared search rather than sending an empty one', () => {
    expect(filterHref({ search: '', period: 'all' })).toBe('/transactions?period=all');
  });

  it('round-trips through the parser', () => {
    // The property that matters: what the bar writes into the address bar is what the next
    // request reads back out of it, so a filter cannot be lost by navigating to itself.
    const filters: TransactionFilters = {
      search: 'Trader Joe’s',
      categoryId: UUID,
      period: 'all',
      sort: 'date_asc',
    };
    const query = Object.fromEntries(
      new URLSearchParams(filterHref(filters).split('?')[1]).entries(),
    );

    expect(parseTransactionFilters(query)).toEqual(filters);
  });
});
