import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readTransactionsView } from './transactions';

// The three-state resolution, and the assertion this file exists for: the second read fires
// only when the first one comes back empty.
//
// Package specifiers, the one case where `jest.mock` needs no relative-path dance. `redirect`
// is mocked as **throwing**, matching `profile.test.ts`, because the real one is typed
// `never` - a mock returning undefined would let execution fall through past the redirect and
// test the opposite of what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const ROW = {
  id: '0198c2a1-0000-7000-8000-000000000001',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  amount: 62.4,
  date: '2025-10-08',
  note: null,
  createdAt: '2025-10-08T09:00:00.000Z',
  updatedAt: '2025-10-08T09:00:00.000Z',
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

/** One 200 body per call, in order, so the two reads can answer differently. */
function respondInTurn(...bodies: { transactions: unknown[]; total: number }[]) {
  const fetchMock = jest.fn();

  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
  }

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function respondWith(status: number, body: unknown = { transactions: [], total: 0 }) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const empty = { transactions: [], total: 0 };
const oneRow = { transactions: [ROW], total: 1 };

/** The path of the nth fetch, backend origin stripped. */
const pathOf = (fetchMock: jest.Mock, call: number) =>
  String(fetchMock.mock.calls[call][0]).replace('http://backend.test', '');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKEND_URL = 'http://backend.test';
  store(TOKEN);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('when the account has transactions', () => {
  it('reports them as populated with the post-filter total', async () => {
    respondInTurn(oneRow);

    expect(await readTransactionsView()).toEqual({
      state: 'populated',
      transactions: [ROW],
      total: 1,
    });
  });

  it('costs exactly one request', async () => {
    // The whole point of probing only on zero: every page load with data on it pays for one
    // read and no more.
    const fetchMock = respondInTurn(oneRow);

    await readTransactionsView();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the badge from total rather than the array length', async () => {
    // TransactionsResponseDto says so outright: a future page size must not silently turn
    // TRN-2's badge into a page count. The two disagree here on purpose.
    respondInTurn({ transactions: [ROW], total: 128 });

    expect(await readTransactionsView()).toMatchObject({ total: 128 });
  });
});

describe('when the first read comes back empty', () => {
  it('probes once more, all-time and unfiltered', async () => {
    const fetchMock = respondInTurn(empty, empty);

    await readTransactionsView({ search: 'zzzz' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pathOf(fetchMock, 0)).toBe('/api/transactions?search=zzzz');
    // No search, no category, and the one value that applies no date predicate. The question
    // is "does this account contain anything at all", not "did that filter match".
    expect(pathOf(fetchMock, 1)).toBe('/api/transactions?period=all');
  });

  it('is empty when the probe finds nothing either', async () => {
    respondInTurn(empty, empty);

    expect(await readTransactionsView()).toEqual({ state: 'empty', total: 0 });
  });

  it('is no-results when the probe finds something', async () => {
    respondInTurn(empty, oneRow);

    expect(await readTransactionsView({ search: 'zzzz' })).toEqual({
      state: 'noResults',
      total: 0,
    });
  });

  it('is no-results for an account whose only rows are in an earlier month', async () => {
    // Case 3, and the reason this module probes rather than inferring from the filters. The
    // request carries no filter at all, so any filters-look-active heuristic calls this
    // "empty", renders "Log your first expense" over a real history, and - because TRN-3
    // drops the filter bar in that state - leaves no control on screen that could reach it.
    respondInTurn(empty, oneRow);

    expect(await readTransactionsView()).toMatchObject({ state: 'noResults' });
  });
});

describe('when the caller already asked the probe’s own question', () => {
  // PET-29's period select offers "All time", so `period=all` with nothing else is now a
  // request a user can make by clicking. Its first read *is* the probe, and firing an
  // identical second one to interpret it answers a question already answered.

  it('does not probe again for an unfiltered all-time read', async () => {
    const fetchMock = respondInTurn(empty);

    expect(await readTransactionsView({ period: 'all' })).toEqual({ state: 'empty', total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores sort, which cannot change whether a result set is empty', async () => {
    const fetchMock = respondInTurn(empty);

    await readTransactionsView({ period: 'all', sort: 'date_asc' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a blank search as no search', async () => {
    const fetchMock = respondInTurn(empty);

    await readTransactionsView({ period: 'all', search: '' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a search', { period: 'all', search: 'zzzz' } as const],
    ['a category', { period: 'all', categoryId: '0198c2a1-0000-7000-8000-0000000000a1' } as const],
  ])('still probes when all-time is narrowed by %s', async (_label, filters) => {
    // The short-circuit is "these filters already are the probe", not "the period is all".
    // An all-time search that matches nothing is a no-results state, and skipping the probe
    // would report the account as empty and offer "Log your first expense" over a full one.
    const fetchMock = respondInTurn(empty, oneRow);

    expect(await readTransactionsView(filters)).toMatchObject({ state: 'noResults' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still returns populated when the all-time read finds rows', async () => {
    const fetchMock = respondInTurn(oneRow);

    expect(await readTransactionsView({ period: 'all' })).toMatchObject({ state: 'populated' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the request itself', () => {
  it('sends every filter it is given', async () => {
    const fetchMock = respondInTurn(oneRow);

    await readTransactionsView({
      search: 'whole',
      categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
      period: 'previous',
      sort: 'date_asc',
    });

    expect(pathOf(fetchMock, 0)).toBe(
      '/api/transactions?search=whole&categoryId=0198c2a1-0000-7000-8000-0000000000a1' +
        '&period=previous&sort=date_asc',
    );
  });

  it('sends no query string at all when given no filters', async () => {
    // Which means the backend's own default applies: period=current, the view TRN-3 draws.
    const fetchMock = respondInTurn(oneRow);

    await readTransactionsView();

    expect(pathOf(fetchMock, 0)).toBe('/api/transactions');
  });

  it('omits a blank search rather than sending an empty parameter', async () => {
    const fetchMock = respondInTurn(oneRow);

    await readTransactionsView({ search: '', period: 'current' });

    expect(pathOf(fetchMock, 0)).toBe('/api/transactions?period=current');
  });

  it('lifts the session into a bearer header and never caches', async () => {
    const fetchMock = respondInTurn(oneRow);

    await readTransactionsView();

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });
});

describe('when the read fails', () => {
  it('sends a 401 to Log in', async () => {
    // The shell already read the profile through the same guard, so this means the session
    // died between the two reads.
    respondWith(401, {});

    await expect(readTransactionsView()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('sends a request with no cookie to Log in without asking the backend', async () => {
    store(undefined);
    const fetchMock = respondInTurn(oneRow);

    await expect(readTransactionsView()).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a 500', () => respondWith(500, {})],
    [
      'an unreachable backend',
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ],
  ])('throws on %s rather than redirecting, because that is the loop', async (_label, arrange) => {
    arrange();

    await expect(readTransactionsView()).rejects.toThrow(/Could not load your transactions/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('throws when the probe fails, rather than reporting a state it did not establish', async () => {
    // The first read succeeded with nothing; the probe is what decides between empty and
    // no-results, so a failed probe has no defensible answer to fall back on.
    const fetchMock = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => empty });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(readTransactionsView()).rejects.toThrow(/Could not load your transactions/);
  });
});
