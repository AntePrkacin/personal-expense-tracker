// The eight Foundations category colours, as background utilities.
//
// Three things about this file are load-bearing:
//
//  1. Every class is written out in full. Tailwind's scanner reads this file as
//     raw text, so `bg-category-${n}` would be found by nobody and compile to
//     nothing - a transparent tile, no build error, no test failure. The same
//     goes for generating this map or moving it to JSON. The compile assertions
//     in utilities.test.ts exist to catch it if someone tries.
//  2. The keys are colour words rather than the Figma token names, because that
//     is what the category form offers when you pick a colour.
//  3. `category-4-green` (#57b368) is not `status-success` (#16a34a), and
//     `category-7-violet` (#8a79f1) is not `brand-accent` (#4f46e5). The design
//     carries two greens and two indigos on purpose; do not collapse them.

export type CategoryColour =
  'coral' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

/** Background utility for a category's icon tile, keyed by colour name. */
export const CATEGORY_TILE: Record<CategoryColour, string> = {
  coral: 'bg-category-1-coral',
  orange: 'bg-category-2-orange',
  yellow: 'bg-category-3-yellow',
  green: 'bg-category-4-green',
  teal: 'bg-category-5-teal',
  blue: 'bg-category-6-blue',
  violet: 'bg-category-7-violet',
  pink: 'bg-category-8-pink',
};
