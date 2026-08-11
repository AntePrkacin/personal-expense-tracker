import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readConversation, requireSessions, sendMessage } from './assistant';

// Three exports because there are two kinds of caller with two failure policies: the two
// `page.tsx` reads, which must redirect a dead session, and the send - called by
// `app/api/assistant/messages/route.ts` - which must never, because a `redirect()` there answers
// the browser's `fetch` with an HTML login page carrying a 200.
//
// Package specifiers, the one case where `jest.mock` needs no relative-path dance. `redirect` is
// mocked as **throwing**, matching `insights.test.ts` and `dashboard.test.ts`: the real one is
// typed `never`, so a mock returning undefined would let execution fall through past the redirect
// and test the opposite of what these cases claim.
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const TOKEN = 'zx8Kq3vLm2Np7Rt4Ws9Yb6Cd1Ef5Gh0Jk8Ln3Pq2Rs';
const SESSION_ID = '0198f3a1-2b4c-7d8e-9f01-234567890abc';

const SESSIONS = {
  sessions: [
    {
      id: SESSION_ID,
      title: 'Where did my money go?',
      lastMessageAt: '2026-08-11T09:00:00.000Z',
      createdAt: '2026-08-11T08:00:00.000Z',
    },
  ],
  total: 1,
};

const CONVERSATION = {
  ...SESSIONS.sessions[0],
  messages: [
    {
      id: '0198f3a1-2b4c-7d8e-9f01-234567890abd',
      role: 'user',
      content: 'Where did my money go?',
      createdAt: '2026-08-11T09:00:00.000Z',
    },
  ],
};

const TURN = {
  sessionId: SESSION_ID,
  title: 'Where did my money go?',
  message: CONVERSATION.messages[0],
  reply: {
    id: '0198f3a1-2b4c-7d8e-9f01-234567890abe',
    role: 'assistant',
    content: 'You spent 312.40 EUR on Groceries.',
    createdAt: '2026-08-11T09:00:01.000Z',
  },
  truncation: null,
};

const originalFetch = global.fetch;
const originalBackendUrl = process.env.BACKEND_URL;

function store(value?: string) {
  const get = jest.fn().mockReturnValue(value === undefined ? undefined : { value });
  (cookies as jest.Mock).mockResolvedValue({ get });
  return get;
}

function respondWith(status: number, body: unknown) {
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
  process.env.BACKEND_URL = 'http://backend.test';
  store(TOKEN);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.BACKEND_URL = originalBackendUrl;
});

describe('requireSessions', () => {
  it('returns the wrapper object on a 200', async () => {
    respondWith(200, SESSIONS);

    await expect(requireSessions()).resolves.toEqual(SESSIONS);
  });

  it('lifts the cookie into an Authorization header', async () => {
    const fetchMock = respondWith(200, SESSIONS);

    await requireSessions();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/assistant/sessions',
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('redirects to the access flow on a 401', async () => {
    respondWith(401, null);

    await expect(requireSessions()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects with no cookie at all, without asking the backend', async () => {
    store(undefined);
    const fetchMock = respondWith(200, SESSIONS);

    await expect(requireSessions()).rejects.toThrow('NEXT_REDIRECT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws rather than redirecting when the backend did not answer', async () => {
    // The `/dashboard` to `/login` loop is what this separation exists to prevent.
    respondWith(500, null);

    await expect(requireSessions()).rejects.toThrow('Could not load your conversations');
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('readConversation', () => {
  it('returns the conversation with its messages on a 200', async () => {
    respondWith(200, CONVERSATION);

    await expect(readConversation(SESSION_ID)).resolves.toEqual(CONVERSATION);
  });

  it('encodes the id into the path', async () => {
    const fetchMock = respondWith(200, CONVERSATION);

    await readConversation('a b/c');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/assistant/sessions/a%20b%2Fc',
      expect.anything(),
    );
  });

  it('answers null on a 404 rather than throwing', async () => {
    // A stale `?session=` drops the parameter and renders an empty chat with a line saying so -
    // the call `transactions/[id]/page.tsx` already makes about an invalid `?sort=`. There is no
    // dynamic segment here, so there is no `not-found.tsx` this could belong to.
    respondWith(404, null);

    await expect(readConversation(SESSION_ID)).resolves.toBeNull();
  });

  it('redirects to the access flow on a 401', async () => {
    respondWith(401, null);

    await expect(readConversation(SESSION_ID)).rejects.toThrow('NEXT_REDIRECT');
  });

  it('throws when the backend did not answer', async () => {
    respondWith(500, null);

    await expect(readConversation(SESSION_ID)).rejects.toThrow('Could not load that conversation');
  });
});

describe('sendMessage', () => {
  it('returns the whole turn on a 201', async () => {
    respondWith(201, TURN);

    await expect(sendMessage({ message: 'Where did my money go?' })).resolves.toEqual({
      ok: true,
      data: TURN,
    });
  });

  it('POSTs JSON with the bearer', async () => {
    const fetchMock = respondWith(201, TURN);

    await sendMessage({ message: 'Hello', sessionId: SESSION_ID });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/api/assistant/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Hello', sessionId: SESSION_ID }),
      }),
    );
  });

  it('threads the caller signal into the fetch, which is hop 2 of the abort chain', async () => {
    const fetchMock = respondWith(201, TURN);
    const controller = new AbortController();

    await sendMessage({ message: 'Hello' }, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('never redirects, whatever the status', async () => {
    // The whole reason this export exists beside the two reads: a `redirect()` reached from
    // inside a route handler answers the browser's fetch with an HTML login page carrying a 200,
    // which the composer would render as a reply.
    respondWith(401, null);

    await expect(sendMessage({ message: 'Hello' })).resolves.toEqual({ ok: false, status: 401 });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces the status rather than collapsing every failure', async () => {
    // `lib/sendAssistantMessage.ts` turns these into seven different sentences, so a helper that
    // reported one reason for all of them would make six of them unreachable.
    for (const status of [400, 404, 429, 503, 504]) {
      respondWith(status, null);

      await expect(sendMessage({ message: 'Hello' })).resolves.toEqual({ ok: false, status });
    }
  });

  it('reports no status when the request never completed', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('dropped'));

    await expect(sendMessage({ message: 'Hello' })).resolves.toEqual({ ok: false });
  });
});
