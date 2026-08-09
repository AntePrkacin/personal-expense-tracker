import { categoryDotClass } from '@/components/ui/categoryColour';

import { capCents, type AllocateDraft, type AllocateLedger } from './allocateForm';

// The 8px stacked bar in the Allocate modal's summary island: one segment per capped category in
// that category's own colour, with the unassigned remainder left as bare track.
//
// **A div rather than a `<progress>`, which is `transactions/[id]/CategoryContextCard.tsx`'s
// precedent and holds more strongly here.** A `<progress>` publishes `role="progressbar"` whatever
// you do to it, so `aria-hidden` on one leaves a hidden semi-interactive node behind - and a stacked
// bar is not a progressbar in the first place, because it has no single value to report. This is
// several proportions at once.
//
// **`aria-hidden`, with no `sr-only` twin.** `dashboard/CategoryDonut.tsx` needed no twin either and
// for the same reason: every figure this encodes is real text within a few pixels of it - each row's
// own cap sits in an editable field, and the assigned and unassigned totals are both in the ledger
// above. A name for the bar would either restate all N figures or announce a meaningless aggregate.
// Note the donut's own review finding, though: `aria-hidden` on a wrapper is a blunt instrument, and
// it must cover the bar alone rather than any text beside it.
//
// **Inline `style` for the widths, which is the accepted escape from the complete-literal class
// rule.** `w-[${percent}%]` compiles to nothing; a style attribute is a real value.

/**
 * The width each segment takes, in percent, in draft order.
 *
 * **`Math.max(1, ...)` on the denominator, mirroring `SpendingSummaryCard`'s `barMax`.** A budget of
 * `0.40` rounds to zero there and breaks `<progress max="0">`; in cents the floor is nearly
 * unreachable, because `@IsPositive()` plus two decimal places puts a real budget at one cent
 * minimum. It stays as one line precisely because it cannot regress - and the equivalent guard on
 * *whole dollars* is exactly the bug PET-36 found and `dashboard/BudgetCard.tsx` still carries.
 *
 * **Unrounded, and deliberately not `barPercent`.** That helper floors, which is right for a single
 * bar that must not contradict the chip beside it and wrong for N segments twice over: flooring each
 * loses up to N-1 percent into a phantom gap before the remainder, and it takes a genuinely small
 * segment to exactly zero.
 */
function percentsOf(
  draft: AllocateDraft,
  ledger: AllocateLedger,
): { key: string; className: string; percent: number }[] {
  const baseCents = Math.max(1, ledger.budgetCents);

  const segments = draft
    .map((row) => ({
      key: row.id,
      className: categoryDotClass(row.color),
      cents: capCents(row.cap) ?? 0,
    }))
    .filter((segment) => segment.cents > 0);

  // The caps held by rows the modal does not draw, as one leading neutral segment. Without it the
  // bar would contradict "Left to assign" on any account whose fallback carries a cap.
  // `categoryDotClass(null)` is the documented neutral rather than a literal written out here, so
  // the muted tone stays in one place.
  const reserved =
    ledger.reservedCents > 0
      ? [
          {
            key: 'reserved',
            className: categoryDotClass(null),
            cents: ledger.reservedCents,
          },
        ]
      : [];

  return [...reserved, ...segments].map((segment) => ({
    key: segment.key,
    className: segment.className,
    percent: (segment.cents / baseCents) * 100,
  }));
}

/**
 * The allocation bar.
 *
 * **The unassigned remainder is the exposed track, not a segment.** One fewer node, and `base-300`
 * is already the colour an empty surface should be - which is also the one place that token is right
 * on this screen, unlike the two charts that had to reject it for a *filled* mark.
 *
 * **A segment for a tiny cap can round to sub-pixel and vanish, and that is accepted.** The
 * tempting fix, a `min-w-px` per segment, pushes the widths past 100%; the segments are flex
 * children with a default `flex-shrink: 1`, so the browser would then shrink the *large* ones to
 * make room - the bar would stop being accurate everywhere in order to make one invisible segment
 * visible. Keeping Σ ≤ 100 is what guarantees nothing is shrunk at all. `TinySegments` in the
 * stories is the case, for a designer to overrule if they want a floor.
 */
export function AllocationBar({ draft, ledger }: { draft: AllocateDraft; ledger: AllocateLedger }) {
  return (
    <div
      aria-hidden="true"
      className="bg-base-300 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
    >
      {percentsOf(draft, ledger).map((segment) => (
        <div
          key={segment.key}
          className={segment.className}
          style={{ width: `${segment.percent}%` }}
        />
      ))}
    </div>
  );
}
