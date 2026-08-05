import { cookies } from 'next/headers';

import { createTransaction } from './createTransaction';

// Exercised through the real `authorizedPost`, the same call `transactions.test.ts` and
// `categories.test.ts` make: mocking the helper would prove only that a mock was called,
// where the behaviour worth pinning is the status-to-reason mapping over real responses.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Deliberately no `next/navigation` mock, and its absence is an assertion. This action must
// never redirect: a `redirect()` inside an action throws, so `await create(body)` would
// never resolve and the modal would sit disabled forever with everything typed discarded.
// The real `redirect` would blow up here, so adding one fails this suite loudly.

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** What `toCreateTransactionBody` produces for frame 09's own mock values. */
const BODY = {
  amount: 24,
  date: '2025-10-08',
  merchant: 'Whole Foods',
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  note: 'Weekly groceries',
};

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
  it('POSTs the body to the transactions endpoint', async () => {
    const fetchMock = respondWith(201);

    await createTransaction(BODY);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/transactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(BODY),
      }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(201);

    await createTransaction(BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('takes no token and no user id of its own', async () => {
    // The reason publishing this as an action is safe: the credential comes off the
    // httpOnly cookie inside the helper, so a caller can only write to their own account.
    expect(createTransaction).toHaveLength(1);
  });
});

describe('success', () => {
  it('reports ok on a 201', async () => {
    respondWith(201);

    await expect(createTransaction(BODY)).resolves.toEqual({ ok: true });
  });

  it('reports ok without needing to read the created row', async () => {
    // A 201 whose body will not parse still means the transaction exists. Reporting a
    // failure would send the user to create a second one.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;

    await expect(createTransaction(BODY)).resolves.toEqual({ ok: true });
  });
});

describe('the four failures', () => {
  it('maps 400 to invalid, whose copy must not say "try again"', async () => {
    // Reachable through the bounds transactionForm.ts deliberately does not mirror: a
    // merchant over 200 characters, a note over 500, an amount over @Max(1_000_000_000).
    // Retrying an unacceptable body loops forever, so the message says check the values.
    respondWith(400);

    await expect(createTransaction(BODY)).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('maps 404 to categoryMissing, the one recoverable failure', async () => {
    // The categoryId names no category of theirs - a category deleted in another tab while
    // the modal sat open. The user picks another one.
    respondWith(404);

    await expect(createTransaction(BODY)).resolves.toEqual({
      ok: false,
      reason: 'categoryMissing',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(createTransaction(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too', async () => {
    const fetchMock = respondWith(201);
    store(undefined);

    await expect(createTransaction(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 409, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(createTransaction(BODY)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(createTransaction(BODY)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('the contract with the modal', () => {
  it('never throws, so no failure reaches the client as an opaque digest', async () => {
    // The rule lib/backend.ts states: an unhandled rejection inside a Server Action arrives
    // with nothing a screen can render.
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
      await expect(createTransaction(BODY)).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the five documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const status of [201, 400, 401, 404, 500]) {
      respondWith(status);
      const result = await createTransaction(BODY);
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual([
      'categoryMissing',
      'failed',
      'invalid',
      'ok',
      'unauthenticated',
    ]);
  });
});
