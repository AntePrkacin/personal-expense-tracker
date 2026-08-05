import { readTransactionsView } from '@/lib/transactions';

import { TransactionsScreen } from './TransactionsScreen';

// 06 Transactions — List (Figma node 26:90) and 07 Transactions — Empty (node 45:752).
//
// PET-19 shipped the header alone; PET-30 puts the first real read under it. The route's whole
// job is resolving which of three states the page is in - `lib/transactions.ts` owns that,
// including why an empty answer takes a second request to interpret - and handing it to a
// screen that renders it. The tabs sit in the content area rather than in the header (node
// 26:150), which is why CTG-1's "Add category" swapping in for "Add transaction" needs no
// header change: the tab passes a different action.
//
// **No filters are read from the URL yet.** `readTransactionsView()` with no argument lets the
// backend's own defaults apply - `period=current`, `sort=date_desc`, the view TRN-3 draws - and
// PET-29 is what turns the search field and the three selects into real state. Whether that
// state lives in `searchParams` or in a client component is PET-29's call to make; either way
// it arrives here as the argument this call already accepts.
//
// No `export const dynamic`: the cookie read behind the view opts this route out of static
// rendering on its own, exactly as it does everywhere else in the app.

export default async function TransactionsPage() {
  const view = await readTransactionsView();

  return <TransactionsScreen view={view} />;
}
