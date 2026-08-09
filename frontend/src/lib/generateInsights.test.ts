import { cookies } from 'next/headers';

import { generateInsights } from './generateInsights';

// Exercised through the real `authorizedPost`, the same call `createTransaction.test.ts` makes:
// mocking the helper would prove only that a mock was called, where the behaviour worth pinning
// is the status-to-reason mapping over real responses - and one of those mappings inverts.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Deliberately no `next/navigation` mock, and its absence is an assertion. This action must
// never redirect: a `redirect()` inside an action throws, so `await generateInsights()` would
// never resolve and the button would sit disabled forever. The real `redirect` would blow up
// here, so adding one fails this suite loudly.

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
  respondWith(202);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('starting a run', () => {
  it('POSTs the generate endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(202);

    await generateInsights();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/insights/generate');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends no user id and no token of its own, so a caller can only reach their own account', async () => {
    const fetchMock = respondWith(202);

    await generateInsights();

    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('treats the 202 as success, because the run is floated and there is nothing to read', async () => {
    respondWith(202);

    await expect(generateInsights()).resolves.toEqual({ ok: true });
  });
});

describe('a run that is already in flight', () => {
  it('reports a 409 as success, because that is what the button asked for', async () => {
    // The single-run guard answers 409 when another tab, or a transaction the user just saved,
    // already started a run. The page's next move is the same either way - poll until the state
    // settles - so surfacing it as an error would put a failure message over a page about to
    // show fresh content. A26 designs no error state at all.
    respondWith(409);

    await expect(generateInsights()).resolves.toEqual({ ok: true });
  });
});

describe('when it could not start one', () => {
  it('reports a dead session without redirecting', async () => {
    respondWith(401);

    await expect(generateInsights()).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('reports every other status as failed', async () => {
    respondWith(500);

    await expect(generateInsights()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a request that never completed as failed too', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(generateInsights()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('never throws, so a rejection cannot reach the client as an opaque digest', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    await expect(generateInsights()).resolves.toMatchObject({ ok: false });
  });
});
