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

export const THEME_PREFS = ['system', 'light', 'dark'] as const;

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
 */
export function themeAttribute(pref: ThemePref): 'expensa-light' | 'expensa-dark' | undefined {
  if (pref === 'light') return 'expensa-light';
  if (pref === 'dark') return 'expensa-dark';
  return undefined;
}
