import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireProfile } from './profile';

// The app's first read of real data, and the `(app)` shell's gate - one call doing both.
// Package specifiers, which is the one case where `jest.mock` needs no relative-path
// dance.
//
// `redirect` is mocked as **throwing**, because the real one is typed `never` and throws
// NEXT_REDIRECT. A mock returning undefined would let execution fall through past the
// gate and test the opposite of what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

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

describe('reading the profile', () => {
  it('reads the guarded endpoint with the session as a bearer', async () => {
    const fetchMock = respondWith(200);

    await requireProfile();

    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/profile');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('never caches, so a Settings save is not hidden by a stale footer', async () => {
    const fetchMock = respondWith(200);

    await requireProfile();

    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('answers the three fields the sidebar footer needs', async () => {
    // The read that replaced PLACEHOLDER_PROFILE. The names live in the per-user database
    // and the email on the central users row; this endpoint stitches them, which is why
    // the session read alone could never have fixed the footer.
    expect(await requireProfile()).toMatchObject({
      firstName: 'Marko',
      lastName: 'Kovač',
      email: 'marko@email.com',
    });
  });

  it('gates and reads in one request', async () => {
    // The point of folding the two together: a second call restating the first's
    // conclusion is what made a loop possible.
    const fetchMock = respondWith(200);

    await requireProfile();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when the caller is not signed in', () => {
  it('sends a request with no cookie straight to Log in, asking nothing', async () => {
    store(undefined);
    const fetchMock = respondWith(200);

    await expect(requireProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a 401 to Log in (AC5)', async () => {
    // The guard answers 401 and nothing else for a dead bearer, so this is the one status
    // that really does mean signed out.
    respondWith(401, { statusCode: 401 });

    await expect(requireProfile()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('when the backend could not answer', () => {
  // The distinction this module exists to make. Redirecting these to /login produced an
  // infinite loop: /login sends a signed-in visitor to /dashboard, whose layout bounced
  // straight back here. Throwing terminates, and a reload retries it.

  it.each([
    ['the broken-invariant 500', () => respondWith(500, { statusCode: 500 })],
    ['a bad gateway', () => respondWith(502, {})],
    [
      'an unreachable backend',
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ],
    [
      'a body that will not parse',
      () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        }) as unknown as typeof fetch;
      },
    ],
  ])('throws on %s rather than redirecting', async (_label, arrange) => {
    arrange();

    await expect(requireProfile()).rejects.toThrow(/Could not load the profile/);
  });

  it('never sends an unavailable backend to Log in, because that is the loop', async () => {
    // The regression this file's whole shape exists to prevent. If this assertion ever
    // fails, /dashboard and /login are bouncing off each other and the app is unreachable.
    respondWith(500, {});

    await expect(requireProfile()).rejects.toThrow(/Could not load the profile/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
