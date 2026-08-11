import { cookies } from 'next/headers';

import { changeSchedule } from './changeSchedule';

// Exercised through the real `authorizedPost`, the call every sibling suite makes and for their
// reason: mocking the helper would prove only that a mock was called, where the behaviour worth
// pinning is the status-to-reason mapping over real responses.
//
// Deliberately no `next/navigation` mock, and its absence is an assertion - the same one
// `updateProfile.test.ts` makes. This action must never redirect: a `redirect()` inside an action
// throws, so the form's `await` would never resolve and Save would stay disabled forever. The real
// `redirect` would blow up here, so adding one fails this suite.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

/** A complete schedule, which is the only kind this endpoint takes. */
const BODY = { monthlyBudget: 2400, monthStartDay: 15, firstPaycheckDate: '2026-03-15' };

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
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

describe('the request', () => {
  it('POSTs the schedule endpoint', async () => {
    // A POST rather than a PATCH because it **appends**: two rows in the ordinary case, replacing
    // nothing. That is the whole reason this action exists beside `updateProfile` rather than as a
    // wider body on it.
    const fetchMock = respondWith(200);

    await changeSchedule(BODY);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/profile/schedule',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200);

    await changeSchedule(BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('sends all three fields, because a schedule is a complete statement', async () => {
    // The opposite of `updateProfile`'s diffed body, and the difference is not a style: a request
    // setting a budget or a pay day is incomplete without saying from when, which is why
    // `ChangeScheduleDto` requires every field. Dropping one would be a 400, not a partial write.
    const fetchMock = respondWith(200);

    await changeSchedule(BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(BODY);
  });

  it('takes a body and nothing else - no id, no token', async () => {
    // No id, because the endpoint has none: the resource is always the session's own. No token,
    // because the credential comes off the httpOnly cookie inside the helper. Both are what make
    // publishing this as an action safe, and both are one argument away from being untrue.
    expect(changeSchedule).toHaveLength(1);
  });
});

describe('success', () => {
  it('reports ok on the 200 the endpoint answers', async () => {
    // 200 rather than a POST's default 201, because it creates no resource a caller could then
    // address - what comes back is the profile. `HttpCode` on the controller is what makes that
    // true, and `openapi.e2e-spec.ts` pins it from the other side.
    respondWith(200);

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: true });
  });

  it('reports ok on a 201 too, so a status change is not a reported failure', async () => {
    // Nothing should reintroduce Nest's default, but if it did, the rows would still have landed -
    // and the one thing this action must never do is turn a completed write into a failure the user
    // retries.
    respondWith(201);

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: true });
  });

  it('does not read the response body', async () => {
    // A 2xx means the rows landed, so nothing below that line may turn a saved schedule into a
    // reported failure - the rule `authorizedPost` states from the other side. A body that will not
    // parse is the case that would break it.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: true });
  });
});

describe('the three failures', () => {
  it('maps 400 to invalid, whose copy must not say "try again"', async () => {
    // Two ways in, both worth naming. `firstPaycheckDate` not falling on `monthStartDay`, which
    // `toChangeScheduleBody` makes unreachable by assembling the date from the pay day the form
    // holds. And an anchor earlier than the account's first pay schedule, which the dialog's
    // nine-month window cannot produce against a seed rule anchored a year back. A body the DTO
    // rejects is rejected again forever, so the advice has to be "check the values".
    respondWith(400);

    await expect(changeSchedule({ ...BODY, firstPaycheckDate: '2026-03-14' })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(changeSchedule(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(200);
    store(undefined);

    await expect(changeSchedule(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publishes no conflict arm, because this endpoint has none', async () => {
    // The difference from `updateProfile`'s four reasons, and it is a fact about the write rather
    // than an omission: nothing here can collide with another account, and sending the identical
    // body twice converges - the rule insert is `onConflictDoNothing` on the unique index and a
    // duplicate budget row for one date resolves to the newest, which is the same value. So a 409
    // arriving anyway is an unexplained fault.
    respondWith(409);

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it.each([403, 404, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(changeSchedule(BODY)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});
