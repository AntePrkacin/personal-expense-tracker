import { CATEGORY_DOT, type CategoryColour } from '@/components/ui/categoryColour';

// One starter category chip on screen 03 (node 43:720), which toggles.
//
// The rejected alternative, recorded so nobody "improves" this into one: a visually
// hidden `input type="checkbox"` per chip inside a `fieldset`. Declined because the
// legend would duplicate the screen's own h1, Enter does not toggle a checkbox, and
// a hidden input buys nothing where there is no form. Reach for it if a designer or
// QA asks.

/**
 * The chip's treatment, per state.
 *
 * A daisyUI `btn` in both states, which is what the element already was: `btn-soft
 * btn-primary` is the frame's tinted selected chip and `btn-outline` its bordered
 * unselected one, so the tint, the border and the label colour all come from one
 * modifier pair rather than from three maps of hand-picked colours. That also
 * retires the specificity split the two old maps existed for - a single modifier
 * cannot emit two competing border colours.
 *
 * A colour modifier is legitimate here rather than decoration: `primary` on the
 * pressed chip *is* the selection state, and the checkmark carries the same state
 * without colour for anyone who cannot see it.
 *
 * Complete literal class strings in a `Record`, per the rule every variant map in
 * the repo follows: Tailwind's scanner reads this file as raw text, so a class
 * assembled by interpolation is found by nobody and compiles to nothing.
 */
export const CHIP_STATE: Record<'on' | 'off', string> = {
  on: 'btn-soft btn-primary',
  off: 'btn-outline',
};

/**
 * Everything both states share.
 *
 * `btn` rather than `btn-sm`: the frame draws a 40px chip, which is the default
 * size, and CAT-1's "tap to toggle" makes the tap target the point.
 *
 * Both states are the same `btn`, so neither can be a pixel wider than the other -
 * which is the property the old `border-[1.5px]` deviation bought by hand, and the
 * reason a row of ten chips does not rewrap under the pointer when one is clicked.
 *
 * No `cursor-pointer` and no focus ring here: `btn` carries both, where a bare
 * `<button>` carries neither.
 */
const CHIP_BASE = 'btn gap-2 font-normal';

/**
 * The checkmark a selected chip shows (node 43:723).
 *
 * The path is the exported vector translated to its own 8.5x6 bounding box, so half
 * of the 2-wide round-capped stroke falls outside the viewBox and `overflow-visible`
 * is what stops the tips and the elbow rendering shorn flat - the trap the Chevron
 * in `app/(app)/dashboard/MonthPill.tsx` documents.
 *
 * `currentColor` now: Figma strokes the tick one shade lighter than the label beside
 * it, and the theme publishes one accent, so inheriting the pressed chip's own
 * colour is both correct and theme-aware.
 */
function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 8.5 6"
      className="h-1.5 w-[8.5px] shrink-0 overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 3L3 6L8.5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type CategoryChipProps = {
  /** The category's name, which is also what a registration submits. */
  label: string;
  /** Keyed by colour word, the way the category form offers them. */
  colour: CategoryColour;
  selected: boolean;
  onToggle: () => void;
};

export function CategoryChip({ label, colour, selected, onToggle }: CategoryChipProps) {
  const state = selected ? 'on' : 'off';

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`${CHIP_BASE} ${CHIP_STATE[state]}`}
    >
      {/* Hidden because the dot cannot identify a category even to a reader who can
          see it, so the name always sits beside it. Two of the ten chips repeat a
          colour *word* - Subscriptions reuses Transport's blue, Other reuses Bills'
          orange - and under daisyUI the rendered hues collapse further, because
          `CATEGORY_TILE` maps orange and yellow both onto `warning`: Shopping, Bills
          and Other are one colour on screen, and Transport and Subscriptions another.
          Five of the ten chips are in a tie.

          daisyUI's `status` is the dot: it is exactly this - a small round shape
          whose only job is a colour. **`CATEGORY_DOT`, not `CATEGORY_TILE`**: that
          class carries a `text-*-content` half, and `.status` draws its drop shadow
          from `currentColor`, so a tile value turns the shadow into an opaque
          coloured smudge. `categoryColour.ts` records the whole of it. */}
      <span aria-hidden="true" className={`status status-lg shrink-0 ${CATEGORY_DOT[colour]}`} />
      {label}
      {selected ? <CheckGlyph /> : null}
    </button>
  );
}
