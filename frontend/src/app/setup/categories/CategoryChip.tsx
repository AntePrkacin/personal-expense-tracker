import { CATEGORY_TILE, type CategoryColour } from '@/components/ui/categoryColour';

// One starter category chip on screen 03 (node 43:720), which toggles.
//
// **It is a real `button` carrying `aria-pressed`**, which is the ARIA
// toggle-button pattern and is what the design draws: a chip that presses. Space
// and Enter both activate it, it is one ordinary tab stop, and the pressed state is
// announced without inventing copy the design never draws. The repo had no toggle
// control at all before this, so this is the precedent the category screens inherit.
//
// The alternative, recorded here the way SetupShell.tsx records its two so nobody
// "improves" this into one: a visually hidden `input type="checkbox"` per chip
// inside a `fieldset`, which announces as "checkbox, checked" and reads more
// naturally as "pick several from a set". It was declined because the legend would
// duplicate the screen's own h1, Enter does not toggle a checkbox, and a hidden
// input buys nothing here - there is no form on this screen and nothing submits.
// Reach for it if a designer or QA asks for it.
//
// No `'use client'`. This holds no state; `onToggle` comes from CategoryPicker,
// which is the client component, and importing this from there is what pulls it
// into the client bundle. Same call every component in `components/ui/` makes.
//
// Not in `components/ui/` either: that folder mirrors the nine Figma Components
// tiles and is complete, so a new component from here on is a feature's own. And
// `ui/Tag` is not reusable as one despite the resemblance - see CHIP_SURFACE below.

/**
 * The chip's fill and border, per state.
 *
 * Two maps rather than one string with conditional pieces, per the rule
 * `ui/Field.tsx` records: `border-border-strong` and `border-brand-accent` have
 * equal specificity, so a component emitting both would let stylesheet order pick
 * the winner. Complete literal class strings, because Tailwind's scanner reads this
 * file as raw text and an interpolated class is found by nobody.
 *
 * The selected pair is byte-identical to `TAG_TONES.indigo`, and that is a
 * coincidence rather than a reason to reuse `ui/Tag`: Tag is a non-interactive
 * `span` at a different radius, padding, type style and dot size, and its five
 * tones are *status* tones, which a category is not.
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
 * `inline-flex` rather than `flex`, the call `ui/Tag` records: Figma auto-layout
 * hugs its contents, and a block-level chip would stretch to fill the wrap
 * container.
 *
 * **`border-[1.5px]` in both states is the one deviation from the frame**, where
 * the unselected chip draws 1px. Box sizing is `border-box`, but the chip is
 * auto-sized rather than `w-full`, so a border that thickens on selection makes the
 * chip a pixel wider and taller and nudges - or rewraps - the whole row under the
 * pointer. Half a pixel of border is invisible; a row that jumps when you click it
 * is not. `Field.tsx`'s note that the extra half pixel "eats into the padding
 * rather than resizing the field" is about a full-width control and does not apply
 * here. Same class of deliberate deviation as the five `ui/` form details
 * `frontend/CLAUDE.md` lists.
 *
 * The focus ring is the one every other component uses, and it is why `SetupShell`
 * deliberately omits `overflow-hidden` on the card: ten of these sit inside it.
 *
 * `cursor-pointer` for the reason `BUTTON_BASE` records: a `<button>` gets an arrow
 * from the user agent, and preflight does not change it. It matters more here than
 * on an ordinary button, because a chip is the one control on this screen and it
 * does not look like a button otherwise - CAT-1 tells the user to "tap to toggle",
 * so the cursor is the only thing that says the pills are what to tap.
 */
const CHIP_BASE =
  'text-label-l focus-visible:outline-brand-accent inline-flex cursor-pointer items-center ' +
  'gap-2.25 rounded-md border-[1.5px] px-3.5 py-2.75 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2';

/**
 * The checkmark a selected chip shows (node 43:723).
 *
 * The path is the exported vector translated to its own bounding box: 8.5x6 with a
 * 2-wide round-capped stroke, so half the stroke falls outside the viewBox at every
 * end and `overflow-visible` is what stops the tips and the elbow rendering shorn
 * flat. That is the same trap `ui/Select`'s and `ui/ListRow`'s glyphs document.
 *
 * `text-brand-accent`, not `currentColor`: Figma strokes this with Brand/Accent
 * while the label beside it is Brand/Accent Pressed, so inheriting would quietly
 * darken it. The two are 60px apart on the frame and easy to conflate - the same
 * pair `SetupShell`'s active dot warns about.
 *
 * `aria-hidden`, because `aria-pressed` on the button already carries the state.
 * Private to this file, following `Chevron()` inside `ui/Select.tsx`.
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
      {/* Hidden, because the palette has eight colours for ten chips: two of them
          repeat, so the dot cannot identify a category even to a reader who can
          see it. The name is always spelled out beside it, which is the same
          argument `ui/Tag` makes about its own dot. */}
      <span
        aria-hidden="true"
        className={`size-2.75 shrink-0 rounded-full ${CATEGORY_TILE[colour]}`}
      />
      {label}
      {selected ? <CheckGlyph /> : null}
    </button>
  );
}
