import { readConversation } from '@/lib/assistant';
import { currentPeriod, readPeriods } from '@/lib/periods';

import { PageHeader } from '../PageHeader';
import { InsightsTabs } from './InsightsTabs';
import { ChatSlot, NewChatButton, NewChatProvider } from './NewChat';
import { SESSION_PARAM } from './AssistantHistoryScreen';

// The assistant's Chat view (PET-73). This route used to be the AI Insights screen; those cards
// live on the Dashboard now, and `/insights` answers questions instead of repeating them.
//
// **The header and the tab bar are Server Components and the screen below them is the client
// one.** That is a genuine improvement on the `InsightsScreen` this replaces, which had to wrap
// the header because Regenerate's label and disabled state came from the same value the cards did.
// Nothing in this header depends on the conversation.
//
// **That still holds, and PET-73's review narrowed it by one control.** "New chat" is a client
// component now, because a link cannot reset client state on the URL it already points at, so the
// header renders one client leaf inside otherwise server-rendered markup - which is not the thing
// this paragraph rules out. `NewChat.tsx` carries the account; nothing in the header reads the
// conversation still, which is the claim that mattered.
//
// **The title is "Assistant" and the sidebar label is not.** `ui/Sidebar` renders "Insights" under
// a section heading "ASSISTANT"; renaming the item would repeat that heading directly above it and
// cost edits to the item list, the section list and the suite pinning both strings. So the sidebar
// is untouched and the **title** changes, which **amends INS-1 again** - the Jira ticket carries
// the note.
//
// **The overline stays the period**, so the four routed views keep reading consistently - the same
// argument the 2026-08-08 review made when it took this overline to a period in the first place.
// It is still the one of the four whose period does not ride on the screen's own read, because a
// conversation has no period; `GET /api/periods` answers it.
//
// **Resuming is `?session=`, not a dynamic segment**, and an unknown one **drops the parameter and
// renders an empty chat with a `role="status"` line** rather than `notFound()`. That is the call
// `transactions/[id]/page.tsx` already makes about an invalid `?sort=`, and it avoids a
// `not-found.tsx` for this segment entirely.
//
// No `export const dynamic`: the cookie read behind `readPeriods()` opts this route out of static
// rendering on its own, exactly as it does everywhere else in the app.

export default async function AssistantChatPage({
  searchParams,
}: {
  // Awaited, which Next 15 onward requires: `searchParams` is a promise, and destructuring it
  // synchronously is the mistake that reads as an empty object rather than as an error.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams)[SESSION_PARAM];
  // A repeated key arrives as an array. Taking neither rather than the first is the honest answer:
  // two conversation ids in one URL names no single conversation.
  const requested = typeof raw === 'string' ? raw : undefined;

  const [periods, conversation] = await Promise.all([
    readPeriods(),
    requested === undefined ? Promise.resolve(null) : readConversation(requested),
  ]);

  return (
    // **The provider wraps the header as well as `<main>`**, `FilterNavigation`'s requirement for
    // the same reason: "New chat" lives in the header and the state it resets lives below. It is
    // the only client boundary this file introduces - the header, the tab bar and this page all
    // stay Server Components.
    <NewChatProvider>
      <PageHeader
        // The empty string is unreachable through the API - every account has at least the period
        // it is in - and it is written rather than asserted because a header with a blank overline
        // is a smaller failure than a screen replaced by the error boundary over a label.
        overline={currentPeriod(periods)?.label ?? ''}
        title="Assistant"
        action={
          // A button rather than the link this shipped as, because a link to the URL the user is
          // already on resets nothing and the conversation is client state. `NewChat.tsx` carries
          // the full account. History carries no action at all, which `PageHeader`'s optional
          // slot already supports.
          <NewChatButton />
        }
      />

      <InsightsTabs active="chat" />

      {/* **Keyed on the requested session**, which is what makes every change the URL can express
          - a History link to another conversation, Back, a bookmarked `?session=` - re-seed the
          chat rather than leave the previous one on screen still posting its own id. "New chat" on
          the current URL is the case a key cannot see; `ChatSlot` is where that half lives.

          **The sentinel is namespaced, and a review of the first version is why.** `requested` is
          the raw query value, so a bare `'new'` for "no parameter" shared its key with a literal
          `?session=new` - and the reconciliation this key exists to prevent came back for exactly
          that pair. A prefix costs nothing and cannot collide with a value at all.

          **No `send` prop.** It defaults inside the client bundle, because `sendAssistantMessage`
          is an ordinary browser function rather than a Server Action and React cannot serialise
          one across this boundary - passing it here is a 500 on every load of this route, which is
          how the browser walk found it. `AssistantChatScreen` carries the full account. */}
      <ChatSlot
        key={`session:${requested ?? ''}`}
        conversation={conversation}
        missingSession={requested !== undefined && conversation === null}
      />
    </NewChatProvider>
  );
}
