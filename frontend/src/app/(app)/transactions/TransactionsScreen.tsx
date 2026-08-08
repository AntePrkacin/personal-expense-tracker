import type { TransactionFilters, TransactionsView } from '@/lib/transactions';
import { monthOverline } from '@/lib/format';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { FilterNavigationProvider, PendingRegion } from './FilterNavigation';
import { TransactionsEmpty } from './TransactionsEmpty';
import { TransactionSearch } from './TransactionSearch';
import { TransactionTabs } from './TransactionTabs';

// 06 Transactions — List (node 26:90) and 07 Transactions — Empty (node 45:752), which are one
// screen in three states.
//
// **Separate from `page.tsx` because the route is async and fetches.** Storybook cannot render
// an async Server Component that reads cookies, which is the same reason `WelcomeScreen` and
// `CheckEmailScreen` are their own files. This one takes a resolved view and renders it, so
// both empty states are diffable against Figma with no request scope and no mocks.
//
// **The two slots were PET-29's and are filled now.** They were slots rather than nothing so
// that the conditional could exist first: TRN-3 says the filter bar is deliberately not
// rendered in the empty state, which is a statement about a conditional rather than about a
// component, so PET-30 built the seam and its test and PET-29 filled something that already
// knew when to disappear. Built the other way round, nothing would have failed if the bar
// rendered unconditionally. They stay slots rather than becoming direct imports, because
// both need reads this file cannot make and Storybook has to be able to hand it stand-ins.
//
// **`filters` is a prop rather than a third slot**, because the search field has no
// conditional - all three states draw it - so an omitted node would silently delete the field
// instead of expressing a choice. It is required rather than defaulted for a reason
// `frontend/CLAUDE.md` spells out: `npm run build` does not typecheck `*.test.tsx`, so a
// default of `{}` would let a call site quietly test a screen with no filters at all.

type TransactionsScreenProps = {
  view: TransactionsView;
  /**
   * What the URL is filtered by, for the search field in the header.
   *
   * The whole set rather than just the term, so a keystroke rewrites the query string
   * without dropping the category, period or sort the user already chose.
   */
  filters: TransactionFilters;
  /**
   * How many live categories the account has, for the other tab's badge (PET-36).
   *
   * A prop rather than a read, and free at the call site: `page.tsx` already fetches the
   * categories to join names and colours onto the table's rows, so this is `categories.length`
   * over data it is holding anyway. Required rather than defaulted, for the same reason
   * `filters` is - `npm run build` never typechecks `*.test.tsx`, so a default would let a call
   * site quietly render the bar with a zero it never meant.
   */
  categoryCount: number;
  /**
   * TRN-3's three selects: "All categories", "This month" and the right-aligned "Newest
   * first". Rendered in the populated and no-results states and **never** in the empty one.
   */
  filterBar?: React.ReactNode;
  /** TRN-4 to TRN-6's table. The populated state's only content. */
  table?: React.ReactNode;
};

export function TransactionsScreen({
  view,
  filters,
  categoryCount,
  filterBar,
  table,
}: TransactionsScreenProps) {
  // A15's amendment in one line: the no-results state keeps every control, the empty one drops
  // the filter bar. Reading it off the state name rather than off "is a filter active" is what
  // `lib/transactions.ts` documents at length - the two disagree for an account whose rows are
  // all in an earlier month.
  const showFilterBar = view.state !== 'empty';

  return (
    // **The provider wraps the header as well as `<main>`, and it has to.** The search field
    // and the three selects both navigate through it, and they sit on opposite sides of that
    // boundary - so a provider around `<main>` alone would leave the field throwing. It is
    // also what lets `PendingRegion` below dim the table for a change the header started.
    <FilterNavigationProvider>
      <PageHeader
        overline={monthOverline(new Date())}
        title="Transactions"
        action={
          <>
            {/* **This must stay in the header, outside the state conditional below.** The
                field keeps its focus and its caret across a filter change only because its
                position in the tree is identical in all three states, so React reconciles it
                rather than remounting it - move it under `<main>`, or key this screen on
                anything, and every keystroke loses focus after the debounce lands. */}
            <TransactionSearch filters={filters} />
            {/* Opens modal 09, as of PET-31, and so does the empty card's copy below. Both go
                through the one provider on the shell's layout, which is what stops this page
                mounting two dialogs. */}
            <AddTransactionButton />
          </>
        }
      />

      {/* gap-5 is the designed 20px, which both frames put between the tabs and whatever comes
          next - the filter bar on 06, the card on 07. flex-1 on the column is what lets the
          empty card fill the remaining height rather than sitting at its content's size.

          No horizontal padding: `(app)/layout.tsx` states the shared gutter exactly once, so
          the header above and this column read their edges from the same wrapper. A `px-10`
          here would double it and put this page's content on a different grid from the other
          three. */}
      <main className="flex flex-1 flex-col gap-5 pb-10">
        <TransactionTabs
          active="transactions"
          transactionCount={view.total}
          categoryCount={categoryCount}
        />

        {showFilterBar ? filterBar : null}

        {view.state === 'populated' ? (
          <PendingRegion>{table}</PendingRegion>
        ) : (
          <TransactionsEmpty state={view.state} />
        )}
      </main>
    </FilterNavigationProvider>
  );
}
