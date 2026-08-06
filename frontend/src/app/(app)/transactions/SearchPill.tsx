// The Transactions header's search field (Figma node 26:142).
//
// Note this is what 06 Transactions draws where 04 Dashboard draws the month
// select - the two screens do not share a right-hand control. PET-19's AC3 says
// the month select appears on both; TRN-1 and the frame itself disagree, and
// they win.
//
// Rendered inert, matching how A8 treats the month select. TRN-1 does describe a
// real input, but there is no transaction list to filter until PET-28, and a box
// that accepts typing and filters nothing is a worse lie than one that plainly
// does nothing. Turning it real is a <div> becoming an <input> plus the state
// that owns the query.

/**
 * The magnifier, traced from the Figma export (node 26:143) and re-pointed at
 * `currentColor`.
 *
 * Stroke-only at 1.5, like Button's TrashGlyph and Select's Chevron, but unlike
 * those two it needs no `overflow-visible`: the ring's outer edge lands at 11 and
 * the handle's round cap at about 14.5, both inside the 16 box.
 */
function MagnifierGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="5.5" cy="5.5" r="4.75" />
      <path d="M9.5 9.5L14 14" strokeLinecap="round" />
    </svg>
  );
}

export function SearchPill({ placeholder }: { placeholder: string }) {
  return (
    // The muted text is what says "placeholder copy rather than a value", which
    // is the one styling difference from the month pill beyond the swapped
    // padding. Same field dressing as MonthPill, same refusal to be a control.
    <div className="bg-base-100 border-base-300 rounded-field text-base-content/50 flex items-center gap-2 border px-3 py-2 text-sm">
      <MagnifierGlyph />
      {placeholder}
    </div>
  );
}
