'use client';

import { useState } from 'react';

import { THEME_COLOUR, THEME_COOKIE, themeAttribute, type ThemePref } from '@/lib/theme';

// The Theme control on the Preferences card. PET-74's addendum shipped it as a three-way
// System / Light / Dark segmented row; PET-79 replaces that row in place with a grid of tiles,
// one per registered theme, because the app went from two themes to five and a segmented control
// cannot preview what it is offering.
//
// **Each tile previews its own theme by wearing it.** A tile carries `data-theme="<name>"` on its
// own wrapper, so the eight circles inside it paint that theme's real values through the same
// semantic classes the app uses everywhere else. No hex is written here, nothing is hardcoded,
// and editing a theme value in `globals.css` updates every swatch for free. The Automatic tile
// carries no attribute at all, which is precisely what that arm means - see `lib/theme.ts` for
// why removing the attribute is what re-arms the OS selection rather than fighting it.
//
// **It applies instantly and is deliberately not a form field.** The product owner chose the
// design's behaviour over the card's: everything else here waits for the page-level "Save
// changes", but the choice never travels in the PATCH - it is a per-browser cookie, not a
// profile column - so there is nothing for Save to send and nothing for a failed save to roll
// back. That is also why this is the one control on the page that takes no `disabled`: a save
// in flight freezes fields whose values it is carrying, and it is not carrying this one. The
// same argument, from the same product decision, that keeps the Categories summary card free of
// the shared form props.
//
// **Native radios under the tiles, and that is the accessibility budget.** This repo has refused
// `role="listbox"`, `role="menu"` and `role="tab"` wherever the keyboard contract behind the role
// was not implemented; `role="radio"` on styled buttons would be a fourth refusal waiting to
// happen, because real radios owe roving focus and arrow keys. Visually-hidden
// `<input type="radio">`s get all of that from the platform: one tab stop for the group, arrows
// move the selection, and because selection fires `change`, an arrow key applies the theme
// exactly as a click does. The tiles light up through `has-[:checked]`, and the focus ring is
// restored with `outline-solid` alongside `outline-2`, per `frontend/CLAUDE.md`'s standing trap.
//
// **The change lands in three places, all owned here.** The `<html>` element's `data-theme` swaps
// the painted theme in the same frame, the cookie makes the next server render agree so a reload
// arrives already themed with no flash, and the `theme-color` meta tag follows - which the
// manifest cannot do, because its value is static and the tag varies only by media query, never
// by a cookie-driven attribute. Without that third write the tag is correct on load and stale
// from the first theme change, which is the worse of the two failures because it looks like it
// works. Nothing re-reads the cookie client-side: the server-rendered `initial` prop is the one
// source at mount, and this component is the only writer after it.

/**
 * The eight semantic swatches a tile draws, as complete literal class strings.
 *
 * The rule every variant map in this repo follows and the reason this is not a loop over a
 * name list: Tailwind's scanner reads this file as raw text, so `bg-${token}` is found by nobody
 * and compiles to nothing at all - a transparent circle with no build error. `base-100/200/300`
 * are deliberately absent, the same call `COLOUR_TOKENS` makes: a swatch painted in the tile's
 * own background is a swatch painted in nothing.
 */
const SWATCH_CLASSES = [
  'bg-primary',
  'bg-secondary',
  'bg-accent',
  'bg-neutral',
  'bg-info',
  'bg-success',
  'bg-warning',
  'bg-error',
] as const;

/**
 * The six options with their copy, exported so no story or test restates a shipped string -
 * `MONTH_START_HINT`'s rule, one row up the card.
 *
 * **Automatic is first and is the only one whose `pref` is not a theme name.** The app's own pair
 * follows, because one of them is the `:root` default, then the three stock themes. Every label is
 * ours: the design file draws none of this, so all six join what A29 owes a designer.
 *
 * **The labels say "Spendifico" where the theme names say `expensa-`, and that split is
 * deliberate.** PET-51 renamed the product and six suites pin the absence of the old name in
 * user-visible copy so it cannot be half-reverted by somebody working from Figma in good faith -
 * one of them caught the first draft of this file, which shipped "Expensa Light" as a tile label.
 * The CSS identifiers keep their names because PET-74 took those values from the team's *Expensa
 * Design System* project, so `expensa-light` names its source rather than the product, and
 * renaming it would reach `globals.css`, every stored cookie, `DecorativePanel.tsx`'s pin and
 * three explainer files for no gain. Internal name, brand label.
 */
export const THEME_OPTIONS = [
  {
    pref: 'system',
    label: 'Automatic',
    hint: 'Follows your device setting, between the two Spendifico palettes.',
  },
  { pref: 'expensa-light', label: 'Spendifico Light', hint: 'The app’s own light palette.' },
  { pref: 'expensa-dark', label: 'Spendifico Dark', hint: 'The app’s own dark palette.' },
  { pref: 'light', label: 'Light', hint: 'daisyUI’s light theme.' },
  { pref: 'dark', label: 'Dark', hint: 'daisyUI’s dark theme.' },
  { pref: 'abyss', label: 'Abyss', hint: 'A deep green-black palette.' },
] as const satisfies readonly { pref: ThemePref; label: string; hint: string }[];

/**
 * Every registered theme is offered, and every option names something real.
 *
 * Two proofs rather than one, because they fail in opposite directions: a theme registered in
 * `globals.css` and missing from the picker is a theme nobody can reach, and an option naming a
 * theme that is not registered pins nothing and silently follows the page - the failure
 * `app/DecorativePanel.tsx` shipped once. `ThemeField.test.tsx` asserts both against
 * `THEME_NAMES`; these two aliases make the first a build error as well.
 */
