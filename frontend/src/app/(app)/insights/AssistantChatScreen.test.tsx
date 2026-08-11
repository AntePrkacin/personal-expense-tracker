import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AssistantConversation } from '../../../lib/assistant';
import type { SendMessageResult } from '../../../lib/sendAssistantMessage';

import {
  AssistantChatScreen,
  CHAT_EMPTY_COPY,
  MISSING_SESSION_NOTICE,
} from './AssistantChatScreen';
import { DISCLOSURE } from './AssistantComposer';
import { THINKING_TEXT } from './TypingIndicator';
import { FAILURE_COPY, MAX_MESSAGE_CHARS } from './assistantChat';

// The chat screen: the optimistic append, the pending state, one case per taxonomy arm, the live
// region's **text**, the character cap, and cancellation.
//
// **The send is injected**, so this suite passes a `jest.fn()` and needs no module mock at all -
// which is what keeps the `@/` alias trap (see `frontend/src/app/CLAUDE.md`) out of it entirely.

const SESSION_ID = '0198f3a1-2b4c-7d8e-9f01-234567890abc';

const turn = (overrides: Partial<{ sessionId: string; reply: string }> = {}) => ({
  sessionId: overrides.sessionId ?? SESSION_ID,
  title: 'Where did my money go?',
  message: {
    id: 'stored-question',
    role: 'user' as const,
    content: 'Where did my money go?',
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  reply: {
    id: 'stored-reply',
    role: 'assistant' as const,
    content: overrides.reply ?? 'You spent 312.40 EUR on Groceries.',
    createdAt: '2026-08-11T09:00:01.000Z',
  },
  truncation: null,
});

const conversation = (): AssistantConversation => ({
  id: SESSION_ID,
  title: 'An older question',
  lastMessageAt: '2026-08-10T09:00:00.000Z',
  createdAt: '2026-08-10T09:00:00.000Z',
  messages: [
    {
      id: 'old-question',
      role: 'user',
      content: 'An older question',
      createdAt: '2026-08-10T09:00:00.000Z',
    },
    {
      id: 'old-reply',
      role: 'assistant',
      content: 'An older answer',
      createdAt: '2026-08-10T09:00:01.000Z',
    },
  ],
});

/** A send that resolves when the test says so, for asserting the in-flight state. */
const deferred = () => {
  let settle: (result: SendMessageResult) => void = () => {};
  const promise = new Promise<SendMessageResult>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

const renderScreen = (
  send: jest.Mock,
  props: Partial<React.ComponentProps<typeof AssistantChatScreen>> = {},
) => render(<AssistantChatScreen conversation={null} send={send} {...props} />);

const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Ask about your spending'), text);
  await user.click(screen.getByRole('button', { name: 'Send' }));
};

describe('the empty state', () => {
  it('draws its copy and the composer, with no conversation', () => {
    renderScreen(jest.fn());

    expect(screen.getByRole('heading', { name: CHAT_EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByLabelText('Ask about your spending')).toBeInTheDocument();
  });

  it('shows the disclosure before the first message, and it names all four things', () => {
    // Categorically larger than receipt scanning's: transactions with their amounts and dates, the
    // conversation, the training use, and that conversations are stored.
    renderScreen(jest.fn());

    const disclosure = screen.getByText(DISCLOSURE);
    expect(disclosure).toBeInTheDocument();
    expect(DISCLOSURE).toMatch(/merchant, amount, date and category/);
    expect(DISCLOSURE).toMatch(/this conversation/i);
    expect(DISCLOSURE).toMatch(/improve their models/i);
    expect(DISCLOSURE).toMatch(/saved to your account/i);
  });

  it('disables Send until something is typed', async () => {
    const user = userEvent.setup();
    renderScreen(jest.fn());

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await user.type(screen.getByLabelText('Ask about your spending'), 'Hello');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('caps the field at the DTO own limit', () => {
    renderScreen(jest.fn());

    expect(screen.getByLabelText('Ask about your spending')).toHaveAttribute(
      'maxlength',
      String(MAX_MESSAGE_CHARS),
    );
  });
});

describe('resuming a conversation', () => {
  it('renders its stored messages', () => {
    renderScreen(jest.fn(), { conversation: conversation() });

    expect(screen.getByText('An older question')).toBeInTheDocument();
    expect(screen.getByText('An older answer')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: CHAT_EMPTY_COPY.heading }),
    ).not.toBeInTheDocument();
  });

  it('sends the session id, so the turn continues that conversation', async () => {
    const user = userEvent.setup();
    const send = jest.fn().mockResolvedValue({ ok: true, data: turn() });
    renderScreen(send, { conversation: conversation() });

    await ask(user, 'Another question');

    expect(send).toHaveBeenCalledWith(
      { message: 'Another question', sessionId: SESSION_ID },
      expect.any(AbortSignal),
    );
  });

  it('says so when the requested conversation was gone, rather than 404ing the page', async () => {
    renderScreen(jest.fn(), { missingSession: true });

    expect(screen.getByText(MISSING_SESSION_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: CHAT_EMPTY_COPY.heading })).toBeInTheDocument();
  });
});

describe('a turn', () => {
  it('appends the question optimistically and disables the composer', async () => {
    const user = userEvent.setup();
    const { promise, settle } = deferred();
    const send = jest.fn().mockReturnValue(promise);
    renderScreen(send);

    await ask(user, 'Where did my money go?');

    expect(screen.getByText('Where did my money go?')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask about your spending')).toBeDisabled();

    settle({ ok: true, data: turn() });
    await waitFor(() =>
      expect(screen.getByText('You spent 312.40 EUR on Groceries.')).toBeInTheDocument(),
    );
  });

  it('announces the pending state as text, not as a bare region', async () => {
    // A polite region created with its content is generally not announced at all, and
    // `getByRole('status')` cannot tell that apart from a working one - so the **text** is what is
    // asserted, and the region is mounted from the first render.
    const user = userEvent.setup();
    const { promise, settle } = deferred();
    renderScreen(jest.fn().mockReturnValue(promise));

    expect(screen.getAllByRole('status')[0]).toHaveTextContent('');

    await ask(user, 'Hello');
    expect(screen.getByRole('status')).toHaveTextContent(THINKING_TEXT);

    settle({ ok: true, data: turn() });
    await waitFor(() => expect(screen.queryByText(THINKING_TEXT)).not.toBeInTheDocument());
  });

  it('adopts the session id from the first reply, so the next turn continues it', async () => {
    const user = userEvent.setup();
    const send = jest.fn().mockResolvedValue({ ok: true, data: turn() });
    renderScreen(send);

    await ask(user, 'First');
    await waitFor(() => expect(screen.getByText(/You spent/)).toBeInTheDocument());
    await ask(user, 'Second');

    expect(send).toHaveBeenNthCalledWith(
      1,
      { message: 'First', sessionId: undefined },
      expect.anything(),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      { message: 'Second', sessionId: SESSION_ID },
      expect.anything(),
    );
  });

  it('clears the composer on success', async () => {
    const user = userEvent.setup();
    renderScreen(jest.fn().mockResolvedValue({ ok: true, data: turn() }));

    await ask(user, 'Hello');

    await waitFor(() => expect(screen.getByLabelText('Ask about your spending')).toHaveValue(''));
  });

  it('states a truncation on screen as well as to the model', async () => {
    // Unreachable on every account this project has - the ceiling is 3,000 and the showcase
    // account holds 2,249 - so this case is constructed rather than seeded.
    const user = userEvent.setup();
    renderScreen(
      jest.fn().mockResolvedValue({
        ok: true,
        data: {
          ...turn(),
          truncation: { included: 3000, total: 4210, oldestIncludedDate: '2024-02-09' },
        },
      }),
    );

    await ask(user, 'Hello');

    await waitFor(() =>
      expect(screen.getByText(/3000 most recent transactions of 4210/)).toBeInTheDocument(),
    );
  });
});

describe('a failure', () => {
  it.each([
    ['invalid'],
    ['unauthenticated'],
    ['rateLimited'],
    ['unavailable'],
    ['timedOut'],
    ['failed'],
  ] as const)('renders the %s line and restores the question', async (reason) => {
    const user = userEvent.setup();
    renderScreen(jest.fn().mockResolvedValue({ ok: false, reason }));

    await ask(user, 'Where did my money go?');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(FAILURE_COPY[reason]));
    // The optimistic message is removed: the backend persists nothing unless the reply arrives, so
    // leaving it would assert a stored turn that does not exist. Asserted as the log region being
    // gone rather than as the text being absent - the restored draft is the textarea's own value,
    // which `queryByText` also matches.
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ask about your spending')).toHaveValue('Where did my money go?');
  });

  it('drops the session id on a missing conversation, so the retry starts a new one', async () => {
    const user = userEvent.setup();
    const send = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'missingSession' })
      .mockResolvedValueOnce({ ok: true, data: turn() });
    renderScreen(send, { conversation: conversation() });

    await ask(user, 'Another question');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(FAILURE_COPY.missingSession),
    );

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(send).toHaveBeenNthCalledWith(
      2,
      { message: 'Another question', sessionId: undefined },
      expect.anything(),
    );
  });

  it('survives a rejected send rather than sticking on Stop forever', async () => {
    // The `try` is load-bearing: a `fetch` rejects on a dropped connection as readily as an action
    // did, and uncaught it leaves the pending state up with the composer stuck.
    const user = userEvent.setup();
    renderScreen(jest.fn().mockRejectedValue(new Error('boom')));

    await ask(user, 'Hello');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(FAILURE_COPY.failed));
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ask about your spending')).toBeEnabled();
  });
});

