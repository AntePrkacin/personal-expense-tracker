// The theme preference behind the Settings Theme control (PET-74's addendum), shared by the
// server (the root layout, `settings/page.tsx`) and the client (`settings/ThemeField.tsx`) -
// which is why this module touches neither React nor `next/headers`, the same line
// `lib/date.ts` and `settings/settingsForm.ts` hold.
//
// **`system` means "no `data-theme` attribute at all", and that is the whole mechanism.**
// `globals.css` registers `expensa-dark` with `--prefersdark`, whose media selector daisyUI
// emits as `:root:not([data-theme])` - so stamping the attribute is what suppresses the
// automatic OS selection, and removing it is what restores it. An explicit choice and the
// automatic one cannot fight, by construction, which is what retired the old rule that a
// theme control must not coexist with automatic prefers-dark: a two-way toggle could not
// coexist with it, and this control's `system` arm is the coexistence.

/**
 * The registered daisyUI theme names, in the order the picker offers them.
 *
 * PET-74's Expensa pair first, because they are the app's own and one of them is the `:root`
 * default; then the three stock themes PET-79 registered behind seven token overrides. The
 * authority for what is actually registered is `globals.css`'s `@plugin 'daisyui'` block and its
 * two `@plugin 'daisyui/theme'` blocks; this list is the half of that contract the TypeScript
 * side holds, and `frontend/src/lib/themeGuard.test.ts` is what fails if the two disagree.
 */
export const THEME_NAMES = ['expensa-light', 'expensa-dark', 'light', 'dark', 'abyss'] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/**
 * Every value the cookie may hold: `system` plus one per registered theme.
 *
 * **`light` and `dark` mean something different than they did before PET-79**, and it is worth
 * knowing rather than discovering. Under PET-74 they were the two arms of a three-way control and
 * `themeAttribute` mapped them onto `expensa-light` and `expensa-dark`; they are now the *stock*
 * daisyUI themes of those names, and the Expensa pair is named explicitly. So a browser holding
 * the old cookie lands on a different theme, once. Nothing is migrated, because there are no real
 * users and test accounts are purged - `docs/TODO.md` carries the decision. The `system` arm is
 * unaffected, which is the one every browser that has never touched the control is on.
 */
export const THEME_PREFS = ['system', ...THEME_NAMES] as const;

export type ThemePref = (typeof THEME_PREFS)[number];

/**
 * The cookie the choice persists in, named beside `spendifico.session`.
 *
 * Deliberately **not** httpOnly, unlike both cookies `lib/session.ts` and `lib/pendingEmail.ts`
 * own: those hold a credential and an address, where this holds one of three public words, and
 * the control writes it from the browser so the choice applies instantly with no round trip.
 * The server reads it in the root layout so the page arrives already themed - a localStorage
 * copy would need an inline script in `<head>` to avoid a flash of the wrong theme.
 */
export const THEME_COOKIE = 'spendifico.theme';

/**
 * Validates a stored preference back into the union.
 *
 * A cookie is writable from devtools, so the value is checked rather than cast - the same call
 * `setup/draft.ts` makes about sessionStorage and `lib/pendingEmail.ts` about its own cookie.
 * Anything unrecognised, absent included, reads as `system`, deliberately the arm that claims
 * the least: it is the pre-PET-74 behaviour for every browser that has never touched the control.
 */
export function parseThemePref(value: string | undefined): ThemePref {
  return THEME_PREFS.includes(value as ThemePref) ? (value as ThemePref) : 'system';
}

/**
 * The registered daisyUI theme name a preference pins, or `undefined` for `system`.
 *
 * `undefined` rather than a name, because React omits an attribute whose value is `undefined` -
 * so `<html data-theme={themeAttribute(pref)}>` renders no attribute at all for `system`, which
 * is the state the `--prefersdark` media selector requires. The names are the theme blocks' own
 * from `globals.css`; `DecorativePanel.tsx` learned the hard way that an unregistered name
 * (`light`, after PET-74 replaced the stock pair) matches nothing and pins nothing, silently.
 *
 * **A lookup rather than two branches as of PET-79**, and the shape carries the point: every
 * preference except `system` *is* a registered theme name, so there is no mapping table to keep
 * in step with the CSS and no second place for a rename to have to reach. The one branch left is
 * the one that means something.
 */
export function themeAttribute(pref: ThemePref): ThemeName | undefined {
  return pref === 'system' ? undefined : pref;
}

/**
 * The browser chrome colour per theme: each one's own `base-100`, the surface the chrome sits
 * above.
 *
 * **The one place in the app a theme colour is written as a hex outside `globals.css`**, and it
 * has to be: `<meta name="theme-color">` takes a colour rather than a `var()`, and the element
 * lives outside the themed subtree anyway. So a change to any theme's card colour owes an edit
 * here - `themeGuard.test.ts` is what notices, because it reads the same values out of
 * `globals.css` and the installed `daisyui/themes.css` and pins this map against them.
 *
 * It lives here rather than in `settings/ThemeField.tsx` because both sides need it: the root
 * layout renders the static `prefers-color-scheme` pair from the two Expensa entries, and the
 * control overwrites the tag when an explicit theme is picked.
 */
export const THEME_COLOUR: Record<ThemeName, string> = {
  'expensa-light': '#ffffff',
  'expensa-dark': '#18202b',
  light: '#ffffff',
  dark: '#1d232a',
  abyss: '#001e29',
};
