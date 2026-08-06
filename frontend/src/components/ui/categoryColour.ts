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

/**
 * Background and content utility for a category's icon tile, keyed by colour name.
 *
 * Each value pairs the tile's background with its `-content` colour, so a glyph
 * drawn on the tile with `currentColor` follows the theme rather than assuming
 * white - the same pairing every daisyUI status colour ships with.
 */
export const CATEGORY_TILE: Record<CategoryColour, string> = {
  coral: 'bg-error text-error-content',
  orange: 'bg-warning text-warning-content',
  yellow: 'bg-warning text-warning-content',
  green: 'bg-success text-success-content',
  teal: 'bg-accent text-accent-content',
  blue: 'bg-info text-info-content',
  violet: 'bg-primary text-primary-content',
  pink: 'bg-secondary text-secondary-content',
};

/**
 * The background alone, for a mark with no content on it.
 *
 * **A second map rather than a substring of the one above, because daisyUI's `status` reads
 * `color`.** `.status` is a dot whose only job is a colour, which is exactly what the category
 * chips and the Welcome panel's list want - but it draws itself a small drop shadow from
 * `currentColor`, and it sets `color` to a 30%-opacity black for that purpose. Handing it a
 * `CATEGORY_TILE` value overrides that with a fully opaque `-content` colour, and the subtle
 * shadow becomes an opaque coloured smudge under every dot. The `text-*-content` half is not
 * inert on a dot after all; it is only inert where nothing reads `currentColor`.
 *
 * Two maps rather than one derived from the other, because this file's first rule is that
 * every class is written out in full - and `categoryColour.test.ts` pins that each tile begins
 * with its dot, so the pair cannot drift.
 */
export const CATEGORY_DOT: Record<CategoryColour, string> = {
  coral: 'bg-error',
  orange: 'bg-warning',
  yellow: 'bg-warning',
  green: 'bg-success',
  teal: 'bg-accent',
  blue: 'bg-info',
  violet: 'bg-primary',
  pink: 'bg-secondary',
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
 * The hexes are the backend's stored seed values, not a frontend token: PET-57 retired
 * `globals.css`'s hand-rolled palette and `globals.test.ts` with it, so this file is now
 * their single frontend home. `backend/src/database/user/starter-categories.ts` seeds
 * each one uppercase, which is the casing this map keys on.
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
 * **`bg-base-300` looks like a mistake and is not.** `#98A0AE`, `FALLBACK_CATEGORY.color`
 * in the backend's own file, is the "Uncategorized" grey that file says is deliberately
 * outside the palette. Under daisyUI a colour that is nobody's category colour has no
 * status meaning to reach for, so the theme-aware stand-in is a base shade rather than one
 * of `error`/`warning`/`success`/etc - a base shade is exactly what has no semantic weight
 * to spend. `text-base-content` is the paired content colour, the same pairing every entry
 * in `CATEGORY_TILE` above carries.
 *
 * A bare string rather than a ninth entry in the maps above, because `CategoryColour` stays
 * eight keys: widening it would offer this grey to the onboarding chips and to the colour picker
 * frame 19 draws, as if it were a colour somebody could pick.
 */
export const CATEGORY_TILE_NEUTRAL = 'bg-base-300 text-base-content';

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
  if (hex === null || hex === undefined) {
    return CATEGORY_TILE_NEUTRAL;
  }

  // `Object.hasOwn` rather than a bare index. The key is a stored value that reaches here from
  // the API, and a plain object lookup also finds everything on `Object.prototype` - so a
  // colour of `constructor` or `toString` would return a function where a class string is
  // expected. Uppercasing happens to defeat that today, since none of those keys carry
  // capitals, but that is luck rather than a guard and it would stop being true the moment
  // this stopped normalising case.
  const key = hex.toUpperCase();

  return Object.hasOwn(CATEGORY_COLOUR_BY_HEX, key)
    ? CATEGORY_TILE[CATEGORY_COLOUR_BY_HEX[key]!]
    : CATEGORY_TILE_NEUTRAL;
}
