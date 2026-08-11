'use client';

import { useState } from 'react';

import { THEME_COOKIE, themeAttribute, type ThemePref } from '@/lib/theme';

// The Theme row on the Preferences card (PET-74's addendum): System / Light / Dark as the
// segmented control the Claude Design system's `SettingsScreen.jsx` draws (`ThemeSegmented`),
// mapped to semantic classes exactly as `CardBanner` and `BudgetField` translated their own
// sources - `bg-base-300` for the design's muted track, the selected segment lifted on a
// `bg-base-100` pill with `shadow-sm`.
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
// **Native radios under the segmented skin, and that is the accessibility budget.** This repo
// has refused `role="listbox"`, `role="menu"` and `role="tab"` wherever the keyboard contract
// behind the role was not implemented; `role="radio"` on styled buttons - which is what the
// design source literally draws - would be a fourth refusal waiting to happen, because real
// radios owe roving focus and arrow keys. Visually-hidden `<input type="radio">`s get all of
// that from the platform: one tab stop, arrows move the selection, and because selection fires
// `change`, an arrow key applies the theme exactly as a click does. The labels wear the
// segmented look and light up through `has-[:checked]`; the focus ring is restored with
// `outline-solid` alongside `outline-2`, per `frontend/CLAUDE.md`'s standing trap.
//
// **The change lands in two places, both owned here.** The `<html>` element's `data-theme`
// swaps the painted theme in the same frame (removing it is what `system` means - see
// `lib/theme.ts` for why that restores the OS selection by construction), and the cookie makes
// the next server render agree, so a reload arrives already themed with no flash. Nothing
// re-reads the cookie client-side: the server-rendered `initial` prop is the one source at
// mount, and this component is the only writer after it.

/**
 * The three options with the design source's own copy, exported so no story or test restates a
 * shipped string - `MONTH_START_HINT`'s rule, one row up the card.
 */
export const THEME_OPTIONS = [
  { pref: 'system', label: 'System', hint: 'Follows your device setting.' },
  { pref: 'light', label: 'Light', hint: 'Always the light palette.' },
  { pref: 'dark', label: 'Dark', hint: 'Always the dark palette.' },
] as const satisfies readonly { pref: ThemePref; label: string; hint: string }[];

/**
 * Writes one preference onto the document: the `<html>` attribute for this frame, the cookie
 * for every render after it. Exported for the suite, which asserts both writes rather than the
 * class strings around them.
 *
 * A year of `max-age`, refreshed on every change; `samesite=lax` to match the app's other
 * cookies; no `secure`, which would silently fail to set under `npm run dev` - the same reason
 * `lib/session.ts` rejected `__Host-`.
 */
export function applyThemePref(pref: ThemePref): void {
  const attribute = themeAttribute(pref);
  if (attribute) {
    document.documentElement.setAttribute('data-theme', attribute);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
}

// A literal rather than `useId`, `ui/FieldShell`'s own convention, so the suite and the markup
// name the same string.
const LABEL_ID = 'settings-theme-label';

const SEGMENT_CLASS =
  'text-base-content/70 has-[:checked]:bg-base-100 has-[:checked]:text-base-content ' +
  'has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid ' +
  'has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2 ' +
  'flex h-8 min-w-22 cursor-pointer items-center justify-center rounded-full px-4 ' +
  'text-sm font-medium select-none';

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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {/* The design's row heading, not a `<label>`: three inputs cannot share one `for`, so
            the group is named by `aria-labelledby` instead and each input's own name is its
            visible segment text. */}
        <span id={LABEL_ID} className="text-sm font-semibold">
          Theme
        </span>
        {/* The per-selection hint, plain text rather than a live region: the radio itself
            announces the change of state, and the hint is its visual restatement. */}
        <span className="text-base-content/60 text-sm">{active.hint}</span>
      </div>

      {/* `role="radiogroup"` over native radios is grouping, not a re-implementation: the
          inputs keep their platform roles and keyboard, the wrapper only carries the name. */}
      <div
        role="radiogroup"
        aria-labelledby={LABEL_ID}
        className="bg-base-300 inline-flex gap-1 rounded-full p-1"
      >
        {THEME_OPTIONS.map((option) => (
          <label key={option.pref} className={SEGMENT_CLASS}>
            <input
              type="radio"
              name="theme-pref"
              value={option.pref}
              className="sr-only"
              checked={pref === option.pref}
              onChange={() => choose(option.pref)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
