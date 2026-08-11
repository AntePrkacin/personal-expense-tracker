import { requireSessions } from '@/lib/assistant';
import { currentPeriod, readPeriods } from '@/lib/periods';

import { PageHeader } from '../../PageHeader';
import { AssistantHistoryScreen } from '../AssistantHistoryScreen';
import { InsightsTabs } from '../InsightsTabs';

// The assistant's History view (PET-73): every conversation the account has held.
//
// **A static segment beside no dynamic one**, so nothing shadows it - unlike
// `/transactions/categories`, which sits beside `[id]` and relies on Next resolving static first.
// And it needs no change to `SidebarNav` at all: `matchItem()` matches by prefix with a
// trailing-slash boundary, so nesting under `/insights` keeps Insights lit for free.
//
// **It awaits the sessions read and hands the resolved list to a synchronous screen**, the shape
// `/transactions` set and every screen since has copied - which is what lets Storybook draw both
// states with no request scope and no mocks.
//
// **No header action.** `PageHeader`'s action is optional, and "New chat" belongs on the Chat tab
// where it means something: from here the Chat tab itself is the way to a new conversation.
//
// No `export const dynamic`: the cookie read behind `requireSessions()` opts this route out of
// static rendering on its own.

export default async function AssistantHistoryPage() {
  // Independent reads, so they go in parallel. `requireSessions()` is the one that decides whether
  // the session is alive; `readPeriods()` throws rather than redirecting, which is the split every
  // multi-read page in this app keeps - two opinions about a dead cookie on one page is the shape
  // the `/dashboard` to `/login` loop came out of.
  const [{ sessions }, periods] = await Promise.all([requireSessions(), readPeriods()]);

  return (
    <>
      <PageHeader overline={currentPeriod(periods)?.label ?? ''} title="Assistant" />

      <InsightsTabs active="history" />

      <AssistantHistoryScreen sessions={sessions} />
    </>
  );
}
