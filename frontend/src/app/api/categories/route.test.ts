/**
 * @jest-environment node
 */

import { readCategoryOptions } from '../../../lib/categories';

import { GET } from './route';

// **The `node` environment above is load-bearing**, for the reason
// `app/auth/verify/route.test.ts` records: `NextResponse` is built on the Web `Request`,
// `Response` and `Headers` globals, and the repo's default jsdom environment exposes
// none of them, so the suite fails at *import* with "Request is not defined" rather than
// on an assertion. This is the second route handler in the repo and the second file to
// need the docblock.
//
// A **relative** specifier, because `jest.mock` cannot resolve the `@/` alias from
// anywhere in this repo - the note in `frontend/src/app/CLAUDE.md` records that it fails
// with "Cannot find module" from every directory, and that the accompanying `import` has
// to name the same path so the two refer to one module.
jest.mock('../../../lib/categories', () => ({ readCategoryOptions: jest.fn() }));

const read = readCategoryOptions as jest.Mock;

const OPTIONS = [
  { id: '0198c2a1-0000-7000-8000-0000000000a1', name: 'Groceries' },
  { id: '0198c2a1-0000-7000-8000-0000000000ff', name: 'Uncategorized' },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('a successful read', () => {
  it('answers 200 with the options in an envelope', async () => {
    read.mockResolvedValue({ ok: true, data: OPTIONS });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ categories: OPTIONS });
  });

  it('preserves the order it was given', async () => {
    read.mockResolvedValue({ ok: true, data: OPTIONS });

    const body = (await (await GET()).json()) as { categories: { name: string }[] };

    expect(body.categories.map((c) => c.name)).toEqual(['Groceries', 'Uncategorized']);
  });

  it('answers 200 with an empty list rather than a failure', async () => {
    // An account with no categories is not an error, and the select has to render.
    read.mockResolvedValue({ ok: true, data: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ categories: [] });
  });
});

describe('the two failures', () => {
  it('answers a bare 401 when the session is gone', async () => {
    read.mockResolvedValue({ ok: false, reason: 'unauthenticated' });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('');
  });

  it('answers a bare 503 when the backend could not answer', async () => {
    read.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('');
  });

  it('keeps the two distinguishable, so the modal can say different things', async () => {
    read.mockResolvedValueOnce({ ok: false, reason: 'unauthenticated' });
    const first = await GET();

    read.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
    const second = await GET();

    expect(first.status).not.toBe(second.status);
  });

  it('does not redirect, which would hand the modal an HTML page', async () => {
    // The whole reason lib/categories.ts refuses to redirect where lib/transactions.ts
    // does. A 307 here would resolve to a login page the modal would try to parse as JSON.
    read.mockResolvedValue({ ok: false, reason: 'unauthenticated' });

    const response = await GET();

    // Not a 3xx, and carrying no Location for a browser to follow. 401 is a client
    // error rather than a redirect, which is the distinction being pinned.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get('Location')).toBeNull();
  });
});

describe('caching', () => {
  it.each([
    ['a success', { ok: true, data: OPTIONS }],
    ['a 401', { ok: false, reason: 'unauthenticated' }],
    ['a 503', { ok: false, reason: 'unavailable' }],
  ])('sends no-store on %s', async (_name, result) => {
    // The browser half of the rule. lib/categories.ts sends no-store to the backend; this
    // stops the browser reusing the response, which is what makes re-fetching on every
    // open mean anything.
    read.mockResolvedValue(result);

    expect((await GET()).headers.get('Cache-Control')).toBe('no-store');
  });
});
