import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { logOut } from './logOut';

// Exercised through the real `authorizedPost`, the call `generateInsights.test.ts` and
// `createTransaction.test.ts` both make: mocking the helper would prove only that a mock was
// called, where the behaviour worth pinning here is what happens to the cookie on each answer.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Mocked, and its presence is the inverse of the assertion `generateInsights.test.ts` makes by
// leaving it out. That action must never redirect, because a `redirect()` inside an action throws
// and its caller awaits the result; this one has no caller waiting for anything - leaving is the
// entire point - so the redirect is the last line rather than a bug.
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

/** The mutable jar an action gets, unlike a Server Component's read-only one. */
function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  const remove = jest.fn();
  (cookies as jest.Mock).mockResolvedValue({ get, delete: remove });
  return { get, remove };
}

function respondWith(status: number) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKEND_URL = 'http://backend.test';
  store(TOKEN);
  respondWith(204);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('signing out', () => {
  it('POSTs the logout endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(204);

    await logOut();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/logout');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends no user id and no token of its own, so a caller can only end their own session', async () => {
    const fetchMock = respondWith(204);

    await logOut();

    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('clears the session cookie under the path it was written with', async () => {
    const { remove } = store(TOKEN);

    await logOut();

    // Name alone would leave a cookie that only looks gone: the delete has to agree with the
    // `path: '/'` `sessionCookieOptions` writes it under.
    expect(remove).toHaveBeenCalledWith({
      name: 'spendifico.session',
      path: '/',
    });
  });

  it('redirects to Log in rather than Welcome', async () => {
    await logOut();

    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('bounds the revoke, so a hanging backend cannot keep the user signed in', async () => {
    const fetchMock = respondWith(204);

    await logOut();

    // The signal is the whole of the fix a code review asked for. Without it, a
    // backend that accepts the connection and never answers holds the `await` for
    // undici's 300s header timeout - so the cookie is never cleared, the redirect
    // never runs, and the user has pressed a control that does nothing. Clearing
    // the cookie on every arm is worth nothing if the arm never arrives.
    //
    // Asserting that a signal is passed rather than how long it runs: a real timer
    // would make this suite wait for it, and the duration is a tuning decision
    // where the presence of a bound is the correctness one.
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('when the API will not answer', () => {
  // The whole point of the action's shape: local sign-out is guaranteed and revocation is best
  // effort, because clearing the cookie only on a 2xx would leave a user unable to sign out of
  // their own browser on the one screen whose purpose is leaving.
  it.each([
    ['a dead session', 401],
    ['a refused request', 403],
    ['a broken backend', 500],
  ])('still clears the cookie and still leaves on %s', async (_case, status) => {
    const { remove } = store(TOKEN);
    respondWith(status);

    await logOut();

    expect(remove).toHaveBeenCalledWith({
      name: 'spendifico.session',
      path: '/',
    });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('still clears the cookie when the request never completed', async () => {
    const { remove } = store(TOKEN);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await logOut();

    expect(remove).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('never throws, so a rejection cannot reach the client as an opaque digest', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    await expect(logOut()).resolves.toBeUndefined();
  });
});

describe('when there was no cookie to begin with', () => {
  it('sends no request at all and still leaves', async () => {
    const { remove } = store(undefined);
    const fetchMock = respondWith(204);

    await logOut();

    // `authorizedPost` answers 401 without fetching when the jar is empty, so a user whose
    // cookie expired mid-session must not be stranded on a screen they cannot leave.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
