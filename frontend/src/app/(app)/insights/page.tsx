import { readConversation, readSessionCount } from '@/lib/assistant';

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
// **The title is "AI Assistant" and so is the sidebar label, as of PET-76.** The paragraph this
// replaces argued the opposite and it is worth knowing why: `ui/Sidebar` rendered "Insights" under
// a section heading "ASSISTANT", so renaming the item would have repeated that heading directly
// above it - which made "keep the sidebar, change the title" the cheap answer, and left the one
// item in the navigation naming something different from the page it opens. The heading is
// "INSIGHTS" now and the item is "AI Assistant", so the two agree and this **amends INS-1 a third
// time**. `ui/Sidebar.tsx` carries what that costs, which the product owner accepted.
//
// **The overline is a fixed literal and this screen reads no period at all.** It was the current
// period's label, on the 2026-08-08 review's argument that the four routed views should read
// consistently - and this is the one of the four where that cost a whole request, because a
// conversation has no period, so `GET /api/periods` was called for a string in a header and nothing
// else. Naming a period over a chat that spans any number of them was also the weakest of the four
// claims. So both routes lose `readPeriods()` - one fewer request per view on each - and
// `currentPeriod` goes with them, having had exactly these two callers. `readPeriods` itself stays:
// the dashboard and the categories tab use it.
//
// **Resuming is `?session=`, not a dynamic segment**, and an unknown one **drops the parameter and
// renders an empty chat with a `role="status"` line** rather than `notFound()`. That is the call
// `transactions/[id]/page.tsx` already makes about an invalid `?sort=`, and it avoids a
// `not-found.tsx` for this segment entirely.
//
// No `export const dynamic`, and the reason moved rather than went away - this is the class of bug
// that froze a month name at build time once before, so `npm run build`'s output is checked for
// this route still reporting dynamic. Reading `searchParams` opts it out on its own, and
// `(app)/layout.tsx`'s `requireProfile()` reads a cookie above it either way, which is what covered
// every route in this app when its own `force-dynamic` was deleted.

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

  // **Two reads, and the paragraph this replaces is worth keeping because PET-76 wrote it and PET-76
  // undid it.** It said "one read rather than the two this made... a bare `/insights` now fetches
  // nothing at all", which was true when the header named no period and the tab bar carried no
  // badge. The badge is the second thing on this screen that is a fact about the *account* rather
  // than about the conversation, so something has to ask.
  //
  // What that costs is one **count** rather than one list: `GET /api/assistant/sessions/count`
  // answers a single integer over the same predicate the list uses, which is the whole reason that
  // endpoint exists rather than this page reading `sessions` and discarding the rows. So the claim
  // narrows from "fetches nothing" to "fetches nothing it does not draw".
  //
  // `Promise.all` because neither depends on the other, and serialising two independent round trips
  // is the mistake `/transactions` records for its own pair. Note `readSessionCount` **degrades to
  // `null`** rather than throwing, so a failed count costs the badge and not the chat.
  const [conversation, historyCount] = await Promise.all([
    requested === undefined ? Promise.resolve(null) : readConversation(requested),
    readSessionCount(),
  ]);

  return (
    // **The provider wraps the header as well as `<main>`**, `FilterNavigation`'s requirement for
    // the same reason: "New chat" lives in the header and the state it resets lives below. It is
    // the only client boundary this file introduces - the header, the tab bar and this page all
    // stay Server Components.
    <NewChatProvider>
      <PageHeader
        // Both literals, and both invented, so they join what A29 owes a designer along with every
        // other string on these two screens. The overline reads as a phrase leading into the title
        // rather than as a label of its own, which is what the four period overlines beside it are.
        overline="Your very own personal"
        title="AI Assistant"
        action={
          // A button rather than the link this shipped as, because a link to the URL the user is
          // already on resets nothing and the conversation is client state. `NewChat.tsx` carries
          // the full account. History carries no action at all, which `PageHeader`'s optional
          // slot already supports.
          <NewChatButton />
        }
      />

      <InsightsTabs active="chat" historyCount={historyCount} />

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
