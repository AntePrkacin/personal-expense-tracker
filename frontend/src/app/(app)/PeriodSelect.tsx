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

type PeriodSelectProps = {
  /**
   * Every period the account has, newest first, straight from `GET /api/periods`.
   *
   * Threaded from the page rather than read here: this is a client component, so it cannot make a
   * guarded read at all - the same split the currency and the profile already take.
   */
  periods: readonly Period[];
  /**
   * The period the screen is showing, as its `start`.
   *
   * Taken from the **response** rather than from the URL, so the selected option is what the server
   * actually answered with. On a bare `/dashboard` the URL carries no period and this is the current
   * one's start, which is what makes the control show a value instead of an empty box - the sparse-URL
   * trap `transactions/filters.ts` records for its own pills.
   */
  selected: string;
  /** The route to navigate within, e.g. `/dashboard`. Its own `?period=` is rebuilt from scratch. */
  pathname: string;
};

export function PeriodSelect({ periods, selected, pathname }: PeriodSelectProps) {
  const router = useRouter();

  return (
    <select
      // The design draws no visible label, so the control names itself - `FilterPill`'s call, and the
      // reason its own prop is called `label`.
      aria-label="Budgeting period"
      value={selected}
      onChange={(event) => {
        const period = periods.find((entry) => entry.start === event.target.value);

        // A value not in the list cannot come from this control; guarding rather than asserting
        // because the alternative is navigating to `undefined`.
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
    </select>
  );
}
