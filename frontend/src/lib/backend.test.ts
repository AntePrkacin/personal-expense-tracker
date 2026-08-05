import { postAccepted } from './backend';

// The request shape, pinned once for both callers. These assertions came from
// app/setup/register/actions.test.ts, which was the only place the URL, the method
// and the serialized body were checked at all; that suite now covers what the
// register action adds on top of this - the cookie - rather than re-checking the
// fetch.

const BODY = { email: 'marko@email.com' };

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

/** A response with only the one field the helper reads. */
function respondWith(status: number) {
  const fetchMock = jest.fn().mockResolvedValue({ status });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  process.env.BACKEND_URL = 'http://backend.test';
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('postAccepted', () => {
  it('posts the body to the given path', async () => {
    const fetchMock = respondWith(202);

    await postAccepted('/api/auth/login-link', BODY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/api/auth/login-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
      cache: 'no-store',
    });
  });

  it('reads BACKEND_URL rather than hard-coding a host', async () => {
    // The variable is server-side only and has no NEXT_PUBLIC_ prefix, which is what
    // keeps it out of the browser bundle. A literal here would work in dev and break
    // everywhere else.
    process.env.BACKEND_URL = 'https://api.example.test';
    const fetchMock = respondWith(202);

    await postAccepted('/api/auth/register', BODY);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/auth/register');
  });

  it('never sends the request from the client, so cache is no-store', async () => {
    // Not a caching micro-optimisation: a POST Next decided to cache would silently
    // swallow a second attempt - a resend, most obviously.
    const fetchMock = respondWith(202);

    await postAccepted('/api/auth/login-link', BODY);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('reports success on 202', async () => {
    respondWith(202);

    expect(await postAccepted('/api/auth/login-link', BODY)).toEqual({ ok: true });
  });

  it.each([200, 201, 204, 302])('treats %s as a failure, not a near-miss', async (status) => {
    // 202 is the documented success for both endpoints and the only one. Accepting any
    // 2xx would let a backend change that stops accepting the request read as one that
    // still does.
    respondWith(status);

    expect(await postAccepted('/api/auth/login-link', BODY)).toEqual({ ok: false, status });
  });

  it.each([
    ['a validation rejection', 400],
    ['the rate limiter', 429],
    ['a server fault', 500],
  ])('reports %s with its status', async (_label, status) => {
    // 429 is the one a caller branches on: screen 24 tells the user to wait rather
    // than that it failed, which is only possible because the status survives.
    respondWith(status);

    expect(await postAccepted('/api/auth/login-link', BODY)).toEqual({ ok: false, status });
  });

  it('reports a failure with no status when the backend is unreachable', async () => {
    // The case a running-backend walkthrough never shows. Left to throw, this reaches
    // the client as an opaque server-action digest with nothing the screen can use.
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await postAccepted('/api/auth/login-link', BODY)).toEqual({ ok: false });
  });

  it('does not distinguish a known address from an unknown one', async () => {
    // REG-6, LOG-6 and A35: the backend answers 202 with an empty body either way, so
    // this function cannot tell them apart and must not try. Pinned so nobody adds a
    // branch that would leak whether an account exists.
    respondWith(202);

    const first = await postAccepted('/api/auth/login-link', BODY);
    const second = await postAccepted('/api/auth/login-link', { email: 'nobody@email.com' });

    expect(first).toEqual(second);
  });
});
