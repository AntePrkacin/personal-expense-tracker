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
 * nothing - `base-300` measures 1.15:1 (light) and 1.16:1 (dark) against the
 * card under the Expensa themes, and PET-22 and PET-23 each rejected it by name
 * after measuring the stock value at the same 1.16.
 *
 * **`base-content/50` is the one exception and it is not a surface**, it is the
 * *ink* on those surfaces at half strength - a mid grey in light and a light
 * grey in dark, measured 3.395:1 and 5.076:1 against the card. It is here
 * because the sixteen semantic tokens cannot supply a muted colour that is
 * visible in both themes, which is a measured fact rather than an impression;
 * see the table on `COLOUR_CONTRAST` below.
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
 * What each token measures against the card it is drawn on, light then dark.
 *
 * **Re-measured for PET-74's Expensa theme pair**, which replaced the stock
 * `light`/`dark` these numbers first described. The themes now author every
 * colour as an exact hex in `frontend/src/app/globals.css`, so each figure is
 * computed from those values directly (the WCAG formula, with `base-content/50`
 * alpha-composited over the card first) and cross-checked in headless Chromium
 * by painting the token over `base-100` and reading the pixel - the method
 * `frontend/CLAUDE.md` requires, kept even though the arithmetic is now exact,
 * because a computed table drifts the moment somebody edits a theme value
 * without re-running the check.
 *
 * **Under the stock themes only `primary` and `secondary` cleared 3:1 in both
 * columns; the Expensa values were chosen with this table in the loop, so six
 * now do** - `primary`, `secondary`, `info`, `success`, `error` and
 * `base-content/50`. What has not changed is the shape of the rest: every
 * `-content` token is still deliberately at the opposite end of the lightness
 * range from its base, which is exactly what makes it legible *as a glyph on
 * its own tile* (every pairing measures 3.4:1 or better, both themes) and
 * exactly what makes it near-invisible as a fill on the page's own surface in
 * one theme. That is a property of the pairing, not of any one assignment, so
 * it cannot be fixed by re-picking a colour: seventeen categories cannot all be
 * distinct and all clear 3:1 in both themes.
 *
 * PET-64 accepted that for the twelve category templates, on the argument its
 * PR records - the ring is `aria-hidden`, the legend names every slice in real
 * text, and every glyph clears 3:1 on its own tile, so colour carries no
 * information WCAG 1.4.11 governs. This table exists so the next person weighing
 * that decision argues with numbers instead of re-deriving them, and so nobody
 * writes "visible in both themes" about a token again without looking.
 *
 * Not exported to the API and not a runtime check - it is documentation with a
 * type on it, kept beside the list it describes so the two cannot drift.
 *
 * **Every number here is void the moment a theme changes**, which is why
 * `docs/explainers/category-color-palette-preview.html` renders this table beside
 * the marks it describes: a theme is what re-measurement is triggered by, and
 * `frontend/CLAUDE.md`'s Changing or adding a theme is the authority for the
 * check that has to pass before one lands.
 */
export const COLOUR_CONTRAST: Record<ColourToken, [number, number]> = {
  primary: [6.288, 3.608],
  'primary-content': [1.175, 14.073],
  secondary: [4.253, 3.857],
  'secondary-content': [1.175, 13.953],
  accent: [2.415, 6.793],
  'accent-content': [10.13, 1.619],
  neutral: [18.019, 1.099],
  'neutral-content': [1.913, 8.574],
  info: [3.374, 4.861],
  'info-content': [11.904, 1.378],
  success: [3.296, 4.977],
  'success-content': [12.334, 1.33],
  warning: [2.278, 7.2],
  'warning-content': [8.402, 1.952],
  error: [4.829, 3.396],
  'error-content': [16.613, 1.009],
  'base-content/50': [3.395, 5.076],
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
