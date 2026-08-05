import type { TransactionsView } from '@/lib/transactions';
import { monthOverline } from '@/lib/format';

import { AddTransactionButton } from '../AddTransactionButton';
import { PageHeader } from '../PageHeader';
import { SearchPill } from './SearchPill';
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
// **The two slots are PET-29's, and they are slots rather than nothing so the conditional
// exists now.** `filterBar` is the whole point: TRN-3 says the filter bar is deliberately not
// rendered in the empty state, and that is a statement about a conditional rather than about a
// component. Built here, with a test, PET-29 fills a slot that already knows when to
// disappear; built there, nothing would fail if the bar rendered unconditionally. `table` is
// the same shape for the populated branch, which is otherwise blank until PET-29 lands.

type TransactionsScreenProps = {
  view: TransactionsView;
  /**
   * TRN-3's three selects: "All categories", "This month" and the right-aligned "Newest
   * first". Rendered in the populated and no-results states and **never** in the empty one.
   */
  filterBar?: React.ReactNode;
  /** TRN-4 to TRN-6's table. The populated state's only content. */
  table?: React.ReactNode;
};

export function TransactionsScreen({ view, filterBar, table }: TransactionsScreenProps) {
  // A15's amendment in one line: the no-results state keeps every control, the empty one drops
  // the filter bar. Reading it off the state name rather than off "is a filter active" is what
  // `lib/transactions.ts` documents at length - the two disagree for an account whose rows are
  // all in an earlier month.
  const showFilterBar = view.state !== 'empty';

  return (
    <>
      <PageHeader
        overline={monthOverline(new Date())}
        title="Transactions"
        action={
          <>
            <SearchPill placeholder="Search transactions" />
            {/* Opens modal 09, as of PET-31, and so does the empty card's copy below. Both go
                through the one provider on the shell's layout, which is what stops this page
                mounting two dialogs. */}
            <AddTransactionButton />
          </>
        }
      />

      {/* gap-5 is the designed 20px, which both frames put between the tabs and whatever comes
          next - the filter bar on 06, the card on 07. flex-1 on the column is what lets the
          empty card fill the remaining height rather than sitting at its content's size. */}
      <main className="flex flex-1 flex-col gap-5 px-10 pb-10">
        <TransactionTabs total={view.total} />

        {showFilterBar ? filterBar : null}

        {view.state === 'populated' ? table : <TransactionsEmpty state={view.state} />}
      </main>
    </>
  );
}
