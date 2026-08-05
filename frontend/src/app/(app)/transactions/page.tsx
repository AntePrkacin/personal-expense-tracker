import { redirect } from 'next/navigation';

import { readCategoryLabels } from '@/lib/categories';
import { ACCESS_ROUTES } from '@/lib/routes';
import { readTransactionsView } from '@/lib/transactions';

import { parseTransactionFilters, type TransactionSearchParams } from './filters';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionsScreen } from './TransactionsScreen';
import { TransactionsTable } from './TransactionsTable';

// 06 Transactions — List (Figma node 26:90) and 07 Transactions — Empty (node 45:752).
//
// PET-19 shipped the header alone; PET-30 put the first real read under it; PET-29 makes the
// controls real. The route's job is still resolving which of three states the page is in -
// `lib/transactions.ts` owns that, including why an empty answer takes a second request to
// interpret - and it now also turns a query string into filters and joins the categories onto
// the rows. The tabs sit in the content area rather than in the header (node 26:150), which is
// why CTG-1's "Add category" swapping in for "Add transaction" needs no header change: the tab
// passes a different action.
//
// **The filters come from `searchParams`, which is the choice PET-30 left open.**
// `readTransactionsView` already took them as its one argument, so the URL slots straight into
// the call this file was already making. `filters.ts` records why the URL won over client
// state, and why an invalid value has to be dropped here rather than forwarded.
//
// **Two reads in parallel, and the second is a join rather than a second opinion.** A
// transaction row carries only `categoryId`, so the name and the colour every row draws come
// from `GET /api/categories`. `Promise.all` because neither depends on the other; serialising
// them would add a round trip to the app's busiest screen for nothing.
//
// No `export const dynamic`: the cookie read behind both opts this route out of static
// rendering on its own, exactly as it does everywhere else in the app.

export default async function TransactionsPage({
  searchParams,
}: {
  // A promise in Next 16, and awaited in the body rather than destructured in the signature
  // so the async boundary is visible where it happens - the shape `auth/verify/failed` uses.
  // Typed loosely on purpose: that file narrows its own to `{ reason?: string }`, which
  // quietly assumes a key cannot repeat, and `?period=all&period=current` is one address-bar
  // edit away from proving otherwise.
  searchParams: Promise<TransactionSearchParams>;
}) {
  const filters = parseTransactionFilters(await searchParams);

  const [view, categories] = await Promise.all([
    readTransactionsView(filters),
    readCategoryLabels(),
  ]);

  // The failure policy lives here rather than in `lib/categories.ts`, and that module's own
  // comment says why it must: its other caller is the route handler answering the Add
  // transaction modal's fetch, where a redirect would hand an open modal an HTML login page
  // with a 200 on it. So the read stays data and each caller decides.
  //
  // The decision itself is `lib/transactions.ts`'s, deliberately identical: only a 401 means
  // signed out, and anything else throws so a reload retries. Two guarded reads on one page
  // are fine; two *opinions* about whether the session is alive are what produced the
  // `/dashboard` to `/login` loop PET-52 had to unpick.
  //
  // Throwing rather than degrading to a table with no category names is the honest choice:
  // every CATEGORY cell would go blank at once, which looks like a broken screen and says
  // nothing about why.
  if (!categories.ok) {
    if (categories.reason === 'unauthenticated') {
      redirect(ACCESS_ROUTES.login);
    }

    throw new Error('Could not load your categories: the backend did not answer.');
  }

  return (
    <TransactionsScreen
      view={view}
      filters={filters}
      filterBar={<TransactionFilterBar filters={filters} categories={categories.data} />}
      // Built only for the state that renders it. The screen drops both slots in the empty
      // state anyway, so this is about types rather than output: narrowing here lets the
      // table take a `Transaction[]` instead of a union it would have to re-narrow.
      table={
        view.state === 'populated' ? (
          <TransactionsTable transactions={view.transactions} categories={categories.data} />
        ) : undefined
      }
    />
  );
}
