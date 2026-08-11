import { parsePeriodParam, periodHref, periodParam } from './periodParams';

// The `?period=` half of period navigation, which is a module of pure functions - so this suite needs
// no cookie store, no fetch and no router. `periods.test.ts` next door owns the read.

const CURRENT = {
  start: '2025-10-01',
  end: '2025-11-01',
  label: 'October 2025',
  current: true,
};

const PREVIOUS = {
  start: '2025-09-01',
  end: '2025-10-01',
  label: 'September 2025',
  current: false,
};

describe('periodParam', () => {
  it('omits the current period, so one view has one URL', () => {
    // `transactions/filters.ts`'s own rule, and it holds here for the same reason: a dashboard
    // linking to `?period=2026-03-01` would go stale the moment that period rolled over.
    expect(periodParam(CURRENT)).toBeUndefined();
  });

  it('names any other period by its start', () => {
    expect(periodParam(PREVIOUS)).toBe('2025-09-01');
  });
});

describe('periodHref', () => {
  it('links the current period at the bare route', () => {
    expect(periodHref('/dashboard', CURRENT)).toBe('/dashboard');
  });

  it('links any other period with its start', () => {
    expect(periodHref('/transactions/categories', PREVIOUS)).toBe(
      '/transactions/categories?period=2025-09-01',
    );
  });

  it('rebuilds the query rather than appending to whatever was there', () => {
    // The pathname is a pathname: a caller handing it a query string would produce two `?period=`
    // keys, which the backend reads as an array and rejects.
    expect(periodHref('/dashboard', PREVIOUS)).toBe('/dashboard?period=2025-09-01');
  });
});

describe('parsePeriodParam', () => {
  it('forwards a well-formed date', () => {
    expect(parsePeriodParam({ period: '2025-09-01' })).toBe('2025-09-01');
  });

  it('forwards a well-formed date the account may not have, rather than guessing', () => {
    // **Validated and deliberately not canonicalised.** This app cannot know which dates start a
    // period without asking, and the 400 is the honest answer to a link naming one the account does
    // not have - which `authorizedGet` reports as `unavailable` and the reads throw on.
    expect(parsePeriodParam({ period: '1999-01-01' })).toBe('1999-01-01');
  });

  it('drops a malformed value rather than sending a guaranteed 400', () => {
    expect(parsePeriodParam({ period: 'october' })).toBeUndefined();
    expect(parsePeriodParam({ period: '2025-9-1' })).toBeUndefined();
    expect(parsePeriodParam({ period: '' })).toBeUndefined();
  });

  it('drops a repeated key rather than resolving it', () => {
    // A repeated key arrives as an array, the same call `parseTransactionFilters` makes.
    expect(parsePeriodParam({ period: ['2025-09-01', '2025-10-01'] })).toBeUndefined();
  });

  it('answers undefined for a bare route, which means the current period', () => {
    expect(parsePeriodParam({})).toBeUndefined();
  });
});
