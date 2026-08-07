import { formatWhole } from '@/lib/format';
import type { DashboardSummary } from '@/lib/dashboard';

// Monthly budget card with stats row (Figma node 22:55, DSH-3 to DSH-6).
//
// A Server Component: nothing on it is interactive, so it costs the client bundle nothing.
// `page.tsx` builds it from the one dashboard read, which is why its props are a `Pick` off
// `DashboardSummary` rather than a shape of its own - the same "read the type off the
// contract" rule every other reader in this app follows.

/**
 * The status chip's two tones, complete literal class strings per key so Tailwind's scanner
 * finds them - the pattern `ui/categoryColour.ts` sets.
 *
 * **Two tones, not three.** `remaining` going negative is the one branch the contract
 * documents ("overspending is a state the frontend needs the magnitude to draw"), so under
 * budget and over budget are the two the data can actually distinguish. A third "getting
 * close" tone would need a threshold - 80%? 90%? pace-relative? - that nothing designs;
 * `docs/TODO.md` records it as owed rather than inventing one here.
 */
const CHIP = {
  onTrack: {
    badge: 'badge badge-soft badge-success',
    dot: 'status status-success',
    label: 'On track',
  },
  overBudget: {
    badge: 'badge badge-soft badge-error',
    dot: 'status status-error',
    label: 'Over budget',
  },
} as const;

/**
 * The shortest a budgeting period can be, in days, and therefore the smallest `daysLeft` that
 * still proves the period has barely started.
 *
 * **Not a designed threshold, a derived bound** - the distinction this file already draws when
 * it refuses to invent a "getting close" chip tone. A period runs from one `monthStartDay` to
 * the next, so it is 28 to 31 days long and `daysLeft >= 28` means at most three days have
 * elapsed, whatever the month and whatever the profile's start day. Nothing here picks a cutoff;
 * February picks it.
 */
const SHORTEST_PERIOD_DAYS = 28;

type BudgetCardProps = Pick<
  DashboardSummary,
  | 'spent'
  | 'monthlyBudget'
  | 'remaining'
  | 'daysLeft'
  | 'transactionCount'
  | 'averagePerDay'
  | 'topCategory'
> & {
  /**
   * The screen's shared PET-26 condition. Necessary but **not sufficient** for the caption to
   * read "Full month ahead" - see the caption itself for why `daysLeft` gets a say too.
   */
  isEmpty: boolean;
};

