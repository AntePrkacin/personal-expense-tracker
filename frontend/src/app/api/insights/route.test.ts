/**
 * @jest-environment node
 */

import { readInsights } from '../../../lib/insights';

import { GET } from './route';

// **The `node` environment above is load-bearing**, for the reason `app/auth/verify/route.test.ts`
// records: `NextResponse` is built on the Web `Request`, `Response` and `Headers` globals, and
// the repo's default jsdom environment exposes none of them, so the suite fails at *import*
// with "Request is not defined" rather than on an assertion. This is the third route handler in
// the repo and the third file to need the docblock.
//
// A **relative** specifier, because `jest.mock` cannot resolve the `@/` alias from anywhere in
// this repo - see the note in `frontend/src/app/CLAUDE.md`.
jest.mock('../../../lib/insights', () => ({ readInsights: jest.fn() }));

const read = readInsights as jest.Mock;

const SET = {
  state: 'ready',
  monthLabel: 'October 2025',
  summary: { headline: "You're on track this month", body: "You've spent $1,240 of $2,000." },
  insights: [{ tone: 'warning', title: 'Dining out is over budget', body: '$12 over' }],
  generatedAt: '2025-10-08T09:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('a successful read', () => {
  it('answers 200 with the set passed straight through', async () => {
    // Unlike the categories handler, which narrows a whole screen's payload down to the two
    // fields a `<select>` needs, every field here is drawn by the page - so there is nothing to
    // project and a projection would be a second place for the shape to drift.
    read.mockResolvedValue({ ok: true, data: SET });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(SET);
  });

  it('tells the browser not to cache it either', async () => {
    // `authorizedGet` already sends `cache: 'no-store'` to the backend; this is the other half.
    // It matters more here than anywhere: the poll exists specifically to observe a value
    // changing, so a cached response would leave the page in skeletons while the run behind it
    // finished.
    read.mockResolvedValue({ ok: true, data: SET });

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('when the read failed', () => {
  it('passes a dead session through as a 401 rather than a redirect', async () => {
    // A redirect would answer the poll with an HTML login page carrying a 200, which the page
    // would parse as a set.
    read.mockResolvedValue({ ok: false, reason: 'unauthenticated' });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 503 when the backend could not answer', async () => {
    read.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const response = await GET();

    expect(response.status).toBe(503);
  });

  it('sends no body on either failure, because the page owns what little copy there is', async () => {
    read.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const response = await GET();

    await expect(response.text()).resolves.toBe('');
  });
});
