import type { Period } from '@/lib/periods';
import type { TransactionFilters, TransactionsView } from '@/lib/transactions';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { filterHref } from './filters';
import { FilterNavigationProvider, PendingRegion } from './FilterNavigation';
import { TransactionPeriodSelect } from './TransactionPeriodSelect';
import { TransactionsEmpty } from './TransactionsEmpty';
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
// **`filters` is a prop rather than a third slot**, because the header's period select has no
// conditional - all three states draw it - so an omitted node would silently delete the control
// instead of expressing a choice. It is required rather than defaulted for a reason
// `frontend/CLAUDE.md` spells out: `npm run build` does not typecheck `*.test.tsx`, so a
// default of `{}` would let a call site quietly test a screen with no filters at all.
//
// **PET-67 swapped the header's control for the filter bar's period pill, and the paragraph it
// replaced claimed something that has to be re-argued rather than deleted.** That paragraph said
// keeping the search field in the header was a *correctness requirement*: the field holds its focus
// and its caret across a filter change only because React reconciles it rather than remounting it,
// which needs its position in the tree to be identical in all three states - and `<main>` is where
// the branch between the table and the empty card lives. All of that is still true of the mechanism.
// What makes it safe to move the field into the bar anyway is a fact about the states rather than
// about the tree: `showFilterBar` is false only in the `empty` state, and **no keystroke can reach
// that state**. `lib/transactions.ts` decides `empty` from an account-wide `period=all` probe, so it
// means "this account has never logged anything" rather than "this filter matched nothing", which is
// `noResults` and keeps the bar. A user who can type has transactions, and a user with no
// transactions is handed no field to type in. So the field's position is identical across every
// state a keystroke can move between, which is the whole of what reconciliation needs.
//
// The visible consequence is real and is the thing to check before changing either state's copy:
// **the designed empty state now draws no search box at all.** That is defensible on its own terms,
// since there is nothing to search, and neither TRN-3 nor A15 says anything about it.

type TransactionsScreenProps = {
  view: TransactionsView;
  /**
   * What the URL is filtered by, for the period select in the header.
   *
   * The whole set rather than just the period, so changing which period you are looking at
   * rewrites the query string without dropping the search, category or sort the user already
   * chose. That is the requirement `PeriodSelect`'s own `periodHref` cannot meet, and the reason
   * `TransactionPeriodSelect` sits between the two.
   */
  filters: TransactionFilters;
  /**
   * Every period the account has, newest first, for the header's select (PET-67).
   *
   * Required rather than optional for `filters`' reason: a default of `[]` would render a period
   * control with nothing in it, and `npm run build` never reads `*.test.tsx` to catch a call site
   * that let it.
   */
  periods: readonly Period[];
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
   * TRN-3's bar: "All categories", the search field and the right-aligned sort, as of PET-67.
   * Rendered in the populated and no-results states and **never** in the empty one.
   */
  filterBar?: React.ReactNode;
  /** TRN-4 to TRN-6's table. The populated state's only content. */
  table?: React.ReactNode;
};

/**
 * The overline for the one filter that spans every period, `period=all`.
 *
 * **The response's `period` is `null` there rather than empty**, which the contract states in as
 * many words: a list covering every period has no single label. So this is the one overline on the
 * screen that is not the backend's, and it is deliberately the string `PERIOD_OPTIONS` already
 * offers for that filter rather than a second name for one thing - the pill reading "All time" over
 * a header saying anything else would be two answers to one question.
 */
const ALL_PERIODS_OVERLINE = 'All time';

export function TransactionsScreen({
  view,
  filters,
  periods,
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
    // **The provider wraps the header as well as `<main>`, and it has to.** The period select and
    // the bar's own controls all navigate through it, and they sit on opposite sides of that
    // boundary - so a provider around `<main>` alone would leave the header's select throwing. It is
    // also what lets `PendingRegion` below dim the table for a change the header started, which is
    // new for the period as of PET-67: the pill it replaces was inside `<main>` already, and the
    // Dashboard's own `PeriodSelect` navigates through the bare router and dims nothing.
    <FilterNavigationProvider>
      <PageHeader
        overline={view.period?.label ?? ALL_PERIODS_OVERLINE}
        title="Transactions"
        action={
          <>
            {/* The same control the Dashboard and the Categories tab draw in this position, so all
                three headers now name their period the same way. `selected` is the period the
                response actually covers rather than the URL's, and `undefined` for `period=all` -
                see `TransactionPeriodSelect`, which turns that into the appended "All time"
                entry. */}
            <TransactionPeriodSelect
              periods={periods}
              filters={filters}
              selected={view.period?.start}
            />
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
        {/* `filterHref(filters)` rather than the bare route: this tab is the control a
            filtering user clicks to get back to their own view, so pointing it at
            `/transactions` would empty the search box and reset the period on the one click
            that means "stay here". The Categories tab keeps the bare path - see
            `TransactionTabs` for why the two directions differ. */}
        <TransactionTabs
          active="transactions"
          transactionCount={view.total}
          categoryCount={categoryCount}
          transactionsHref={filterHref(filters)}
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
