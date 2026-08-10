import { cookies } from 'next/headers';

import { updateProfile } from './updateProfile';

// Exercised through the real `authorizedPatch`, the call `updateCategory.test.ts` and
// `updateTransaction.test.ts` both make and for their reason: mocking the helper would prove only
// that a mock was called, where the behaviour worth pinning is the status-to-reason mapping over
// real responses.
//
// Deliberately no `next/navigation` mock, and its absence is an assertion - the same one every
// sibling suite makes. This action must never redirect: a `redirect()` inside an action throws, so
// the form's `await` would never resolve and Save would stay disabled forever. The real `redirect`
// would blow up here, so adding one fails this suite.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
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
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('the request', () => {
  it('PATCHes the profile endpoint', async () => {
    const fetchMock = respondWith(200);

    await updateProfile({ fullName: 'Ana Anic' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/profile',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200);

    await updateProfile({ fullName: 'Ana Anic' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('sends the body it was handed, verbatim', async () => {
    // The diff belongs to `settings/settingsForm.ts`; this function must not add to it or take
    // from it, or a field the user never touched would be rewritten on every save.
    const fetchMock = respondWith(200);

    await updateProfile({ email: 'marko.kovac@email.com' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ email: 'marko.kovac@email.com' });
  });

  it('does not widen a one-field body into a whole profile', async () => {
    // The failure this guards is the expensive one: a body naming all six fields writes the five
    // the user never opened, and `PATCH /api/profile` would answer 200 while doing it.
    const fetchMock = respondWith(200);

    await updateProfile({ fullName: 'Ana Anic' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(['fullName']);
  });

  it('takes a body and nothing else - no id, no token', async () => {
    // No id, because the endpoint has none: the resource is always the session's own, so
    // cross-user access is structural rather than policed. No token, because the credential comes
    // off the httpOnly cookie inside the helper. Both are what make publishing this as an action
    // safe, and both are one argument away from being untrue.
    expect(updateProfile).toHaveLength(1);
  });
});

describe('success', () => {
  it('reports ok on the 200 the endpoint answers', async () => {
    respondWith(200);

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({ ok: true });
  });

  it('does not read the response body', async () => {
    // A 2xx means the change landed, so nothing may turn a saved row into a reported failure -
    // the rule `authorizedPatch` states from the other side. A body that will not parse is the
    // case that would break it, and here it would also make the sidebar footer disagree with a
    // save that really happened, which is AC5.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({ ok: true });
  });
});

describe('the four failures', () => {
  it('maps 400 to invalid, whose copy must not say "try again"', async () => {
    // Reachable through a name past `@MaxLength(100)`, which `settingsForm.ts` deliberately does
    // not mirror, and through an address `lib/email.ts` accepts and validator.js refuses. A body
    // the DTO rejects is rejected again forever, so the advice has to be "check the values".
    respondWith(400);

    await expect(updateProfile({ fullName: 'x'.repeat(101) })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps 409 to taken, the one 409 in this app a user can really reach', async () => {
    // `updateCategory`'s `fallback` and `deleteCategory`'s sit behind controls that are not drawn.
    // This one is two accounts wanting one address, so its copy names the cause - the backend
    // discloses it deliberately, because an authenticated form cannot tell a typo from a taken
    // address unless it is told.
    respondWith(409);

    await expect(updateProfile({ email: 'marko@email.com' })).resolves.toEqual({
      ok: false,
      reason: 'taken',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(200);
    store(undefined);

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 404 to failed rather than publishing a missing arm', async () => {
    // The endpoint documents no 404 at all - an absent profile row is a broken invariant answered
    // with a 500, deliberately, because a documented 404 would invite a "create your profile" flow
    // with nothing behind it. So a 404 arriving anyway is an unexplained fault, not a resource the
    // form could say something useful about.
    respondWith(404);

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it.each([403, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('the contract with the form', () => {
  it('never throws, so no failure reaches the client as an opaque digest', async () => {
    for (const arrange of [
      () => respondWith(400),
      () => respondWith(401),
      () => respondWith(409),
      () => respondWith(500),
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ]) {
      arrange();
      await expect(updateProfile({ fullName: 'Ana Anic' })).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the five documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const status of [200, 400, 401, 409, 500]) {
      respondWith(status);
      const result = await updateProfile({ fullName: 'Ana Anic' });
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual(['failed', 'invalid', 'ok', 'taken', 'unauthenticated']);
  });
});
