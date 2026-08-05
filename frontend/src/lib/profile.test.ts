import { cookies } from 'next/headers';

import { readProfile } from './profile';

// The app's first read of real data, so this suite is also the first to pin that a
// response shape survives the trip. A package specifier, which is the one case where
// `jest.mock` needs no relative-path dance.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const PROFILE = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown = PROFILE) {
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

describe('readProfile', () => {
  it('reads the guarded endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(200);

    await readProfile();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/profile');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never caches, so a Settings save is not hidden by a stale footer', async () => {
    const fetchMock = respondWith(200);

    await readProfile();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('answers the three fields the sidebar footer needs', async () => {
    // The read that replaces PLACEHOLDER_PROFILE. The names live in the per-user
    // database and the email on the central users row; this endpoint stitches them,
    // which is why the session read alone could never have fixed the footer.
    const profile = await readProfile();

    expect(profile).toMatchObject({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
    });
  });

  it('requests nothing without a cookie', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    expect(await readProfile()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is null for a 401', async () => {
    respondWith(401, { statusCode: 401 });

    expect(await readProfile()).toBeNull();
  });

  it('is null for the 500 a missing profile row answers', async () => {
    // The backend calls that a broken invariant rather than a 404, because verification
    // inserts the row before it clears the onboarding payload. Null either way here;
    // the caller redirects rather than rendering a sidebar with holes in it.
    respondWith(500, { statusCode: 500 });

    expect(await readProfile()).toBeNull();
  });

  it('is null when the backend is unreachable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    expect(await readProfile()).toBeNull();
  });
});
