import { MessagesSquare } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/EmptyState';
import type { AssistantSession } from '@/lib/assistant';
import { todayIsoDate } from '@/lib/date';
import { formatRelativeDate } from '@/lib/format';

import { INSIGHTS_TAB_HREFS } from './InsightsTabs';

// The History view's `<main>` (PET-73): every past conversation, newest activity first.
//
// **A Server Component taking the resolved list.** Nothing here holds state - the whole screen is
// a list of links - so the split `/transactions` set applies in its simplest form: `page.tsx`
// fetches, this renders, and Storybook can draw both states from a literal.
//
// **The link is on the title, not the row**, for the accessible-name reason the transactions
// table's merchant cell records: a link wrapping a whole row takes its name from everything inside
// it, so every row would announce as "Where did my money go? Last active Today". The title is the
// only part that names the thing being opened.
//
// **`components/EmptyState` is the right component here**, and it is worth saying why, because it
// is the wrong one on the Dashboard. That component is a full-card centred treatment replacing the
// content - a 72px accent-soft circle, a heading, a body and an optional action - which is exactly
// what a screen with nothing on it wants, and exactly what the Dashboard's in-card empty
// treatments are not.
//
// **Resuming is a query parameter, not a dynamic segment.** An `/insights/[sessionId]` route would
// be a third path the tab bar has to disambiguate - both `/insights/history` and a uuid keep the
// sidebar lit, but the bar would have to decide which tab a uuid belongs to - where a query
// parameter keeps exactly two routes and two tabs.

/** The parameter the Chat view resumes from. One half of a contract; `page.tsx` reads the other. */
export const SESSION_PARAM = 'session';

/** Ours, like every string on this screen. Joins what A29 owes a designer. */
export const HISTORY_EMPTY_COPY = {
  heading: 'No conversations yet',
  body: 'Ask the assistant something about your spending and it will show up here.',
  action: 'Start a conversation',
};

/**
 * The calendar date an ISO **instant** falls on, in the zone `today` is read in.
 *
 * **`lastMessageAt` is a timestamp, not a `YYYY-MM-DD` column**, which is the one respect this
 * caption differs from `RecentTransactionsCard`'s and the reason a review of PET-73 added this
 * function. `slice(0, 10)` takes the **UTC** date out of that instant, while `today` defaults to
 * the frontend host's own zone - so at UTC+2 a message sent at 00:30 local is 22:30 UTC the
 * previous day and a conversation from minutes ago read "Yesterday". That is a second and
 * independent error on top of the host-zone-versus-`APP_TIMEZONE` gap the prop's own docblock
 * cites; both sides are now read in one zone, which leaves only the documented gap.
 *
 * `todayIsoDate` is the right tool despite its name: it formats a moment as the calendar date it
 * falls on using local getters, and "today" is only what its default argument means.
 */
function calendarDateOf(instant: string): string {
  return todayIsoDate(new Date(instant));
}

/** Where a row links back to: the Chat view, carrying the session to resume. */
export function conversationHref(sessionId: string): string {
  return `${INSIGHTS_TAB_HREFS.chat}?${SESSION_PARAM}=${encodeURIComponent(sessionId)}`;
}

export type AssistantHistoryScreenProps = {
  sessions: readonly AssistantSession[];
  /**
   * Today, for the relative caption.
   *
   * A parameter with a default rather than a bare clock read, the shape `formatRelativeDate` and
   * every helper in `lib/date.ts` already take, so a story and a suite can pin "Today" without
   * faking a timer. It inherits the frontend-host-zone gap `RecentTransactionsCard` documents at
   * length; `docs/TODO.md` carries it. What it no longer carries is a **second** zone on top of
   * that one - see {@link calendarDateOf}.
   */
  today?: string;
};

export function AssistantHistoryScreen({ sessions, today }: AssistantHistoryScreenProps) {
  if (sessions.length === 0) {
    return (
      <main className="flex flex-1 flex-col pb-10">
        <EmptyState
          icon={<MessagesSquare className="size-8" aria-hidden="true" />}
          heading={HISTORY_EMPTY_COPY.heading}
          body={HISTORY_EMPTY_COPY.body}
          action={
            <Link className="btn btn-primary" href={INSIGHTS_TAB_HREFS.chat}>
              {HISTORY_EMPTY_COPY.action}
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="flex-1 pb-10">
      <ul className="list bg-base-100 rounded-box border-base-300 border">
        {sessions.map((session) => (
          <li key={session.id} className="list-row">
            <div className="list-col-grow">
              <Link
                href={conversationHref(session.id)}
                className="focus-visible:outline-primary rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
              >
                {session.title}
              </Link>
              {/* The caption is outside the link, so the link's accessible name stays the title
                  alone. `formatRelativeDate` gives "Today", "Yesterday" or a short date. */}
              <div className="text-base-content/60 text-xs">
                Last active {formatRelativeDate(calendarDateOf(session.lastMessageAt), today)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
