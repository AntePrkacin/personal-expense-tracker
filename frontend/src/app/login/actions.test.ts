import { setPendingEmail } from '../../lib/pendingEmail';

import { sendLoginLink } from './actions';

// What this action adds on top of lib/backend.ts: the endpoint it picks, the body
// shape it builds, and the cookie. The request mechanics - method, headers,
// serialization, `cache: 'no-store'` - are asserted once in lib/backend.test.ts.
//
// The mock is mandatory: without it every 202 case throws "`cookies` was called
// outside a request scope", because Jest has no request scope. A relative specifier,
// because `jest.mock` cannot resolve the `@/` alias from any directory - see the note
// in frontend/src/app/CLAUDE.md - and the import above names the same one.
jest.mock('../../lib/pendingEmail', () => ({ setPendingEmail: jest.fn() }));

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
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('sendLoginLink', () => {
  it('posts the address to the login-link endpoint', async () => {
    // Not /api/auth/register, which is the one-character-apart mistake that would
    // create an account from the log-in screen.
    const fetchMock = respondWith(202);

    await sendLoginLink(ADDRESS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/login-link');
  });

  it('sends only the address, which is all RequestLoginLinkDto carries', async () => {
    const fetchMock = respondWith(202);

    await sendLoginLink(ADDRESS);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: ADDRESS });
  });

  it('reports success on 202', async () => {
    respondWith(202);

    expect(await sendLoginLink(ADDRESS)).toEqual({ ok: true });
  });

  it.each([
    ['a validation rejection', 400],
    ['the rate limiter', 429],
    ['a server fault', 500],
  ])('reports %s with its status', async (_label, status) => {
    respondWith(status);

    expect(await sendLoginLink(ADDRESS)).toEqual({ ok: false, status });
  });

  it('reports a failure with no status when the backend is unreachable', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await sendLoginLink(ADDRESS)).toEqual({ ok: false });
  });

  it('AC4: answers an address with no account exactly as it answers a known one', async () => {
    // LOG-6 and A35. The backend creates nothing and sends nothing for an unknown
    // address and still answers 202, so this cannot tell them apart - and must not
    // try. Pinned so nobody adds a "no such account" branch, which would turn this
    // screen into an account-enumeration oracle.
    respondWith(202);

    const known = await sendLoginLink(ADDRESS);
    const unknown = await sendLoginLink('nobody@email.com');

    expect(known).toEqual(unknown);
  });

  it('does not re-validate the address, leaving the backend as the authority', async () => {
    // `@IsEmail()` on the DTO is the rule that counts, and a second one here could
    // drift from it. So a crafted call reaches the backend and comes back a 400 rather
    // than being rejected locally on a looser rule than the real one.
    const fetchMock = respondWith(400);

    const result = await sendLoginLink('not an address');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, status: 400 });
  });

  describe('the address it hands to screen 24', () => {
    it('stashes the address on a success', async () => {
      respondWith(202);

      await sendLoginLink(ADDRESS);

      expect(setPendingEmail).toHaveBeenCalledTimes(1);
      expect(setPendingEmail).toHaveBeenCalledWith(ADDRESS);
    });

    it.each([400, 429, 500])('stashes nothing on %s', async (status) => {
      // No link was sent, and the form stays put and shows its failure line - so a
      // stashed address would let a later reload of /check-email claim a link is
      // waiting when none is.
      respondWith(status);

      await sendLoginLink(ADDRESS);

      expect(setPendingEmail).not.toHaveBeenCalled();
    });

    it('stashes nothing when the backend is unreachable', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
      global.fetch = fetchMock as unknown as typeof fetch;

      await sendLoginLink(ADDRESS);

      expect(setPendingEmail).not.toHaveBeenCalled();
    });
  });
});
