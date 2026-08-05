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

// Everything below is the bridge from what the API stores to what the map above is keyed
// by, and it exists because the two speak different languages on purpose.
//
// `CategoryResponseDto.color` is a hex string. This file's keys are colour words, because
// point 2 above says that is what the category form offers when you pick a colour - and
// because a Tailwind class cannot be built from a hex at runtime anyway, which is point 1.
// So a screen rendering a stored category needs a lookup, and PET-29's table is the first
// screen that does. `app/setup/starterCategories.ts` is the same bridge in the other
// direction and for a fixed list, which is why it needs no lookup at all.

/**
 * The eight Foundations colours by their stored hex.
 *
 * Uppercase keys, and callers normalise before looking up. That is required rather than
 * defensive: `CreateCategoryDto` validates the colour with `/^#[0-9A-Fa-f]{6}$/`, so
 * `#57b368` is a value the API accepts and stores as typed, while
 * `backend/src/database/user/starter-categories.ts` seeds the same colour uppercase.
 *
 * The hexes are the ones in `globals.css`, and `globals.test.ts` pins those against the
 * design; this file's own test pins that the two agree, so a token edited in one place
 * cannot leave a tile silently falling back to grey.
 */
export const CATEGORY_COLOUR_BY_HEX: Record<string, CategoryColour> = {
  '#EF6F6C': 'coral',
  '#F29A3D': 'orange',
  '#E7C24A': 'yellow',
  '#57B368': 'green',
  '#34B9AE': 'teal',
  '#3F8EE6': 'blue',
  '#8A79F1': 'violet',
  '#CE6FB8': 'pink',
};

/**
 * The tile for a colour outside the eight.
 *
 * **`bg-text-tertiary` looks like a mistake and is not.** `--color-text-tertiary` is
 * `#98a0ae`, which is exactly `FALLBACK_CATEGORY.color` - the "Uncategorized" grey that the
 * backend's own file says is deliberately outside the palette. So this is the design's
 * answer for a category with no colour of its own rather than an invented grey, and
 * reaching for a `category-*` token here would give the fallback a real category's colour.
 *
 * A bare string rather than a ninth entry in the map above, because `CategoryColour` stays
 * eight keys: widening it would offer this grey to the onboarding chips and to `ui/ListRow`
 * as if it were a colour somebody could pick.
 */
export const CATEGORY_TILE_NEUTRAL = 'bg-text-tertiary';

/**
 * The background utility for a stored category colour.
 *
 * Falls back to the neutral tile for a hex outside the eight, for a category that could not
 * be resolved at all, and for anything malformed. Unreachable through the UI today - every
 * category is one of the ten starters, and no screen can create another yet - but
 * `CreateCategoryDto` accepts any well-formed hex, so the day category writes ship, an
 * unpalette colour renders grey rather than transparent. `docs/TODO.md` records what that
 * ticket owes: either a picker restricted to the eight, or a rendering path that does not
 * go through a class map.
 */
export function categoryTileClass(hex: string | null | undefined): string {
  const colour =
    hex === null || hex === undefined ? undefined : CATEGORY_COLOUR_BY_HEX[hex.toUpperCase()];

  return colour === undefined ? CATEGORY_TILE_NEUTRAL : CATEGORY_TILE[colour];
}
