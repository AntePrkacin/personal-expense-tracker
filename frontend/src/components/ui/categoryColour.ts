import {
  Baby,
  Beer,
  Bike,
  Bird,
  Book,
  Briefcase,
  Bus,
  Camera,
  Car,
  CircleQuestionMark,
  Coffee,
  CreditCard,
  Dumbbell,
  Eye,
  Film,
  Fish,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  IceCreamCone,
  KeyRound,
  Landmark,
  Music,
  Package,
  Palette,
  Panda,
  PawPrint,
  Pencil,
  Percent,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Rabbit,
  Receipt,
  Sailboat,
  Scale,
  Scissors,
  Shield,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sofa,
  SquareParking,
  Stethoscope,
  Tag,
  Tent,
  Ticket,
  Trash2,
  TreePalm,
  TrendingUp,
  Tv,
  Users,
  Utensils,
  WavesHorizontal,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { components } from '@/types/api';

// The seventeen daisyUI semantic colour tokens and the sixty-four lucide icons a
// category can carry, mapped onto what actually paints them (PET-64, PET-65).
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
//     `Record` keyed by them is its own exhaustiveness proof: adding an
//     eighteenth token to `backend/src/database/central/template-tokens.ts` and
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
 *
 * `base-content/50` is the one that follows neither rule, because it has no
 * partner: it is the page's own ink at half strength, so the glyph takes
 * `base-100`, the surface that ink is normally drawn on. That inverts to a light
 * glyph on mid grey in light and a dark glyph on light grey in dark, which is
 * the pairing that survives both themes.
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
  'base-content/50': 'bg-base-content/50 text-base-100',
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
  // Deliberately identical to `CATEGORY_DOT_NEUTRAL` below. They are the same
  // colour for the same measured reason, and the duplication is this file's
  // first rule - every class written out in full - rather than an oversight.
  'base-content/50': 'bg-base-content/50',
};

/**
 * The same seventeen colours as a CSS value, for an SVG `fill`.
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
  // The `color-mix` Tailwind's own `/50` modifier compiles to, written out
  // because a `fill` cannot take the class. Same colour as the `CATEGORY_DOT`
  // entry above by construction, which is what keeps the donut's Uncategorized
  // slice and its legend dot from drifting apart.
  'base-content/50': 'color-mix(in oklab, var(--color-base-content) 50%, transparent)',
};

/**
 * The lucide component for a stored icon name.
 *
 * **The map exists because `lucide-react` imports by name at build time.**
 * `icons[name]` off the library's own barrel would work and would also pull all
 * ~2000 glyphs it ships into the bundle; a static map imports exactly
 * sixty-four.
 *
 * `Record<IconName, LucideIcon>` is the exhaustiveness proof the contract's enum
 * buys: a sixty-fifth name added to `ICON_NAMES` backend-side and synced breaks
 * this build rather than rendering a hole where a glyph belongs.
 *
 * **PET-65 grew this from thirteen to sixty-four, and the cost is linear.** The
 * import is per icon, so the set is roughly 25-40 KB raw before gzip. That is
 * the price of the guarantee above: the alternative that stays flat is the
 * barrel lookup, which gives up the exhaustiveness proof and the tree shaking in
 * one move.
 */
