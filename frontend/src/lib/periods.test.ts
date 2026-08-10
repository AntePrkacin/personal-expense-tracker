import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { currentPeriod, readPeriods, type PeriodsView } from './periods';

// The period select's data source, plus `currentPeriod`. The three `?period=` functions moved to
// `periodParams.test.ts` with the module they belong to - see `lib/periodParams.ts` for why the URL
// half cannot live beside a read that touches `next/headers`.
//
// One read, no probe: `GET /api/periods` takes no filters, so there is no ambiguous-empty case for
// a second request to resolve - `lib/dashboard.ts`'s shape exactly.
//
// Package specifiers, the one case where `jest.mock` needs no relative-path dance. `redirect` is
// mocked as **throwing**, matching every sibling suite: the real one is typed `never`, so a mock
// returning undefined would let execution fall through past the redirect and test the opposite of
// what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const CURRENT = {
  start: '2025-10-01',
  end: '2025-11-01',
  label: 'October 2025',
  current: true,
};

const PREVIOUS = {
  start: '2025-09-01',
  end: '2025-10-01',
  label: 'September 2025',
  current: false,
};

const VIEW: PeriodsView = { periods: [CURRENT, PREVIOUS] };

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = VIEW) {
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

describe('reading the periods', () => {
  it('reads the guarded endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(200);

    await readPeriods();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/periods');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never caches, so a schedule change shows its new periods immediately', async () => {
    // The one write that changes this list is `POST /api/profile/schedule`, and the form that sends
    // it calls `router.refresh()` - which re-runs this read and would otherwise be handed the list
    // from before the change.
    const fetchMock = respondWith(200);

    await readPeriods();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('returns the list as the backend ordered it', async () => {
    // Newest first is the contract's own guarantee and the order the select draws, so re-sorting
    // here would be a second authority on one question.
    expect(await readPeriods()).toEqual(VIEW);
  });

  it('costs exactly one request', async () => {
    const fetchMock = respondWith(200);

    await readPeriods();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when the caller is not signed in', () => {
  it('sends a request with no cookie straight to Log in, asking nothing', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    await expect(readPeriods()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a 401 to Log in', async () => {
    respondWith(401, {});

    await expect(readPeriods()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('when the backend could not answer', () => {
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
  ])('throws on %s rather than degrading to an empty list', async (_label, arrange) => {
    // **The opposite of `lib/categoryTemplates.ts`'s policy, and the contrast is the point.** That
    // read backs a selection on a step whose Continue is unconditional, so losing it costs the user
    // their starter categories rather than the flow. This one backs the control that says which
    // period every figure on the screen belongs to: an empty list would render a header naming no
    // period over figures that are all scoped to one.
    arrange();

    await expect(readPeriods()).rejects.toThrow(/Could not load your budgeting periods/);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('currentPeriod', () => {
  it('finds the one period flagged as containing today', () => {
    expect(currentPeriod({ periods: [PREVIOUS, CURRENT] })).toBe(CURRENT);
  });

  it('reads the flag rather than the index, so the two cannot disagree', () => {
    // The contract documents index 0 as the current one *and* flags it per row. Two statements of
    // one fact, and the flag is the one that cannot be wrong if the ordering ever changes.
    expect(currentPeriod({ periods: [PREVIOUS, CURRENT] })?.label).toBe('October 2025');
  });

  it('falls back to the newest when nothing is flagged', () => {
    // Unreachable through the API - exactly one period contains today - and a fallback rather than a
    // throw because the caller is naming a header.
    expect(currentPeriod({ periods: [PREVIOUS] })).toBe(PREVIOUS);
  });

  it('answers undefined for an empty list', () => {
    expect(currentPeriod({ periods: [] })).toBeUndefined();
  });
});
