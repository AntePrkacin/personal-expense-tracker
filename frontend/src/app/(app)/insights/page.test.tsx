import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { readConversation } from '../../../lib/assistant';
import type { AssistantConversation } from '../../../lib/assistant';
import * as periods from '../../../lib/periods';

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

// **Mocked so the absence of a call can be asserted, not so a call can be answered (PET-76).** This
// route awaited `readPeriods()` for the current period's label in its overline; both strings are
// literals now, so it reads no period at all - which is one fewer request per view and the thing
// `reads no period for its header` below pins. The module is spread and one export replaced, the
// shape `pages.test.tsx` uses, because the rest of it is pure.
jest.mock('../../../lib/periods', () => ({
  ...jest.requireActual('../../../lib/periods'),
  readPeriods: jest.fn(),
}));

// The header's "New chat" reaches `useRouter`; nothing here presses it.
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

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
  (readConversation as jest.Mock).mockResolvedValue(null);
});

const page = (search: Record<string, string | string[]> = {}) =>
  InsightsPage({ searchParams: Promise.resolve(search) });

describe('the session parameter', () => {
  it('reads nothing when there is none', async () => {
    render(await page());

    expect(readConversation).not.toHaveBeenCalled();
  });

  it('reads no period for its header, so a bare visit fetches nothing at all', async () => {
    // PET-76. The overline was the current period's label, which cost a whole `GET /api/periods` for
    // a string over a conversation that belongs to no period. Both header strings are literals now.
    // Pinned as an absence because that is the only way it fails if somebody restores the read: the
    // rendered header would look identical either way.
    render(await page());

    expect(periods.readPeriods).not.toHaveBeenCalled();
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

  it('does not confuse a literal ?session=new with no parameter at all', async () => {
    // The key's sentinel used to be a bare `'new'`, drawn from the same value space as the
    // parameter it stands in for, so this pair keyed identically and the reconciliation the key
    // exists to prevent came back for it. The draft is what makes a remount observable here: it is
    // client state, so it survives a reconcile and cannot survive a remount.
    const user = userEvent.setup();
    const { rerender } = render(await page({ session: 'new' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Ask about your spending')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('Ask about your spending'), 'a half-typed question');

    rerender(await page());

    expect(screen.getByLabelText('Ask about your spending')).toHaveValue('');
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
