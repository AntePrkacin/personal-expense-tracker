import { setPendingEmail } from '../../../lib/pendingEmail';
import type { components } from '@/types/api';

import { registerAccount } from './actions';

// What this action adds on top of lib/backend.ts: the cookie, and only on a success.
// The request shape - the URL, the method, the serialized body, `cache: 'no-store'` -
// moved to lib/backend.test.ts with the fetch itself, so it is asserted once for both
// callers rather than twice.
//
// **The mock is not optional.** Without it every case below reaching the 202 path
// throws "`cookies` was called outside a request scope", because there is no request
// scope under Jest - which is how six of this suite's cases failed the moment the
// action started stashing.
//
// A relative specifier, because `jest.mock` cannot resolve the `@/` alias from any
// directory - see the note in frontend/src/app/CLAUDE.md. It intercepts the aliased
// import inside actions.ts all the same, since Jest keys its registry on the resolved
// path and SWC rewrote the alias at transform time. The accompanying import above
// names the same relative specifier, which is the other half of that rule.
jest.mock('../../../lib/pendingEmail', () => ({ setPendingEmail: jest.fn() }));

const BODY: components['schemas']['RegisterDto'] = {
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000.5,
  categories: ['Groceries', 'Transport'],
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

/** A response with only the one field the helper reads. */
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

describe('registerAccount', () => {
  it('posts the body to the register endpoint', async () => {
    // The path, which is this action's own and the one thing about the request it
    // still chooses.
    const fetchMock = respondWith(202);

    await registerAccount(BODY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/auth/register');
  });

  it('reports success on 202', async () => {
    respondWith(202);

    expect(await registerAccount(BODY)).toEqual({ ok: true });
  });

  it.each([
    ['a validation rejection', 400],
    ['the rate limiter', 429],
    ['a server fault', 500],
  ])('reports %s with its status', async (_label, status) => {
    respondWith(status);

    expect(await registerAccount(BODY)).toEqual({ ok: false, status });
  });

  it('reports a failure with no status when the backend is unreachable', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await registerAccount(BODY)).toEqual({ ok: false });
  });

  it('does not distinguish a duplicate address from a new one', async () => {
    // REG-6 and A35: the backend answers 202 with an empty body either way, so this
    // function cannot tell them apart and must not try. Pinned so nobody adds an
    // "already registered" branch that would leak whether an account exists.
    respondWith(202);

    const first = await registerAccount(BODY);
    const second = await registerAccount(BODY);

    expect(first).toEqual(second);
  });

  describe('the address it hands to screen 24', () => {
    it('stashes the submitted address on a success', async () => {
      // The whole of PET-12's Option A from this side: nothing travels in the URL, so
      // if this call is dropped screen 24 silently shows its no-address fallback while
      // every other assertion here stays green.
      respondWith(202);

      await registerAccount(BODY);

      expect(setPendingEmail).toHaveBeenCalledTimes(1);
      expect(setPendingEmail).toHaveBeenCalledWith('marko@email.com');
    });

    it('takes the address off the body, which is already trimmed', async () => {
      // `toRegisterBody` is the one place the three text fields are trimmed, so the
      // body is the trimmed value and the draft is not. Stashing what was typed would
      // put a padded address into screen 24's copy.
      respondWith(202);

      await registerAccount({ ...BODY, email: 'marko+tag@email.com' });

      expect(setPendingEmail).toHaveBeenCalledWith('marko+tag@email.com');
    });

    it.each([400, 429, 500])('stashes nothing on %s', async (status) => {
      // No account was created and no link was sent, and the form stays put and shows
      // its failure line - so a stashed address would outlive a submission that never
      // happened, and a later reload of /check-email would claim a link is waiting.
      respondWith(status);

      await registerAccount(BODY);

      expect(setPendingEmail).not.toHaveBeenCalled();
    });

    it('stashes nothing when the backend is unreachable', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
      global.fetch = fetchMock as unknown as typeof fetch;

      await registerAccount(BODY);

      expect(setPendingEmail).not.toHaveBeenCalled();
    });
  });
});
