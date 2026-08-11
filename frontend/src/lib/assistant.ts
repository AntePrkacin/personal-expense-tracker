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

/** `GET /api/assistant/sessions/count`'s 200. */
export type AssistantSessionCount =
  operations['AssistantController_sessionCount']['responses'][200]['content']['application/json'];

/**
 * How many conversations there are, for the tab bar's badge, or `null` if it could not be asked
 * (PET-76).
 *
 * **A fourth failure policy, and it is `lib/palette.ts`'s rather than `requireSessions`' above.**
 * That read is the *contents* of the History screen, so an unanswerable backend has to reach
 * `app/error.tsx`; this one is a number on a chrome element that both routes draw. Throwing would
 * replace a working chat - a screen whose own data is already in hand - because a badge could not
 * be numbered, which is the trade `lib/transactions.ts` gets right in the other direction.
 *
 * **And it deliberately does not decide whether the session is alive**, the clause
 * `lib/palette.ts` carries in as many words. `(app)/layout.tsx`'s `requireProfile()` has already
 * answered that for every route below it, and a second opinion about a dead cookie is the shape the
 * `/dashboard` to `/login` loop came out of. So a 401 here degrades like anything else: no badge.
 *
 * The consequence to know is that **a missing badge is not "no conversations"** - zero renders as a
 * `0`, and `null` renders nothing at all. `InsightsTabs` is where that distinction is drawn.
 */
export async function readSessionCount(): Promise<number | null> {
  const result = await authorizedGet<AssistantSessionCount>('/api/assistant/sessions/count');

  return result.ok ? result.data.total : null;
}

/**
 * `8-4-4-4-12` hex and nothing else, matching what `ParseUUIDPipe` accepts.
 *
 * Shape only, deliberately: this is not a claim that the id names a live conversation, which is
 * the backend's to answer. It is what tells a **malformed** value apart from a merely unknown one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One conversation with its messages, or `null` when it is not there.
 *
 * **A missing conversation is `null` rather than `notFound()`**, which is the one place this
 * departs from `lib/transactionDetail.ts`. Resuming is a **query parameter** here, not a dynamic
 * segment, so there is no `/insights/[sessionId]` route for a `not-found.tsx` to belong to - and
 * the honest answer to a stale `?session=` is the same one `transactions/[id]/page.tsx` gives an
 * invalid `?sort=`: drop the parameter and render the screen. The chat screen says so in a
 * `role="status"` line rather than replacing the page.
 *
 * **A malformed id is dropped here rather than asked about**, and a review of PET-73 is why this
 * function has a shape check at all. The docblock already promised that a stale `?session=` drops
 * the parameter, and `frontend/src/app/CLAUDE.md` says the same - but `GET
 * /api/assistant/sessions/{id}` answers a non-uuid with a **400** from `ParseUUIDPipe`, which
 * `authorizedGet` reports as `unavailable`, indistinguishable here from an unreachable backend and
 * therefore thrown. So `/insights?session=abc` - a truncated paste, a hand-edited URL - replaced
 * the whole screen with the error boundary. Validating the shape is
 * `lib/periodParams.ts`'s call for the identical problem: **validate and do not canonicalise**, so
 * a well-formed id the account does not have is still forwarded and still answered by the 404
 * arm below. The `unavailable` throw stays, now unreachable from this caller, because it is what a
 * genuinely unanswerable backend still deserves.
 */
export async function readConversation(sessionId: string): Promise<AssistantConversation | null> {
  if (!UUID.test(sessionId)) {
    return null;
  }

  const result = await authorizedGet<AssistantConversation>(
    `/api/assistant/sessions/${encodeURIComponent(sessionId)}`,
  );

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  // `missing` is a 404 - the conversation is gone or never existed, which drops the parameter
  // rather than replacing the screen. A non-uuid never reaches here at all; see the shape check
  // above for why it cannot be folded in on this side of the request.
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
