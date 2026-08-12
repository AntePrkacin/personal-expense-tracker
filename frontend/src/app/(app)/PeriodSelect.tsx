'use client';

import { useRouter } from 'next/navigation';

import type { Period } from '@/lib/periods';
import { periodHref } from '@/lib/periodParams';

// The period select the Dashboard and the Categories tab both draw in their header (Figma node
// 21:61), and the control that finally makes PET-72's history navigable.
//
// **It replaces `dashboard/MonthPill.tsx`, which was an inert `<div>` by decision rather than by
// omission.** That file's own comment recorded why - only October exists in the design file, so DSH-2
// and A8 said it renders the current period and stays non-functional "until month navigation is
// designed" - and it ended with a TODO saying the ticket that designs it "turns this into a real
// Select and gives it the surrounding period state. Nothing else has to move." That prediction held
// exactly: this is that Select, the state is `?period=` in the URL, and the two screens' headers each
// changed by one line.
//
// **A native `<select>`, which is the pattern the transactions filter pills already set.** The five
// custom pickers in this app exist because a designed popup could not be reproduced with a native
// control - swatches in `ColourSelect`, a 64-glyph grid in `IconSelect`, a 28-row capped list in
// `MonthStartField`. A period is a line of text, the list is as long as the account's own history, and
// `TransactionFilterBar`'s three navigating pills are the same control doing the same job on the
// sibling screen. Building a sixth popover here would be new keyboard code for no gain.
//
// **It lives at the `(app)` root rather than under `dashboard/`**, because two routes draw it: the
// Dashboard header and the Categories tab's. `MonthPill` sat beside the one screen that had it, which
// is the same reason `PageHeader` sits here rather than in `components/ui/`.
//
// **`replace`, not `push`**, which is `TransactionFilterBar`'s recorded decision for the identical
// reason: changing which period you are looking at is not a place you navigated to, so twelve periods
// browsed should not be twelve entries to back out of.
//
// **PET-67 gave it a third consumer and two optional props, and the interesting half is why the
// navigation had to become a union rather than a wider href builder.** `/transactions` draws this in
// its header now, where a period change has to preserve the search term, the category and the sort -
// so `periodHref`, which rebuilds the query string from scratch, is exactly wrong there. The obvious
// fix is an `hrefFor` prop, and it cannot be passed: `TransactionsScreen` is a **Server Component**,
// and a function prop cannot cross into a Client Component at all. So the arm is `onSelect`, supplied
// by `transactions/TransactionPeriodSelect.tsx`, a client wrapper that exists for that reason and
// then earns its keep twice over by routing the change through `FilterNavigation` - which is what
// makes a period change dim the table like every other filter change on that screen, where the
// `router.replace` below cannot.

type PeriodSelectNavigation =
  /**
   * Build the href here and navigate. The Dashboard's and the Categories tab's arm: a period is the
   * whole of their URL state, so `periodHref` rebuilding the query string is correct rather than
   * lossy.
   */
  | { pathname: string; onSelect?: never }
  /**
   * Hand the chosen value back and navigate nowhere. `/transactions`' arm, where the period is one
   * of four filters and the caller owns both the href and the transition.
   *
   * An exclusive union rather than two optional props, the technique `ui/Button` uses for `href`
   * versus `onClick` and `PageHeader` for its two shapes: a `pathname` that is silently ignored
   * because an `onSelect` was also passed is a state worth making unrepresentable.
   */
  | { pathname?: never; onSelect: (value: string) => void };

type PeriodSelectProps = PeriodSelectNavigation & {
  /**
   * Every period the account has, newest first, straight from `GET /api/periods`.
   *
   * Threaded from the page rather than read here: this is a client component, so it cannot make a
   * guarded read at all - the same split the currency and the profile already take.
   */
  periods: readonly Period[];
  /**
   * The period the screen is showing, as its `start` - or an `extraOptions` value.
   *
   * Taken from the **response** rather than from the URL, so the selected option is what the server
   * actually answered with. On a bare `/dashboard` the URL carries no period and this is the current
   * one's start, which is what makes the control show a value instead of an empty box - the sparse-URL
   * trap `transactions/filters.ts` records for its own pills.
   */
  selected: string;
  /**
   * Entries appended after the account's own periods, for a value that is not a period.
   *
   * One caller and one entry: `/transactions`' "All time", whose response carries `period: null`
   * because a list spanning every period can be labelled by none of them. Without it that filter is
   * a `selected` matching no option, which browsers draw as blank or as the wrong first entry - the
   * same trap `filters.ts` records, and the reason this is a prop rather than something the
   * transactions caller could paper over on its side.
   *
   * It is deliberately not a place to put "Last month": that period is already in `periods` under
   * its own name, and two options for one view is the two-URLs-for-one-view problem `filters.ts`
   * argues against.
   */
  extraOptions?: readonly { value: string; label: string }[];
};

export function PeriodSelect({
  periods,
  selected,
  pathname,
  onSelect,
  extraOptions = [],
}: PeriodSelectProps) {
  const router = useRouter();

  return (
    <select
      // The design draws no visible label, so the control names itself - `FilterPill`'s call, and the
      // reason its own prop is called `label`.
      aria-label="Budgeting period"
      value={selected}
      onChange={(event) => {
        const value = event.target.value;

        // The delegating arm hands back whatever was chosen, `extraOptions` values included - the
        // caller offered them, so it is the only thing that can say what they mean.
        if (onSelect) {
          onSelect(value);
          return;
        }

        const period = periods.find((entry) => entry.start === value);

        // A value not in the list cannot come from this control; guarding rather than asserting
        // because the alternative is navigating to `undefined`. Note this arm cannot be reached by
        // an `extraOptions` entry, because a caller passing those passes `onSelect` above.
        if (period) router.replace(periodHref(pathname, period));
      }}
      // `w-auto` for `FilterPill`'s reason: `select` ships `width: clamp(3rem, 20rem, 100%)`, sized
      // for a field standing alone in a column, which in a header row reads as a 320px slab.
      // `cursor-pointer` because daisyUI sets no cursor on a resting select - see
      // `frontend/CLAUDE.md`, Where daisyUI and Tailwind fight.
      className="select select-sm w-auto cursor-pointer font-medium"
    >
      {periods.map((period) => (
        <option key={period.start} value={period.start}>
          {/* The backend's own label, never derived here. A period is not always one calendar month -
              a pay-day change stretches one across the gap - so month arithmetic on this side would
              print the wrong thing exactly when it matters. `lib/periods.ts` carries the argument. */}
          {period.label}
        </option>
      ))}

      {/* After the real periods, never interleaved: the list is newest-first history, and an entry
          that is not a period has no place in that ordering. */}
      {extraOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
