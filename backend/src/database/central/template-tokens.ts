/**
 * The two closed sets a template row is allowed to reference.
 *
 * **A template carries a token the code already ships, never a colour value or
 * an arbitrary icon name**, and that is the one constraint the whole
 * admin-managed design bends around. Tailwind cannot build a class from runtime
 * data - `bg-${row.token}` compiles to nothing at all, with no build error - and
 * `lucide-react` imports by name at build time, so a name nobody wrote down
 * cannot become a component. An admin can rename, reorder, enable, disable and
 * reassign; inventing a seventeenth colour or an off-map icon is a deploy.
 *
 * **The payoff is that the compile-time guarantees survive where they matter.**
 * `@IsIn` against these arrays publishes a real OpenAPI enum, so
 * `frontend/src/types/api.d.ts` gets a literal union for both, and
 * `Record<CategoryColour, string>` and `Record<IconName, LucideIcon>` in the
 * frontend are each their own exhaustiveness proof. Only category *names* lose
 * their union, because those are genuinely admin-authored.
 *
 * Validation checks the allowlist and **never** the `enabled` flag: `enabled` is
 * presentation, so the picker offers what is enabled while a category already
 * carrying a since-disabled colour keeps rendering.
 *
 * A DTO importing a closed set out of `database/` has precedent - `register.dto.ts`
 * has done it since the starter categories were a constant.
 */

/**
 * The seventeen daisyUI semantic colour tokens, verbatim as the class suffix.
 *
 * Stored on `categories.color` as written here, not as a hex. Hex is not merely
 * indirect, it is **incoherent**: `primary` is valued differently per theme, so
 * `primary` (`#4f46e5` light, `#6963ee` dark under PET-74's Expensa themes) and
 * `primary-content` (`#ecebfd`, `#edecfd`) have no single hex, and a stored one
 * would record one value and paint the other half the time.
 *
 * The `base-100/200/300` surfaces are deliberately absent. They are the page's
 * own backgrounds, so a category painted in one is a category painted in
 * nothing - `base-300` measures between 1.115:1 and 1.178:1 against the card
 * across all five themes PET-79 registers, and PET-22 and PET-23 each rejected
 * it by name after measuring the stock value at the same 1.16.
 *
 * **`base-content/50` is the one exception and it is not a surface**, it is the
 * *ink* on those surfaces at half strength - a mid grey on a light card and a
 * light grey on a dark one, measured 3.401:1 to 5.107:1 across the five. It is
 * here because the sixteen semantic tokens cannot supply a muted colour visible
 * in **every** theme, which is a measured fact rather than an impression: it is
 * one of only three tokens that clear 3:1 everywhere. See the table on
 * `COLOUR_CONTRAST` below.
 */
export const COLOUR_TOKENS = [
  'primary',
  'primary-content',
  'secondary',
  'secondary-content',
  'accent',
  'accent-content',
  'neutral',
  'neutral-content',
  'info',
  'info-content',
  'success',
  'success-content',
  'warning',
  'warning-content',
  'error',
  'error-content',
  'base-content/50',
] as const;

export type ColourToken = (typeof COLOUR_TOKENS)[number];

/**
 * The five themes this app registers, in the order the tables below read.
 *
 * Named here rather than left as tuple positions because PET-79 took the app from
 * two themes to five, and `[number, number]` meaning "light then dark" was
 * already the sort of thing a reader has to go and check. The authority for the
 * list is `frontend/src/app/globals.css`, which registers them, and
 * `frontend/src/lib/theme.ts`, which maps a stored preference onto one.
 */