type OfferedPref = (typeof THEME_OPTIONS)[number]['pref'];
export type EveryThemeIsOffered = Exclude<ThemePref, OfferedPref> extends never ? true : never;
export type EveryOfferedIsAPref = Exclude<OfferedPref, ThemePref> extends never ? true : never;

/**
 * Writes one preference onto the document: the `<html>` attribute and the `theme-color` meta tags
 * for this frame, the cookie for every render after it. Exported for the suite, which asserts all
 * three writes rather than the class strings around them.
 *
 * A year of `max-age`, refreshed on every change; `samesite=lax` to match the app's other
 * cookies; no `secure`, which would silently fail to set under `npm run dev` - the same reason
 * `lib/session.ts` rejected `__Host-`.
 *
 * **The chrome colour cannot follow the picker on its own, and that is a fact about the platform
 * rather than a gap.** The manifest's `theme_color` is one static value and
 * `<meta name="theme-color">` varies only by media query, never by a cookie-driven `data-theme` -
 * so `layout.tsx` renders a `prefers-color-scheme` pair, which is exactly right for the
 * `system` arm and wrong for an explicit pick that disagrees with the OS. This closes the
 * explicit case by overwriting both tags with the picked theme's own colour.
 *
 * **The `system` arm restores the pair by reading each tag's own `media`**, rather than by
 * stashing the original anywhere: Next renders the pair from `viewport.themeColor` and gives no
 * hook to hang a custom attribute on, and the media query *is* the fact that says which of the
 * two a tag is. `system` follows the OS between the two Expensa casts, which is what those two
 * entries are.
 */
export function applyThemePref(pref: ThemePref): void {
  const attribute = themeAttribute(pref);
  if (attribute) {
    document.documentElement.setAttribute('data-theme', attribute);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
    const colour = attribute
      ? // One explicit colour on both tags, so neither can win by media over the pick.
        THEME_COLOUR[attribute]
      : // Back to the automatic pair: the dark-media tag gets the dark cast, the other the light.
        THEME_COLOUR[
          tag.getAttribute('media')?.includes('dark') ? 'expensa-dark' : 'expensa-light'
        ];
    tag.setAttribute('content', colour);
  }

  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
}

// A literal rather than `useId`, `ui/FieldShell`'s own convention, so the suite and the markup
// name the same string.
const LABEL_ID = 'settings-theme-label';

/**
 * The tile, in both states.
 *
 * A `card`-shaped button rather than a daisyUI `btn`, unlike `CategoryChip`: a chip is a label
 * and this holds a label over a swatch row, so the box is `rounded-box border` on the tile's own
 * `base-100`. `has-[:checked]:border-primary` plus a ring is the selected treatment - a border
 * colour change alone moves no pixels, which is the class of defect
 * `frontend/CLAUDE.md`'s Where daisyUI and Tailwind fight catalogues, so the ring is what makes
 * it unmissable and the border what makes it precise.
 */
const TILE_CLASS =
  'border-base-300 has-[:checked]:border-primary has-[:checked]:ring-primary ' +
  'has-[:checked]:ring-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid ' +
  'has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2 ' +
  'bg-base-100 rounded-box flex cursor-pointer flex-col gap-2 border p-3 select-none';

type ThemeFieldProps = {
  /**
   * The preference the server rendered `<html>` with, read from the cookie in
   * `settings/page.tsx`. A prop rather than a client-side cookie read, because the control's
   * checked state has to agree with the server HTML at hydration - the same reasoning that
   * threads every other server-known value down instead of re-deriving it in the browser.
   */
  initial: ThemePref;
};

export function ThemeField({ initial }: ThemeFieldProps) {
  const [pref, setPref] = useState(initial);
  const active = THEME_OPTIONS.find((option) => option.pref === pref) ?? THEME_OPTIONS[0];

  const choose = (next: ThemePref) => {
    setPref(next);
    applyThemePref(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {/* The row heading, not a `<label>`: six inputs cannot share one `for`, so the group is
            named by `aria-labelledby` instead and each input's own name is its visible tile
            text. */}
        <span id={LABEL_ID} className="text-sm font-semibold">
          Theme
        </span>
        {/* The per-selection hint, plain text rather than a live region: the radio itself
            announces the change of state, and the hint is its visual restatement. */}
        <span className="text-base-content/60 text-sm">{active.hint}</span>
      </div>

      {/* `role="radiogroup"` over native radios is grouping, not a re-implementation: the inputs
          keep their platform roles and keyboard, the wrapper only carries the name. */}
      <div
        role="radiogroup"
        aria-labelledby={LABEL_ID}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((option) => (
          <label
            key={option.pref}
            className={TILE_CLASS}
            // The whole of the preview. `undefined` renders no attribute, so the Automatic tile
            // inherits whatever the page is currently painted as - which is what it is offering.
            data-theme={themeAttribute(option.pref)}
          >
            <input
              type="radio"
              name="theme-pref"
              value={option.pref}
              className="sr-only"
              checked={pref === option.pref}
              onChange={() => choose(option.pref)}
            />
            <span className="text-base-content truncate text-sm font-medium">{option.label}</span>
            {/* `aria-hidden` because the swatches carry nothing the label does not: a reader is
                told which theme this is, and eight unnamed circles would announce as eight empty
                generics. The same call `ui/Input`'s `$` prefix and the step indicator make. */}
            <span aria-hidden="true" className="flex gap-1">
              {SWATCH_CLASSES.map((swatch) => (
                <span key={swatch} className={`size-3 rounded-full ${swatch}`} />
              ))}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
