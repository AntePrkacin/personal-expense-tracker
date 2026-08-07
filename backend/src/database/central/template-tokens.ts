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
 * The sixteen daisyUI semantic colour tokens, verbatim as the class suffix.
 *
 * Stored on `categories.color` as written here, not as a hex. Hex is not merely
 * indirect, it is **incoherent**: `primary` is valued differently per theme, so
 * `primary` (`#422ad5` light, `#605dff` dark) and `primary-content` (`#e0e7ff`,
 * `#edf1fe`) have no single hex, and a stored one would record one value and
 * paint the other half the time.
 *
 * The `base-*` tokens are deliberately absent. They are the page's own surfaces,
 * so a category painted in one is a category painted in nothing.
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
] as const;

export type ColourToken = (typeof COLOUR_TOKENS)[number];

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
