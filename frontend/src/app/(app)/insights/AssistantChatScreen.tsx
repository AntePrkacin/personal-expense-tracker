'use client';

import { MessageSquareText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { FormError } from '@/components/FormError';
import type { AssistantConversation, AssistantMessage } from '@/lib/assistant';
import { sendAssistantMessage, type SendMessageResult } from '@/lib/sendAssistantMessage';

import { AssistantComposer } from './AssistantComposer';
import { AssistantMessageList } from './AssistantMessageList';
import { TypingIndicator } from './TypingIndicator';
import { FAILURE_COPY, OPTIMISTIC_ID, optimisticMessage, truncationNotice } from './assistantChat';
import { scrollToLatest } from './chatScroll';

// The Chat view's `<main>` (PET-73). The header and the tab bar above it are `page.tsx`'s and stay
// Server Components.
//
// **A client component rendering `<main>` only**, which is a genuine improvement on the
// `InsightsScreen` this replaces: that one had to wrap the page header because Regenerate's label
// and disabled state were derived from the same value the cards were. Nothing in this header
// depends on the conversation, so the boundary sits where the state does.
//
// **The send is an injectable prop with a default, and the default is what makes it legal.** Both
// transaction modals take `create` and `scan` as required props passed down from a Server
// Component, and copying that shape here **fails at runtime**: those two are Server Actions, which
// React can serialise across the RSC boundary precisely because `'use server'` replaces them with a
// reference. `sendAssistantMessage` is an ordinary browser function - it has to be, since
// cancellation needs a `fetch` the composer can abort - so passing it from `page.tsx` produced
// "Functions cannot be passed directly to Client Components". **No gate caught that**: it is a
// server-render failure, and the suite injects its own `jest.fn()` so it never exercises the
// default. The browser walk found it on the first load of `/insights`.
//
// So the prop stays for the reasons injection was wanted - the suite passes a `jest.fn()`, the
// stories pass stubs, and the `@/` alias trap stays out of both - and the **default is resolved
// here, inside the client bundle**, so nothing crosses the boundary. `page.tsx` passes no `send` at
// all.
//
// **How a turn lands.** Append the user's message optimistically, set pending, await the send
// **inside a `try`**, then append the reply and adopt the returned session id and title. On any
// failure, remove the optimistic message, put the text back in the composer, and render one line.
// That removal is not fussiness: the backend persists nothing unless the reply arrives, so leaving
// the question on screen asserts a stored turn that does not exist and a reload would make it
// vanish.
//
// **A cancel takes the same path minus the message.** The optimistic message is removed and the
// text restored exactly as on a failure, and nothing is rendered - so the screen returns to
// precisely the state it was in before the user pressed send. The `try` therefore branches on the
// abort **before** it reaches the taxonomy, not after.
//
// **The `try` is load-bearing rather than defensive.** A `fetch` rejects on a dropped connection as
// readily as a Server Action did, and uncaught it leaves the pending state up forever with the
// composer stuck on "Stop" - the exact review finding the scan handler produced, arrived at through
// a different mechanism.
//
// **The conversation scrolls to its newest turn, and the page is what scrolls.** `chatScroll.ts`
// carries why there is no bounded message region and why this is not `scrollIntoView`. It runs in
// an effect rather than inside `submit`, so it fires after React has committed the new bubbles -
// scrolling before they exist would scroll to the old bottom. An effect is the right tool here and
// not the thing `react-hooks/set-state-in-effect` forbids: this writes to the DOM rather than
// setting state.

/** Ours, like every string on this screen. Joins what A29 owes a designer. */
export const CHAT_EMPTY_COPY = {
  heading: 'Ask about your spending',
  body: 'The assistant reads the transactions on this account and answers questions about them. Try "how much did I spend on groceries last month?"',
};

/** Shown when a `?session=` named nothing, which drops the parameter rather than 404ing. */
export const MISSING_SESSION_NOTICE =
  'That conversation is no longer available. This is a new one.';

export type AssistantChatScreenProps = {
  /**
   * The conversation being resumed, or `null` for a fresh one.
   *
   * Resolved by `page.tsx` from `?session=`. A parameter naming nothing arrives as `null` beside
   * `missingSession`, which is the state that renders the notice above.
   */
  conversation: AssistantConversation | null;
  /** True when a `?session=` was present and named nothing live. */
  missingSession?: boolean;
  /**
   * The send. Defaults to the real one; the suite and the stories pass their own.
   *
   * **Optional with a default rather than required**, which is the one place this departs from
   * the transaction modals - see the header comment. A required prop would have to be passed from
   * `page.tsx`, and a plain browser function cannot cross the RSC boundary.
   */
  send?: (
    body: { message: string; sessionId?: string },
    signal?: AbortSignal,
  ) => Promise<SendMessageResult>;
};

export function AssistantChatScreen({
  conversation,
  missingSession = false,
  send = sendAssistantMessage,
}: AssistantChatScreenProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(conversation?.messages ?? []);
  const [sessionId, setSessionId] = useState<string | undefined>(conversation?.id);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [truncation, setTruncation] = useState<string | null>(null);

  /**
   * The turn in flight, so "Stop" can abort it.
   *
   * A ref rather than state: nothing renders from it, and it is read at the moment of the click
   * rather than from the closure the render made - the same call `AddTransactionModal`'s scan lock
   * settles on.
   */
  const controllerRef = useRef<AbortController | null>(null);

  // Keyed on what actually changes the height: a bubble arriving or leaving, and the typing
  // indicator appearing. Deliberately not on every render.
  useEffect(() => {
    scrollToLatest(document.scrollingElement);
  }, [messages.length, pending]);

  const submit = async () => {
    const message = draft.trim();
    if (message.length === 0 || pending) {
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    // Optimistic, and cleaned up on every path that is not a success.
    const optimistic = optimisticMessage(message, new Date().toISOString());
    setMessages((previous) => [...previous, optimistic]);
    setDraft('');
    setFailure(null);
    setTruncation(null);
    setPending(true);

    const restore = () => {
      setMessages((previous) => previous.filter((entry) => entry.id !== OPTIMISTIC_ID));
      setDraft(message);
    };

    try {
      const result = await send({ message, sessionId }, controller.signal);

      if (result.ok) {
        // The server's own stored question replaces the optimistic one, so the ids on screen are
        // the real ones from here on.
        setMessages((previous) => [
          ...previous.filter((entry) => entry.id !== OPTIMISTIC_ID),
          result.data.message,
          result.data.reply,
        ]);
        setSessionId(result.data.sessionId);
        if (result.data.truncation) {
          setTruncation(truncationNotice(result.data.truncation));
        }
        return;
      }

      // **The abort branch comes before the taxonomy**, not after: a cancel is a deliberate act
      // and carries no copy at all, so folding it into the generic arm would show a failure
      // message for something the user chose.
      if (result.aborted) {
        restore();
        return;
      }

      restore();
      setFailure(FAILURE_COPY[result.reason]);

      // A conversation that is gone must not be sent to again, or every retry 404s forever. The
      // text is kept, so the next send starts a new conversation with the same question - which
      // is exactly what that arm's copy promises.
      if (result.reason === 'missingSession') {
        setSessionId(undefined);
      }
    } catch {
      // A rejected `fetch` this module did not classify. Uncaught it would leave the composer on
      // "Stop" forever.
      restore();
      setFailure(FAILURE_COPY.failed);
    } finally {
      setPending(false);
      controllerRef.current = null;
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-4 pb-10">
      {missingSession ? (
        <p role="status" className="text-base-content/60 text-sm">
          {MISSING_SESSION_NOTICE}
        </p>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-8" aria-hidden="true" />}
          heading={CHAT_EMPTY_COPY.heading}
          body={CHAT_EMPTY_COPY.body}
        />
      ) : (
        <AssistantMessageList messages={messages} />
      )}

      {/* Mounted in every state, because a live region created with its content is not announced.
          See `TypingIndicator`. */}
      <TypingIndicator pending={pending} />

      {truncation ? (
        <p role="status" className="text-base-content/60 text-xs">
          {truncation}
        </p>
      ) : null}

      {failure ? <FormError message={failure} /> : null}

      <AssistantComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submit()}
        onStop={() => controllerRef.current?.abort()}
        pending={pending}
      />
    </main>
  );
}
