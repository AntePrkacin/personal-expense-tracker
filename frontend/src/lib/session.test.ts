import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  authorizedDelete,
  authorizedGet,
  authorizedPatch,
  authorizedPost,
  authorizedPostFormData,
  hasSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session';

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

describe('authorizedGet', () => {
  // The seam `readSession()` and `requireProfile()` share, and `lib/transactions.ts` is the
  // third consumer that earned it. `hasSession` above deliberately discards the failure
  // reason, so these are the assertions that pin the distinction itself - the one that
  // stopped `/dashboard` and `/login` bouncing off each other.

  it('returns the parsed body on success', async () => {
    expect(await authorizedGet('/api/auth/session')).toEqual({ ok: true, data: SESSION });
  });

  it('takes the path verbatim, query string included', async () => {
    // What `lib/transactions.ts` needs from it: the filters are already in the path.
    const fetchMock = respondWith(200);

    await authorizedGet('/api/transactions?period=all');

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/transactions?period=all');
  });

  it.each([
    ['no cookie at all', () => store(undefined)],
    ['a 401, the only status the guard uses for a dead bearer', () => respondWith(401, {})],
  ])('reports %s as unauthenticated', async (_label, arrange) => {
    arrange();

    expect(await authorizedGet('/api/profile')).toEqual({ ok: false, reason: 'unauthenticated' });
  });

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
    [
      'a body that will not parse',
      () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        }) as unknown as typeof fetch;
      },
    ],
  ])('reports %s as unavailable, never as signed out', async (_label, arrange) => {
    // The half that must not be collapsed into the other. Answering "unauthenticated" here
    // is what sent a live session with a failing read to /login, which sent it back.
    arrange();

    expect(await authorizedGet('/api/profile')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a 404 as missing rather than unavailable', async () => {
    // PET-34's arm. `GET /api/transactions/:id` is the only read whose route can answer one,
    // and the detail page turns this into notFound() - so collapsing it into `unavailable`
    // would render Next's error page over a transaction that was merely deleted.
    respondWith(404, {});

    expect(await authorizedGet('/api/transactions/gone')).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('still reports a 403 as unavailable, so missing is a 404 and not "any 4xx"', async () => {
    respondWith(403, {});

    expect(await authorizedGet('/api/profile')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never throws, whatever the backend does', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(authorizedGet('/api/profile')).resolves.toBeDefined();
  });
});

describe('authorizedPost', () => {
  const BODY = {
    amount: 24,
    date: '2025-10-08',
    merchant: 'Whole Foods',
    categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  };

  it('POSTs JSON with the session as a bearer token and no store', async () => {
    const fetchMock = respondWith(201, {});

    await authorizedPost('/api/transactions', BODY);

    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/api/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(BODY),
      cache: 'no-store',
    });
  });

  it('serialises the body verbatim, adding and dropping nothing', async () => {
    // forbidNonWhitelisted makes any extra property a 400, so this helper must not
    // decorate what it is given. The caller owns the key set.
    const fetchMock = respondWith(201, {});

    await authorizedPost('/api/transactions', BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(BODY);
  });

  it('never forwards the session as a cookie', async () => {
    const fetchMock = respondWith(201, {});

    await authorizedPost('/api/transactions', BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.stringify(init.headers)).not.toContain('spendifico.session');
  });

  it('reports 401 with no round trip when there is no cookie', async () => {
    // A missing cookie is reported as 401 rather than a reason of its own: for a write the
    // advice is identical either way, so one status keeps the caller's table to four rows.
    const fetchMock = respondWith(201, {});
    store(undefined);

    expect(await authorizedPost('/api/transactions', BODY)).toEqual({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([200, 201, 202, 204])('treats %d as success', async (status) => {
    respondWith(status, {});

    expect(await authorizedPost('/api/transactions', BODY)).toEqual({ ok: true });
  });

  it.each([400, 401, 404, 409, 429, 500, 502])('passes %d through as a status', async (status) => {
    // The whole reason this is not authorizedGet: the caller has to tell 400 from 404 from
    // 401, and AuthorizedResult would have collapsed all three into `unavailable`.
    respondWith(status, {});

    expect(await authorizedPost('/api/transactions', BODY)).toEqual({ ok: false, status });
  });

  it('reports an unreachable backend with no status at all', async () => {
    // The absent status is the documented signal for "the request never completed", and
    // the one case where the caller genuinely cannot know whether the write landed.
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const result = await authorizedPost('/api/transactions', BODY);

    expect(result).toEqual({ ok: false });
    expect(result).not.toHaveProperty('status');
  });

  // The failure worth engineering against: a 201 whose body will not parse means the
  // transaction *exists*, so reporting failure would send the user to create a second one.
  // Nothing in this helper reads the body, which is what makes that unreachable.
  it('succeeds on a 2xx even when the body is unparseable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }) as unknown as typeof fetch;

    expect(await authorizedPost('/api/transactions', BODY)).toEqual({ ok: true });
  });

  it('never reads the response body', async () => {
    const json = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json }) as unknown as typeof fetch;

    await authorizedPost('/api/transactions', BODY);

    expect(json).not.toHaveBeenCalled();
  });

  it('never throws, whatever the backend does', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(authorizedPost('/api/transactions', BODY)).resolves.toBeDefined();
  });
});

describe('authorizedDelete', () => {
  const PATH = '/api/transactions/0198c2a1-0000-7000-8000-0000000000b1';

  it('DELETEs with the session as a bearer token, no body and no store', async () => {
    const fetchMock = respondWith(204, {});

    await authorizedDelete(PATH);

    expect(fetchMock).toHaveBeenCalledWith(`http://backend.test${PATH}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
  });

  it('sends no body and no Content-Type', async () => {
    // Stated as its own assertion rather than left implicit in the object above: a
    // Content-Type on a bodiless request is the sort of thing a strict proxy rejects, and
    // the shape assertion would still pass if someone added one alongside a `body: undefined`.
    const fetchMock = respondWith(204, {});

    await authorizedDelete(PATH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain('Content-Type');
  });

  it('never forwards the session as a cookie', async () => {
    const fetchMock = respondWith(204, {});

    await authorizedDelete(PATH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.stringify(init.headers)).not.toContain('spendifico.session');
  });

  it('reports 401 with no round trip when there is no cookie', async () => {
    const fetchMock = respondWith(204, {});
    store(undefined);

    expect(await authorizedDelete(PATH)).toEqual({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats 204, the status the endpoint actually answers, as success', async () => {
    respondWith(204, {});

    expect(await authorizedDelete(PATH)).toEqual({ ok: true });
  });

  it.each([200, 202])('treats %d as success too', async (status) => {
    // `response.ok` covers the whole 2xx range rather than testing for 204 specifically,
    // so a backend that starts answering 200 with the deleted row does not read as a failure.
    respondWith(status, {});

    expect(await authorizedDelete(PATH)).toEqual({ ok: true });
  });

  it.each([400, 401, 404, 409, 500, 502])('passes %d through as a status', async (status) => {
    // 404 and 401 are the two the dialog gives different copy to, which is the whole
    // reason this returns AuthorizedWriteResult rather than collapsing to `unavailable`.
    respondWith(status, {});

    expect(await authorizedDelete(PATH)).toEqual({ ok: false, status });
  });

  it('reports an unreachable backend with no status at all', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const result = await authorizedDelete(PATH);

    expect(result).toEqual({ ok: false });
    expect(result).not.toHaveProperty('status');
  });

  it('never reads the response body, because a 204 has none', async () => {
    const json = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json }) as unknown as typeof fetch;

    await authorizedDelete(PATH);

    expect(json).not.toHaveBeenCalled();
  });

  it('never throws, whatever the backend does', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(authorizedDelete(PATH)).resolves.toBeDefined();
  });
});

describe('authorizedPatch', () => {
  const PATH = '/api/transactions/0198c2a1-0000-7000-8000-0000000000b1';
  const BODY = { amount: 31.5 };

  it('PATCHes JSON with the session as a bearer token and no store', async () => {
    const fetchMock = respondWith(200, {});

    await authorizedPatch(PATH, BODY);

    expect(fetchMock).toHaveBeenCalledWith(`http://backend.test${PATH}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(BODY),
      cache: 'no-store',
    });
  });

  it('serialises a partial body verbatim, adding nothing', async () => {
    // The whole point of the endpoint: an absent key means "leave this field alone", so a
    // helper that filled in the four it was not given would rewrite fields the user never
    // touched. forbidNonWhitelisted makes an added key a 400 on top of that.
    const fetchMock = respondWith(200, {});

    await authorizedPatch(PATH, BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(['amount']);
  });

  it('sends an explicit null through, because null is how the note is cleared', async () => {
    // `JSON.stringify` drops `undefined` and keeps `null`, which is exactly the DTO's
    // tri-state: absent leaves the note alone, null clears it, a string sets it. Pinned here
    // because a helper that stripped falsy values would make clearing a note impossible.
    const fetchMock = respondWith(200, {});

    await authorizedPatch(PATH, { note: null, merchant: undefined });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ note: null });
  });

  it('never forwards the session as a cookie', async () => {
    const fetchMock = respondWith(200, {});

    await authorizedPatch(PATH, BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.stringify(init.headers)).not.toContain('spendifico.session');
  });

  it('reports 401 with no round trip when there is no cookie', async () => {
    const fetchMock = respondWith(200, {});
    store(undefined);

    expect(await authorizedPatch(PATH, BODY)).toEqual({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats 200, the status the endpoint actually answers, as success', async () => {
    respondWith(200, {});

    expect(await authorizedPatch(PATH, BODY)).toEqual({ ok: true });
  });

  it.each([201, 202, 204])('treats %d as success too', async (status) => {
    respondWith(status, {});

    expect(await authorizedPatch(PATH, BODY)).toEqual({ ok: true });
  });

  it.each([400, 401, 404, 409, 500, 502])('passes %d through as a status', async (status) => {
    // 404 is the one this verb cannot classify on its own - it means either a missing
    // transaction or a missing category - which is why the status travels and
    // `lib/updateTransaction.ts` narrows it from the body it built.
    respondWith(status, {});

    expect(await authorizedPatch(PATH, BODY)).toEqual({ ok: false, status });
  });

  it('reports an unreachable backend with no status at all', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const result = await authorizedPatch(PATH, BODY);

    expect(result).toEqual({ ok: false });
    expect(result).not.toHaveProperty('status');
  });

  it('succeeds on a 2xx even when the body is unparseable', async () => {
    // The edit landed, so nothing may report otherwise - `authorizedPost`'s rule, and the
    // reason this helper does not parse the updated row it is offered.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }) as unknown as typeof fetch;

    expect(await authorizedPatch(PATH, BODY)).toEqual({ ok: true });
  });

  it('never reads the response body', async () => {
    const json = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch;

    await authorizedPatch(PATH, BODY);

    expect(json).not.toHaveBeenCalled();
  });

  it('never throws, whatever the backend does', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(authorizedPatch(PATH, BODY)).resolves.toBeDefined();
  });
});