describe('cancellation', () => {
  it('swaps Send for Stop while a turn is in flight', async () => {
    const user = userEvent.setup();
    const { promise, settle } = deferred();
    renderScreen(jest.fn().mockReturnValue(promise));

    await ask(user, 'Hello');

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();

    settle({ ok: true, data: turn() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
  });

  it('aborts the signal it handed the send, which is hop 1 of the chain', async () => {
    const user = userEvent.setup();
    const { promise, settle } = deferred();
    const send = jest.fn().mockReturnValue(promise);
    renderScreen(send);

    await ask(user, 'Hello');
    const signal = send.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(signal.aborted).toBe(true);

    settle({ ok: false, aborted: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
  });

  it('renders no error line at all, and restores the composer', async () => {
    // The eighth outcome. A cancel is a deliberate act, so folding it into the generic arm would
    // show a failure message for something the user chose.
    const user = userEvent.setup();
    renderScreen(jest.fn().mockResolvedValue({ ok: false, aborted: true }));

    await ask(user, 'Where did my money go?');

    await waitFor(() =>
      expect(screen.getByLabelText('Ask about your spending')).toHaveValue(
        'Where did my money go?',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('submits on Enter, because a textarea would insert a newline instead', async () => {
    const user = userEvent.setup();
    const send = jest.fn().mockResolvedValue({ ok: true, data: turn() });
    renderScreen(send);

    await user.type(screen.getByLabelText('Ask about your spending'), 'Hello{Enter}');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('inserts a newline on Shift+Enter rather than submitting', async () => {
    const user = userEvent.setup();
    const send = jest.fn();
    renderScreen(send);

    const field = screen.getByLabelText('Ask about your spending');
    await user.type(field, 'One{Shift>}{Enter}{/Shift}Two');

    expect(send).not.toHaveBeenCalled();
    expect(field).toHaveValue('One\nTwo');
  });
});

describe('the message list', () => {
  it('is a log region, so a reply announces politely', () => {
    renderScreen(jest.fn(), { conversation: conversation() });

    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('labels each turn in text rather than by colour or side alone', () => {
    renderScreen(jest.fn(), { conversation: conversation() });

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });

  it('gives every bubble its daisyUI root and its side', () => {
    // **The daisyUI-state exception to this repo's assert-behaviour-not-classes rule**, and it
    // earns it: `AssistantMessageList` builds these from a `Record` of whole literals, which the
    // Blueprint quality inspector cannot follow - it reported `chat-header` as an orphan part with
    // no `chat` root. It was wrong, and this is the proof, so the rejected finding rests on
    // something other than a reading of the source.
    const { container } = renderScreen(jest.fn(), { conversation: conversation() });

    const rows = container.querySelectorAll('.chat');
    expect(rows).toHaveLength(2);
    expect(container.querySelector('.chat-end')).toHaveClass('chat');
    expect(container.querySelector('.chat-start')).toHaveClass('chat');
    // Every header sits inside a row carrying the root, which is what "orphan part" would mean.
    for (const header of container.querySelectorAll('.chat-header')) {
      expect(header.parentElement).toHaveClass('chat');
    }
  });
});
