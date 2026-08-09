import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readInsights, requireInsights } from './insights';

// Two exports because there are two callers with two failure policies: the route handler
// serving the browser's poll, which must never be handed a redirect, and the Server Component,
// which must be.
//
// Package specifiers, the one case where `jest.mock` needs no relative-path dance. `redirect`
// is mocked as **throwing**, matching `dashboard.test.ts` and `profile.test.ts`: the real one
// is typed `never`, so a mock returning undefined would let execution fall through past the
// redirect and test the opposite of what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const SET = {
  state: 'ready',
  monthLabel: 'October 2025',
  summary: { headline: "You're on track this month", body: "You've spent $1,240 of $2,000." },
  insights: [{ tone: 'warning', title: 'Dining out is over budget', body: '$12 over' }],
  generatedAt: '2025-10-08T09:00:00.000Z',
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = SET) {
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

describe('readInsights, which leaves the policy to its caller', () => {
  it('reads the guarded endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(200);

    await readInsights();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/insights');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never caches, which matters more here than anywhere: the poll watches a value change', async () => {
    const fetchMock = respondWith(200);

    await readInsights();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('costs exactly one request, because the read carries state and content together', async () => {
    const fetchMock = respondWith(200);

    await readInsights();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the set as data', async () => {
    await expect(readInsights()).resolves.toEqual({ ok: true, data: SET });
  });

  it('reports a dead session rather than redirecting, so the poll is never handed a login page', async () => {
    // The whole reason this export exists beside `requireInsights`. A `redirect()` answers the
    // browser's `fetch` with HTML carrying a 200, which the page would parse as a set.
    respondWith(401, {});

    await expect(readInsights()).resolves.toEqual({ ok: false, reason: 'unauthenticated' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reports an unreachable backend as unavailable rather than throwing', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(readInsights()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('requireInsights, the Server Component read', () => {
  it('returns the set on success', async () => {
    await expect(requireInsights()).resolves.toEqual(SET);
  });

  it('sends a request with no cookie straight to Log in, asking nothing', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    await expect(requireInsights()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a 401 to Log in', async () => {
    respondWith(401, {});

    await expect(requireInsights()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('throws rather than redirecting when the backend could not answer', async () => {
    // The distinction `lib/profile.ts` exists to make: redirecting an unreachable backend to
    // `/login` is the loop that made the whole app unreachable, login screen included.
    respondWith(500, {});

    await expect(requireInsights()).rejects.toThrow('the backend did not answer');
    expect(redirect).not.toHaveBeenCalled();
  });
});
