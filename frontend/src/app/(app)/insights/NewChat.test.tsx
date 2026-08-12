import { screen } from '@testing-library/react';

// `render` comes from the shell wrapper: the chat posts into the toast region as of PET-77, and
// `useToast()` throws outside its provider by design. See `(app)/shellRender.tsx`.
import { render } from '../shellRender';
import userEvent from '@testing-library/user-event';

import type { AssistantConversation } from '../../../lib/assistant';

import { CHAT_EMPTY_COPY } from './AssistantChatScreen';
import { ChatSlot, NewChatButton, NewChatProvider } from './NewChat';

// "New chat", which shipped as a link and reset nothing.
//
// **The case this suite exists for is the one a link could not express**: on a bare `/insights` the
// href *is* the current URL, so nothing navigated, nothing remounted, and the next message was
// appended to the conversation the user had just asked to leave. Both halves are asserted - what is
// on screen, and what the next send carries - because only the second one is the data defect.
//
// A relative specifier on the mock, because `jest.mock` cannot resolve the `@/` alias from anywhere
// in this repo; see `frontend/src/app/CLAUDE.md`.

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => replace(href) }),
}));

const SESSION_ID = '0198f3a1-2b4c-7d8e-9f01-234567890abc';

const turn = (reply: string) => ({
  sessionId: SESSION_ID,
  title: 'Where did my money go?',
  message: {
    id: `question-${reply}`,
    role: 'user' as const,
    content: 'Where did my money go?',
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  reply: {
    id: `reply-${reply}`,
    role: 'assistant' as const,
    content: reply,
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
  ],
});

const renderChat = (send: jest.Mock, conversationProp: AssistantConversation | null = null) =>
  render(
    <NewChatProvider>
      <NewChatButton />
      <ChatSlot conversation={conversationProp} send={send} />
    </NewChatProvider>,
  );

const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Ask about your spending'), text);
  await user.click(screen.getByRole('button', { name: 'Send' }));
};

beforeEach(() => {
  replace.mockClear();
});

describe('New chat', () => {
  it('drops the conversation from the screen', async () => {
    const user = userEvent.setup();
    const send = jest.fn().mockResolvedValue({ ok: true, data: turn('An answer') });
    renderChat(send);

    await ask(user, 'Where did my money go?');
    expect(screen.getByText('An answer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.queryByText('An answer')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: CHAT_EMPTY_COPY.heading })).toBeInTheDocument();
  });

  it('stops the next message continuing the old conversation', async () => {
    // The defect, and the half no rendering assertion would have caught: the screen kept
    // `sessionId` in state, so a send after "New chat" posted the abandoned conversation's id.
    const user = userEvent.setup();
    const send = jest.fn().mockResolvedValue({ ok: true, data: turn('An answer') });
    renderChat(send);

    await ask(user, 'Where did my money go?');
    expect(send).toHaveBeenLastCalledWith(
      { message: 'Where did my money go?', sessionId: undefined },
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await ask(user, 'And on coffee?');

    expect(send).toHaveBeenLastCalledWith(
      { message: 'And on coffee?', sessionId: undefined },
      expect.anything(),
    );
  });

  it('clears a resumed conversation without waiting for the navigation', async () => {
    // The prop still names conversation A, exactly as it does in the window between `router.replace`
    // and the server answering it. Re-seeding from it there would put the abandoned conversation
    // back on screen and let a message sent inside that window carry its id.
    const user = userEvent.setup();
    renderChat(jest.fn(), conversation());

    expect(screen.getByText('An older question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.queryByText('An older question')).not.toBeInTheDocument();
  });

  it('replaces the URL, so a reload does not resume the abandoned conversation', async () => {
    // **`replace`, not `push`**: a fresh chat is not a place to come back out of.
    const user = userEvent.setup();
    renderChat(jest.fn());

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(replace).toHaveBeenCalledWith('/insights');
  });

  it('throws when the button is rendered outside the provider', () => {
    // A control that quietly stops resetting is a bug that looks like a slow network -
    // `useFilterNavigation`'s call, and the reason the hook does not return a no-op.
    expect(() => render(<NewChatButton />)).toThrow('NewChatProvider');
  });
});
