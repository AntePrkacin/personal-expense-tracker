// Progress bar (Figma "Components", node 21:2).
//
// Used on the monthly budget card, the allocation summary, every category card
// and the transaction detail page. The fill is the brand accent up to and
// including the cap, and the danger tone past it (04 Dashboard node 22:55 for
// the accent state, 13 Categories node 37:495 for the danger one).

type ProgressBarOwnProps = {
  /** Amount spent. May exceed `max`; that is what turns the bar red. */
  value: number;
  /** The cap. `0` is tolerated: a category need not have one. */
  max: number;
  /** Overrides the announced value, e.g. "$1,240 of $2,000". */
  valueText?: string;
};

/**
 * The accessible name is required at compile time.
 *
 * A progressbar with no name is a hard axe failure, and nothing in the design
 * puts a label inside the bar, so it can only come from the caller. Making the
 * union exhaustive means `npm run build` - which is this repo's typecheck gate -
 * rejects a nameless bar rather than leaving it for review to catch.
 *
 * `labelledBy` exists because the name is usually already on screen as the card
 * title ("Monthly budget", "Groceries this month"). Pointing at that beats
 * duplicating it into an invisible aria-label that can drift.
 */
type ProgressBarProps = ProgressBarOwnProps &
  ({ label: string; labelledBy?: never } | { labelledBy: string; label?: never });

export function ProgressBar({ value, max, valueText, label, labelledBy }: ProgressBarProps) {
  // Strictly greater than. At the cap the bar is still the accent colour:
  // "Housing $1,100 of $1,100" is tagged "Full", not "Over" (node 37:567).
  const over = value > max;

  // A cap of 0 would make this NaN, which is invalid CSS and renders as either
  // a full or an empty bar depending on the browser.
  const ratio = max > 0 ? value / max : 0;

  // Only the *width* is clamped. aria-valuenow keeps the real figure, because
  // telling someone at 120% of budget that they are at 100% is a lie the bar
  // itself is not telling - the red fill already says "over".
  const width = Math.min(100, Math.max(0, ratio * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className="bg-surface-muted h-2 w-full overflow-hidden rounded-full"
    >
      <div
        // toFixed keeps the inline style out of 61.99999999999999% territory,
        // and Number() drops the trailing zeros it introduces.
        style={{ width: `${Number(width.toFixed(2))}%` }}
        className={`h-full rounded-full ${over ? 'bg-status-danger' : 'bg-brand-accent'}`}
      />
    </div>
  );
}
