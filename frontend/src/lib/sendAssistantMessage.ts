import type { SendMessageBody, SendMessageResponse } from '@/lib/assistant';

// Sends one assistant turn from the browser, and classifies what came back.
//
// **A plain async function, not a Server Action, and not a `'use server'` module.** Every other
// write in this app is an action; this one runs in the **browser** and calls the frontend's own
// route handler, so it touches neither `next/headers` nor `BACKEND_URL` - the handler does both
// on its behalf. The reason it is shaped this way is cancellation: an action exposes no
// `AbortController` a client component can reach into, and a turn costs roughly 40k input tokens
// and runs for tens of seconds. See `docs/explainers/cancelling-an-ai-request.md`.
//
// **`lib/scanReceipt.ts` is the file this copies for its taxonomy**, not one of the category
// writes: it already publishes 429, 503 and 504, which the four-reason writes do not.

/** The one string that must not drift; the handler is the other half. Its suite pins the pair. */
export const SEND_PATH = '/api/assistant/messages';

/**
 * Why a turn produced no reply.
 *
 * Seven reasons, each earning its place because each needs different copy:
 *
 * - **`invalid`** is a 400: the message was empty, past the character cap, or the session id was
 *   not a uuid. The composer restates the cap client-side, so reaching this means the two
 *   disagreed.
 * - **`unauthenticated`** is a 401: the session died with the chat open.
 * - **`missingSession`** is a 404: the conversation is gone. **The id is dropped and the text is
 *   kept**, so the next send starts a new conversation with the same question rather than
 *   failing forever against a dead id.
 * - **`rateLimited`** is a 429: over the per-user chat limit. Its copy says **wait**, not retry.
 * - **`unavailable`** is a 503: `GEMINI_API_KEY` is unset on this deployment. Nothing the user
 *   does fixes it, so the copy must not blame the message.
 * - **`timedOut`** is a 504: the model call did not finish in time. **Retrying the identical
 *   question is the right next move**, which is exactly why it cannot fold into `failed`.
 * - **`failed`** is everything else, including a request that never completed.
 *
 * **Cancellation is an eighth outcome and deliberately not one of these.** An `AbortError` means
 * the user chose to stop, so it carries no copy at all: `aborted: true` restores the composer and
 * renders nothing. Folding it into `failed` would show a failure message for a deliberate act,
 * which is the same mistake as the no-results copy claiming an account is empty.
 */
export type SendMessageFailureReason =
  | 'invalid'
  | 'unauthenticated'
  | 'missingSession'
  | 'rateLimited'
  | 'unavailable'
  | 'timedOut'
  | 'failed';

export type SendMessageResult =
  | { ok: true; data: SendMessageResponse }
  | { ok: false; aborted: true }
  | { ok: false; aborted?: false; reason: SendMessageFailureReason };

/**
 * @param signal hop 1 of the abort chain. The composer owns the controller and "Stop" calls
 * `abort()`; the handler receives the dropped connection as `request.signal` and passes it to the
 * backend, whose Express `close` then aborts the Gemini call.
 */
export async function sendAssistantMessage(
  body: SendMessageBody,
  signal?: AbortSignal,
): Promise<SendMessageResult> {
  let response: Response;

  try {
    response = await fetch(SEND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    });
  } catch {
    // **The abort branch, and it must come before the taxonomy rather than after it.** `fetch`
    // rejects with an `AbortError` on a signal, which is indistinguishable in shape from a
    // dropped connection - so the signal itself is what is asked, not the error. Getting this
    // wrong renders an error message for something the user chose.
    if (signal?.aborted) {
      return { ok: false, aborted: true };
    }

    return { ok: false, reason: 'failed' };
  }

  if (response.ok) {
    try {
      return { ok: true, data: (await response.json()) as SendMessageResponse };
    } catch {
      // A 201 whose body will not parse. Unlike `authorizedPost`'s create, there is nothing to
      // salvage: the reply *is* the body, so there is no honest way to report success.
      return { ok: false, reason: 'failed' };
    }
  }

  switch (response.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      return { ok: false, reason: 'missingSession' };
    case 429:
      return { ok: false, reason: 'rateLimited' };
    case 503:
      return { ok: false, reason: 'unavailable' };
    case 504:
      return { ok: false, reason: 'timedOut' };
    default:
      return { ok: false, reason: 'failed' };
  }
}
