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

/**
 * The same eight colours as a CSS value, for an SVG `fill`.
 *
 * **A third map rather than a reuse of `CATEGORY_DOT`, because `fill` is an SVG presentation
 * attribute and a Tailwind class is not a valid value for one.** `bg-error` in a `fill` resolves
 * to nothing at all: no error, no colour, an unpainted slice. PET-23's donut is the first thing
 * here that colours an SVG rather than a box, and every chart after it has the same problem.
 *
 * A `var(--color-*)` reference is a live one, resolved by the browser exactly as the class is, so
 * a slice follows the light/dark theme with no JavaScript and no `dark:` variant - verified in a
 * browser by flipping `prefers-color-scheme` and re-reading the computed fill. The values pair
 * one-to-one with `CATEGORY_DOT` and `categoryColour.test.ts` pins that, so a ninth colour added
 * to one and not the others fails there rather than painting a hole in the ring.
 */
export const CATEGORY_FILL: Record<CategoryColour, string> = {
  coral: 'var(--color-error)',
  orange: 'var(--color-warning)',
  yellow: 'var(--color-warning)',
  green: 'var(--color-success)',
  teal: 'var(--color-accent)',
  blue: 'var(--color-info)',
  violet: 'var(--color-primary)',
  pink: 'var(--color-secondary)',
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
 *
 * **`CATEGORY_DOT_NEUTRAL` and `CATEGORY_FILL_NEUTRAL` deliberately do not follow this one**, and
 * the reason is the glyph: the tile has content drawn on it and they do not. See their own note.
 */
export const CATEGORY_TILE_NEUTRAL = 'bg-base-300 text-base-content';

/**
 * The same fallback without its content half, for a mark with nothing on it.
 *
 * **Not `CATEGORY_TILE_NEUTRAL`'s background half, and the difference is whether anything is
 * drawn on top.** A tile is a box with a glyph in it, so it reads as a shape whatever its
 * background does. A dot and a donut slice are bare colour, and `base-300` is the theme's own
 * *empty-surface* token: on a `bg-base-100` card it measures **1.157:1** in light and **1.115:1**
 * in dark, which is the near-invisibility PET-22 already measured and rejected for the trend
 * chart's muted bars. Reaching for it here reintroduced that finding on a different chart.
 *
 * **This is not a decorative state, which is what makes it worth contrast rather than restraint.**
 * `CategoriesService.foldOrphansIntoFallback` attributes every orphaned transaction to
 * Uncategorized, so this is the colour real money is drawn in - and PET-23's requirement is that
 * the ring closes, which a slice nobody can see fails by another route.
 *
 * `base-content/50` measures **3.382:1** in light and **4.743:1** in dark against the same card,
 * clearing the 3:1 non-text contrast bar in both. That is one step darker than
 * `FALLBACK_CATEGORY.color`'s own `#98A0AE` (2.66:1 in light), and the divergence is deliberate:
 * `frontend/CLAUDE.md` gives colour to daisyUI and structure to Figma, so a stored hex is not the
 * authority over a rendered hue, and clearing the bar is worth more than matching the grey.
 *
 * It and `CATEGORY_FILL_NEUTRAL` below are the same colour by construction - Tailwind's `/50`
 * modifier compiles to exactly the `color-mix` that one is written as - which is what keeps a
 * legend dot and its own slice from drifting apart. Neither carries the `text-*-content` half,
 * the whole reason `CATEGORY_DOT` exists as a second map: on a mark with no content it turns
 * daisyUI's `currentColor` drop shadow into an opaque smudge, and a fallback that reintroduced it
 * would reintroduce that bug on exactly the path nobody looks at.
 */
export const CATEGORY_DOT_NEUTRAL = 'bg-base-content/50';

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

/**
 * The same lookup for a `status` dot, for a mark with no content on it.
 *
 * **Two tickets needed it independently, which is why this names both call sites.** PET-34's
 * transaction detail draws a category chip; PET-23's donut legend draws a coloured dot with the
 * category name beside it in real text. The two existing `CATEGORY_DOT` call sites - the
 * onboarding chip and the Welcome panel - index it by colour **word**, because each of them owns
 * the word already. A screen rendering a category that came off the API has a hex instead, and
 * the only hex-keyed path here returned the tile - whose `text-*-content` half is exactly what
 * must not reach a `status`. So this is the missing half of the pair rather than a convenience:
 * without it either consumer would have had a smudge under its dot, or a second colour lookup
 * written out at the call site.
 *
 * Every note on `categoryTileClass` applies unchanged, `Object.hasOwn` included and for the same
 * reason, and so does the uppercase normalisation - `CreateCategoryDto` accepts `#57b368` while
 * the seed writes `#57B368`.
 */
export function categoryDotClass(hex: string | null | undefined): string {
  if (hex === null || hex === undefined) {
    return CATEGORY_DOT_NEUTRAL;
  }

  const key = hex.toUpperCase();

  return Object.hasOwn(CATEGORY_COLOUR_BY_HEX, key)
    ? CATEGORY_DOT[CATEGORY_COLOUR_BY_HEX[key]!]
    : CATEGORY_DOT_NEUTRAL;
}

/**
 * The neutral fill, for a colour outside the eight.
 *
 * Stands to `CATEGORY_FILL` as `CATEGORY_DOT_NEUTRAL` stands to `CATEGORY_DOT`, and that one is
 * declared above beside `CATEGORY_TILE_NEUTRAL` rather than here, which is where the contrast
 * measurements and the no-content-half reasoning both live. Written as the `color-mix` Tailwind's
 * `/50` modifier compiles to, because an SVG `fill` takes a CSS value and not a class - so the
 * two are the same colour by construction rather than by a comment asking you to keep them so.
 */
export const CATEGORY_FILL_NEUTRAL =
  'color-mix(in oklab, var(--color-base-content) 50%, transparent)';

/**
 * The CSS colour for a stored category colour, for an SVG `fill`.
 *
 * The donut's slices. Falls back to the same neutral grey the tile and the dot do, which is the
 * designed answer for the fallback category's own `#98A0AE` rather than an accident - dropping an
 * unresolvable slice would make the ring not close, and the ring closing is PET-23's requirement.
 */
export function categoryFillVar(hex: string | null | undefined): string {
  if (hex === null || hex === undefined) {
    return CATEGORY_FILL_NEUTRAL;
  }

  const key = hex.toUpperCase();

  return Object.hasOwn(CATEGORY_COLOUR_BY_HEX, key)
    ? CATEGORY_FILL[CATEGORY_COLOUR_BY_HEX[key]!]
    : CATEGORY_FILL_NEUTRAL;
}
