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
 * `primary` (`#422ad5` light, `#605dff` dark) and `primary-content` (`#e0e7ff`,
 * `#edf1fe`) have no single hex, and a stored one would record one value and
 * paint the other half the time.
 *
 * The `base-100/200/300` surfaces are deliberately absent. They are the page's
 * own backgrounds, so a category painted in one is a category painted in
 * nothing - `base-300` measures 1.16:1 against the card and PET-22 and PET-23
 * each rejected it by name after measuring it.
 *
 * **`base-content/50` is the one exception and it is not a surface**, it is the
 * *ink* on those surfaces at half strength - a mid grey in light and a light
 * grey in dark, measured 3.401:1 and 4.769:1 against the card. It is here
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
 * **Measured, not estimated**, in headless Chromium against the installed
 * daisyUI, by painting each token over `base-100` on a canvas and computing the
 * WCAG ratio - the method `frontend/CLAUDE.md` requires, because Chromium
 * reports `oklch()` and a token carrying an alpha means nothing until it is
 * composited. The harness is cross-validated: it reports `base-300` at 1.16
 * against PET-22's independently recorded 1.157, and `base-content/50` at
 * 3.401 / 4.769 against PET-23's own figures for the same colour.
 *
 * **The number that matters is that only `primary` and `secondary` clear 3:1 in
 * both themes.** Every other semantic token is near-invisible in one of them,
 * because daisyUI pairs each colour with a `-content` that is deliberately at
 * the opposite end of the lightness range - which is exactly what makes it
 * legible *as text on its own colour* and exactly what makes it illegible as a
 * fill on the page's own surface. That is a property of the design system, not
 * of any one assignment here, so it cannot be fixed by re-picking a colour:
 * twelve categories cannot all be distinct and all clear 3:1.
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
  primary: [8.321, 3.399],
  'primary-content': [1.232, 14.037],
  secondary: [3.67, 4.316],
  'secondary-content': [1.208, 13.109],
  accent: [1.903, 8.322],
  'accent-content': [9.686, 1.635],
  neutral: [19.895, 1.256],
  'neutral-content': [1.269, 12.48],
  info: [2.221, 7.13],
  'info-content': [14.073, 1.125],
  success: [1.959, 8.084],
  'success-content': [10.034, 1.578],
  warning: [1.763, 8.983],
  'warning-content': [9.245, 1.713],
  error: [2.864, 5.53],
  'error-content': [15.702, 1.009],
  'base-content/50': [3.401, 4.769],
};

/**
 * The thirteen lucide icon names this app imports, in lucide's own kebab-case.
 *
 * **This is a cross-app contract, which is why it is published rather than kept
 * private.** The frontend's static `CATEGORY_ICON` map must import exactly these
 * thirteen components, and publishing the set as an OpenAPI enum is what makes
 * `Record<IconName, LucideIcon>` an exhaustiveness proof rather than a map that
 * silently misses a key.
 *
 * `circle-question-mark`, not `circle-help`: the latter is a deprecated alias of
 * it in the installed lucide 1.29.0. All thirteen are verified to exist there.
 */
export const ICON_NAMES = [
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
] as const;

export type IconName = (typeof ICON_NAMES)[number];
