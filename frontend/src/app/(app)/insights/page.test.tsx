import { render, screen } from '@testing-library/react';

import { readConversation } from '../../../lib/assistant';
import type { AssistantConversation } from '../../../lib/assistant';
import { readPeriods } from '../../../lib/periods';

import { MISSING_SESSION_NOTICE } from './AssistantChatScreen';
import InsightsPage from './page';

// The Chat route's own job, which is entirely about `?session=`: read the conversation it names,
// hand it down, and make sure the screen below is showing **that** conversation rather than the one
// it was showing a moment ago. `pages.test.tsx` owns the header and the title; the chat's own
// behaviour is `AssistantChatScreen.test.tsx`'s and the reset is `NewChat.test.tsx`'s.
//
// **This file exists because of a review finding on PET-73**: the screen seeds its state from its
// props on mount only, so a navigation between two conversations left the previous one on screen -
// and posting to it. Relative specifiers throughout, the `@/` alias being unresolvable to
// `jest.mock` from anywhere in this repo.

jest.mock('../../../lib/assistant', () => ({ readConversation: jest.fn() }));

jest.mock('../../../lib/periods', () => ({
  ...jest.requireActual('../../../lib/periods'),
  readPeriods: jest.fn(),
}));

// The header's "New chat" reaches `useRouter`; nothing here presses it.
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const PERIODS = {
  periods: [
    {
      start: '2026-08-01',
      end: '2026-09-01',
      label: 'August 2026',
      current: true,
    },
  ],
};

const conversation = (id: string, question: string): AssistantConversation => ({
  id,
  title: question,
  lastMessageAt: '2026-08-11T09:00:00.000Z',
  createdAt: '2026-08-11T08:00:00.000Z',
  messages: [
    {
      id: `${id}-question`,
      role: 'user',
      content: question,
      createdAt: '2026-08-11T09:00:00.000Z',
    },
  ],
});

const A = conversation('0198f3a1-2b4c-7d8e-9f01-2345678900aa', 'Where did my money go?');
const B = conversation('0198f3a1-2b4c-7d8e-9f01-2345678900bb', 'And on coffee?');

beforeEach(() => {
  jest.clearAllMocks();
  (readPeriods as jest.Mock).mockResolvedValue(PERIODS);
  (readConversation as jest.Mock).mockResolvedValue(null);
});

const page = (search: Record<string, string | string[]> = {}) =>
  InsightsPage({ searchParams: Promise.resolve(search) });

describe('the session parameter', () => {
  it('reads nothing when there is none', async () => {
    render(await page());

    expect(readConversation).not.toHaveBeenCalled();
  });

  it('resumes the conversation it names', async () => {
    (readConversation as jest.Mock).mockResolvedValue(A);

    render(await page({ session: A.id }));

    expect(readConversation).toHaveBeenCalledWith(A.id);
    expect(screen.getByText('Where did my money go?')).toBeInTheDocument();
  });

  it('takes neither of two ids rather than the first', async () => {
    // A repeated key arrives as an array, and two conversation ids in one URL name no single
    // conversation.
    render(await page({ session: [A.id, B.id] }));

    expect(readConversation).not.toHaveBeenCalled();
  });

  it('says so when the id named nothing, rather than 404ing', async () => {
    (readConversation as jest.Mock).mockResolvedValue(null);

    render(await page({ session: A.id }));

    // By text rather than by role: the typing indicator is a second `role="status"`, mounted from
    // the first render for the reason `TypingIndicator` records.
    expect(screen.getByText(MISSING_SESSION_NOTICE)).toBeInTheDocument();
  });

  it('swaps the conversation when the parameter changes', async () => {
    // **The finding.** The chat is a client component seeded on mount, rendered at a fixed
    // position, so React reconciles it across this navigation instead of remounting it - which left
    // A's messages on screen under B's URL, with A's id still on every send. The `key` in
    // `page.tsx` is what makes this pass; deleting it fails here and nowhere else.
    (readConversation as jest.Mock).mockResolvedValue(A);
    const { rerender } = render(await page({ session: A.id }));

    (readConversation as jest.Mock).mockResolvedValue(B);
    rerender(await page({ session: B.id }));

    expect(screen.getByText('And on coffee?')).toBeInTheDocument();
    expect(screen.queryByText('Where did my money go?')).not.toBeInTheDocument();
  });

  it('empties the chat when the parameter goes away', async () => {
    // The same reconciliation, in the direction "New chat" navigates: the server hands back no
    // conversation and the screen must stop showing the last one.
    (readConversation as jest.Mock).mockResolvedValue(A);
    const { rerender } = render(await page({ session: A.id }));

    rerender(await page());

    expect(screen.queryByText('Where did my money go?')).not.toBeInTheDocument();
  });
});