describe('authorizedPostFormData', () => {
  const PATH = '/api/transactions/scan';

  const body = () => {
    const data = new FormData();
    data.append('files', new File(['x'], 'receipt.png', { type: 'image/png' }));
    return data;
  };

  it('POSTs the FormData body with no Content-Type set by hand, and no store', async () => {
    // Unlike authorizedPost/Patch, which serialise JSON themselves: fetch derives the
    // multipart boundary from a FormData body, which this function could not compute.
    const fetchMock = respondWith(200, { ok: true });
    const data = body();

    await authorizedPostFormData(PATH, data);

    expect(fetchMock).toHaveBeenCalledWith(`http://backend.test${PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: data,
      cache: 'no-store',
    });
  });

  it('reports 401 with no round trip when there is no cookie', async () => {
    const fetchMock = respondWith(200, {});
    store(undefined);

    expect(await authorizedPostFormData(PATH, body())).toEqual({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the parsed body on success, unlike every JSON-body write above', async () => {
    // The one difference AuthorizedWriteResult's own doc anticipates: the scan's response
    // body is the entire point of the call, so this is the write that finally needed it.
    respondWith(200, { merchant: 'Konzum' });

    expect(await authorizedPostFormData(PATH, body())).toEqual({
      ok: true,
      data: { merchant: 'Konzum' },
    });
  });

  it.each([400, 401, 413, 429, 500, 503, 504])('passes %d through as a status', async (status) => {
    respondWith(status, {});

    expect(await authorizedPostFormData(PATH, body())).toEqual({ ok: false, status });
  });

  it('reports an unreachable backend with no status at all', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const result = await authorizedPostFormData(PATH, body());

    expect(result).toEqual({ ok: false });
    expect(result).not.toHaveProperty('status');
  });

  it('never throws, whatever the backend does', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(authorizedPostFormData(PATH, body())).resolves.toBeDefined();
  });
});
