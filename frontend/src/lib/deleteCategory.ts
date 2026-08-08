'use server';

import { authorizedDelete } from '@/lib/session';

// "Delete" in the category confirmation dialog (CED-9): the second delete in the app, and the
// first that removes anything outside transactions.
//
// Everything structural about `lib/deleteTransaction.ts` applies here unchanged, so this comment
// records only what differs. A Server Action rather than a route handler, because the dialog
// submits from a page it stays on. In `lib/` rather than beside the route, because `'use server'`
// makes *every* export of a module an action and an action must be an async function - so
// `lib/categories.ts` could not have hosted it beside the three reads, and this needs a file of
// its own regardless of how many callers it has.
//
// **It takes an id and nothing else, and must never take a token or a user id.** The credential
// comes off the httpOnly cookie inside `authorizedDelete`, so a caller can only ever delete from
// their own account. Cross-user isolation is structural on the backend - every method opens the
// caller's own database, and there is no `user_id` column to forget - so an id belonging to
// somebody else is an ordinary 404 rather than somebody else's category.

/**
 * What the dialog needs to know, which is which message to show.
 *
 * **A result rather than a throw**, the rule `lib/backend.ts` states and every action here
 * inherits: an unhandled rejection inside a Server Action reaches the client as an opaque digest
 * with nothing a screen can render.
 *
 * **Four failures, where `deleteTransaction` has three and `createCategory` has three**, and the
 * extra one is the whole reason this is not the transaction delete with the noun changed.
 * `DELETE /api/categories/:id` documents 401, 404 and **409**:
 *
 * - **`missing`** is a 404: the category is not there. Reached by deleting the same card from two
 *   tabs, or by deleting one a `router.refresh()` has not caught up with. Worth its own line
 *   because the user's next move is different: nothing, it is already gone. Its copy must not say
 *   "try again", which answers 404 forever.
 * - **`fallback`** is a 409, and it means exactly one thing: this was `Uncategorized`. The backend
 *   refuses it because that row is where deleting any *other* category sends its transactions, so
 *   the request is well-formed and the caller is entitled to make it - it just conflicts with an
 *   invariant of the resource, which is why the backend chose 409 over 403. **The UI cannot reach
 *   it**, since `CategoryCardMenu` omits Delete when `isFallback` is set. It is classified anyway,
 *   because a hidden control is not an enforcement - a stale tab whose card list predates a
 *   re-provisioning, or a devtools-driven call, both land here - and because the honest message
 *   for it is not "please try again", which would loop forever.
 * - **`unauthenticated`** is a 401: the session died with the dialog open. It deliberately does
 *   **not** redirect, for `createCategory`'s reason - a `redirect()` inside an action throws, so
 *   the caller's `await` would never resolve and Delete would sit disabled forever.
 * - **`failed`** is everything else, including the request that never completed. A 400 folds in
 *   here rather than earning a reason of its own: this action sends no body, so the only 400 the
 *   endpoint can answer is `ParseUUIDPipe` rejecting a malformed id, which is not something the
 *   person holding the dialog can act on. Note that 400 is reachable and **undeclared** in the
 *   OpenAPI responses, which is another reason not to build an arm on it.
 */
export type DeleteCategoryResult =
  { ok: true } | { ok: false; reason: 'missing' | 'fallback' | 'unauthenticated' | 'failed' };

/**
 * Removes one category, keeping every transaction that was filed under it.
 *
 * **The reassignment is the endpoint's, not this function's.** `DELETE /api/categories/:id` moves
 * the category's transactions onto the `Uncategorized` fallback and *then* tombstones the
 * category, in two ordered statements rather than a transaction, sweeping tombstoned transactions
 * too so the offline-sync record carries no dangling category id. Nothing here needs to know that
 * beyond the fact the dialog's copy rests on it: the transactions survive, which is the whole
 * point of the ticket.
 *
 * As with the transaction delete, "permanently" is the client's view rather than the database's -
 * the category row tombstones through `deleted_at` and is invisible through every endpoint
 * afterwards. This comment exists so nobody "fixes" the dialog's copy against the schema.
 */
export async function deleteCategory(id: string): Promise<DeleteCategoryResult> {
  const result = await authorizedDelete(`/api/categories/${encodeURIComponent(id)}`);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      return { ok: false, reason: 'missing' };
    case 409:
      return { ok: false, reason: 'fallback' };
    default:
      // 400, every other status, and `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
