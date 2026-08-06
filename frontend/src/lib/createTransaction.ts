'use server';

import { authorizedPost } from '@/lib/session';
import type { components } from '@/types/api';

// "Add transaction" (ADD-3): the app's **first authenticated write**.
//
// **A Server Action rather than a route handler**, which is the split
// `docs/agents/api-contract.md` sets: a handler is for when the browser *navigates to* the
// call, as PET-52's verify does, and this is a form submitting from a page it stays on. It
// also keeps `BACKEND_URL` and the bearer token server-side without opening a POST endpoint
// on the frontend's own origin that nothing but this modal should reach.
//
// **In `lib/` rather than an `actions.ts` beside a route, and `lib/resend.ts` set that
// precedent.** The modal opens from three route segments - Dashboard, Transactions and
// eventually AI Insights - so an action under `app/(app)/transactions/` would make a shared
// component import its result type from one particular route, which is the layering
// inversion that moved `resendLoginLink` out of `app/check-email/`. Here it is not a second
// caller discovered later; it has three hosts on day one.
//
// **Named after the operation, not the entity, and that is load-bearing.** `'use server'`
// makes *every* export of this module a Server Action, and an action must be an async
// function - so `lib/transactions.ts` could not have hosted this beside its reads, and a
// `lib/transactions.write.ts` holding one function is what naming it after the operation
// avoids. Exporting a `type` from a `'use server'` file is fine; `lib/resend.ts` does it.
//
// **It takes no token and no user id, and must never take either.** The credential comes
// off the httpOnly cookie inside `authorizedPost`, so a caller can only ever write to their
// own account - which is the whole reason publishing this as an action is safe.

/** The request body, read off the contract rather than declared. */
type CreateTransactionBody = components['schemas']['CreateTransactionDto'];

/**
 * What the modal needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and this file inherits:
 * an unhandled rejection inside a Server Action reaches the client as an opaque digest with
 * nothing a screen can render, so a throw here would leave the modal unable to tell a
 * rejected body from an unreachable backend.
 *
 * Four failures rather than one, because each wants different advice and two of them are
 * recoverable:
 *
 * - **`invalid`** is a 400: our predicates and the DTO disagree. Reachable through the
 *   bounds `(app)/transactionForm.ts` deliberately does not mirror - a merchant over 200
 *   characters, a note over 500, an amount over `@Max(1_000_000_000)` - and its copy must
 *   say "check the values", never "try again", which for an unacceptable body loops forever.
 * - **`categoryMissing`** is a 404: the `categoryId` names no category of theirs, which
 *   happens when one is deleted in another tab while the modal sits open. The only failure
 *   here with an obvious next action, so it gets its own line telling them to pick another.
 * - **`unauthenticated`** is a 401: the session died with a half-typed form on screen. It
 *   deliberately does **not** redirect - see below.
 * - **`failed`** is everything else, including the request that never completed.
 *
 * `reason` strings rather than raw statuses, matching `lib/resend.ts`, so no component ever
 * restates HTTP.
 */
export type CreateTransactionResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'categoryMissing' | 'unauthenticated' | 'failed' };

/**
 * Records one expense.
 *
 * **A 401 answers rather than redirecting**, which is the opposite call from
 * `lib/transactions.ts` and deliberate twice over. A `redirect()` inside an action throws,
 * so `await create(body)` would never resolve and the modal would sit disabled forever -
 * the same mechanism `registerAccount` documents for why it stashes instead of redirecting.
 * And it would discard everything typed, on a form the user could have saved by signing in
 * again in another tab. The modal shows a line and offers the way out instead.
 *
 * Note the shell has already read the profile through the same guard by the time this runs,
 * so a 401 here means the session died between opening the modal and submitting it.
 */
export async function createTransaction(
  body: CreateTransactionBody,
): Promise<CreateTransactionResult> {
  const result = await authorizedPost('/api/transactions', body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      return { ok: false, reason: 'categoryMissing' };
    default:
      // Every other status, plus `undefined` for the request that never completed. The
      // modal's copy is the same for both, because there is nothing useful to say about
      // the difference to somebody who just wants their coffee logged.
      return { ok: false, reason: 'failed' };
  }
}
