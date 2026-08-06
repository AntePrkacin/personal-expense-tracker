import { cookies } from 'next/headers';

import { updateTransaction } from './updateTransaction';

// Exercised through the real `authorizedPatch`, the call both other write suites make and for
// their reason: mocking the helper would prove only that a mock was called, where the behaviour
// worth pinning is the status-to-reason mapping over real responses.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Deliberately no `next/navigation` mock, and its absence is an assertion - the same one
// `createTransaction.test.ts` and `deleteTransaction.test.ts` make. This action must never
// redirect: a `redirect()` inside an action throws, so the modal's `await` would never resolve
// and Save changes would stay disabled forever with every edit still in the form. The real
// `redirect` would blow up here, so adding one fails this suite.

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** Frame 11's own row, the "Whole Foods - $24.00" the modal opens prefilled with. */
const ID = '0198c2a1-0000-7000-8000-0000000000b1';

const CATEGORY_ID = '0198c2a1-0000-7000-8000-0000000000a1';

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
  it('PATCHes the id under the transactions endpoint', async () => {
    const fetchMock = respondWith(200);

    await updateTransaction(ID, { amount: 31.5 });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/api/transactions/${ID}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200);

    await updateTransaction(ID, { amount: 31.5 });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('encodes the id into the path', async () => {
    // The id reaches this function from a browser, so it goes through `encodeURIComponent`
    // rather than straight into a template. A uuid needs no encoding, which is exactly why
    // this is worth an assertion: nothing in the happy path would ever notice its removal.
    const fetchMock = respondWith(404);

    await updateTransaction('../profile', { amount: 31.5 });

    expect(fetchMock.mock.calls[0]![0]).toBe('http://backend.test/api/transactions/..%2Fprofile');
  });

  it('takes an id and a body, and no token or user id', async () => {
    // What makes publishing this as an action safe: the credential comes off the httpOnly
    // cookie inside the helper, and the backend scopes the update to that session's own
    // database, so an id belonging to somebody else is a 404 rather than their row.
    expect(updateTransaction).toHaveLength(2);
  });

  it('sends the partial body verbatim, adding nothing', async () => {
    // The endpoint's contract: an absent key leaves that field alone. A body decorated with
    // the four fields it was not given would rewrite values the user never touched, and
    // forbidNonWhitelisted makes an unknown key a 400 on top of that.
    const fetchMock = respondWith(200);

    await updateTransaction(ID, { merchant: 'Trader Joe' });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ merchant: 'Trader Joe' });
  });

  it('sends a null note through, because null is how a note is cleared', async () => {
    const fetchMock = respondWith(200);

    await updateTransaction(ID, { note: null });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ note: null });
  });
});

describe('success', () => {
  it('reports ok on the 200 the endpoint answers', async () => {
    respondWith(200);

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({ ok: true });
  });

  it('does not read the updated row it is answered with', async () => {
    // `authorizedPatch` was offered the returned `TransactionResponseDto` and declines it: the
    // modal closes and calls `router.refresh()`, so a parsed row would have no reader - and a
    // 2xx whose body will not parse still means the edit landed.
    const json = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json }) as unknown as typeof fetch;

    await updateTransaction(ID, { amount: 31.5 });

    expect(json).not.toHaveBeenCalled();
  });
});

describe('the five failures', () => {
  it('maps 400 to invalid, whose copy says to check the values', async () => {
    // Reachable through the bounds `transactionForm.ts` deliberately does not mirror - a
    // merchant over 200 characters, a note over 500, an amount over @Max - and its copy must
    // not say "try again", which for a body the DTO rejects loops forever.
    respondWith(400);

    await expect(updateTransaction(ID, { amount: 2_000_000_000 })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps a malformed id to invalid too rather than a reason of its own', async () => {
    // ParseUUIDPipe answers 400 for an id that is not a uuid. Folded in with a rejected value
    // for `deleteTransaction`'s reason: there is nothing the person holding the modal can do
    // about a bad id, and the rejected-value copy is the more useful of the two.
    respondWith(400);

    await expect(updateTransaction('not-a-uuid', { amount: 31.5 })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps 404 to transactionMissing when the body carries no categoryId', async () => {
    // The common case, and the whole reason the 404 is split: nothing in this frontend can
    // delete a category yet, while deleting a transaction is a button on every row. So a patch
    // that did not touch the category can only have failed on the row itself, and the copy
    // says so plainly instead of hedging.
    respondWith(404);

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({
      ok: false,
      reason: 'transactionMissing',
    });
  });

  it('maps 404 to transactionOrCategoryMissing when the body carries a categoryId', async () => {
    // The backend answers the same status for `Transaction not found.` and `Category not
    // found.`, so once a category is in play the two are genuinely indistinguishable without
    // matching its error prose - which nothing pins across the two apps. The copy names both.
    respondWith(404);

    await expect(updateTransaction(ID, { categoryId: CATEGORY_ID })).resolves.toEqual({
      ok: false,
      reason: 'transactionOrCategoryMissing',
    });
  });

  it('splits on the key being present, not on it being truthy', async () => {
    // `'categoryId' in body` rather than a truthiness test, because an empty string is a
    // categoryId the DTO will reject and still one the 404 could be about. It cannot arrive
    // from the modal, whose predicates reject it first, so this is defence in depth.
    respondWith(404);

    await expect(updateTransaction(ID, { categoryId: '' })).resolves.toEqual({
      ok: false,
      reason: 'transactionOrCategoryMissing',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(200);
    store(undefined);

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 409, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toEqual({
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
      () => respondWith(500),
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ]) {
      arrange();
      await expect(updateTransaction(ID, { amount: 31.5 })).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the six documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const [status, body] of [
      [200, { amount: 31.5 }],
      [400, { amount: 31.5 }],
      [401, { amount: 31.5 }],
      [404, { amount: 31.5 }],
      [404, { categoryId: CATEGORY_ID }],
      [500, { amount: 31.5 }],
    ] as const) {
      respondWith(status);
      const result = await updateTransaction(ID, body);
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual([
      'failed',
      'invalid',
      'ok',
      'transactionMissing',
      'transactionOrCategoryMissing',
      'unauthenticated',
    ]);
  });
});
