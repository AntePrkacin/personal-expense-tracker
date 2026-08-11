import { render, screen } from '@testing-library/react';

import type { AssistantSession } from '../../../lib/assistant';

import {
  AssistantHistoryScreen,
  HISTORY_EMPTY_COPY,
  conversationHref,
} from './AssistantHistoryScreen';

// The History list: its two states, and the accessible-name decision behind the link's placement.

const TODAY = '2026-08-11';

const session = (overrides: Partial<AssistantSession> = {}): AssistantSession => ({
  id: '0198f3a1-2b4c-7d8e-9f01-234567890abc',
  title: 'Where did my money go?',
  lastMessageAt: '2026-08-11T09:00:00.000Z',
  createdAt: '2026-08-11T08:00:00.000Z',
  ...overrides,
});

describe('the empty state', () => {
  it('draws its copy and a way into the chat', () => {
    render(<AssistantHistoryScreen sessions={[]} today={TODAY} />);

    expect(screen.getByRole('heading', { name: HISTORY_EMPTY_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(HISTORY_EMPTY_COPY.body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: HISTORY_EMPTY_COPY.action })).toHaveAttribute(
      'href',
      '/insights',
    );
  });
});

describe('the list', () => {
  it('renders one row per conversation', () => {
    render(
      <AssistantHistoryScreen
        sessions={[session(), session({ id: 'second', title: 'What about coffee?' })]}
        today={TODAY}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Where did my money go?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'What about coffee?' })).toBeInTheDocument();
  });

  it('puts the link on the title alone, so the accessible name is the conversation', () => {
    // A link wrapping the whole row takes its name from everything inside it, so every row would
    // announce as "Where did my money go? Last active Today" - the reason PET-34 put the
    // transactions link on the merchant cell rather than on the row.
    render(<AssistantHistoryScreen sessions={[session()]} today={TODAY} />);

    const link = screen.getByRole('link', { name: 'Where did my money go?' });
    expect(link).not.toHaveTextContent('Last active');
  });

  it('carries the session into the chat route as a query parameter', () => {
    // Not a dynamic segment: an `/insights/[sessionId]` route would be a third path the tab bar
    // has to disambiguate, where a query parameter keeps exactly two routes and two tabs.
    render(<AssistantHistoryScreen sessions={[session()]} today={TODAY} />);

    expect(screen.getByRole('link', { name: 'Where did my money go?' })).toHaveAttribute(
      'href',
      conversationHref(session().id),
    );
  });

  it('encodes an id that would otherwise break the query string', () => {
    expect(conversationHref('a b/c')).toBe('/insights?session=a%20b%2Fc');
  });

  it('captions each row with when it was last active', () => {
    render(
      <AssistantHistoryScreen
        sessions={[session({ lastMessageAt: '2026-08-10T09:00:00.000Z' })]}
        today={TODAY}
      />,
    );

    expect(screen.getByText('Last active Yesterday')).toBeInTheDocument();
  });

  it('reads the instant as a calendar date rather than through a Date', () => {
    // `formatRelativeDate` takes `YYYY-MM-DD`, and `lastMessageAt` is an ISO instant - so the
    // screen slices rather than parsing. Round-tripping a calendar date through a `Date` shifts it
    // across timezones, which is the rule `lib/date.ts` states from both directions.
    render(<AssistantHistoryScreen sessions={[session()]} today={TODAY} />);

    expect(screen.getByText('Last active Today')).toBeInTheDocument();
  });

  it('draws no empty state when there is anything to list', () => {
    render(<AssistantHistoryScreen sessions={[session()]} today={TODAY} />);

    expect(
      screen.queryByRole('heading', { name: HISTORY_EMPTY_COPY.heading }),
    ).not.toBeInTheDocument();
  });
});
