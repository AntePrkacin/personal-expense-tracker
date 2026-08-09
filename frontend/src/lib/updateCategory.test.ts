import { cookies } from 'next/headers';

import { updateCategory } from './updateCategory';

// Exercised through the real `authorizedPatch`, the call `updateTransaction.test.ts` and
// `deleteCategory.test.ts` both make and for their reason: mocking the helper would prove only that
// a mock was called, where the behaviour worth pinning is the status-to-reason mapping over real
// responses.
//
// Deliberately no `next/navigation` mock, and its absence is an assertion - the same one every
// sibling suite makes. This action must never redirect: a `redirect()` inside an action throws, so
// the modal's `await` would never resolve and Save would stay disabled forever. The real `redirect`
// would blow up here, so adding one fails this suite.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** Frame 21's own target, the "Subscriptions" the modal is prefilled with. */
const ID = '0198c2a1-0000-7000-8000-0000000000c1';

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
  it('PATCHes the id under the categories endpoint', async () => {
    const fetchMock = respondWith(200);

    await updateCategory(ID, { name: 'Subscriptions' });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/api/categories/${ID}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200);

    await updateCategory(ID, { name: 'Subscriptions' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('sends the body it was handed, verbatim', async () => {
    // The diff belongs to `categoryForm.ts`; this function must not add to it or take from it, or
    // a field the user never touched would be rewritten on every save.
    const fetchMock = respondWith(200);

    await updateCategory(ID, { monthlyCap: 250 });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ monthlyCap: 250 });
  });

  it('sends a null cap through rather than dropping it', async () => {
    // `null` is how a capped category becomes uncapped, and `JSON.stringify` keeps it where it
    // drops an `undefined` - so this is the one body value whose survival is worth an assertion.
    const fetchMock = respondWith(200);

    await updateCategory(ID, { monthlyCap: null });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ monthlyCap: null });
  });

  it('encodes the id into the path', async () => {
    // The id reaches this function from a browser, so it goes through `encodeURIComponent` rather
    // than straight into a template. A uuid needs no encoding, which is exactly why this is worth
    // an assertion: nothing in the happy path would ever notice its removal.
    const fetchMock = respondWith(404);

    await updateCategory('../profile', { name: 'x' });

    expect(fetchMock.mock.calls[0]![0]).toBe('http://backend.test/api/categories/..%2Fprofile');
  });

  it('takes an id and a body and nothing else', async () => {
    // No token and no user id, which is what makes publishing this as an action safe: the
    // credential comes off the httpOnly cookie inside the helper, and the backend scopes the
    // lookup to that session's own database.
    expect(updateCategory).toHaveLength(2);
  });
});

describe('success', () => {
  it('reports ok on the 200 the endpoint answers', async () => {
    respondWith(200);

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({ ok: true });
  });

  it('does not read the response body', async () => {
    // A 2xx means the change landed, so nothing may turn a saved row into a reported failure -
    // the rule `authorizedPatch` states from the other side. A body that will not parse is the
    // case that would break it.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({ ok: true });
  });
});

describe('the five failures', () => {
  it('maps 400 to invalid, whose copy must not say "try again"', async () => {
    // Reachable through every bound `categoryForm.ts` does not mirror, through a colour or icon
    // outside the allowlist, and through a malformed id. A body the DTO rejects is rejected
    // again forever, so the advice has to be "check the values".
    respondWith(400);

    await expect(updateCategory(ID, { name: 'x'.repeat(61) })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps 404 to missing, and it can only mean the category', async () => {
    // Unlike the transaction patch, this body references no second resource by id - so there is
    // no ambiguous reading to hedge and the copy can name the category plainly.
    respondWith(404);

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('maps 409 to fallback, which is the refused rename of Uncategorized', async () => {
    // The backend fixes that row's name while leaving its cap, colour, icon and note editable.
    // `CategoryCard` renders no kebab and no banner on it, so the UI cannot open this modal for
    // it at all - and it is classified anyway, because a hidden control is not an enforcement
    // and "please try again" would be advice that loops forever.
    respondWith(409);

    await expect(updateCategory(ID, { name: 'Everything else' })).resolves.toEqual({
      ok: false,
      reason: 'fallback',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(200);
    store(undefined);

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('the contract with the modal', () => {
  it('never throws, so no failure reaches the client as an opaque digest', async () => {
    for (const arrange of [
      () => respondWith(400),
      () => respondWith(404),
      () => respondWith(409),
      () => respondWith(500),
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ]) {
      arrange();
      await expect(updateCategory(ID, { name: 'Subscriptions' })).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the six documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const status of [200, 400, 401, 404, 409, 500]) {
      respondWith(status);
      const result = await updateCategory(ID, { name: 'Subscriptions' });
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual([
      'failed',
      'fallback',
      'invalid',
      'missing',
      'ok',
      'unauthenticated',
    ]);
  });
});
