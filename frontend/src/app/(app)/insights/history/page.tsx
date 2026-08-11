import { Button } from '@/components/ui/Button';
import { requireSessions } from '@/lib/assistant';

import { PageHeader } from '../../PageHeader';
import { AssistantHistoryScreen } from '../AssistantHistoryScreen';
import { INSIGHTS_TAB_HREFS, InsightsTabs } from '../InsightsTabs';

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
// **It carries "New chat" too, and here that control really is a link.** This shipped with no
// header action at all, on the argument that the Chat tab is itself the way to a new conversation -
// true, and it made the button appear and disappear as the user moved between two tabs of one
// feature, which reads as the control being broken rather than as it being unnecessary. So the
// action is on both.
//
// **A `href` rather than `NewChatButton`, and the reason is exactly the one `NewChat.tsx` records
// for refusing a link on the Chat tab.** There, the href *is* the current URL and the conversation
// is client state, so nothing navigated and nothing remounted. Neither clause holds here: the
// destination is a different route, so the navigation genuinely happens and `ChatSlot` mounts fresh
// with `conversation: null`, which is the whole of what "new chat" means. That means this page needs
// no `NewChatProvider`, no client boundary and no generation counter - it stays a Server Component.
//
// It is a **push**, unlike `start()`'s deliberate `replace`. That call exists so Back does not
// restore a `?session=` naming a conversation the user abandoned; from here there is no parameter to
// leave behind, and Back returning to the list the user was just reading is the better behaviour.
//
// **The header is two fixed literals as of PET-76, matching the Chat tab's**, so this route reads no
// period either and makes one request rather than two. `insights/page.tsx` carries the argument;
// what it means here is that the `Promise.all` this page was built around has one member left and is
// gone with it.
//
// No `export const dynamic`: the cookie read behind `requireSessions()` opts this route out of
// static rendering on its own, and `(app)/layout.tsx`'s `requireProfile()` does it again above.

export default async function AssistantHistoryPage() {
  const { sessions, total } = await requireSessions();

  return (
    <>
      <PageHeader
        overline="Your very own personal"
        title="AI Assistant"
        action={<Button label="New chat" variant="primary" href={INSIGHTS_TAB_HREFS.chat} />}
      />

      {/* **The count comes off the read this page already made**, not from a second request to
          `sessions/count`. `AssistantSessionsResponseDto` publishes `total` beside the rows for
          exactly this - and the two endpoints share one predicate backend-side, so the number here
          and the number the Chat tab draws cannot disagree. Reading `sessions.length` instead would
          be the mistake `TransactionsTable`'s badge already records: a future page size would
          silently turn a total into a page count. */}
      <InsightsTabs active="history" historyCount={total} />

      <AssistantHistoryScreen sessions={sessions} />
    </>
  );
}
