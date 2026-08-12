'use client';

import type { Period } from '@/lib/periods';
import type { TransactionFilters } from '@/lib/transactions';

import { PeriodSelect } from '../PeriodSelect';
import { useFilterNavigation } from './FilterNavigation';
import { ALL_PERIODS_OPTION, filterHref } from './filters';

// The Transactions header's period control (PET-67), and the smallest client boundary it could be.
//
// **It exists because a function prop cannot cross into a Client Component.** `PeriodSelect` needs
// to be told what to do with the chosen value here, since a period change on this screen has to
// preserve the search term, the category and the sort - and `TransactionsScreen`, which draws the
// header, is a Server Component and so cannot pass a callback at all. This file is the client
// component in between: it holds the one function and nothing else.
//
// **It then earns its keep a second time, which is the half worth not undoing.** Navigating through
// `useFilterNavigation()` rather than through `router.replace` puts a period change inside the
// screen's one `useTransition`, so the table dims for it exactly as it dims for the category, the
// search and the sort. `PeriodSelect`'s own arm cannot do that: it calls the router directly, which
// is right for the Dashboard, where there is no table to dim and no other filter to preserve.
//
// **Every pixel of markup is `PeriodSelect`'s**, deliberately. What differs between this screen's
// period control and the Dashboard's is where the change is sent and one extra option, and neither
// is a reason to own a second copy of the `select select-sm w-auto cursor-pointer` string whose two
// unobvious halves `frontend/CLAUDE.md` records as cascade traps.

type TransactionPeriodSelectProps = {
  /** Every period the account has, newest first, from `GET /api/periods`. */
  periods: readonly Period[];
  /**
   * The whole filter set, so a period change preserves the other three.
   *
   * The same reason `TransactionSearch` takes it rather than just the term: `filterHref` is built
   * from the full set, and passing one key would make this control the one that silently resets
   * everything else.
   */
  filters: TransactionFilters;
  /**
   * The period the list actually covers, as its `start`, or `undefined` for `period=all`.
   *
   * Read off the response rather than the URL, which is `PeriodSelect`'s own rule: a bare
   * `/transactions` carries no period and still has to show the current one rather than an empty
   * box.
   */
  selected?: string;
};

export function TransactionPeriodSelect({
  periods,
  filters,
  selected,
}: TransactionPeriodSelectProps) {
  const { navigate } = useFilterNavigation();

  return (
    <PeriodSelect
      periods={periods}
      // `period: null` on the response is exactly `?period=all`, which the contract documents as
      // having no single label - so the sentinel is what the control shows for it. Falling back to
      // the current period's start instead would leave the header naming one month over a list
      // spanning every one of them.
      selected={selected ?? ALL_PERIODS_OPTION.value}
      extraOptions={[ALL_PERIODS_OPTION]}
      onSelect={(value) => {
        // No `scroll: false`, matching the filter bar rather than the search field: this control
        // sits at the top of the page, so whoever touched it is already there, and landing on the
        // new first row is what changing the period asked for.
        navigate(filterHref({ ...filters, period: periodFilterFor(value, periods) }));
      }}
    />
  );
}

/**
 * The `?period=` a chosen value should become, or `undefined` for the absent key.
 *
 * Three cases, and the first is the one that keeps this screen's URLs stable. The **current**
 * period is written as no key at all, which is `filters.ts`' rule that one view has one URL and
 * `periodParam`'s own behaviour on the other two screens: a header linking to `?period=2026-03-01`
 * would go stale the moment that period rolled over. "All time" is the literal `all` the contract
 * has always accepted. Any other period is its own `start`, the date form `parseTransactionFilters`
 * has forwarded since PET-72.
 *
 * A value in none of those is `undefined`, i.e. the current period. It is unreachable through the
 * control, and the alternative is putting a junk value in the URL for the backend to answer 400 to,
 * which on this screen means the error boundary rather than a lost filter.
 */
function periodFilterFor(value: string, periods: readonly Period[]): TransactionFilters['period'] {
  if (value === ALL_PERIODS_OPTION.value) {
    return ALL_PERIODS_OPTION.value;
  }

  const period = periods.find((entry) => entry.start === value);

  return period === undefined || period.current ? undefined : period.start;
}
