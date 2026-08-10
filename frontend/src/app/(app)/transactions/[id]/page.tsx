import { requireProfile } from '@/lib/profile';
import { readTransactionDetail } from '@/lib/transactionDetail';
import { toQuery } from '@/lib/transactionQuery';

import { filterHref, parseTransactionFilters, type TransactionSearchParams } from '../filters';
import { TransactionDetailActions } from './TransactionDetailActions';
import { TransactionDetailScreen } from './TransactionDetailScreen';

// 08 Transaction detail (Figma node 34:349).
//
// **One read for the whole screen.** `GET /api/transactions/:id` answers the transaction, its
// category with that category's month stats, and the recent siblings, so this route makes a
// single request where the frame suggests three. `lib/transactionDetail.ts` owns the failure
// policy, including the `notFound()` that `not-found.tsx` beside this file renders.
//
// **Async here, synchronous in the screen**, which is the shape `/transactions` established:
// Storybook cannot render an async Server Component that reads cookies, so the screen takes a
// resolved response and is diffable against Figma with no request scope and no mocks.
//
// **The filters round-trip through the URL.** They arrive on this page's own query string,
// carried here by the merchant link on the list, and go back out as the breadcrumb's href and
// as Delete's destination. `parseTransactionFilters` validates and drops anything malformed,
// so a hand-edited `?sort=lol` costs the user their sort rather than the page - which is a
// softer failure than the list's, where the same value reaches the API and 400s.
//
// No `export const dynamic`: the cookie read inside the detail read opts this route out of
// static rendering on its own, exactly as it does everywhere else in the app.

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  // Both promises in Next 16, awaited in the body rather than destructured in the signature,
  // matching `transactions/page.tsx`.
  params: Promise<{ id: string }>;
  searchParams: Promise<TransactionSearchParams>;
}) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);

  const filters = parseTransactionFilters(rawSearchParams);
  const detail = await readTransactionDetail(id);

  // Free, for the reason `transactions/page.tsx` records: the shell's gate already read it.
  const { currency } = await requireProfile();

  return (
    <TransactionDetailScreen
      currency={currency}
      detail={detail}
      backHref={filterHref(filters)}
      // The query alone, for the sibling links. Built from the parsed filters rather than
      // sliced off `backHref`, so the two cannot disagree about what a default looks like -
      // `filters.ts` writes a default as the absent key, and re-deriving it is one function
      // call either way.
      query={toQuery(filters)}
      actions={
        <TransactionDetailActions transaction={detail.transaction} backHref={filterHref(filters)} />
      }
    />
  );
}
