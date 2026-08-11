import { SEND_PATH, sendAssistantMessage } from './sendAssistantMessage';

// One case per taxonomy arm, plus the eighth outcome that is deliberately not one.
//
// This module runs in the **browser** - it is the one write in this app that is not a Server
// Action - so there is no cookie to mock and no `BACKEND_URL`: it calls the frontend's own route
// handler, which does both on its behalf.

const TURN = {
  sessionId: '0198f3a1-2b4c-7d8e-9f01-234567890abc',
  title: 'Where did my money go?',
  message: {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abd',
    role: 'user',
    content: 'Where did my money go?',
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  reply: {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abe',
    role: 'assistant',
    content: 'You spent 312.40 EUR on Groceries.',
    createdAt: '2026-08-11T09:00:01.000Z',
  },
  truncation: null,
};

const originalFetch = global.fetch;

function respondWith(status: number, body: unknown = null) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('the request', () => {
  it('posts JSON to the handler, which is the half of the contract this file owns', () => {
    // The path exists here and in `app/api/assistant/messages/route.ts`, and nothing else checks
    // the two agree - the same pairing `useCategoryOptions` records for its own handler.
    expect(SEND_PATH).toBe('/api/assistant/messages');
  });

  it('sends the body and never caches', async () => {
    const fetchMock = respondWith(201, TURN);

    await sendAssistantMessage({ message: 'Hello', sessionId: TURN.sessionId });

    expect(fetchMock).toHaveBeenCalledWith(SEND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello', sessionId: TURN.sessionId }),
      cache: 'no-store',
      signal: undefined,
    });
  });

  it('passes the caller signal, which is hop 1 of the abort chain', async () => {
    const fetchMock = respondWith(201, TURN);
    const controller = new AbortController();

    await sendAssistantMessage({ message: 'Hello' }, controller.signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('success', () => {
  it('hands back the whole turn', async () => {
    respondWith(201, TURN);

    await expect(sendAssistantMessage({ message: 'Hello' })).resolves.toEqual({
      ok: true,
      data: TURN,
    });
  });

  it('reports a failure when a 201 body will not parse', async () => {
    // Unlike `authorizedPost`'s create, there is nothing to salvage here: the reply *is* the
    // body, so there is no honest way to report success.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => {
        throw new SyntaxError('unexpected token');
      },
    });

    await expect(sendAssistantMessage({ message: 'Hello' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('the seven reported reasons', () => {
  it.each([
    [400, 'invalid'],
    [401, 'unauthenticated'],
    [404, 'missingSession'],
    [429, 'rateLimited'],
    [503, 'unavailable'],
    [504, 'timedOut'],
    [418, 'failed'],
  ] as const)('reports a %i as %s', async (status, reason) => {
    respondWith(status);

    await expect(sendAssistantMessage({ message: 'Hello' })).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it('reports a request that never completed as failed', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('dropped'));

    await expect(sendAssistantMessage({ message: 'Hello' })).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('keeps 504 distinct from failed, because retrying is right for one and not the other', async () => {
    // The arm most likely to be folded away by somebody tidying. Retrying the identical question
    // is the correct next move after a timeout and pointless after a generic failure.
    respondWith(504);
    const timedOut = await sendAssistantMessage({ message: 'Hello' });

    respondWith(500);
    const failed = await sendAssistantMessage({ message: 'Hello' });

    expect(timedOut).not.toEqual(failed);
  });
});

describe('cancellation', () => {
  it('reports an abort as aborted, carrying no reason at all', async () => {
    // The eighth outcome, deliberately outside the taxonomy: the user chose to stop, so there is
    // no copy to render. Folding it into `failed` would show a failure message for a deliberate
    // act - the same mistake as the no-results copy claiming an account is empty.
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(sendAssistantMessage({ message: 'Hello' }, controller.signal)).resolves.toEqual({
      ok: false,
      aborted: true,
    });
  });

  it('asks the signal rather than the error, because the two rejections are the same shape', async () => {
    // A dropped connection and an abort both reject with something opaque. The signal is the only
    // thing that can tell them apart, which is why the branch reads it rather than the error.
    const controller = new AbortController();
    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(sendAssistantMessage({ message: 'Hello' }, controller.signal)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
