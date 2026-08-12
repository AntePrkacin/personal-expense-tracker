'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { fieldDescribedBy, FieldShell } from '@/components/ui/FieldShell';
import { currencySymbol, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/money';

// The Monthly budget field: a currency segment joined to an amount input with a "/ month" suffix.
//
// **Its authority is the team's Claude Design system, not Figma, by product decision (PET-47).**
// The source is `ui_kits/expensa-app/OnboardingScreen.jsx`'s `OnboardingBudgetField`, which
// `SettingsScreen.jsx` renders inside its Budget card. Figma draws a separate "Currency" select
// above a plain budget input, which is what `app/setup/BudgetForm.tsx` shipped and what this
// replaces on both screens - so the two are now one control rather than two, and PET-47's AC1 reads
// "currency" as this field's left segment rather than a row of its own.
//
// **It lives in `components/` because it spans two route trees**, which is `AccessCard`'s reason
// rather than a general "shared field" one: `app/setup/` collects a budget before an account
// exists, and `app/(app)/settings/` edits one afterwards. It clears the bar this folder's own
// CLAUDE.md sets - a picker, a controlled amount field and a popover is real behaviour, not a
// wrapper around a daisyUI class.
//
// **It reads no context and takes the currency as a prop**, which is what lets both consumers use
// it. Settings feeds it from the profile; onboarding feeds it from the sessionStorage draft, where
// there is no session and no `PreferencesProvider` to reach. A field that called `useMoney()` would
// have been unusable on exactly one of the two screens it exists for.
//
// **The box is daisyUI's `join`, which is what makes the segments one pill without any authored
// CSS.** `join` applies the radius to the first and last item and collapses the seam between them,
// so nothing here sets a border radius, a border colour or a negative margin. The amount half is
// daisyUI's own "text label inside" input shape - a `label.input` wrapping the real `<input>` plus
// a trailing `<span>` - which is where the "/ month" suffix comes from.
//
// **One deviation from the source worth stating.** Claude Design moves the focus ring onto the
// *container*, so the whole pill lights up; daisyUI gives each `join-item` its own ring, and that
// is what ships. Reproducing the container ring means authoring a selector, which
// `frontend/CLAUDE.md` forbids outright, and the per-item ring is the more accurate signal anyway:
// it says which half of the control has the caret. `docs/TODO.md` carries it as owed a designer.

/**
 * The currency trigger, as complete literal strings per state.
 *
 * `btn` rather than `select`'s class, which is the one place this diverges from
 * `(app)/DateField.tsx` and `transactions/categories/ColourSelect.tsx`. Those two are whole fields
 * standing alone, so they wear the box every other field wears; this is a segment *inside* a field,
 * where a second field-sized box would read as two controls rather than one. `btn` is also what
 * daisyUI's own `join` examples put beside an input, and it lands on the same 40px height as the
 * `input` half with no sizing class on either.
 *
 * `join-item` is what collapses the seam. `shrink-0` because the amount half is the one that should
 * absorb a narrow viewport, and without it flexbox shrinks the currency code to an ellipsis first.
 */
const TRIGGER: Record<'valid' | 'invalid', string> = {
  valid: 'btn join-item shrink-0 gap-1.5 font-normal',
  invalid: 'btn join-item border-error shrink-0 gap-1.5 font-normal',
};

/**
 * The amount half: daisyUI's `input` on the wrapping `label`, never on the `<input>` inside it.
 *
 * That is the documented shape for an input with an element beside its text (`components/input`'s
 * "Text input with text label inside"), and it is what puts the "/ month" suffix inside the box
 * rather than after it. The inner control carries `grow` and no box classes of its own.
 *
 * `input-error` is the same invalid border `ui/Input` and `ui/Select` show from their own `error`
 * prop, so a rejected budget looks the same here as a rejected name does two fields up.
 */
const BOX: Record<'valid' | 'invalid', string> = {
  valid: 'input join-item flex-1',
  invalid: 'input input-error join-item flex-1',
};

/**
 * The panel, matching `ColourSelect`'s so the two custom pickers in this app read as one idea.
 *
 * `w-56` rather than the trigger's width: a popover is out of flow and inherits nothing. No
 * `max-h`/`overflow` pair, unlike that file - three currencies fit, and a scroll container for
 * three rows would be furniture with nothing to do.
 *
 * **That sentence was true, then false for two tickets, and is true again - which is the reason to
 * read it before growing `SUPPORTED_CURRENCIES` rather than after.** PET-72 took the list to
 * twenty-nine codes for a good reason elsewhere (an exponent-2 allowlist, closing a defect that
 * inflated every JPY amount a hundredfold) and nothing brought anyone back here. Measured at that
 * point: the panel stood **1024px** in a **757px** viewport, overflowing by **294px**, with
 * `max-height` computing to `none` and `scrollHeight === clientHeight`, so it did not scroll
 * either. The last codes were painted and unreachable - a popover is in the **top layer** and
 * positioned against the viewport, so scrolling the page does not bring its bottom back. PET-85
 * cut the list to three, which restores the condition this constant was measured under instead of
 * bounding a panel nobody had designed at that length.
 *
 * So the guard here is a **product** one rather than a CSS one, and it lives in
 * `backend/src/common/currency.ts` where the list does. If that list ever grows past what fits, the
 * `max-h`/`overflow` pair is the change - `transactions/categories/ColourSelect.tsx` is the working
 * example one directory over - and this paragraph is the measurement to re-take, in a browser,
 * because no gate in this repo can see it.
 */
const PANEL = 'dropdown menu rounded-box bg-base-100 z-10 w-56 p-2 shadow-md';

type BudgetFieldProps = {
  /** Lands on the amount `<input>`, so `ui/FieldShell`'s `htmlFor` names the thing being typed in. */
  id: string;
  /** The Figma and Claude Design label, "Monthly budget". A prop so a caller can amend it. */
  label: string;
  /** The stored ISO 4217 code. Any code the backend accepts, not only the three offered. */
  currency: string;
  /**
   * The amount as a **display string**, e.g. `'2,000'`.
   *
   * Not a number, which is `SetupDraft.budget`'s and `CategoryFormValues.monthlyCap`'s reason: no
   * number represents `'2000.'` mid-type, and the conversion belongs at the request boundary. The
   * caller runs `reformatAmountInput` in its own change handler, exactly as it did before this
   * component existed - that helper writes to the DOM and restores the caret, so it must stay at
   * the call site rather than being buried here.
   */
  value: string;
  onValueChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called with the picked code. Omit to render the segment inert - see `currencyDisabled`. */
  onCurrencyChange?: (code: CurrencyCode) => void;
  /** One line of validation copy, rendered by the shell beneath the box. */
  error?: string;
  /** One line of standing guidance. See `ui/FieldShell` on why this is a prop and not a `<p>`. */
  hint?: string;
  /** Marks the amount required for semantics; every form here is `noValidate` (A12). */
  required?: boolean;
  /** Disables both halves, for a form whose request is in flight. */
  disabled?: boolean;
};

export function BudgetField({
  id,
  label,
  currency,
  value,
  onValueChange,
  onCurrencyChange,
  error,
  hint,
  required,
  disabled,
}: BudgetFieldProps) {
  /**
   * Whether the panel is showing, for `aria-expanded` and nothing else.
   *
   * The one piece of state the platform popover does not let us avoid, and it is fed by the
   * popover's own `toggle` event rather than by the click - so a click, an Escape and a click
   * outside all arrive through one path and the attribute cannot disagree with what the browser
   * did. `ColourSelect` and `TransactionRowMenu` both record the whole argument.
   */
  const [open, setOpen] = useState(false);

  const state = error ? 'invalid' : 'valid';
  const symbol = currencySymbol(currency);
  const panelId = `${id}-currency`;

  // A dashed-ident derived from the field id, so two budget fields on one page cannot anchor to
  // each other's panel.
  const anchor = `--${id}-currency-anchor`;

  // The picker is inert when the caller wires no handler. Onboarding and Settings both pass one;
  // what this covers is a future read-only rendering, and it keeps the segment visible rather than
  // dropping it, because the code is information even when it cannot be changed.
  const currencyDisabled = disabled === true || onCurrencyChange === undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="join w-full">
        {/* **The accessible name is built from the subtree, not an `aria-label`.** HTML-AAM
            computes a button's name from what is inside it, so the `sr-only` word plus the code
            give "Currency USD" - which says both what the control is and what it currently holds.
            An `aria-label="Currency"`, which the design system's own version uses, would *replace*
            the subtree and lose the value at exactly the moment a reader needs it.

            The symbol is `aria-hidden` because it duplicates the code it sits beside; announcing
            "dollar sign U S D" is two names for one fact.

            `aria-haspopup` is deliberately absent, for `TransactionRowMenu`'s reason: its useful
            values name ARIA patterns this is not one of, and `"true"` means menu. `aria-expanded`
            reports the state instead, which is the half a reader actually needs. */}
        <button
          type="button"
          popoverTarget={panelId}
          disabled={currencyDisabled}
          aria-expanded={open}
          className={TRIGGER[state]}
          style={{ anchorName: anchor } as React.CSSProperties}
        >
          <span className="sr-only">Currency</span>
          {/* **Rendered only when it is a real glyph.** `currencySymbol` falls back to the code
              itself for anything outside `SUPPORTED_CURRENCIES`, and this span used to sit
              unconditionally beside `{currency}` - so a profile holding `CHF` drew "CHF CHF". The
              symbol is decoration duplicating the code, so the honest fallback is to draw no
              symbol at all rather than the code twice.

              This stayed reachable through two changes to what "outside the list" means. It was
              written when the backend validated `@IsISO4217CurrencyCode()` and any of 180 codes
              could be stored; PET-72 narrowed that to an allowlist and PET-85 narrowed it again to
              three, and each narrowing left *more* stored codes outside the list rather than
              fewer. `CHF` is the live example: offered yesterday, not offered today, still
              rendering. */}
          {symbol === currency ? null : (
            <span aria-hidden="true" className="font-semibold">
              {symbol}
            </span>
          )}
          <span>{currency}</span>
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>

        <label className={BOX[state]}>
          {/* No `type="number"`: it renders spinners and discards a half-typed `24.` mid-keystroke,
              which is `ui/Input`'s own recorded reason. `inputMode="decimal"` gets the numeric
              keypad without either. `tabular-nums` so the digits stop shifting as they are typed. */}
          <input
            id={id}
            name={id}
            type="text"
            inputMode="decimal"
            className="grow font-semibold tabular-nums"
            value={value}
            onChange={onValueChange}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescribedBy(id, hint, error)}
          />
          {/* `aria-hidden` because "/ month" is a property of the field the label already carries,
              and a screen reader meeting it after the value would announce the amount as a
              fraction. */}
          <span aria-hidden="true" className="text-base-content/60">
            / month
          </span>
        </label>
      </div>

      {/* **No `role="listbox"` and no `role="option"`, on purpose**, which is the fourth time this
          app declines a roles-plus-keyboard promise: those roles commit to arrow keys, Home/End,
          type-ahead and `aria-activedescendant`, none of which this implements. What ships is a
          list of ordinary buttons - Tab reaches each, Enter and Space pick - with `aria-current`
          naming the chosen row. `ColourSelect` carries the full argument and the two costs. */}
      <ul
        className={PANEL}
        popover="auto"
        id={panelId}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        {SUPPORTED_CURRENCIES.map((option) => {
          const chosen = option.code === currency;

          return (
            <li key={option.code}>
              <button
                type="button"
                popoverTargetAction="hide"
                popoverTarget={panelId}
                aria-current={chosen ? 'true' : undefined}
                className={chosen ? 'menu-active' : undefined}
                onClick={() => onCurrencyChange?.(option.code)}
              >
                <span aria-hidden="true" className="w-4 font-semibold">
                  {option.symbol}
                </span>
                <span className="grow">{option.name}</span>
                {/* **`opacity-60`, not `text-base-content/60`, and only a browser walk could have
                    caught it.** `menu-active` paints the chosen row a near-black `neutral` in
                    *both* themes, while `base-content` inverts with the theme - so a
                    `text-base-content/*` class is dark-on-dark in **light** mode and fine in dark.
                    Composited and measured against the row's own painted background: the old class
                    is **1.056:1 light** and 6.92:1 dark, where `opacity-60` is **5.962:1 in both**,
                    because opacity dims whatever `currentColor` the row already set instead of
                    naming a colour of its own.
                    Two things worth carrying. The defect was **light-theme only**, so a walk that
                    checked one theme would have cleared it - `frontend/CLAUDE.md` asks for both for
                    exactly this reason. And `getComputedStyle` alone cannot see it: these tokens
                    resolve to `oklch()`/`oklab()`, so the numbers have to come from painting the
                    colour and reading the pixel, which is the same rule that file states for a
                    translucent fill. Every gate was green with the defect in place. */}
                <span className="opacity-60">{option.code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </FieldShell>
  );
}
