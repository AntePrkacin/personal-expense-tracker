import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet, authorizedPostJson, type AuthorizedBodyResult } from '@/lib/session';
import type { components, operations } from '@/types/api';

// The assistant's three server-side calls: two reads for the two screens, and the send the route
// handler makes on the browser's behalf.
//
// **It has three exports for the reason `lib/insights.ts` has two, and the third is the new
// shape.** The reads are called from a `page.tsx` and redirect a dead session, which is
// `lib/dashboard.ts`'s policy. The **send** must not: it is called from
// `app/api/assistant/messages/route.ts`, and a `redirect()` reached from inside a route handler
// answers the browser's `fetch` with an HTML login page carrying a **200** - which the composer
// would render as a reply. So it returns an `AuthorizedBodyResult` and the handler maps a dead
// session to a bare 401, exactly as `app/api/insights/route.ts` already does for its read.
//
// An earlier draft of PET-73's plan said the two-export shape did not apply here, on the grounds
// that it exists for a poll this feature does not have. That reasoning was about the wrong half:
// the split exists because a **route handler** and a Server Component answer a dead session
// differently, and this feature has both.
//
// **The send is not a Server Action, and cancellation is the whole reason.** A client component
// calling an action has no `AbortController` to reach - the RPC is opaque and takes no `signal` -
// which is why the receipt scan settled for a generation-counter ref that discards a late result
// while the request runs to completion. At roughly 40k input tokens and tens of seconds on a free
// tier, that was the wrong trade. See `docs/explainers/cancelling-an-ai-request.md`.

/** `GET /api/assistant/sessions`'s 200, read from the contract rather than declared. */
export type AssistantSessions =
  operations['AssistantController_sessions']['responses'][200]['content']['application/json'];

/** One conversation as the History list draws it. */
export type AssistantSession = AssistantSessions['sessions'][number];

/** `GET /api/assistant/sessions/{id}`'s 200. */
export type AssistantConversation =
  operations['AssistantController_conversation']['responses'][200]['content']['application/json'];

/** One stored message, user or assistant. */
export type AssistantMessage = AssistantConversation['messages'][number];

/** What the send answers with: the whole turn, plus the session it belongs to. */
export type SendMessageResponse = components['schemas']['SendMessageResponseDto'];

/** What the send asks for. `sessionId` absent starts a conversation. */
export type SendMessageBody = components['schemas']['SendMessageDto'];

/**
 * Every conversation, newest activity first, or the access flow.
 *
 * `lib/dashboard.ts`'s policy, because this is read from a `page.tsx`: only a 401 or a missing
 * cookie means signed out, and everything else throws so `app/error.tsx` renders something a
 * reload retries.
 */
export async function requireSessions(): Promise<AssistantSessions> {
  const result = await authorizedGet<AssistantSessions>('/api/assistant/sessions');

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your conversations: the backend did not answer.');
}

/**
 * One conversation with its messages, or `null` when it is not there.
 *
 * **A missing conversation is `null` rather than `notFound()`**, which is the one place this
 * departs from `lib/transactionDetail.ts`. Resuming is a **query parameter** here, not a dynamic
 * segment, so there is no `/insights/[sessionId]` route for a `not-found.tsx` to belong to - and
 * the honest answer to a stale `?session=` is the same one `transactions/[id]/page.tsx` gives an
 * invalid `?sort=`: drop the parameter and render the screen. The chat screen says so in a
 * `role="status"` line rather than replacing the page.
 */
export async function readConversation(sessionId: string): Promise<AssistantConversation | null> {
  const result = await authorizedGet<AssistantConversation>(
    `/api/assistant/sessions/${encodeURIComponent(sessionId)}`,
  );

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  // `missing` is a 404 - the conversation is gone or never existed. A 400 from `ParseUUIDPipe`
  // arrives as `unavailable`, which is the same answer to the user: this id names nothing they
  // can open. Both drop the parameter rather than replacing the screen.
  if (result.reason === 'missing') {
    return null;
  }

  throw new Error('Could not load that conversation: the backend did not answer.');
}

/**
 * Sends one message, **without redirecting**, and hands back the whole turn.
 *
 * The non-redirecting half, called only by `app/api/assistant/messages/route.ts`. See the header
 * comment for why a redirect here would be worse than useless.
 *
 * @param signal the second hop of the abort chain: `request.signal` from the route handler,
 * threaded into the fetch at the backend so an abandoned turn stops spending quota.
 */
export async function sendMessage(
  body: SendMessageBody,
  signal?: AbortSignal,
): Promise<AuthorizedBodyResult<SendMessageResponse>> {
  return authorizedPostJson<SendMessageResponse>('/api/assistant/messages', body, signal);
}
