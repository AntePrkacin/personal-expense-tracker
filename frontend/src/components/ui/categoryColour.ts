import {
  Car,
  CircleQuestionMark,
  Gift,
  GraduationCap,
  HeartPulse,
  Landmark,
  PawPrint,
  Plane,
  Scissors,
  ShoppingBasket,
  Tv,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { components } from '@/types/api';

// The sixteen daisyUI semantic colour tokens and the thirteen lucide icons a
// category can carry, mapped onto what actually paints them (PET-64).
//
// Four things about this file are load-bearing:
//
//  1. Every class is written out in full. Tailwind's scanner reads this file as
//     raw text, so an interpolated `bg-${token}` would be found by nobody and
//     compile to nothing - a transparent tile, no build error. The same is true
//     of the icons: `lucide-react` resolves by import at build time, so a
//     runtime name cannot become a component without a static map like this one.
//  2. **The keys are the contract's own unions, not a list restated here.**
//     `CreateCategoryDto.color` and `.icon` publish real OpenAPI enums, so a
//     `Record` keyed by them is its own exhaustiveness proof: adding a
//     seventeenth token to `backend/src/database/central/template-tokens.ts` and
//     running `api:sync` breaks this file's build until the map covers it. That
//     is the whole payoff of the token allowlist, and it is why skipping
//     `api:sync` is catastrophic rather than untidy - the union degrades to
//     `string`, `Record<string, string>` accepts any subset of keys, and every
//     tile renders grey with the build green.
//  3. The values are theme colours, not fixed hues, so the marks follow the
//     active light/dark theme. **This replaced a hex map**, and the reason is
//     sharper than indirection: `primary` is valued differently per theme, so
//     several of these colours have no single hex at all.
//  4. **The pairing inverts for a `-content` token, and it looks like a
//     mistake.** `accent-content` maps to `bg-accent-content text-accent`,
//     because the glyph on that tile has to be legible against it and the
//     token's own partner is the base colour it was derived from.

/** A stored category colour. Read out of the contract, never restated. */
export type CategoryColour = components['schemas']['CreateCategoryDto']['color'];

/** A stored category icon, same rule. Required on create as of PET-64. */
export type IconName = components['schemas']['CreateCategoryDto']['icon'];

// **Three of the thirteen seeded colour pairs are visibly close, deliberately.**
// Measured in OKLab, where roughly 0.10 is the floor for telling two categories
// apart:
//
//   ΔE 0.029  Personal care / Gifts     accent-content / success-content
//   ΔE 0.037  Education / Travel        primary-content / secondary-content
//   ΔE 0.060  Groceries / Utilities     success / accent
//
// Kept rather than re-picked. Breaking Education / Travel would force one onto a
// near-black tile, since `primary-content`, `secondary-content` and
// `neutral-content` are all near-white and only one pale tile is possible - a
// large visual change to fix something invisible, in a channel that carries
// nothing. Near-identical also beats exact reuse: `accent-content` and
// `success-content` differ in hue (188° against 169°) and can separate on a
// wide-gamut display, where a reused token never can.
//
// **What makes it safe is that each category has its own icon**, which is why
// `CATEGORY_ICON` below landed in the same ticket as this palette rather than
// after it. `categoryColour.test.ts` pins all three pairs, so the map cannot
// read as thirteen distinct colours while rendering ten.

/**
 * Background and content utility for a category's icon tile, keyed by token.
 *
 * Each value pairs the tile's background with the colour a glyph drawn on it
 * with `currentColor` should take - so for a base token that is its own
 * `-content` partner, and for a `-content` token it is the base it came from.
 */
export const CATEGORY_TILE: Record<CategoryColour, string> = {
  primary: 'bg-primary text-primary-content',
  'primary-content': 'bg-primary-content text-primary',
  secondary: 'bg-secondary text-secondary-content',
  'secondary-content': 'bg-secondary-content text-secondary',
  accent: 'bg-accent text-accent-content',
  'accent-content': 'bg-accent-content text-accent',
  neutral: 'bg-neutral text-neutral-content',
  'neutral-content': 'bg-neutral-content text-neutral',
  info: 'bg-info text-info-content',
  'info-content': 'bg-info-content text-info',
  success: 'bg-success text-success-content',
  'success-content': 'bg-success-content text-success',
  warning: 'bg-warning text-warning-content',
  'warning-content': 'bg-warning-content text-warning',
  error: 'bg-error text-error-content',
  'error-content': 'bg-error-content text-error',
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
  primary: 'bg-primary',
  'primary-content': 'bg-primary-content',
  secondary: 'bg-secondary',
  'secondary-content': 'bg-secondary-content',
  accent: 'bg-accent',
  'accent-content': 'bg-accent-content',
  neutral: 'bg-neutral',
  'neutral-content': 'bg-neutral-content',
  info: 'bg-info',
  'info-content': 'bg-info-content',
  success: 'bg-success',
  'success-content': 'bg-success-content',
  warning: 'bg-warning',
  'warning-content': 'bg-warning-content',
  error: 'bg-error',
  'error-content': 'bg-error-content',
};

/**
 * The same sixteen colours as a CSS value, for an SVG `fill`.
 *
 * **A third map rather than a reuse of `CATEGORY_DOT`, because `fill` is an SVG presentation
 * attribute and a Tailwind class is not a valid value for one.** `bg-error` in a `fill` resolves
 * to nothing at all: no error, no colour, an unpainted slice. PET-23's donut is the first thing
 * here that colours an SVG rather than a box, and every chart after it has the same problem.
 *
 * A `var(--color-*)` reference is a live one, resolved by the browser exactly as the class is, so
 * a slice follows the light/dark theme with no JavaScript and no `dark:` variant - verified in a
 * browser by flipping `prefers-color-scheme` and re-reading the computed fill. The values pair
 * one-to-one with `CATEGORY_DOT` and `categoryColour.test.ts` pins that, so a seventeenth colour
 * added to one and not the others fails there rather than painting a hole in the ring.
 */
export const CATEGORY_FILL: Record<CategoryColour, string> = {
  primary: 'var(--color-primary)',
  'primary-content': 'var(--color-primary-content)',
  secondary: 'var(--color-secondary)',
  'secondary-content': 'var(--color-secondary-content)',
  accent: 'var(--color-accent)',
  'accent-content': 'var(--color-accent-content)',
  neutral: 'var(--color-neutral)',
  'neutral-content': 'var(--color-neutral-content)',
  info: 'var(--color-info)',
  'info-content': 'var(--color-info-content)',
  success: 'var(--color-success)',
  'success-content': 'var(--color-success-content)',
  warning: 'var(--color-warning)',
  'warning-content': 'var(--color-warning-content)',
  error: 'var(--color-error)',
  'error-content': 'var(--color-error-content)',
};

/**
 * The lucide component for a stored icon name.
 *
 * **The map exists because `lucide-react` imports by name at build time.**
 * `icons[name]` off the library's own barrel would work and would also pull
 * every glyph it ships into the bundle; a static map imports exactly thirteen.
 *
 * `Record<IconName, LucideIcon>` is the exhaustiveness proof the contract's enum
 * buys: a fourteenth name added to `ICON_NAMES` backend-side and synced breaks
 * this build rather than rendering a hole where a glyph belongs.
 */
export const CATEGORY_ICON: Record<IconName, LucideIcon> = {
  'shopping-basket': ShoppingBasket,
  utensils: Utensils,
  car: Car,
  zap: Zap,
  'heart-pulse': HeartPulse,
  tv: Tv,
  'graduation-cap': GraduationCap,
  plane: Plane,
  scissors: Scissors,
  gift: Gift,
  'paw-print': PawPrint,
  landmark: Landmark,
  // Not `CircleHelp`, which is a deprecated alias of it in lucide 1.29.0.
  'circle-question-mark': CircleQuestionMark,
};

// Everything below is the fallback path: what to paint when a category could not
// be resolved at all.
//
// **It is a much narrower job than it used to be.** Until PET-64 these also
// answered for the `Uncategorized` fallback category, whose `#98A0AE` was
// outside the eight-colour palette on purpose, and for any well-formed hex a
// category might carry that the map did not know. Neither case exists now: the
// fallback carries `warning-content` like any other category, and `color` is a
// closed enum the API validates. What is left is a `categoryId` that matched
// nothing in the account's list, and `null`.

/**
 * The tile for a category that could not be resolved.
 *
 * **`bg-base-300` looks like a mistake and is not.** Under daisyUI a mark that is
 * nobody's category has no status meaning to reach for, so the theme-aware
 * stand-in is a base shade rather than one of `error`/`warning`/`success` - a
 * base shade is exactly what has no semantic weight to spend.
 * `text-base-content` is the paired content colour, the same pairing every entry
 * in `CATEGORY_TILE` above carries.
 *
 * A bare string rather than a seventeenth entry in the maps above, because
 * `CategoryColour` is the contract's union and widening it here would be this
 * file disagreeing with the API about what a category may store.
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
 * `base-content/50` measures **3.382:1** in light and **4.743:1** in dark against the same card,
 * clearing the 3:1 non-text contrast bar in both.
 *
 * It and `CATEGORY_FILL_NEUTRAL` below are the same colour by construction - Tailwind's `/50`
 * modifier compiles to exactly the `color-mix` that one is written as - which is what keeps a
 * legend dot and its own slice from drifting apart. Neither carries the `text-*-content` half,
 * the whole reason `CATEGORY_DOT` exists as a second map: on a mark with no content it turns
 * daisyUI's `currentColor` drop shadow into an opaque smudge, and a fallback that reintroduced it
 * would reintroduce that bug on exactly the path nobody looks at.
 *
 * **This stopped being the Uncategorized slice's colour at PET-64**, which is worth knowing
 * because the note that used to live here argued at length that it was. That category carries
 * `warning-content` now and resolves through `CATEGORY_DOT` like any other. The contrast argument
 * still holds for what remains - the backend's orphan fold means an unresolvable row can still be
 * real money - so the measurement stays rather than reverting to `base-300`.
 */
export const CATEGORY_DOT_NEUTRAL = 'bg-base-content/50';

/**
 * The background utility for a stored category colour.
 *
 * Falls back to the neutral tile for a category that could not be resolved, and for anything
 * malformed. `CreateCategoryDto.color` is a closed enum, so a value outside the map means the
 * contract and this file have drifted - which `api:sync` is what prevents, and which this guard
 * renders as grey rather than transparent if it ever happens anyway.
 */
export function categoryTileClass(color: string | null | undefined): string {
  if (color === null || color === undefined) {
    return CATEGORY_TILE_NEUTRAL;
  }

  // `Object.hasOwn` rather than a bare index. The key is a stored value that reaches here from
  // the API, and a plain object lookup also finds everything on `Object.prototype` - so a
  // colour of `constructor` or `toString` would return a function where a class string is
  // expected. The case normalisation this used to do is gone with the hex: a token is a fixed
  // lowercase string the API validates, so `Success` is not a value it can store.
  return Object.hasOwn(CATEGORY_TILE, color)
    ? CATEGORY_TILE[color as CategoryColour]
    : CATEGORY_TILE_NEUTRAL;
}

/**
 * The same lookup for a `status` dot, for a mark with no content on it.
 *
 * **Two tickets needed it independently, which is why this names both call sites.** PET-34's
 * transaction detail draws a category chip; PET-23's donut legend draws a coloured dot with the
 * category name beside it in real text. Both must not receive a `CATEGORY_TILE` value, whose
 * `text-*-content` half turns daisyUI's `currentColor` drop shadow into an opaque smudge.
 *
 * Every note on `categoryTileClass` applies unchanged, `Object.hasOwn` included and for the same
 * reason.
 */
export function categoryDotClass(color: string | null | undefined): string {
  if (color === null || color === undefined) {
    return CATEGORY_DOT_NEUTRAL;
  }

  return Object.hasOwn(CATEGORY_DOT, color)
    ? CATEGORY_DOT[color as CategoryColour]
    : CATEGORY_DOT_NEUTRAL;
}

/**
 * The lucide component for a stored icon name, or `null`.
 *
 * **`null` rather than a stand-in glyph, because the caller already has a tile to draw.** An
 * unresolvable icon is a category from before the column was constrained, or one the map has
 * drifted from; both call sites render the tile with nothing in it, which reads as a category
 * with no icon rather than as a wrong one.
 */
export function categoryIcon(name: string | null | undefined): LucideIcon | null {
  if (name === null || name === undefined) {
    return null;
  }

  return Object.hasOwn(CATEGORY_ICON, name) ? CATEGORY_ICON[name as IconName] : null;
}

/**
 * The neutral fill, for a category that could not be resolved.
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
 * The donut's slices. Falls back to the neutral grey the tile and the dot do, which is what keeps
 * the ring closed: dropping an unresolvable slice would make it not close, and the ring closing is
 * PET-23's requirement.
 */
export function categoryFillVar(color: string | null | undefined): string {
  if (color === null || color === undefined) {
    return CATEGORY_FILL_NEUTRAL;
  }

  return Object.hasOwn(CATEGORY_FILL, color)
    ? CATEGORY_FILL[color as CategoryColour]
    : CATEGORY_FILL_NEUTRAL;
}
