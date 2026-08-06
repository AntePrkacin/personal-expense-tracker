// The eight category colours, mapped onto daisyUI theme colours (PET-57).
//
// Three things about this file are load-bearing:
//
//  1. Every class is written out in full. Tailwind's scanner reads this file as
//     raw text, so an interpolated `bg-${tone}` would be found by nobody and
//     compile to nothing - a transparent tile, no build error.
//  2. The keys are colour words rather than Figma token names, because that is
//     what the category form offers when you pick a colour, and the stored
//     category rows carry them.
//  3. The values are theme colours, not fixed hues, so the tiles follow the
//     active light/dark theme. The mapping is nearest-match by design and it is
//     lossy on purpose: orange and yellow both land on `warning`, which PET-57
//     accepted because category colours are decoration, not semantics. The
//     colour words stay the stable identity; only the rendered hue is themed.

export type CategoryColour =
  'coral' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

/** Background utility for a category's icon tile, keyed by colour name. */
export const CATEGORY_TILE: Record<CategoryColour, string> = {
  coral: 'bg-error',
  orange: 'bg-warning',
  yellow: 'bg-warning',
  green: 'bg-success',
  teal: 'bg-accent',
  blue: 'bg-info',
  violet: 'bg-primary',
  pink: 'bg-secondary',
};