export function BudgetCard({
  spent,
  monthlyBudget,
  remaining,
  daysLeft,
  transactionCount,
  averagePerDay,
  topCategory,
  isEmpty,
}: BudgetCardProps) {
  const overBudget = remaining < 0;
  const tone = overBudget ? CHIP.overBudget : CHIP.onTrack;

  // The whole-dollar figures are rounded **once, here**, and the remainder is derived from
  // that rounded pair rather than formatted from `remaining` independently.
  //
  // Rounding each of the three through `formatWhole` separately lets two figures four lines
  // apart contradict each other on one card: a budget of 2000 with `spent` 1240.50 formats as
  // "$1,241 of $2,000" beside "$760 left" (`remaining` is exactly 759.50), and 1241 + 760 is
  // 2001. `docs/TODO.md` accepts that a whole-dollar aggregate can sit a dollar off the cents
  // a user adds up by hand - that is inherent in drawing whole dollars at all - but it does not
  // accept two figures on the same card visibly disagreeing about the same budget.
  //
  // `remaining` is still what decides the tone above, because the contract computes it in
  // integer cents and it is the field that is documented as going negative; this is only about
  // what the two captions print.
  const spentWhole = Math.round(spent);
  const budgetWhole = Math.round(monthlyBudget);
  const remainingWhole = budgetWhole - spentWhole;

  return (
    // `card bg-base-100 shadow-sm` is `AccessCard`'s own box, named in
    // `frontend/src/app/CLAUDE.md` as what a second card should match.
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Monthly budget</h2>
          <span className={tone.badge}>
            {/* aria-hidden: the badge's own text already carries the state, the same call
                `ui/categoryColour.ts`'s callers make about a colour dot beside a name. */}
            <span className={tone.dot} aria-hidden="true" />
            {tone.label}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <p className="font-display text-4xl font-bold">{formatWhole(spentWhole)}</p>
          <p className="text-base-content/60 text-sm">of {formatWhole(budgetWhole)}</p>
        </div>

        {/* Clamped to the max: an overspent month has `spent > monthlyBudget`, and a
            <progress> handed a value above its max renders full but reports the raw number to
            assistive technology. Not aria-hidden, unlike DecorativePanel's decorative bar -
            this one reports the reader's own budget, so it needs a real accessible name
            instead of none at all. */}
        <progress
          className="progress progress-primary w-full"
          value={Math.min(spent, monthlyBudget)}
          max={monthlyBudget}
          aria-label="Monthly budget spent"
        />

        <div className="flex items-center justify-between text-sm">
          {/* The magnitude, not a formatted negative: overspent, `remaining` is negative, and
              `−$240 left` reads as a double negative colliding with the chip that already
              says "Over budget". */}
          <p>{formatWhole(Math.abs(remainingWhole))} left</p>
          {/* **The caption names no month, and that amends the frame.** Node 22:55 draws
              "8 days left in October", but the two halves of that sentence come from different
              periods: `daysLeft` is counted backend-side against the profile's `monthStartDay`,
              while a month name here could only be the frontend host's calendar month. At
              `monthStartDay: 15` on 20 October the window is Oct 15 to Nov 15 and the card
              would read "26 days left in October", and even at the default of 1 the two clocks
              disagree for an hour twice a month, because the backend formats its period against
              `APP_TIMEZONE` and `new Date()` here reads whatever zone the frontend runs in.
              Nothing on this response names the period, so the honest sentence is the one that
              does not claim to - `docs/TODO.md` records what a labelled period would need.

              **Frame 05's "Full month ahead" needs both halves of this condition, and the
              review of PET-26 is why.** `isEmpty` alone was the first version, on the reasoning
              that `daysLeft` counts down whether or not the account has ever spent anything and
              so has no value meaning "empty". That is true and the converse is too:
              `transactionCount === 0` says nothing about time remaining. An account that has
              logged nothing by the 28th of a period starting on the 1st has `daysLeft` of 4, and
              the first version replaced an accurate "4 days left" with a sentence claiming the
              month had not started - a state every light account passes through, not only a
              brand-new one.

              So emptiness chooses *whether* the frame's copy is eligible and `daysLeft` proves
              it is *true*. Above `SHORTEST_PERIOD_DAYS` at most three days have elapsed and the
              sentence holds; below it the caption falls back to the count, which is accurate in
              every period and is what the populated card draws anyway. Nothing on this response
              carries the period's length, so this bound is the strongest claim the data
              supports - `docs/TODO.md` records what a period-length field would buy.

              The plural is a local ternary rather than a helper: `daysLeft` is documented as 1
              on the last day of the period and never 0, so "1 days left" is a state every user
              reaches once a month, and this is the app's only pluralized string. */}
          <p className="text-base-content/60">
            {isEmpty && daysLeft >= SHORTEST_PERIOD_DAYS
              ? 'Full month ahead'
              : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
          </p>
        </div>

        <div className="border-base-300 border-t" />

        <div className="flex gap-10">
          <div className="flex flex-col-reverse gap-1">
            <p className="text-base-content/60 text-xs">Transactions</p>
            <p className="text-xl font-bold">{transactionCount}</p>
          </div>
          <div className="flex flex-col-reverse gap-1">
            <p className="text-base-content/60 text-xs">Avg / day</p>
            <p className="text-xl font-bold">{formatWhole(averagePerDay)}</p>
          </div>
          <div className="flex flex-col-reverse gap-1">
            <p className="text-base-content/60 text-xs">Top category</p>
            {/* Rendered rather than deferred: the contract documents null as "nothing spent
                yet", and drawing the dash here rather than waiting for PET-26 is what makes
                this card complete for an empty account on its own. */}
            <p className="text-xl font-bold">{topCategory?.name ?? '—'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
