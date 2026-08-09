'use server';

import { authorizedPost } from '@/lib/session';

// "Regenerate" (INS-1): the trigger behind the AI Insights page's one control.
//
// **A Server Action rather than a route handler**, which is the split
// `docs/agents/api-contract.md` sets and `lib/createTransaction.ts` is the precedent for: a
// handler is for when the browser *navigates to* the call, and this is a button on a page the
// user stays on. It also keeps `BACKEND_URL` and the bearer token server-side without opening
// a POST endpoint on the frontend's own origin.
//
// **Named after the operation rather than the entity, and that is load-bearing.**
// `'use server'` makes *every* export of this module a Server Action and an action must be an
// async function, so `lib/insights.ts` could not have hosted this beside its reads - the
// identical constraint that put `createTransaction` and `deleteTransaction` in files of their
// own rather than inside `lib/transactions.ts`.
//
// **It takes no token and no user id, and must never take either.** The credential comes off
// the httpOnly cookie inside `authorizedPost`, so a caller can only ever regenerate their own
// account's insights - which is the whole reason publishing this as an action is safe.

/**
 * What the page needs to know, which is whether to start polling.
 *
 * **A 409 is `ok`, and that is the decision this type exists to record.** The backend answers
 * it when a run is already in flight - started by another tab, by a transaction the user just
 * saved, or by a double click - and in every one of those cases the thing the button was
 * pressed for is already happening. Reporting it as an error would put a failure message over
 * a page that is about to show fresh content. So the caller enters polling on both, and the
 * page has no error state to draw at all, which is what A26 asks for.
 *
 * Two failures rather than one, because they want different things from the user:
 *
 * - **`unauthenticated`** is a 401: the session died while the page was open. It deliberately
 *   does **not** redirect - a `redirect()` inside an action throws, so `await generate()`
 *   would never resolve and the button would sit disabled forever, which is the mechanism
 *   `lib/createTransaction.ts` documents.
 * - **`failed`** is everything else, including the request that never completed.
 */
export type GenerateInsightsResult =
  { ok: true } | { ok: false; reason: 'unauthenticated' | 'failed' };

/**
 * Starts a generation run, or reports that one is already going.
 *
 * `POST /api/insights/generate` takes **no body** - the account is the whole of the input, and
 * it comes off the cookie - so the empty object below is `authorizedPost`'s signature being
 * satisfied rather than a payload. It answers **202**, not 200: the run is floated and only
 * the `generating` row is committed before it returns, which is what makes polling the way to
 * learn the result rather than reading a response.
 */
export async function generateInsights(): Promise<GenerateInsightsResult> {
  const result = await authorizedPost('/api/insights/generate', {});

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 409:
      // A run is already in flight. See the type: this is success as far as the page is
      // concerned, because the page's next move - poll until the state settles - is the same
      // move either way.
      return { ok: true };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
