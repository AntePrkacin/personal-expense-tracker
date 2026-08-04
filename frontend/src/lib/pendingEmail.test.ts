import { cookies } from 'next/headers';

import { PENDING_EMAIL_COOKIE, readPendingEmail, setPendingEmail } from './pendingEmail';

// A **package** specifier, so the `@/` alias trap frontend/src/app/CLAUDE.md records
// does not apply here at all: the resolver sees `next/headers` verbatim and resolves
// it the same way the import above does.
//
// Mocked rather than exercised, because there is no request scope under Jest -
// `cookies()` throws "was called outside a request scope" - and because the point of
// this suite is the options object, which is the part no other gate can see. The real
// store is checked in the walkthrough, in devtools.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const ADDRESS = 'marko@email.com';

/** The two methods this module uses, over a plain map. */
function store(initial?: string) {
  const set = jest.fn();
  const get = jest.fn().mockReturnValue(initial === undefined ? undefined : { value: initial });
  (cookies as jest.Mock).mockResolvedValue({ get, set });
  return { get, set };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PENDING_EMAIL_COOKIE', () => {
  it('is the namespaced name, pinned as a literal', () => {
    // Asserted verbatim rather than imported-and-compared, so a rename shows up as a
    // diff somebody has to read - the same call draft.test.ts makes about
    // SETUP_DRAFT_KEY. Cookies are a flat per-origin bucket, so the namespace is what
    // stops a collision with anything else this origin sets.
    expect(PENDING_EMAIL_COOKIE).toBe('spendifico.pending_email');
  });

  it('is not the session cookie', () => {
    // Two unrelated cookies: this one carries an address for one screen's copy, and
    // PET-52's carries a credential. Pinned so nobody merges them on the grounds that
    // both are "the auth cookie".
    expect(PENDING_EMAIL_COOKIE).not.toMatch(/session|token/);
  });
});

describe('setPendingEmail', () => {
  it('stashes the address under the namespaced name', async () => {
    const { set } = store();

    await setPendingEmail(ADDRESS);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe(PENDING_EMAIL_COOKIE);
    expect(set.mock.calls[0][1]).toBe(ADDRESS);
  });

  it('keeps the address off the client and out of a cross-site request', async () => {
    // The three that make this Option A rather than a query parameter with extra
    // steps. httpOnly because screen 24 renders on the server and no client code has
    // any use for the value; path '/' because two routes read it; and `lax` rather
    // than `strict` because PET-52's verify link arrives as a cross-site top-level
    // GET, which `strict` withholds cookies from.
    const { set } = store();

    await setPendingEmail(ADDRESS);

    expect(set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('expires with the link it describes', async () => {
    // Fifteen minutes, in seconds, mirroring the backend's own LOGIN_LINK_TTL_M
    // default: once the link is dead the screen's promise is stale anyway. Asserted in
    // seconds because `maxAge` is seconds and 15 would be a fifteen-second cookie.
    const { set } = store();

    await setPendingEmail(ADDRESS);

    expect(set.mock.calls[0][2]).toMatchObject({ maxAge: 900 });
  });

  it('leaves the cookie insecure in development, where dev is plain HTTP', async () => {
    // `secure: NODE_ENV === 'production'` - true in production, and false here, which
    // is what lets `npm run dev` over http://localhost work at all.
    //
    // Only this branch is asserted, deliberately: next/jest's SWC transform can inline
    // process.env.NODE_ENV at transform time, so reassigning it in a test can silently
    // do nothing and leave an assertion checking the branch it meant to escape. This
    // still proves the expression is evaluated rather than hard-coded `true`.
    const { set } = store();

    await setPendingEmail(ADDRESS);

    expect(set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it('replaces whatever was there, so a second submission wins', async () => {
    // Two registrations in one browser, or a register followed by a log in with a
    // different address. The cookie is not a list.
    const { set } = store('someone.else@email.com');

    await setPendingEmail(ADDRESS);

    expect(set.mock.calls[0][1]).toBe(ADDRESS);
  });
});

describe('readPendingEmail', () => {
  it('returns the stashed address', async () => {
    store(ADDRESS);

    expect(await readPendingEmail()).toBe(ADDRESS);
  });

  it('returns null when there is no cookie', async () => {
    // An ordinary outcome, not an error: the cookie expires and a second browser never
    // had one. Screen 24 answers with copy that reads correctly without an address.
    store();

    expect(await readPendingEmail()).toBeNull();
  });

  it('returns null for an empty value', async () => {
    store('');

    expect(await readPendingEmail()).toBeNull();
  });

  it.each([
    ['a hand-written string', 'not an address'],
    ['markup', '<script>alert(1)</script>'],
    ['a bare name', 'marko'],
  ])('refuses %s rather than rendering it as an address', async (_label, value) => {
    // httpOnly keeps script out, not devtools, and this value is both interpolated
    // into the screen's copy and POSTed as the resend address. Same call parseDraft
    // makes about a sessionStorage draft, for the same reason: everything this module
    // hands out has to be something the field could have produced.
    store(value);

    expect(await readPendingEmail()).toBeNull();
  });

  it('reads the same name it writes', async () => {
    // The two halves are the whole mechanism, and a typo in either would leave the
    // screen permanently on its fallback copy with every other test green.
    const { get, set } = store(ADDRESS);

    await setPendingEmail(ADDRESS);
    await readPendingEmail();

    expect(get.mock.calls[0][0]).toBe(set.mock.calls[0][0]);
  });
});