export const CATEGORY_ICON: Record<IconName, LucideIcon> = {
  // Order follows ICON_NAMES: the thirteen a seeded category carries, then the
  // fifty-one PET-65 offers to a user's own categories, grouped by domain.
  // Not `CircleHelp`, which is a deprecated alias of `circle-question-mark` in
  // lucide 1.29.0.
  //
  // **`Pencil` and `Trash2` are imported here AND used as the app's own chrome** -
  // the transaction row menu's Edit and Delete actions. That overlap was found by
  // scanning every non-category lucide import in `frontend/src` and was accepted
  // knowingly, so a user can pick a mark that means an action elsewhere. Do not
  // "fix" it without reading the interface-scan section of
  // `docs/explainers/category-icon-set-preview.html`, which lists all seventeen.
  //
  // Several names read oddly against their domain block because seventeen of the
  // fifty-one were replaced on glyph shape alone - `panda` for `train-front`,
  // which collided with `bus`. `template-tokens.ts` is the authority for why.
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
  'circle-question-mark': CircleQuestionMark,
  coffee: Coffee,
  beer: Beer,
  pizza: Pizza,
  'ice-cream-cone': IceCreamCone,
  fuel: Fuel,
  bus: Bus,
  panda: Panda,
  bike: Bike,
  'square-parking': SquareParking,
  house: House,
  bird: Bird,
  'waves-horizontal': WavesHorizontal,
  wifi: Wifi,
  smartphone: Smartphone,
  'trash-2': Trash2,
  wrench: Wrench,
  sofa: Sofa,
  pill: Pill,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  eye: Eye,
  tag: Tag,
  shirt: Shirt,
  package: Package,
  gem: Gem,
  scale: Scale,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  'shopping-cart': ShoppingCart,
  percent: Percent,
  receipt: Receipt,
  'trending-up': TrendingUp,
  shield: Shield,
  'gamepad-2': Gamepad2,
  music: Music,
  film: Film,
  ticket: Ticket,
  book: Book,
  camera: Camera,
  palette: Palette,
  briefcase: Briefcase,
  pencil: Pencil,
  fish: Fish,
  baby: Baby,
  users: Users,
  rabbit: Rabbit,
  sailboat: Sailboat,
  'tree-palm': TreePalm,
  'key-round': KeyRound,
  tent: Tent,
  heart: Heart,
};

// Everything below is the fallback path: what to paint when a category could not
// be resolved at all.
//
// **It is a much narrower job than it used to be.** Until PET-64 these also
// answered for the `Uncategorized` fallback category, whose `#98A0AE` was
// outside the eight-colour palette on purpose, and for any well-formed hex a
// category might carry that the map did not know. Neither case exists now: the
// fallback carries `base-content/50` like any other category, and `color` is a
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
 * `base-content/50` measures **3.401:1** in light and **4.769:1** in dark against the same card,
 * clearing the 3:1 non-text contrast bar in both. (PET-23 recorded 3.382 and 4.743; PET-64's
 * re-measurement through a rebuilt harness reports the figures above, and the third decimal is
 * compositing noise rather than a change - what matters is that both runs clear the bar and both
 * report `base-300` failing it in the same breath.)
 *
 * It and `CATEGORY_FILL_NEUTRAL` below are the same colour by construction - Tailwind's `/50`
 * modifier compiles to exactly the `color-mix` that one is written as - which is what keeps a
 * legend dot and its own slice from drifting apart. Neither carries the `text-*-content` half,
 * the whole reason `CATEGORY_DOT` exists as a second map: on a mark with no content it turns
 * daisyUI's `currentColor` drop shadow into an opaque smudge, and a fallback that reintroduced it
 * would reintroduce that bug on exactly the path nobody looks at.
 *
 * **It is the Uncategorized slice's colour again, and the round trip is worth recording.** PET-64
 * moved that category onto `warning-content` and left a note here saying this had "stopped being"
 * its colour. Nobody had measured `warning-content`: it is **1.713:1** against the dark card, so
 * the change quietly undid the fix PET-23 had made for exactly this row, on exactly this argument.
 * The review of PET-64 caught it and the category is back on `base-content/50` - as a real
 * seventeenth entry in `COLOUR_TOKENS` this time, so it resolves through `CATEGORY_DOT` like any
 * other colour rather than through this constant.
 *
 * So the two are now the same colour by two different routes, which is intended: this one answers
 * for a category that could not be resolved *at all*, and the map entry answers for the
 * `Uncategorized` row. Both are "spend nobody can attribute", both can be real money through the
 * backend's orphan fold, and there is no reason for them to look different.
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
