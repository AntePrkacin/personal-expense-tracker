import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { readTransactionDetail } from './transactionDetail';

// The four-way failure policy, which is this module's whole reason for existing separately
// from `lib/transactions.ts`: it is the only read in the app that can legitimately answer
// "that thing is not there" rather than "I could not ask".
//
// Both navigation functions are mocked as **throwing**, matching `transactions.test.ts` and
// `profile.test.ts`. Their real signatures return `never`, so a mock returning undefined would
// let execution fall through and test the opposite of what each case claims - here that would
// mean `notFound()` being followed by the throw below, and the suite passing on the wrong one.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';
const ID = '0198c2a1-0000-7000-8000-000000000001';

const DETAIL = {
  transaction: {
    id: ID,
    merchant: 'Whole Foods',
    categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
    amount: 62.4,
    date: '2025-10-08',
    note: null,
    createdAt: '2025-10-08T09:00:00.000Z',
    updatedAt: '2025-10-08T09:00:00.000Z',
  },
  category: {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: '#22C55E',
    icon: null,
    note: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 3,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
  },
  recentInCategory: [],
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = DETAIL) {
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

describe('when the transaction is there', () => {
  it('returns all three parts of the response untouched', async () => {
    respondWith(200);

    expect(await readTransactionDetail(ID)).toEqual(DETAIL);
  });

  it('reads the id from the path, and costs exactly one request', async () => {
    // The screen draws three cards' worth of data and pays for one read, which is the whole
    // argument for not calling `lib/categories.ts` alongside it.
    const fetchMock = respondWith(200);

    await readTransactionDetail(ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`http://backend.test/api/transactions/${ID}`);
  });

  it('encodes an id that would otherwise change the path', async () => {
    // The id reaches this function straight off a dynamic segment, so it is whatever is in the
    // URL. A slash in it must not become a path segment the backend reads as a different route.
    const fetchMock = respondWith(200);

    await readTransactionDetail('../profile');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://backend.test/api/transactions/..%2Fprofile',
    );
  });
});

describe('when the read fails', () => {
  it('sends a 401 to the access flow', async () => {
    respondWith(401, {});

    await expect(readTransactionDetail(ID)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('sends a missing cookie to the access flow without asking the backend', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    await expect(readTransactionDetail(ID)).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the not-found page for a 404', async () => {
    // The arm PET-34 added to `authorizedGet`. A transaction deleted in another tab is not a
    // fault, and reporting it as one would put Next's error page over an ordinary outcome.
    respondWith(404, {});

    await expect(readTransactionDetail(ID)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['a 400 from the id not being a UUID', 400],
    ['a 500', 500],
    ['a bad gateway', 502],
  ])('throws on %s rather than claiming the transaction is gone', async (_label, status) => {
    respondWith(status, {});

    await expect(readTransactionDetail(ID)).rejects.toThrow('the backend did not answer');
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('throws on an unreachable backend', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(readTransactionDetail(ID)).rejects.toThrow('the backend did not answer');
    expect(notFound).not.toHaveBeenCalled();
  });
});
