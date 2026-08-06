import { cookies } from 'next/headers';

import { deleteTransaction } from './deleteTransaction';

// Exercised through the real `authorizedDelete`, the call `createTransaction.test.ts` makes and
// for its reason: mocking the helper would prove only that a mock was called, where the
// behaviour worth pinning is the status-to-reason mapping over real responses.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Deliberately no `next/navigation` mock, and its absence is an assertion - the same one
// `createTransaction.test.ts` makes. This action must never redirect: a `redirect()` inside an
// action throws, so the dialog's `await` would never resolve and its Delete button would stay
// disabled forever. The real `redirect` would blow up here, so adding one fails this suite.

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** Frame 12's own target row, the "Whole Foods - $62.40" the dialog's copy quotes. */
const ID = '0198c2a1-0000-7000-8000-0000000000b1';

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
  it('DELETEs the id under the transactions endpoint', async () => {
    const fetchMock = respondWith(204);

    await deleteTransaction(ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/api/transactions/${ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(204);

    await deleteTransaction(ID);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('encodes the id into the path', async () => {
    // The id reaches this function from a browser, so it goes through `encodeURIComponent`
    // rather than straight into a template. A uuid needs no encoding, which is exactly why
    // this is worth an assertion: nothing in the happy path would ever notice its removal.
    const fetchMock = respondWith(404);

    await deleteTransaction('../profile');

    expect(fetchMock.mock.calls[0]![0]).toBe('http://backend.test/api/transactions/..%2Fprofile');
  });

  it('takes an id and nothing else', async () => {
    // No token and no user id, which is what makes publishing this as an action safe: the
    // credential comes off the httpOnly cookie inside the helper, and the backend scopes the
    // lookup to that session's own database.
    expect(deleteTransaction).toHaveLength(1);
  });

  it('sends no body', async () => {
    const fetchMock = respondWith(204);

    await deleteTransaction(ID);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});

describe('success', () => {
  it('reports ok on the 204 the endpoint answers', async () => {
    respondWith(204);

    await expect(deleteTransaction(ID)).resolves.toEqual({ ok: true });
  });
});

describe('the three failures', () => {
  it('maps 404 to missing, whose copy says the row is already gone', async () => {
    // Reached by deleting the same row from two tabs, or by deleting one a `router.refresh()`
    // has not caught up with. The user's next move is nothing at all, which is why this is
    // not folded into `failed` and its "try again".
    respondWith(404);

    await expect(deleteTransaction(ID)).resolves.toEqual({ ok: false, reason: 'missing' });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(deleteTransaction(ID)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(204);
    store(undefined);

    await expect(deleteTransaction(ID)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 400 to failed rather than giving it a reason of its own', async () => {
    // The deliberate difference from `createTransaction`, which has a fourth reason. A 400
    // here can only mean the id is not a uuid, and there is nothing the person holding the
    // dialog can do about that - so it folds in, exactly as a malformed verify token folds
    // in with a dead link.
    respondWith(400);

    await expect(deleteTransaction(ID)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it.each([403, 409, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(deleteTransaction(ID)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(deleteTransaction(ID)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('the contract with the dialog', () => {
  it('never throws, so no failure reaches the client as an opaque digest', async () => {
    for (const arrange of [
      () => respondWith(400),
      () => respondWith(500),
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ]) {
      arrange();
      await expect(deleteTransaction(ID)).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the four documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const status of [204, 400, 401, 404]) {
      respondWith(status);
      const result = await deleteTransaction(ID);
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual(['failed', 'missing', 'ok', 'unauthenticated']);
  });
});
