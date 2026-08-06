'use server';

import { authorizedDelete } from '@/lib/session';

// "Delete" in the confirmation dialog (DEL-2): the app's **first delete**, and its second
// authenticated write after `lib/createTransaction.ts`.
//
// Everything structural about that file applies here unchanged, so this comment records only
// what differs. A Server Action rather than a route handler, because the dialog submits from a
// page it stays on. In `lib/` rather than an `actions.ts` beside a route, because the dialog is
// mounted on the shell and DEL-1 lists three entry points across three route segments. Named
// after the operation rather than the entity, because `'use server'` makes *every* export of a
// module an action and an action must be an async function - so `lib/transactions.ts` could not
// have hosted it beside the reads.
//
// **It takes an id and nothing else, and must never take a token or a user id.** The credential
// comes off the httpOnly cookie inside `authorizedDelete`, so a caller can only ever delete from
// their own account. That is what makes publishing this as an action safe, and it is the same
// property that makes the id parameter harmless despite arriving from the browser: the backend
// scopes the lookup to the session's own database, so an id belonging to somebody else is a 404
// rather than somebody else's row.

/**
 * What the dialog needs to know, which is which message to show.
 *
 * **A result rather than a throw**, for `createTransaction`'s reason: an unhandled rejection
 * inside a Server Action reaches the client as an opaque digest with nothing a screen can
 * render.
 *
 * **Three failures where the create action has four**, and the missing one is the point. That
 * one distinguishes 400 (`invalid`) from 404 (`categoryMissing`) because a form can act on the
 * difference - fix the values, or pick another category. This action sends no body and no
 * category, so a 400 could only mean the id is not a uuid, which is not something the person
 * holding the dialog can do anything about. It folds in with `failed`, exactly as
 * `app/auth/verify/route.ts` folds a malformed token in with a dead link.
 *
 * - **`missing`** is a 404: the transaction is not there. Reached by deleting the same row from
 *   two tabs, or by deleting one that a `router.refresh()` has not caught up with. Worth its own
 *   line because the user's next move is different: nothing, the row is already gone.
 * - **`unauthenticated`** is a 401: the session died with the dialog open. It deliberately does
 *   **not** redirect, for `createTransaction`'s two reasons - a `redirect()` inside an action
 *   throws, so the caller's `await` would never resolve and the dialog would sit disabled
 *   forever.
 * - **`failed`** is everything else, including the request that never completed. That last case
 *   is the uncomfortable one here in a way it is not for a create: a delete that may or may not
 *   have landed leaves the user to retry, and a retry that succeeds the first time answers 404
 *   the second. `missing` is honest copy for that, which is part of why it exists.
 */
export type DeleteTransactionResult =
  { ok: true } | { ok: false; reason: 'missing' | 'unauthenticated' | 'failed' };

/**
 * Removes one expense, permanently as far as every endpoint is concerned (DEL-3).
 *
 * Note "permanently" is the client's view rather than the database's: `docs/TODO.md` records
 * that `transactions` tombstones rather than hard-deletes, for the offline-sync roadmap, and
 * that the row is invisible through every endpoint afterwards. Nothing here has to know that,
 * and this comment exists so nobody "fixes" the dialog's copy against the schema.
 */
export async function deleteTransaction(id: string): Promise<DeleteTransactionResult> {
  const result = await authorizedDelete(`/api/transactions/${encodeURIComponent(id)}`);

  if (result.ok) {
    return { ok: true };
  }

  switch (result.status) {
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 404:
      return { ok: false, reason: 'missing' };
    default:
      // 400, every other status, and `undefined` for the request that never completed.
      return { ok: false, reason: 'failed' };
  }
}
