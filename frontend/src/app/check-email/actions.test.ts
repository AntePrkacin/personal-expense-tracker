import { readPendingEmail } from '../../lib/pendingEmail';

import { resendLoginLink } from './actions';

// What this action does that the login one does not: it reads the address instead of
// being handed one. The request mechanics are lib/backend.test.ts's.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias from any
// directory - see the note in frontend/src/app/CLAUDE.md - and the import above names
// the same one. Mocked rather than exercised because `cookies()` has no request scope
// under Jest.
jest.mock('../../lib/pendingEmail', () => ({ readPendingEmail: jest.fn() }));

const ADDRESS = 'marko@email.com';

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function respondWith(status: number) {
  const fetchMock = jest.fn().mockResolvedValue({ status });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BACKEND_URL = 'http://backend.test';
  (readPendingEmail as jest.Mock).mockResolvedValue(ADDRESS);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('resendLoginLink', () => {
  it('takes no argument, so it cannot be aimed at another address', async () => {
    // The defense this shape exists for: a Server Action is reachable by anyone who
    // finds it, so an `email` parameter would publish a link-sender for arbitrary
    // addresses pointed at the project's own mail credentials. Pinned on the function's
    // arity, which is the only place that guarantee lives.
    expect(resendLoginLink).toHaveLength(0);
  });

  it('sends to the stashed address', async () => {
    const fetchMock = respondWith(202);

    await resendLoginLink();

    expect(readPendingEmail).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/login-link');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: ADDRESS });
  });

  it('reports success on 202', async () => {
    respondWith(202);

    expect(await resendLoginLink()).toEqual({ ok: true });
  });

  it('surfaces a 429 with its status, so the screen can say "wait"', async () => {
    // The one status the screen branches on. A36 designs no cooldown, so this is the
    // reachable failure rather than an exotic one.
    respondWith(429);

    expect(await resendLoginLink()).toEqual({ ok: false, status: 429 });
  });

  it('reports a failure with no status when the backend is unreachable', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await resendLoginLink()).toEqual({ ok: false });
  });

  describe('with no address stashed', () => {
    it('requests nothing', async () => {
      // Unreachable from the rendered screen, which shows "Log in again" instead of this
      // control when there is no address - but the action is reachable on its own, and a
      // POST with an undefined email would be a guaranteed 400 for no reason.
      (readPendingEmail as jest.Mock).mockResolvedValue(null);
      const fetchMock = respondWith(202);

      await resendLoginLink();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a plain failure', async () => {
      (readPendingEmail as jest.Mock).mockResolvedValue(null);
      respondWith(202);

      expect(await resendLoginLink()).toEqual({ ok: false });
    });
  });
});
