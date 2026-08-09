import { cookies } from 'next/headers';

import { scanReceipt } from './scanReceipt';

// Exercised through the real `authorizedPostFormData`, the same call `createTransaction.test.ts`
// makes about `authorizedPost`: mocking the helper would prove only that a mock was called,
// where the behaviour worth pinning is the status-to-reason mapping and the amount conversion
// over real responses.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function formData() {
  const data = new FormData();
  data.append('files', new File(['x'], 'receipt.png', { type: 'image/png' }));
  return data;
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
  it('POSTs the FormData body to the scan endpoint, with no Content-Type of its own', async () => {
    const fetchMock = respondWith(200, {
      merchant: null,
      amount: null,
      date: null,
      categoryId: null,
      note: null,
      missing: [],
    });
    const body = formData();

    await scanReceipt(body);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/api/transactions/scan', init);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    // No Content-Type set by hand: fetch derives the multipart boundary itself, which this
    // function could not compute and set correctly on its own.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200, {
      merchant: null,
      amount: null,
      date: null,
      categoryId: null,
      note: null,
      missing: [],
    });

    await scanReceipt(formData());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('maps a missing cookie to unauthenticated without ever sending a request', async () => {
    const fetchMock = respondWith(200, {});
    store(undefined);

    await expect(scanReceipt(formData())).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the amount conversion', () => {
  it('normalizes amount through formatAmountInput(amount.toFixed(2)), the same call toTransactionFormValues makes', async () => {
    respondWith(200, {
      merchant: 'Konzum',
      amount: 1240.5,
      date: '2026-08-03',
      categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
      note: null,
      missing: [],
    });

    const result = await scanReceipt(formData());

    expect(result).toEqual({
      ok: true,
      data: {
        merchant: 'Konzum',
        amount: '1,240.50',
        date: '2026-08-03',
        categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
        note: null,
        missing: [],
      },
    });
  });

  it('leaves a null amount null, rather than converting it to a string', async () => {
    respondWith(200, {
      merchant: null,
      amount: null,
      date: null,
      categoryId: null,
      note: null,
      missing: ['merchant', 'amount', 'date', 'categoryId'],
    });

    const result = await scanReceipt(formData());

    expect(result.ok && result.data.amount).toBeNull();
  });

  it('formats a whole-dollar amount with the cents the field always shows', async () => {
    // A `24` from the model must render as `24.00`, exactly as an edited amount does -
    // `toFixed(2)` is what supplies the cents before formatAmountInput ever sees the string.
    respondWith(200, {
      merchant: null,
      amount: 24,
      date: null,
      categoryId: null,
      note: null,
      missing: [],
    });

    const result = await scanReceipt(formData());

    expect(result.ok && result.data.amount).toBe('24.00');
  });
});

describe('the six failures', () => {
  it('maps 400 to rejected, whose copy must not say "try again"', async () => {
    respondWith(400);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'rejected' });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(scanReceipt(formData())).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps 413 to tooLarge', async () => {
    respondWith(413);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('maps 429 to rateLimited', async () => {
    respondWith(429);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'rateLimited' });
  });

  it('maps 503 to unavailable, distinct from a failed scan', async () => {
    respondWith(503);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('maps 504 to timedOut, distinct from the keyless 503', async () => {
    respondWith(504);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'timedOut' });
  });

  it.each([403, 409, 500, 502])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(scanReceipt(formData())).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('the missing array', () => {
  it('passes it through unchanged, for the modal to render its own copy from', async () => {
    respondWith(200, {
      merchant: 'Konzum',
      amount: null,
      date: null,
      categoryId: null,
      note: null,
      missing: ['amount', 'date', 'categoryId'],
    });

    const result = await scanReceipt(formData());

    expect(result.ok && result.data.missing).toEqual(['amount', 'date', 'categoryId']);
  });
});
