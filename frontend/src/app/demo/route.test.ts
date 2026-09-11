/**
 * @jest-environment node
 */

import { SESSION_COOKIE } from '../../lib/session';

import { GET } from './route';

// The demo hand-out: what the browser gets back for each answer the backend can give.
//
// **The `node` environment above is load-bearing**, for the reason
// `auth/verify/route.test.ts` records: `NextResponse` is built on the Web `Request`,
// `Response` and `Headers` globals and jsdom exposes none of them, so the suite fails at
// import rather than on an assertion.
//
// Nothing is mocked but `fetch`. The handler's own logic is the redirect target and the
// one cookie, and both are readable off the real response object - which is exactly why
// the cookie is set on the response rather than through `next/headers`.

const SESSION_TOKEN = 'aB3dE6gH9jK2mN5pQ8rS1tU4vW7xY0zA3bC6dE9fG2h';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

const thirtyDaysOut = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function respondWith(status: number, body: unknown = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  process.env.BACKEND_URL = 'http://backend.test';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
  jest.restoreAllMocks();
});

describe('GET /demo', () => {
  it('POSTs the hand-out and signs the visitor in on the dashboard', async () => {
    const fetchMock = respondWith(200, {
      token: SESSION_TOKEN,
      expiresAt: thirtyDaysOut(),
    });

    const response = await GET();

    // The one call, and its method: this endpoint takes no body and no credential,
    // which is the whole point of it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://backend.test/api/demo/session');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');

    expect(response.status).toBe(307);
    // **Relative, deliberately.** An absolute URL would have to be rebuilt from the
    // request, and neither `request.url` nor `request.nextUrl` is guaranteed to be the
    // public origin behind a proxy - which sends a visitor to localhost in production
    // and reproduces in no local test.
    expect(response.headers.get('Location')).toBe('/dashboard');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets the session cookie httpOnly, so client JavaScript never sees the token', async () => {
    respondWith(200, { token: SESSION_TOKEN, expiresAt: thirtyDaysOut() });

    const response = await GET();
    const cookie = response.cookies.get(SESSION_COOKIE);

    expect(cookie?.value).toBe(SESSION_TOKEN);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/');
    expect(cookie?.sameSite).toBe('lax');
  });

  /**
   * The ordinary case, and the one the whole pool design exists to produce rather than
   * avoid: every account is with somebody else and coming back shortly works.
   */
  it('sends a 503 to the busy screen', async () => {
    respondWith(503);

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=busy');
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it('sends a 404 to the disabled screen, not the busy one', async () => {
    respondWith(404);

    const response = await GET();

    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=disabled');
  });

  /**
   * A throttled caller is not told the pool is busy, because it is not: the limiter
   * answered before anything looked at an account.
   */
  it('folds a 429 into the generic failure', async () => {
    respondWith(429);

    const response = await GET();

    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=failed');
  });

  /**
   * **The distinction `docs/agents/api-contract.md` draws from the assistant's 502.** A
   * backend that never answered has told us nothing, so claiming every demo account is
   * in use would be a confident, specific statement built out of no information.
   */
  it('does not report an unreachable backend as busy', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await GET();

    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=failed');
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it('fails rather than signing anyone in when the body will not parse', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }) as unknown as typeof fetch;

    const response = await GET();

    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=failed');
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  /**
   * A `Max-Age` of zero or less is deleted by the browser on arrival, so writing the
   * cookie anyway would look exactly like a successful sign-in that instantly signs the
   * visitor out - the failure `sessionCookieOptions` returns `null` to prevent.
   */
  it('refuses an expiry that has already passed', async () => {
    respondWith(200, {
      token: SESSION_TOKEN,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const response = await GET();

    expect(response.headers.get('Location')).toBe('/demo/unavailable?reason=failed');
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});
