import { Check } from 'lucide-react';

import { categoryDotClass } from '@/components/ui/categoryColour';

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

type CategoryChipProps = {
  /** The category template's name. A registration submits its **id**, not this. */
  label: string;
  /**
   * A daisyUI semantic colour token, as the template carries it.
   *
   * A plain `string` rather than `CategoryColour`, and looked up through
   * `categoryDotClass` rather than indexed: the value is admin data arriving over
   * the wire, so the contract's union describes what the API *should* send rather
   * than what this component can prove it received. The lookup's neutral fallback
   * is what a drifted value renders as, instead of an undefined class.
   */
  colour: string;
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
          see it, so the name always sits beside it. Every seeded chip has its own
          token now - the two duplicated colour *words* are gone with the eight-colour
          palette - but three pairs are deliberately close enough to read as one hue,
          and `categoryColour.ts` names all three with their measured ΔE. So the
          reason this is hidden is unchanged, only its arithmetic.

          daisyUI's `status` is the dot: it is exactly this - a small round shape
          whose only job is a colour. **`categoryDotClass`, not the tile**: a tile
          class carries a `text-*-content` half, and `.status` draws its drop shadow
          from `currentColor`, so a tile value turns the shadow into an opaque
          coloured smudge. `categoryColour.ts` records the whole of it. */}
      <span
        aria-hidden="true"
        className={`status status-lg shrink-0 ${categoryDotClass(colour)}`}
      />
      {label}
      {/* `currentColor` by default, which is the call the hand-traced tick already made:
          Figma strokes it one shade lighter than the label, and the theme publishes one
          accent, so inheriting the pressed chip's own colour is correct and theme-aware. */}
      {selected ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}
