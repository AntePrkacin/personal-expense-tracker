import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readDashboard } from './dashboard';

// One read, no probe: `GET /api/dashboard` takes no filters, so there is no ambiguous-empty
// case for a second request to resolve.
//
// Package specifiers, the one case where `jest.mock` needs no relative-path dance. `redirect`
// is mocked as **throwing**, matching `profile.test.ts` and `transactions.test.ts`: the real
// one is typed `never`, so a mock returning undefined would let execution fall through past
// the redirect and test the opposite of what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const SUMMARY = {
  spent: 1240,
  monthlyBudget: 2000,
  remaining: 760,
  daysLeft: 8,
  transactionCount: 38,
  averagePerDay: 54,
  topCategory: { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  weeklyBuckets: [],
  categories: [],
  recentTransactions: [],
  insight: null,
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = SUMMARY) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKEND_URL = 'http://backend.test';
  store(TOKEN);
  respondWith(200);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('reading the dashboard', () => {
  it('reads the guarded endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(200);

    await readDashboard();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/dashboard');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never caches, so an added or deleted transaction is not hidden by a stale read', async () => {
    const fetchMock = respondWith(200);

    await readDashboard();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('returns every figure the summary carries', async () => {
    expect(await readDashboard()).toEqual(SUMMARY);
  });

  it('costs exactly one request, unlike the transactions read beside it', async () => {
    // The endpoint takes no filters at all, so there is no ambiguous-empty case and no probe.
    const fetchMock = respondWith(200);

    await readDashboard();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when the caller is not signed in', () => {
  it('sends a request with no cookie straight to Log in, asking nothing', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    await expect(readDashboard()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a 401 to Log in', async () => {
    // The shell already read the profile through the same guard, so this means the session
    // died between the two reads.
    respondWith(401, {});

    await expect(readDashboard()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('when the backend could not answer', () => {
  // The distinction `lib/profile.ts` exists to make, restated here rather than assumed:
  // redirecting these to /login is the /dashboard-to-/login loop, and this is the module that
  // reads /dashboard itself.

  it.each([
    ['a 500', () => respondWith(500, {})],
    ['a bad gateway', () => respondWith(502, {})],
    [
      'an unreachable backend',
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ],
  ])('throws on %s rather than redirecting', async (_label, arrange) => {
    arrange();

    await expect(readDashboard()).rejects.toThrow(/Could not load your dashboard/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
