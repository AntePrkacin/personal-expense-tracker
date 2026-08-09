import { cookies } from 'next/headers';

import { updateCategoryCaps } from './updateCategoryCaps';

// Exercised through the real `authorizedPatch`, the call every sibling action suite makes and for
// their reason: mocking the helper would prove only that a mock was called, where the behaviour
// worth pinning is the status-to-reason mapping over real responses.
//
// Deliberately no `next/navigation` mock, and its absence is an assertion. This action must never
// redirect: a `redirect()` inside an action throws, so the modal's `await` would never resolve and
// Save would stay disabled forever - with a screenful of caps on it rather than one field. The real
// `redirect` would blow up here, so adding one fails this suite.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';

const ID = '0198c2a1-0000-7000-8000-0000000000c1';
const OTHER = '0198c2a1-0000-7000-8000-0000000000c2';

const BODY = { categories: [{ id: ID, monthlyCap: 250 }] };

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
  it('PATCHes the collection, with no id in the path', async () => {
    // One fixed route. Unlike `updateCategory` there is nothing caller-supplied in the URL at all,
    // which is why this suite has no encoding case to match that one's.
    const fetchMock = respondWith(200);

    await updateCategoryCaps(BODY);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/categories',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends the session as a bearer token', async () => {
    const fetchMock = respondWith(200);

    await updateCategoryCaps(BODY);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('sends the body it was handed, verbatim', async () => {
    // The diff belongs to `allocateForm.ts`; this function must not add to it or take from it, or a
    // cap the user never touched would be rewritten - and on this endpoint an entry with no cap is a
    // 400 rather than a no-op.
    const fetchMock = respondWith(200);

    await updateCategoryCaps({
      categories: [
        { id: ID, monthlyCap: 250.5 },
        { id: OTHER, monthlyCap: null },
      ],
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      categories: [
        { id: ID, monthlyCap: 250.5 },
        // `JSON.stringify` keeps a null where it drops an `undefined`, and null is the only way a
        // capped category becomes uncapped - so this is the one body value whose survival is worth
        // an assertion.
        { id: OTHER, monthlyCap: null },
      ],
    });
  });

  it('takes a body and nothing else', async () => {
    // No token, no user id and no category id: the credential comes off the httpOnly cookie inside
    // the helper, and the backend scopes every lookup to that session's own database.
    expect(updateCategoryCaps).toHaveLength(1);
  });
});

describe('success', () => {
  it('reports ok on the 200 the endpoint answers', async () => {
    respondWith(200);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({ ok: true });
  });

  it('does not read the response body, even though this endpoint sends one', async () => {
    // This route answers the whole `CategoriesResponseDto`, unlike the other writes - and the action
    // still discards it. A 2xx means the caps landed, so nothing below that line may turn a saved
    // write into a reported failure; a body that will not parse is the case that would break it.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({ ok: true });
  });
});

describe('the four failures', () => {
  it('maps 400 to invalid, whose copy must not say "try again"', async () => {
    // Reachable through more than devtools here: every bound `allocateForm.ts` does not mirror, plus
    // the two array rules - an empty payload and a repeated id. A body the DTO rejects is rejected
    // again forever, so the advice has to be "check the amounts".
    respondWith(400);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('maps 404 to missing, which on this endpoint means nothing was written', async () => {
    // Stronger than the same status next door: the whole payload is refused when any id names no
    // live category, so the identical body is safe to retry once the screen has caught up. That is
    // what the modal's copy promises and what makes this the one arm that refreshes.
    respondWith(404);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('maps 401 to unauthenticated', async () => {
    respondWith(401);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
  });

  it('maps a missing cookie to unauthenticated too, with no round trip', async () => {
    const fetchMock = respondWith(200);
    store(undefined);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has no 409 arm, because this endpoint documents none', async () => {
    // The fallback's cap is editable and no rename is in play, so this is the one categories write
    // with no conflict case - `backend/test/openapi.e2e-spec.ts` pins the absence from the other
    // side. If a 409 ever appears it must land here as `failed` rather than being silently mapped to
    // something more specific.
    respondWith(409);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it.each([403, 429, 500, 502, 503])('maps %d to failed', async (status) => {
    respondWith(status);

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('maps an unreachable backend to failed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(updateCategoryCaps(BODY)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('the contract with the modal', () => {
  it('never throws, so no failure reaches the client as an opaque digest', async () => {
    for (const arrange of [
      () => respondWith(400),
      () => respondWith(404),
      () => respondWith(500),
      () => {
        global.fetch = jest
          .fn()
          .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
      },
    ]) {
      arrange();
      await expect(updateCategoryCaps(BODY)).resolves.toBeDefined();
    }
  });

  it('answers exactly one of the five documented shapes', async () => {
    const reasons = new Set<unknown>();

    for (const status of [200, 400, 401, 404, 500]) {
      respondWith(status);
      const result = await updateCategoryCaps(BODY);
      reasons.add(result.ok ? 'ok' : result.reason);
    }

    expect([...reasons].sort()).toEqual(['failed', 'invalid', 'missing', 'ok', 'unauthenticated']);
  });
});
