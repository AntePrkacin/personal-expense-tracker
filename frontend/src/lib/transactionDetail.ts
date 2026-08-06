import { notFound, redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
import type { components, operations } from '@/types/api';

// The transaction detail read: one request for the whole of frame 08.
//
// `GET /api/transactions/:id` was built for this screen and answers all three of its data
// needs at once - the transaction, its category with that category's month stats, and the
// latest other transactions in the same category. So this page makes **one** request where a
// naive reading of the frame suggests three, and `lib/categories.ts` is deliberately not
// widened to serve the chip: `category` here already carries `name` and `color`.
//
// Two asymmetries in that response are the backend's decisions rather than accidents, and the
// screen has to render them rather than correct them:
//
//   1. `category` reports the **current** period even when the transaction being viewed is
//      from an earlier month. The card answers "where is this category now", not "where was
//      it when this was spent".
//   2. `recentInCategory` has no date predicate at all and **excludes the transaction being
//      viewed**, capped at five. DET-5 draws the viewed transaction as its own first row;
//      excluding it is PET-28's deliberate amendment to A22.

/** The detail read's contract, read off the generated types rather than restated. */
type DetailOperation = operations['TransactionsController_detail'];

type TransactionDetail = DetailOperation['responses'][200]['content']['application/json'];

/**
 * The category with its current-period stats.
 *
 * Re-exported because the screen's props need it by name and `lib/categories.ts` deliberately
 * publishes neither a cap nor a spend - the point of that module's two narrow projections is
 * that a cap never reaches a browser bundle drawing nothing with it. This one is drawing a
 * budget bar, so it needs the whole thing, and it gets it from the transaction's own response
 * rather than by opening either projection up.
 */
export type CategoryContext = components['schemas']['CategoryResponseDto'];

export type { TransactionDetail };

/**
 * One detail read, the access flow, a 404 page, or an error page.
 *
 * The failure policy is `lib/transactions.ts`'s with one arm added, and the arm is the reason
 * PET-34 widened `AuthorizedFailure` at all. A 401 or a missing cookie means signed out and
 * belongs in the access flow. An `unavailable` backend throws, so Next's error boundary
 * renders something a reload can retry. And `missing` calls `notFound()`, because a
 * transaction that was deleted - in another tab, or by this user a moment ago - is not a
 * fault and must not be reported as one.
 *
 * **A non-UUID id is a 400, not a 404**, since the endpoint's `ParseUUIDPipe` rejects it
 * before the lookup. That arrives here as `unavailable` and therefore throws, which is the
 * same treatment `?sort=lol` already gets on the list route. The distinction is worth keeping:
 * a well-formed id that names nothing is a page that honestly says so, while a malformed one
 * is a URL nobody typed by accident.
 *
 * Note the shell has already read the profile through `requireProfile()` by the time this
 * runs, so a 401 here means the session died between the two.
 */
export async function readTransactionDetail(id: string): Promise<TransactionDetail> {
  const result = await authorizedGet<TransactionDetail>(
    `/api/transactions/${encodeURIComponent(id)}`,
  );

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  if (result.reason === 'missing') {
    notFound();
  }

  throw new Error('Could not load that transaction: the backend did not answer.');
}