export const THEME_NAMES = [
  'expensa-light',
  'expensa-dark',
  'light',
  'dark',
  'abyss',
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/**
 * What each token measures against the card it is drawn on, per theme.
 *
 * **Regenerated for PET-79**, which added stock `light`, `dark` and `abyss`
 * beside PET-74's Expensa pair and made this table computed rather than
 * hand-measured. `frontend/src/lib/themeGuard.ts` is what computes it and
 * `npm run theme:report` prints it; every figure here is that tool's output,
 * copied once, and `docs/explainers/category-palette/theme-data.json` is the
 * committed artifact a Jest gate holds it to. Two of PET-74's numbers moved by a
 * few thousandths in the process (`base-content/50` read 3.395 and 5.076 and now
 * reads 3.413 and 5.107); the cause is a `.5` rounding tie the browser breaks
 * downward and `Math.round` breaks upward, not a value changing.
 *
 * **Sixteen figures per theme are arithmetic and the seventeenth is a pixel
 * read**, which is the division `frontend/CLAUDE.md` requires rather than a
 * convenience. The declared tokens are exact for the values the CSS carries -
 * validated by painting all one hundred in headless Chromium and reading them
 * back, where 97 matched byte-for-byte and the other three inside one byte. But
 * `base-content/50` is an ink and an alpha, so it means nothing until it is
 * painted: those five come from compositing it over each theme's own card on a
 * 1x1 canvas, with `base-300` failing at roughly 1.1:1 in the same run as the
 * control that proves the harness discriminates.
 *
 * **Only three of seventeen clear 3:1 in every theme, and that is structural.**
 * They are `primary`, `secondary` and `base-content/50`; PET-74 recorded six for
 * the Expensa pair alone, and adding three themes is what took it back down -
 * `info`, `success` and `error` each fall under in stock `light`. Every
 * `-content` token sits deliberately at the opposite end of the lightness range
 * from its base, which is exactly what makes it legible *as a glyph on its own
 * tile* - every pairing clears 3:1, worst case 3.038:1 in stock `light` - and
 * exactly what makes it near-invisible as a fill on the page's own surface in
 * some theme. That is a property of the pairing rather than of any assignment, so
 * it cannot be fixed by re-picking a colour: seventeen categories cannot all be
 * distinct and all clear 3:1 in five themes. PET-79's gate therefore **pins these figures
 * against drift and floors only `base-content/50`**, the one token with a
 * recorded reason to be visible as bare colour, because the backend's orphan fold
 * routes real money into the donut slice it paints.
 *
 * PET-64 accepted the rest for the category templates, on the argument its PR
 * records - the ring is `aria-hidden`, the legend names every slice in real text,
 * and every glyph clears 3:1 on its own tile, so colour carries no information
 * WCAG 1.4.11 governs. This table exists so the next person weighing that
 * decision argues with numbers instead of re-deriving them, and so nobody writes
 * "visible in both themes" about a token again without looking.
 *
 * Not exported to the API and not a runtime check - it is documentation with a
 * type on it, kept beside the list it describes so the two cannot drift.
 *
 * **Every number here is void the moment a theme changes.** That used to be a
 * warning and is now enforced: `frontend/src/lib/themeGuard.test.ts` fails until
 * `npm run theme:report` is re-run and its artifact committed, and
 * `frontend/CLAUDE.md`'s Changing or adding a theme is still the authority for
 * what has to pass before a theme lands.
 */
export const COLOUR_CONTRAST: Record<ColourToken, Record<ThemeName, number>> = {
  primary: {
    'expensa-light': 6.288,
    'expensa-dark': 3.608,
    light: 8.321,
    dark: 3.399,
    abyss: 14.345,
  },
  'primary-content': {
    'expensa-light': 1.175,
    'expensa-dark': 14.073,
    light: 1.232,
    dark: 14.037,
    abyss: 3.139,
  },
  secondary: {
    'expensa-light': 4.253,
    'expensa-dark': 3.857,
    light: 3.67,
    dark: 4.316,
    abyss: 10.098,
  },
  'secondary-content': {
    'expensa-light': 1.175,
    'expensa-dark': 13.953,
    light: 1.208,
    dark: 13.109,
    abyss: 3.036,
  },
  accent: {
    'expensa-light': 2.415,
    'expensa-dark': 6.793,
    light: 1.415,
    dark: 11.192,
    abyss: 2.139,
  },
  'accent-content': {
    'expensa-light': 10.13,
    'expensa-dark': 1.619,
    light: 9.686,
    dark: 1.635,
    abyss: 16.238,
  },
  neutral: {
    'expensa-light': 18.019,
    'expensa-dark': 1.099,
    light: 19.895,
    dark: 1.256,
    abyss: 1.352,
  },
  'neutral-content': {
    'expensa-light': 1.913,
    'expensa-dark': 8.574,
    light: 1.759,
    dark: 9.005,
    abyss: 12.67,
  },
  info: {
    'expensa-light': 3.374,
    'expensa-dark': 4.861,
    light: 2.221,
    dark: 7.13,
    abyss: 7.764,
  },
  'info-content': {
    'expensa-light': 11.904,
    'expensa-dark': 1.378,
    light: 14.073,
    dark: 1.125,
    abyss: 1.062,
  },
  success: {
    'expensa-light': 3.296,
    'expensa-dark': 4.977,
    light: 1.959,
    dark: 8.084,
    abyss: 9.69,
  },
  'success-content': {
    'expensa-light': 12.334,
    'expensa-dark': 1.33,
    light: 10.034,
    dark: 1.578,
    abyss: 1.182,
  },
  warning: {
    'expensa-light': 2.278,
    'expensa-dark': 7.2,
    light: 1.763,
    dark: 8.983,
    abyss: 10.433,
  },
  'warning-content': {
    'expensa-light': 8.402,
    'expensa-dark': 1.952,
    light: 9.245,
    dark: 1.713,
    abyss: 2.28,
  },
  error: {
    'expensa-light': 4.829,
    'expensa-dark': 3.396,
    light: 2.879,
    dark: 5.501,
    abyss: 4.851,
  },
  'error-content': {
    'expensa-light': 16.613,
    'expensa-dark': 1.013,
    light: 15.702,
    dark: 1.009,
    abyss: 1.314,
  },
  'base-content/50': {
    'expensa-light': 3.413,
    'expensa-dark': 5.107,
    light: 3.401,
    dark: 4.769,
    abyss: 4.025,
  },
};

/**
 * The sixty-four lucide icon names this app imports, in lucide's own kebab-case.
 *
 * **This is a cross-app contract, which is why it is published rather than kept
 * private.** The frontend's static `CATEGORY_ICON` map must import exactly these
 * sixty-four components, and publishing the set as an OpenAPI enum is what makes
 * `Record<IconName, LucideIcon>` an exhaustiveness proof rather than a map that
 * silently misses a key.
 *
 * `circle-question-mark`, not `circle-help`: the latter is a deprecated alias of
 * it in the installed lucide 1.29.0. All sixty-four are verified to exist there.
 *
 * **Every name here must be lucide's canonical one, not one of its deprecated
 * aliases**, and the review of PET-65 found one that was not: `waves` is nothing
 * but a re-export of `waves-horizontal`, exactly the `circle-help` shape one line
 * above, and it shipped because an alias imports and renders identically to the
 * icon it points at. Nothing fails until lucide drops the alias at a major - by
 * which time the name is in the published OpenAPI enum, in `icon_templates` and in
 * whatever categories users picked with it, so a rename becomes a contract change
 * plus a data migration. The cheap tell, if this needs checking again: lucide keys
 * its category metadata on canonical names only, so an alias comes back untagged.
 * `waves` was the one untagged name of the sixty-four, and after the swap there
 * are none.
 *
 * **The first thirteen are PET-64's and are load-bearing; the rest are PET-65's
 * and are a palette.** The opening block is exactly what the twelve seeded
 * categories carry, plus `circle-question-mark` for the `Uncategorized`
 * fallback, so removing one of those breaks a seeded category. Everything after
 * it exists so a user naming a category of their own has something to pick that
 * is not already spoken for - the same slack the colour list has had since
 * PET-64, where seventeen tokens back thirteen categories.
 *
 * **New names are appended, never interleaved.** `icon_templates.sort_order` is
 * assigned from this order at seed time, so inserting into the middle would make
 * a database seeded before the change disagree with one seeded after about the
 * order of every row past the insertion point, for no gain: an admin reorders
 * the picker for themselves.
 *
 * **Replacing a name in place is the one edit that is exempt from that**, and
 * seventeen of the fifty-one below are replacements rather than originals. A swap
 * keeps every other row's position, so the two databases still agree; only the
 * swapped row's own `name` and `label` differ, and no user category references a
 * template icon after provisioning copies it.
 *
 * **The seventeen were chosen on glyph shape alone, and the block comments below
 * did not survive it.** They record the spending domain each icon was originally
 * picked for, and after the visual pass several no longer describe their
 * contents: `panda` sits under Transport (it replaced `train-front`, which
 * collided with `bus`), `sailboat` under Personal care, `bird` and
 * `waves-horizontal` under Home and bills, `fish` under Work and study. That is a
 * real inconsistency, kept deliberately rather than tidied, because the
 * alternative is reordering - which is the one thing the paragraph above forbids.
 * Read the blocks as provenance, not as taxonomy;
 * `docs/explainers/category-icon-set-preview.html` is the authority for what the
 * set actually looks like and why each swap happened.
 *
 * **Two names are deliberately shared with the app's own interface**, which the
 * same review found and accepted: `pencil` is also the transaction row menu's
 * Edit action and `trash-2` its Delete action. A user can therefore pick a mark
 * that means something else elsewhere in the product. Do not "fix" that without
 * reading the explainer's interface-scan section, which lists every one of the
 * seventeen icons `frontend/src` draws outside the category map.
 */
export const ICON_NAMES = [
  // PET-64: the twelve seeded categories, then the fallback.
  'shopping-basket',
  'utensils',
  'car',
  'zap',
  'heart-pulse',
  'tv',
  'graduation-cap',
  'plane',
  'scissors',
  'gift',
  'paw-print',
  'landmark',
  'circle-question-mark',

  // PET-65 onwards: offered to a user's own categories, grouped by the spending
  // domain they serve rather than by anything about lucide.
  // Food and drink
  'coffee',
  'beer',
  'pizza',
  'ice-cream-cone',
  // Transport
  'fuel',
  'bus',
  'panda',
  'bike',
  'square-parking',
  // Home and bills
  'house',
  'bird',
  'waves-horizontal',
  'wifi',
  'smartphone',
  'trash-2',
  'wrench',
  'sofa',
  // Health and fitness
  'pill',
  'stethoscope',
  'dumbbell',
  'eye',
  // Shopping
  'tag',
  'shirt',
  'package',
  'gem',
  // Money
  'scale',
  'credit-card',
  'piggy-bank',
  'shopping-cart',
  'percent',
  'receipt',
  'trending-up',
  'shield',
  // Entertainment and hobbies
  'gamepad-2',
  'music',
  'film',
  'ticket',
  'book',
  'camera',
  'palette',
  // Work and study
  'briefcase',
  'pencil',
  'fish',
  // Family and social
  'baby',
  'users',
  'rabbit',
  // Personal care
  'sailboat',
  // Travel
  'tree-palm',
  'key-round',
  'tent',
  // Other
  'heart',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
