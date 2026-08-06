// The Dashboard header's month select (Figma node 21:61).
//
// Inert on purpose, and that is the design's decision rather than a shortcut:
// only October exists in the file, so DSH-2 and assumption A8 both say it
// renders the current period and stays non-functional until month navigation is
// designed. It is a <div>, not a <select> or a <button>, because a control that
// announces itself as operable and then does nothing is worse than one that
// never claimed to be - a real select with one option would also read out
// "October, 1 of 1" and go nowhere.
//
// TODO: the ticket that designs month navigation turns this into a real Select
// and gives it the surrounding period state. Nothing else has to move.

/**
 * The trailing chevron, traced from the Figma export (node 21:63).
 *
 * The repo's one hand-traced chevron as of PET-57, which retired ui/Select's:
 * daisyUI's `select` class draws its own. This one is the designed 9x4.5 and
 * sits in flow beside the label; if a second hand-drawn chevron ever appears,
 * consider lifting them then.
 *
 * `overflow-visible` is load-bearing: the 1.5 round-capped stroke falls half
 * outside the box at both tips and the elbow, and an SVG viewport clips its own
 * overflow, so without it the arrow renders shorn flat.
 *
 * The size is literal pixels rather than spacing steps because 4.5px is
 * `h-1.125`, and Tailwind will not generate a three-decimal step - it drops the
 * candidate silently. A literal compiles with no token lookup, so nothing about
 * the scale can break it.
 */
function Chevron() {
  return (
    <svg
      viewBox="0 0 9 4.5"
      className="text-base-content/50 h-[4.5px] w-[9px] shrink-0 overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 0L4.5 4.5L9 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MonthPill({ label }: { label: string }) {
  // Styled like a field without being one: `rounded-field` and `border-base-300`
  // are what daisyUI's own select wears, minus the operable semantics the
  // comment above rules out.
  return (
    <div className="bg-base-100 border-base-300 rounded-field flex items-center gap-2 border px-3 py-2 text-sm font-medium">
      {label}
      <Chevron />
    </div>
  );
}
