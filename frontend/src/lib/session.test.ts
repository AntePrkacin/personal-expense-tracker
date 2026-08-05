import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { hasSession, requireSession, SESSION_COOKIE, sessionCookieOptions } from './session';

// The module's first suite: `lib/session.ts` shipped as two documented stubs and was the
// only file in `src/lib/` with no test beside it, because there was nothing yet to
// assert. There is now.
//
// Both mocks use package specifiers, which is the one case where `jest.mock` works
// without the relative-path dance - see the note in frontend/src/app/CLAUDE.md. A real
// `cookies()` throws "was called outside a request scope" under Jest, and a real
// `redirect()` throws NEXT_REDIRECT, which would make every assertion below a
// try/catch.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const SESSION = {
  userId: '0198c2a1-0000-7000-8000-000000000001',
  email: 'marko@email.com',
  expiresAt: '2026-09-04T10:00:00.000Z',
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

/** The cookie jar `cookies()` resolves to. Read-only here: nothing in this module writes. */
function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = SESSION) {
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

describe('SESSION_COOKIE', () => {
  it("sits in the same namespace as the repo's other cookie", () => {
    expect(SESSION_COOKIE).toBe('spendifico.session');
  });

  it('is not the pending-address cookie', () => {
    // The two are unrelated: that one carries an address for one screen's copy, this one
    // carries a credential. `pendingEmail.test.ts` pins the mirror of this assertion.
    expect(SESSION_COOKIE).not.toBe('spendifico.pending_email');
  });
});

describe('sessionCookieOptions', () => {
  it('derives Max-Age from the instant the backend returned', () => {
    // The point of the whole helper. `lib/pendingEmail.ts` mirrors LOGIN_LINK_TTL_M by
    // hand because it has no channel to it; verify hands this one over in its body, so
    // there is nothing to drift from SESSION_TTL_D.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(sessionCookieOptions(expiresAt)?.maxAge).toBeGreaterThan(29 * 24 * 60 * 60);
    expect(sessionCookieOptions(expiresAt)?.maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  it('is httpOnly, lax, root-scoped', () => {
    const options = sessionCookieOptions(new Date(Date.now() + 60_000).toISOString());

    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it("keeps sameSite lax, because 'strict' would withhold the cookie from the emailed link", () => {
    // Not a preference. The verify link arrives as a cross-site top-level GET, which is
    // exactly what 'strict' refuses to send cookies on - so tightening this silently
    // signs every user straight back out.
    expect(sessionCookieOptions(new Date(Date.now() + 60_000).toISOString())?.sameSite).toBe('lax');
  });

  it('is not secure under test, and the production branch is by inspection', () => {
    // next/jest's SWC transform can inline process.env.NODE_ENV, so reassigning it here
    // would silently assert the wrong branch - the trap pendingEmail.test.ts documents.
    // Pinning the test-environment value still proves the expression is evaluated.
    expect(sessionCookieOptions(new Date(Date.now() + 60_000).toISOString())?.secure).toBe(false);
  });

  it.each([
    ['an instant already past', new Date(Date.now() - 1000).toISOString()],
    ['this very moment', new Date(Date.now()).toISOString()],
    ['an unparseable string', 'not-a-date'],
    ['an empty string', ''],
  ])('refuses %s', (_label, expiresAt) => {
    // A cookie with a non-positive Max-Age is one the browser deletes on arrival, so
    // writing it would look like a successful sign-in that instantly signs the user out.
    // The route handler treats null as a failed verify instead.
    expect(sessionCookieOptions(expiresAt)).toBeNull();
  });
});

describe('reading the session', () => {
  it('lifts the cookie into an Authorization header, never a cookie header', async () => {
    // The backend reads no cookies at all, by design, so the move has to happen here.
    const fetchMock = respondWith(200);

    await hasSession();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/session');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('credentials');
  });

  it('never caches, because a revoked session must not keep answering', async () => {
    const fetchMock = respondWith(200);

    await hasSession();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('requests nothing when there is no cookie', async () => {
    // The common case for every signed-out visitor, and it must not cost a round trip.
    store(undefined);
    const fetchMock = respondWith(200);

    await hasSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the session only once per call, so the two seams cannot double-fetch', async () => {
    const fetchMock = respondWith(200);

    await hasSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('hasSession', () => {
  it('is true for a live session', async () => {
    expect(await hasSession()).toBe(true);
  });

  it('is false with no cookie', async () => {
    store(undefined);

    expect(await hasSession()).toBe(false);
  });

  it('is false for a 401, which is expired, revoked or forged', async () => {
    respondWith(401, { statusCode: 401, message: 'Session is invalid, expired or revoked.' });

    expect(await hasSession()).toBe(false);
  });

  it('is false when the backend is unreachable', async () => {
    // Indistinguishable from signed out as far as both callers are concerned, and a
    // throw here would reach the client as an opaque digest nothing can branch on.
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    expect(await hasSession()).toBe(false);
  });

  it("never redirects, because both of its callers' destinations are legitimate", async () => {
    store(undefined);

    await hasSession();

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('requireSession', () => {
  it('returns the session for a live cookie', async () => {
    expect(await requireSession()).toEqual(SESSION);
  });

  it('lets a live session through without redirecting', async () => {
    await requireSession();

    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['no cookie', () => store(undefined)],
    ['a 401', () => respondWith(401, {})],
    [
      'an unreachable backend',
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ],
  ])('sends %s to Log in (AC5)', async (_label, arrange) => {
    arrange();

    // The mocked redirect does not throw, so the function returns past it; the assertion
    // is on the call, which is the whole of the behaviour.
    await requireSession();

    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('does not try to clear the stale cookie', async () => {
    // Amends the stub's own step 4. A Server Component's cookie jar is read-only and
    // .delete() throws ReadonlyRequestCookiesError at runtime with nothing in the types
    // to warn you. Pinned so nobody "completes" the spec and breaks the shell.
    const get = jest.fn().mockReturnValue({ value: TOKEN });
    const del = jest.fn();
    (cookies as jest.Mock).mockResolvedValue({ get, delete: del });
    respondWith(401, {});

    await requireSession();

    expect(del).not.toHaveBeenCalled();
  });
});
