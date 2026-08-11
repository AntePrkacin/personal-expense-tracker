'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';

import { AssistantChatScreen, type AssistantChatScreenProps } from './AssistantChatScreen';
import { INSIGHTS_TAB_HREFS } from './InsightsTabs';

// "New chat", and the one thing on this screen that a link could not express.
//
// **A review of PET-73 is why this file exists, and the header comment it replaces was wrong in a
// way worth keeping.** That version made the action a `<Button href="/insights">` and argued the
// case at length: "a navigation rather than state, which keeps this header on the server and drops
// the session parameter for free". Every clause of that is true and the conclusion did not follow,
// because the conversation is **client state**. `AssistantChatScreen` seeds `messages`, `sessionId`
// and the rest from its props on mount only, and it is rendered at a fixed position with no `key`,
// so:
//
// - On a bare `/insights`, the href **is the current URL**. Nothing navigates, nothing remounts,
//   and `sessionId` still holds the live conversation - so the header's one action did nothing at
//   all, and the next message was appended to the conversation the user asked to leave.
// - On `/insights?session=A`, the navigation really happened and the server really handed back
//   `conversation: null`, and the screen went on rendering A's messages and posting A's id,
//   because React reconciles the same component at the same position rather than remounting it.
//
// So a reset that has to work on the **current** URL cannot be a navigation, and the state that
// needs resetting lives below `<main>` while the control lives in the page header. That is exactly
// `transactions/FilterNavigation.tsx`'s problem - two client pieces on opposite sides of a
// server-rendered boundary - and this is its answer: a provider wrapping both, which is also
// `InsightPollProvider`'s shape one directory over.
//
// **The reset is a `key`, not a pile of setters.** Remounting `AssistantChatScreen` re-seeds every
// piece of its state from the `conversation` prop in one move, which is the whole of what "new
// chat" means, and it leaves that component - and all of its own tests and stories - untouched. A
// render-phase adjustment inside it would have to enumerate five setters and grow a sixth the next
// time a piece of state is added.
//
// **The URL half is still a navigation, and both halves are needed.** `start()` also replaces the
// URL, so a `?session=` stops naming a conversation the screen is no longer showing - otherwise a
// reload would resume it. And `page.tsx` keys this component on the requested session, which is
// what handles every change the URL *can* express: a History link to another conversation, the
// browser's Back button, a bookmarked `?session=`. Neither half covers the other's case.
//
// **`replace`, not `push`**, `TransactionFilterBar`'s recorded call: a fresh chat is not a place to
// come back out of, and Back should leave the screen rather than restore a parameter naming a
// conversation the user abandoned.

type NewChat = {
  /** Bumped once per "New chat". The chat's `key`, and nothing else reads it. */
  generation: number;
  start: () => void;
};

const NewChatContext = createContext<NewChat | null>(null);

/**
 * Throws outside the provider rather than returning a no-op, `useFilterNavigation`'s call: a
 * control that quietly stops resetting is a bug that looks like a slow network.
 */
function useNewChat(): NewChat {
  const value = useContext(NewChatContext);

  if (value === null) {
    throw new Error('useNewChat must be called inside a NewChatProvider');
  }

  return value;
}

/** Wraps the header and `<main>` both, or the button and the chat cannot see one another. */
export function NewChatProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [generation, setGeneration] = useState(0);

  const start = useCallback(() => {
    // Unconditional rather than guarded on a parameter being present: replacing `/insights` with
    // itself costs one RSC round trip on a click the user makes rarely, and reading the current
    // parameter here to save it would put a second opinion about the URL beside `page.tsx`'s.
    router.replace(INSIGHTS_TAB_HREFS.chat);
    setGeneration((previous) => previous + 1);
  }, [router]);

  const value = useMemo(() => ({ generation, start }), [generation, start]);

  return <NewChatContext.Provider value={value}>{children}</NewChatContext.Provider>;
}

/** The header action. Secondary, because the page's emphasized control is the composer's Send. */
export function NewChatButton() {
  const { start } = useNewChat();

  return <Button label="New chat" variant="secondary" onClick={start} />;
}

/**
 * The chat, remounted whenever "New chat" is pressed.
 *
 * A wrapper rather than the `key` living in `page.tsx`, because the generation is context and a
 * Server Component cannot read it. Its props are the screen's own, passed straight through, which
 * keeps the injected `send` reachable from this suite exactly as it is from the screen's; `page.tsx`
 * passes none, for the reason `AssistantChatScreen` records at length - a plain browser function
 * cannot cross the RSC boundary, so passing one from a Server Component is a 500 on every load.
 */
export function ChatSlot(props: AssistantChatScreenProps) {
  const { generation } = useNewChat();

  // **The props are dropped as well as the state, and the race is why.** `start()` also replaces
  // the URL, so the server does eventually hand back `conversation: null` - but that is an RSC
  // round trip away, and a remount in the meantime would re-seed from the conversation the user
  // just abandoned. It would be on screen, and worse, a message sent inside that window would
  // carry its id: the defect this file exists to fix, arrived at through the fix.
  //
  // The baseline is **per mount** rather than a comparison against zero, which is what keeps a
  // later `?session=` working. `page.tsx` keys this component on the requested session, so a
  // navigation to another conversation remounts it and takes the current generation as its own
  // baseline; reading `generation !== 0` instead would force every conversation opened after the
  // first "New chat" to render empty.
  const [baseline] = useState(generation);
  const cleared = generation !== baseline;

  return (
    <AssistantChatScreen
      key={generation}
      {...props}
      conversation={cleared ? null : props.conversation}
      // The stale-`?session=` notice goes too: it explains a parameter the user has since replaced,
      // and "That conversation is no longer available" over a chat they deliberately started is a
      // line about nothing.
      missingSession={cleared ? false : props.missingSession}
    />
  );
}
