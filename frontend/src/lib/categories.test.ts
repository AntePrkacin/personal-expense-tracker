import { cookies } from 'next/headers';

import { readCategoryLabels, readCategoryOptions } from './categories';

// Exercised through the real `authorizedGet` rather than by mocking it, which is
// `transactions.test.ts`'s call and the reason these assertions are worth anything: the
// bearer header, the `no-store` and the 401 classification are the behaviour this module
// inherits, and a mocked helper would assert only that the mock was called.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

// Deliberately no `next/navigation` mock. This module must never redirect - it is read by
// a route handler answering the modal's fetch, where a redirect would return an HTML
// login page with a 200 on it. If a `redirect()` is ever added, the real one throws
// outside a request scope and these tests fail loudly rather than passing quietly.

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** A full CategoryResponseDto, so the narrowing has something to actually drop. */
const GROCERIES = {
  id: '0198c2a1-0000-7000-8000-0000000000a1',
  name: 'Groceries',
  color: '#57b368',
  icon: null,
  note: null,
  isFallback: false,
  monthlyCap: 600,
  spent: 106.5,
  transactionCount: 2,
  percentUsed: 17.75,
  remaining: 493.5,
  over: null,
  status: 'on_track',
};

const UNCATEGORIZED = {
  ...GROCERIES,
  id: '0198c2a1-0000-7000-8000-0000000000ff',
  name: 'Uncategorized',
  color: '#98a0ae',
  isFallback: true,
  monthlyCap: null,
  spent: 0,
  transactionCount: 0,
  percentUsed: null,
  remaining: null,
  status: 'uncapped',
};

