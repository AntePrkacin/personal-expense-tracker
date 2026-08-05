/**
 * @jest-environment node
 */

import { PENDING_EMAIL_COOKIE } from '../../../lib/pendingEmail';
import { SESSION_COOKIE } from '../../../lib/session';

import { GET } from './route';

// The whole of AC1, AC2 and AC3, plus the branches A38 leaves to us.
//
// **The `node` environment above is load-bearing.** `NextResponse` is built on the Web
// `Request`, `Response` and `Headers` globals, and the repo's default jsdom environment
// does not expose them - the suite fails at import with `Request is not defined` rather
// than on an assertion. This is the first route handler in the repo and so the first
// file that needs the docblock; every component suite stays on jsdom.
//
// Nothing is mocked but `fetch`. The handler's own logic is the redirect target and the
// two cookies, and both are readable off the real response object - which is exactly why
// the cookies are set on the response rather than through `next/headers`, whose absent
// request scope is what forces a mock everywhere else.

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';
const SESSION_TOKEN = 'aB3dE6gH9jK2mN5pQ8rS1tU4vW7xY0zA3bC6dE9fG2h';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

const thirtyDaysOut = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

/** The emailed link, as `login-link.template.ts` builds it. */
const linkWith = (query: string) => new Request(`http://localhost:4200/auth/verify${query}`);

function respondWith(status: number, body: unknown = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** A 200 from verify, which is the only success. */
function verifies(expiresAt = thirtyDaysOut()) {
  return respondWith(200, { token: SESSION_TOKEN, expiresAt });
}

const locationOf = (response: Response) => new URL(response.headers.get('location') ?? '');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKEND_URL = 'http://backend.test';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('AC1: a valid link signs the user in', () => {
  it('POSTs the token in the body, never as a query parameter', async () => {
    // The backend takes it in a body precisely so a live credential never reaches its
    // access logs. Sending it any other way would undo that on the frontend's behalf.
    const fetchMock = verifies();

    await GET(linkWith(`?token=${TOKEN}`));

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/verify');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
  });

  it('never caches the verify POST', async () => {
    // A cached POST would silently swallow a second attempt after a resend.
    const fetchMock = verifies();

    await GET(linkWith(`?token=${TOKEN}`));

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('lands on the Dashboard (VER-4)', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).pathname).toBe('/dashboard');
  });

  it('redirects rather than rendering, so the token leaves the address bar at once', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
  });

  it('carries no token onwards in the redirect target', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).search).toBe('');
  });

  it('puts the session in the cookie, httpOnly and lax', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));
    const cookie = response.cookies.get(SESSION_COOKIE);

    expect(cookie?.value).toBe(SESSION_TOKEN);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('sets a Max-Age tracking the expiry the backend returned', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBeGreaterThan(29 * 24 * 60 * 60);
  });

  it('clears the stale pending address, which nothing did before', async () => {
    // docs/TODO.md asked for exactly this: the link is spent, so the address screen 24
    // was showing is stale, and leaving it to expire kept it readable for up to fifteen
    // minutes after the account was in.
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(response.cookies.get(PENDING_EMAIL_COOKIE)?.value).toBe('');
  });
});

describe('AC6: the raw session token stays server-side', () => {
  it('appears in no response body', async () => {
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(await response.text()).not.toContain(SESSION_TOKEN);
  });

  it('appears in no header but the cookie ones', async () => {
    // `x-middleware-set-cookie` is Next's own internal carrier for the same Set-Cookie
    // and is stripped before the response leaves the server, so it is filtered here
    // alongside the real header rather than treated as a leak. What this catches is the
    // token turning up somewhere a browser *can* read it - a Location, say.
    verifies();

    const response = await GET(linkWith(`?token=${TOKEN}`));
    const cookieHeaders = ['set-cookie', 'x-middleware-set-cookie'];
    const rest = [...response.headers.entries()].filter(([name]) => !cookieHeaders.includes(name));

    expect(JSON.stringify(rest)).not.toContain(SESSION_TOKEN);
  });
});

describe('AC2: a dead link says so and offers a resend', () => {
  it.each([
    ['a used, expired or unknown link', 401],
    ['a token the DTO rejected', 400],
  ])('sends %s to the invalid screen', async (_label, status) => {
    // 400 folds in with 401 on purpose: a malformed token is indistinguishable from a
    // dead one to the person holding the email, and the advice is identical.
    respondWith(status, { statusCode: status });

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).pathname).toBe('/auth/verify/failed');
    expect(locationOf(response).searchParams.get('reason')).toBe('invalid');
  });

  it('sets no session cookie', async () => {
    respondWith(401, {});

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it('leaves the pending address alone, because the resend still needs it', async () => {
    // The clear belongs to a *spent* link. Dropping it here would take away the address
    // the failure screen's own Resend control depends on.
    respondWith(401, {});

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(response.cookies.get(PENDING_EMAIL_COOKIE)).toBeUndefined();
  });
});

describe('AC3: a superseded link is distinguished by status code alone', () => {
  it('sends a 409 to the superseded screen', async () => {
    // Reachable by ordinary behaviour rather than by misuse: Gmail threads these emails,
    // so opening the older of two is what a user naturally does.
    respondWith(409, { statusCode: 409 });

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).searchParams.get('reason')).toBe('superseded');
  });

  it('parses no response body to tell the two apart', async () => {
    // The backend's contract promises the distinction is in the status, which is why a
    // 409 with an empty body still routes correctly.
    respondWith(409, {});

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).searchParams.get('reason')).toBe('superseded');
  });
});

describe('the branches A38 leaves to us', () => {
  it('sends a 429 to the busy screen rather than claiming the link is dead', async () => {
    // Reachable for a reason that is nobody's fault: the handler POSTs from this server,
    // so every verify in the deployment shares one per-IP bucket.
    respondWith(429, { statusCode: 429 });

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).searchParams.get('reason')).toBe('busy');
  });

  it.each([
    ['a server fault', 500],
    ['a status nothing maps', 418],
  ])('sends %s to the generic screen', async (_label, status) => {
    respondWith(status, {});

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).searchParams.get('reason')).toBe('failed');
  });

  it('survives an unreachable backend', async () => {
    // The link may well still be live, so the copy this reaches says to try again rather
    // than that it expired.
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).searchParams.get('reason')).toBe('failed');
  });
});

describe('a link with nothing in it', () => {
  it.each([
    ['no query string at all', ''],
    ['an empty token', '?token='],
    ['some other parameter', '?t=abc'],
  ])('sends %s to the invalid screen', async (_label, query) => {
    respondWith(200, {});

    const response = await GET(linkWith(query));

    expect(locationOf(response).searchParams.get('reason')).toBe('invalid');
  });

  it('spends no verify attempt finding that out', async () => {
    // A body with an undefined token is a guaranteed 400, and the per-IP bucket it would
    // spend is shared by the whole deployment.
    const fetchMock = respondWith(200, {});

    await GET(linkWith(''));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a session that is already over', () => {
  it.each([
    ['an expiry in the past', new Date(Date.now() - 1000).toISOString()],
    ['an unparseable expiry', 'not-a-date'],
  ])('treats %s as a failed verify', async (_label, expiresAt) => {
    // Writing the cookie would set a Max-Age the browser deletes on arrival, which reads
    // as a successful sign-in that instantly signs the user out - and lands them on a
    // Dashboard that immediately bounces them back to Log in.
    verifies(expiresAt);

    const response = await GET(linkWith(`?token=${TOKEN}`));

    expect(locationOf(response).pathname).toBe('/auth/verify/failed');
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});
