import { CATEGORY_TILE, type CategoryColour } from '@/components/ui/categoryColour';

// One starter category chip on screen 03 (node 43:720), which toggles.
//
// The rejected alternative, recorded so nobody "improves" this into one: a visually
// hidden `input type="checkbox"` per chip inside a `fieldset`. Declined because the
// legend would duplicate the screen's own h1, Enter does not toggle a checkbox, and
// a hidden input buys nothing where there is no form. Reach for it if a designer or
// QA asks.

/**
 * The chip's fill and border, per state.
 *
 * Two maps rather than one conditional string, per `ui/Field.tsx`'s rule:
 * `border-border-strong` and `border-brand-accent` have equal specificity, so a
 * component emitting both would let stylesheet order pick the winner.
 *
 * The selected pair is byte-identical to `TAG_TONES.indigo` by coincidence, not as a
 * reason to reuse `ui/Tag`: Tag is a non-interactive `span` at a different radius,
 * padding, type style and dot size, and its tones are *status* tones.
 */
export const CHIP_SURFACE: Record<'on' | 'off', string> = {
  on: 'bg-brand-accent-soft border-brand-accent',
  off: 'bg-surface-card border-border-strong',
};

/** The label colour, per state. Split from the fill for the specificity reason above. */
export const CHIP_LABEL: Record<'on' | 'off', string> = {
  on: 'text-brand-accent-pressed',
  off: 'text-text-primary',
};

/**
 * Everything both states share.
 *
 * **`border-[1.5px]` in both states is the one deviation from the frame**, where the
 * unselected chip draws 1px. The chip is auto-sized rather than `w-full`, so a border
 * that thickens on selection makes it a pixel wider and taller and nudges - or
 * rewraps - the whole row under the pointer. Half a pixel of border is invisible; a
 * row that jumps when you click it is not.
 *
 * `cursor-pointer` for the reason `BUTTON_BASE` records, and it matters more here: a
 * chip does not look like a button, and CAT-1 says "tap to toggle", so the cursor is
 * what identifies the pills as the thing to tap.
 */
const CHIP_BASE =
  'text-label-l focus-visible:outline-brand-accent inline-flex cursor-pointer items-center ' +
  'gap-2.25 rounded-md border-[1.5px] px-3.5 py-2.75 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2';

/**
 * The checkmark a selected chip shows (node 43:723).
 *
 * The path is the exported vector translated to its own 8.5x6 bounding box, so half
 * of the 2-wide round-capped stroke falls outside the viewBox and `overflow-visible`
 * is what stops the tips and the elbow rendering shorn flat - the trap `ui/Select`'s
 * and `ui/ListRow`'s glyphs document.
 *
 * `text-brand-accent`, not `currentColor`: Figma strokes this with Brand/Accent while
 * the label beside it is Brand/Accent Pressed, so inheriting would quietly darken it.
 */
function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 8.5 6"
      className="text-brand-accent h-1.5 w-[8.5px] shrink-0 overflow-visible"
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
      className={`${CHIP_BASE} ${CHIP_SURFACE[state]} ${CHIP_LABEL[state]}`}
    >
      {/* Hidden because two of the ten colours repeat, so the dot cannot identify a
          category even to a reader who can see it. The name always sits beside it. */}
      <span
        aria-hidden="true"
        className={`size-2.75 shrink-0 rounded-full ${CATEGORY_TILE[colour]}`}
      />
      {label}
      {selected ? <CheckGlyph /> : null}
    </button>
  );
}