const ALLOCATION = { monthlyBudget: 2000, allocated: 600, unallocated: 1400 };

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown) {
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
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('the request', () => {
  it('GETs the category list with the session as a bearer token and no store', async () => {
    const fetchMock = respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    await readCategoryOptions();

    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/api/categories', {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
  });

  it('never forwards the session as a cookie', async () => {
    // The backend reads no cookies at all; the value moves into the header server-side.
    const fetchMock = respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    await readCategoryOptions();

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.stringify(init.headers)).not.toContain('spendifico.session');
    expect(init).not.toHaveProperty('credentials');
  });

  it('costs no round trip when there is no cookie', async () => {
    const fetchMock = respondWith(200, { categories: [], allocation: ALLOCATION });
    store(undefined);

    await expect(readCategoryOptions()).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the narrowing', () => {
  it('keeps only the id and the name', async () => {
    respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    const result = await readCategoryOptions();

    expect(result).toEqual({
      ok: true,
      data: [{ id: GROCERIES.id, name: 'Groceries' }],
    });
  });

  // The point of the module. Every one of these would otherwise cross into the browser
  // bundle so a <select> could render two strings.
  it('drops the month stats, the cap, the colour and the fallback flag', async () => {
    respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    const result = await readCategoryOptions();
    const option = (result as { ok: true; data: unknown[] }).data[0]!;

    expect(Object.keys(option as object).sort()).toEqual(['id', 'name']);
    for (const dropped of [
      'color',
      'icon',
      'note',
      'isFallback',
      'monthlyCap',
      'spent',
      'transactionCount',
      'percentUsed',
      'remaining',
      'over',
      'status',
    ]) {
      expect(option).not.toHaveProperty(dropped);
    }
  });

  it('drops the allocation block entirely', async () => {
    respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    expect(JSON.stringify(await readCategoryOptions())).not.toContain('monthlyBudget');
  });

  it('preserves the backend’s order rather than re-sorting', async () => {
    // The contract documents the list as ordered by name, so sorting again here would be
    // a second authority - and a locale-aware sort would disagree with SQLite's byte
    // order on exactly the names with diacritics. Given out of order deliberately.
    respondWith(200, {
      categories: [UNCATEGORIZED, GROCERIES],
      allocation: ALLOCATION,
    });

    const result = await readCategoryOptions();

    expect((result as { ok: true; data: CategoryOptionShape[] }).data.map((c) => c.name)).toEqual([
      'Uncategorized',
      'Groceries',
    ]);
  });

  it('passes an empty list straight through', async () => {
    // Not reachable today - provisioning seeds the fallback category - but the select has
    // to render something rather than crash if it ever is.
    respondWith(200, { categories: [], allocation: ALLOCATION });

    await expect(readCategoryOptions()).resolves.toEqual({ ok: true, data: [] });
  });
});

describe('readCategoryLabels, the table’s projection', () => {
  it('keeps the colour, which is the only reason it exists', async () => {
    respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    await expect(readCategoryLabels()).resolves.toEqual({
      ok: true,
      data: [{ id: GROCERIES.id, name: 'Groceries', color: '#57b368' }],
    });
  });

  it('still drops everything the table does not draw', async () => {
    // Widened by three fields, not opened up: the month stats and the cap belong to the
    // Categories screen, and a row shows neither.
    respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    const result = await readCategoryLabels();
    const label = (result as { ok: true; data: unknown[] }).data[0]!;

    expect(Object.keys(label as object).sort()).toEqual(['color', 'id', 'name']);
    expect(JSON.stringify(result)).not.toContain('monthlyBudget');
  });

  it('preserves the backend’s order', async () => {
    respondWith(200, { categories: [UNCATEGORIZED, GROCERIES], allocation: ALLOCATION });

    const result = await readCategoryLabels();

    expect(
      (result as { ok: true; data: { name: string }[] }).data.map((category) => category.name),
    ).toEqual(['Uncategorized', 'Groceries']);
  });

  it('shares one request with readCategoryOptions', async () => {
    // The property the module comment claims: exactly one `authorizedGet('/api/categories')`
    // exists in the app, and the two exports differ only in what survives.
    const fetchMock = respondWith(200, { categories: [GROCERIES], allocation: ALLOCATION });

    await readCategoryLabels();

    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/api/categories', {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [500, 'unavailable'],
  ])('passes a %d through as %s rather than redirecting', async (status, reason) => {
    // The failure stays data here even though this projection's only caller redirects.
    // The policy lives at the call site, because the other caller is a route handler that
    // must never be handed an HTML login page with a 200 on it.
    respondWith(status, {});

    await expect(readCategoryLabels()).resolves.toEqual({ ok: false, reason });
  });
});

describe('the failure classification, inherited from authorizedGet', () => {
  it('reports a 401 as unauthenticated', async () => {
    respondWith(401, {});

    await expect(readCategoryOptions()).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it.each([403, 500, 502, 503])('reports a %d as unavailable', async (status) => {
    respondWith(status, {});

    await expect(readCategoryOptions()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('inherits PET-34\'s "missing" for a 404, which changes nothing for this caller', async () => {
    // 404 was in the sweep above until `authorizedGet` grew a third arm for the transaction
    // detail read. `GET /api/categories` cannot answer one - there is no id in the path - so
    // this pins the inheritance rather than a reachable state, and the one consumer that
    // branches on it, `app/api/categories/route.ts`, answers 503 for anything but a 401
    // either way.
    respondWith(404, {});

    await expect(readCategoryOptions()).resolves.toEqual({ ok: false, reason: 'missing' });
  });

  it('reports an unreachable backend as unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(readCategoryOptions()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a body that will not parse as unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }) as unknown as typeof fetch;

    await expect(readCategoryOptions()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never throws, whatever the backend does', async () => {
    // The modal has to render a message rather than take the page down, so every arm of
    // this module resolves.
    respondWith(500, {});

    await expect(readCategoryOptions()).resolves.toHaveProperty('ok', false);
  });
});

/** Local alias so the order assertion above can name its shape without importing a type. */
type CategoryOptionShape = { id: string; name: string };
