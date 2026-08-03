import { CATEGORY_TILE, type CategoryColour } from './categoryColour';
import { formatNegative } from '@/lib/format';

// List row / Transaction (Figma "Components", node 15:20).
//
// The transaction row used on the dashboard's recent list, the transactions
// table and "Recent in {category}".
//
// Presentational only, with no href. Opening the detail page belongs to the
// transactions list ticket, once routing exists: making the row itself a link
// gives that link an accessible name of the entire row ("Whole Foods Groceries
// Today minus 24 dollars"), which is a decision worth taking deliberately
// rather than inheriting from this component.

/**
 * The tile glyph, traced from the Figma export (node 15:13) and re-pointed at
 * `currentColor`.
 *
 * Figma uses this one placeholder for every category - the Groceries, Transport
 * and Entertainment rows on 04 Dashboard all carry identical glyphs - so per
 * category icons are simply not designed yet. The `icon` prop is the seam for
 * when they are.
 *
 * The handle sits left of centre rather than over the middle of the bag. That
 * is what the export says and what the frames render, so it is preserved.
 *
 * `overflow-visible` is load-bearing, not tidying. The handle's stroke is 1.6
 * wide and its path runs along x=0 and peaks at y=0, so half the stroke falls
 * 0.8 outside the 20x20 box. An SVG viewport clips its own overflow by default,
 * which shears the top-left of the arc flat.
 */
function CategoryGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 overflow-visible" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="14" height="11" rx="2.5" fill="currentColor" />
      <path
        d="M0 3.75C0 -1.25 8 -1.25 8 3.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ListRowProps = {
  /** The merchant, e.g. "Whole Foods". */
  title: string;
  /** Category and date, e.g. "Groceries · Today". */
  subtitle: string;
  /**
   * The stored amount, as a positive magnitude. The row renders it negative;
   * see lib/format.ts for why the sign lives there.
   */
  amount: number;
  categoryColour?: CategoryColour;
  /** Overrides the placeholder glyph inside the coloured tile. */
  icon?: React.ReactNode;
};

export function ListRow({ title, subtitle, amount, categoryColour = 'coral', icon }: ListRowProps) {
  return (
    <div className="flex w-full items-center gap-3.5 py-3">
      {/* The tile carries no information the subtitle does not already give in
          words, so it is hidden rather than described. */}
      <div
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-md text-white ${CATEGORY_TILE[categoryColour]}`}
      >
        {icon ?? <CategoryGlyph />}
      </div>

      {/* min-w-0 is what lets `truncate` work: a flex item's default minimum
          size is its content, so without it a long merchant name pushes the
          amount off the row instead of ellipsing. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-strong-m text-text-primary truncate">{title}</p>
        <p className="text-body-s text-text-tertiary truncate">{subtitle}</p>
      </div>

      {/* Primary, not danger. Every amount on the list is a debit, so colouring
          them red would mark the normal case as an error. shrink-0 keeps the
          figure intact when the title is long. */}
      <p className="text-strong-m text-text-primary shrink-0 text-right tabular-nums">
        {formatNegative(amount)}
      </p>
    </div>
  );
}
