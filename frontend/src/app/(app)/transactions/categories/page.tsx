import { redirect } from 'next/navigation';

import { readCategoriesView } from '@/lib/categories';
import { ACCESS_ROUTES } from '@/lib/routes';
import { readTransactionCount } from '@/lib/transactions';

import { CategoriesScreen } from './CategoriesScreen';

// 13 Categories (Figma node 36:423), the route behind the tab that has been inert since PET-19.
//
// **A nested route rather than a top-level `/categories`, and the sidebar is why.**
// `SidebarNav.matchItem()` maps a pathname back to one of the four sidebar items by prefix,
// with a trailing-slash boundary, and returns `undefined` for a miss - which the caller turns
// into `FALLBACK_ITEM`, `'dashboard'`. So a sibling path would have highlighted Dashboard while
// the tab bar on this very page said Transactions, and frame 13 draws Transactions lit. Nested,
// it needs no change to that file at all, exactly as `/transactions/[id]` needed none.
//
// It is also a **static segment beside a dynamic one**. Next resolves `categories` before
// `[id]`, so this page answers rather than the detail route, and no transaction id can shadow
// it - ids are UUIDs.
//
// **Two reads in parallel, and the second one is only a badge.** Frame 13 draws both tab counts
// on this tab, so the count of transactions has to come from somewhere even though this screen
// renders none of them; `readTransactionCount()` is that, and its own doc comment covers why it
// is one request rather than `readTransactionsView`'s one-or-two. `Promise.all` because neither
// depends on the other.
//
// No `export const dynamic`: the cookie read behind both opts this route out of static
// rendering on its own, as it does everywhere else in the app.

export default async function CategoriesPage() {
  const [categories, transactionCount] = await Promise.all([
    readCategoriesView(),
    readTransactionCount(),
  ]);

  // The failure policy lives here rather than in `lib/categories.ts`, for the reason that
  // module's comment gives in full: its other caller is the route handler answering the Add
  // transaction modal's fetch, where a redirect would hand an open modal an HTML login page
  // with a 200 on it. So the read stays data and each caller decides.
  //
  // The decision is `/transactions`'s, deliberately identical: only a 401 means signed out, and
  // anything else throws so `app/error.tsx` renders something a reload retries. Two guarded
  // reads on one page are fine; two *opinions* about whether the session is alive are what
  // produced the `/dashboard` to `/login` loop PET-52 had to unpick - which is why
  // `readTransactionCount` above applies the same policy internally rather than a softer one.
  //
  // Throwing rather than degrading to a grid with no cards is the honest choice: this response
  // is the entire content of the screen, so there is no reduced version of it worth drawing.
  if (!categories.ok) {
    if (categories.reason === 'unauthenticated') {
      redirect(ACCESS_ROUTES.login);
    }

    throw new Error('Could not load your categories: the backend did not answer.');
  }

  return (
    <CategoriesScreen
      categories={categories.data.categories}
      allocation={categories.data.allocation}
      transactionCount={transactionCount}
    />
  );
}
