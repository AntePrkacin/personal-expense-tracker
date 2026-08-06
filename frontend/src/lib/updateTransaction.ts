'use server';

import { authorizedPatch } from '@/lib/session';
import type { components } from '@/types/api';

// "Save changes" in the edit modal (EDT-2): the app's **third authenticated write**, after
// `lib/createTransaction.ts` and `lib/deleteTransaction.ts`.
//
// Everything structural about those two applies here unchanged - a Server Action rather than a
// route handler because the modal submits from a page it stays on, in `lib/` rather than an
// `actions.ts` beside a route because the modal is mounted on the shell, named after the
// operation because `'use server'` makes every export an action and `lib/transactions.ts` could
// not host it beside the reads, and taking no token and no user id because the credential comes
// off the httpOnly cookie inside `authorizedPatch`. So this comment records only what differs.
//
// **It takes the body the caller built rather than a whole transaction**, and that is what makes
// the 404 classifiable. `(app)/transactionForm.ts`'s `toUpdateTransactionBody` diffs the form
// against the row it opened on and emits only the changed fields, so this function can read
// whether a `categoryId` is in play - which is the one fact that narrows the ambiguous 404 below.
// Handing it a full transaction and diffing here would have put that decision in a module with no
// reason to know about form state.
//
// **The empty body never reaches here.** `PATCH /api/transactions/:id` answers 400 with
// `Provide at least one field to update.` for a body with no keys, and the modal closes without
// calling this at all when nothing changed - so that 400 is unreachable by construction rather
// than handled. Recorded because the alternative reads like a missing case.

/** The request body, read off the contract rather than declared. Every field is optional. */
type UpdateTransactionBody = components['schemas']['UpdateTransactionDto'];

/**
 * What the modal needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and both writes before this
 * one inherit: an unhandled rejection inside a Server Action reaches the client as an opaque
 * digest with nothing a screen can render.
 *
 * **Five failures, where the create publishes four and the delete three**, and the extra one is
 * this endpoint's ambiguous 404 rather than a new kind of advice:
 *
 * - **`invalid`** is a 400: our predicates and the DTO disagree. Reachable through the bounds
 *   `(app)/transactionForm.ts` deliberately does not mirror - a merchant over 200 characters, a
 *   note over 500, an amount over `@Max(1_000_000_000)` - and also through a malformed id, which
 *   `ParseUUIDPipe` rejects. Both fold together for `deleteTransaction`'s reason: a bad id is not
 *   something the person holding the modal can act on, and the copy for a rejected value is the
 *   more useful of the two. It must say "check the values", never "try again", which for a body
 *   the DTO rejects loops forever.
 * - **`transactionMissing`** is a 404 on a patch carrying no `categoryId`, so the only thing that
 *   can be missing is the transaction. Reached by editing a row another tab deleted, or one a
 *   `router.refresh()` has not caught up with.
 * - **`transactionOrCategoryMissing`** is a 404 on a patch that does carry one, where the backend
 *   answers the same status for a transaction it cannot find and a category it cannot find. See
 *   the function below for why this is two reasons rather than one message or a parsed body.
 * - **`unauthenticated`** is a 401: the session died with a half-edited form on screen. It
 *   deliberately does **not** redirect, for `createTransaction`'s two reasons - a `redirect()`
 *   inside an action throws, so the caller's `await` would never resolve and the modal would sit
 *   disabled forever, and it would discard every edit on a form the user could have saved by
 *   signing in again in another tab.
 * - **`failed`** is everything else, including the request that never completed. Gentler here
 *   than for either write before it: a retried edit is idempotent, where a retried create makes a
 *   duplicate and a retried delete answers 404.
 *
 * `reason` strings rather than raw statuses, matching `lib/resend.ts`, so no component ever
 * restates HTTP.
 */
export type UpdateTransactionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'transactionMissing'
        | 'transactionOrCategoryMissing'
        | 'unauthenticated'
        | 'failed';
    };

/**
 * Changes one expense, sending only the fields that changed.
 *
 * **The 404 is split on whether the body carries a `categoryId`, and that is the one decision
 * in this file.** `TransactionsService.update` throws `NotFoundException` twice with different
 * messages - `Transaction not found.` and `Category not found.` - and one status, so the
 * distinction exists on the wire only inside prose. Three ways to handle that were available:
 *
 * The chosen one costs nothing, because the body is already here. A patch with no `categoryId` in
 * it cannot have failed on a category, so its 404 is the transaction and the copy can say so
 * plainly - which is the overwhelmingly common case, since nothing in this frontend can delete a
 * category yet while deleting a *transaction* is a button on every row. A patch that does change
 * the category gets copy naming both, which is vaguer and true.
 *
 * Rejected: **one message for every 404**, which would tell somebody whose row was deleted in
 * another tab that "this transaction or that category" is missing, on the path users actually
 * reach. And **matching the backend's message text**, which is exact until somebody rewords a
 * string that no test pins across the two apps - at which point this silently picks the wrong
 * message with every gate green. `docs/agents/api-contract.md` carries the general form of that
 * rule: a caller reads the contract's *types*, and error prose is not one of them.
 */
export async function updateTransaction(
  id: string,
  body: UpdateTransactionBody,
): Promise<UpdateTransactionResult> {
  const result = await authorizedPatch(`/api/transactions/${encodeURIComponent(id)}`, body);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'invalid' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      // `in` rather than `!== undefined`, because `toUpdateTransactionBody` omits keys it does
      // not mean to send rather than setting them undefined - the same conditional-spread
      // discipline `toCreateTransactionBody` uses so a test can assert with `Object.keys`.
      return {
        ok: false,
        reason: 'categoryId' in body ? 'transactionOrCategoryMissing' : 'transactionMissing',
      };
    default:
      // Every other status, plus `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
