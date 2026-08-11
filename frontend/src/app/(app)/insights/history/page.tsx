import { requireSessions } from '@/lib/assistant';

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
// **The header is two fixed literals as of PET-76, matching the Chat tab's**, so this route reads no
// period either and makes one request rather than two. `insights/page.tsx` carries the argument;
// what it means here is that the `Promise.all` this page was built around has one member left and is
// gone with it.
//
// No `export const dynamic`: the cookie read behind `requireSessions()` opts this route out of
// static rendering on its own, and `(app)/layout.tsx`'s `requireProfile()` does it again above.

export default async function AssistantHistoryPage() {
  const { sessions } = await requireSessions();

  return (
    <>
      <PageHeader overline="Your very own personal" title="AI Assistant" />

      <InsightsTabs active="history" />

      <AssistantHistoryScreen sessions={sessions} />
    </>
  );
}
