import { redirect } from 'next/navigation';

import { readCategoriesView } from '@/lib/categories';
import { readPalette } from '@/lib/palette';
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
// **PET-37 made it three, and the third is for a modal that may never open.** `readPalette()` is the
// colours and icons the Add category picker offers, and reading it here rather than on demand is the
// trade that ticket's plan records: this route already awaits two reads in parallel so a third adds
// no latency, and it costs a route handler, a hook and three loading states less than
// `AddTransactionProvider`'s fetch-on-open shape - which earns its complexity by serving five
// triggers across three routes, where this serves one button on one route. What it does cost is a
// request on every view of this tab whether or not anybody opens the modal; `docs/TODO.md` records
// that as the known price.
//
// No `export const dynamic`: the cookie read behind both opts this route out of static
// rendering on its own, as it does everywhere else in the app.

export default async function CategoriesPage() {
  const [categories, transactionCount, palette] = await Promise.all([
    readCategoriesView(),
    readTransactionCount(),
    readPalette(),
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

  // **The palette gets a softer policy than the categories above, deliberately, and it must not get
  // the same one.** A failure here is not the content of the screen - it is the option lists inside a
  // modal nobody has opened - so throwing would trade a fully renderable grid for an error page, and
  // redirecting would be worse. `null` is what the modal already models: disabled selects and one
  // line saying why.
  //
  // **Above all it does not redirect on its own 401**, and that is the half worth stating. Only the
  // categories read decides whether the session is alive. Two guarded reads on one page are fine;
  // two *opinions* about the session are what produced the `/dashboard` to `/login` loop PET-52 had
  // to unpick, and this read arriving with a second one would be exactly that shape again.
  return (
    <CategoriesScreen
      categories={categories.data.categories}
      allocation={categories.data.allocation}
      transactionCount={transactionCount}
      palette={palette.ok ? palette.data : null}
    />
  );
}
