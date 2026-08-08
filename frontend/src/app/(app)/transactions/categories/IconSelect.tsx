'use client';

import { createElement, useRef, useState } from 'react';

import { categoryIcon, type IconName } from '@/components/ui/categoryColour';
import { FieldShell } from '@/components/ui/FieldShell';
import type { PaletteIcon } from '@/lib/palette';

import { centreChosenRow } from './pickerScroll';

// The Icon field's picker: a search box over a six-across grid of every glyph the palette offers.
//
// **Why a grid rather than `ColourSelect`'s list.** Sixteen colours read fine as named rows; 64 glyphs
// do not, because the *glyph* is what a person is looking for and a one-per-row list makes them scroll
// eleven screens of names to find it. PET-65's plan said as much when it chose 64 - it observed that 64
// grids evenly and noted this picker had no design behind it. Six across is the width the reference
// image asks for.
//
// **The search box is what makes 64 usable, and it is the reason this is not just a grid.** It filters
// on the admin's label *and* on the lucide name, so "tv" finds "Television" and "bank" finds
// "Landmark" - two vocabularies for one glyph, and a person searching has no idea which one they are
// holding.
//
// Everything structural is `ColourSelect`'s, which is in turn `TransactionRowMenu`'s: the popover is
// the platform's, the trigger wears `select`'s own class string so all three fields are one box when
// closed, `aria-labelledby` names the label and the value span, and there is **no `role="listbox"`**
// because that promises a keyboard contract - here it would be a two-dimensional one, with arrows in
// four directions - that this does not implement. Tab reaches every cell and `aria-current` names the
// chosen one. Read `ColourSelect` for the full argument; only the differences are documented here.
//
// **Two states no frame draws and this file invents**: an empty search, and the search box itself.
// `docs/TODO.md` records both as owing a designer.

/**
 * The trigger's box, the same literal `ColourSelect` and `(app)/DateField.tsx` both use, and one
 * literal rather than a per-state record for the reason `ColourSelect` gives: this field can carry
 * no message, so an `invalid` variant would be unreachable.
 */
const TRIGGER = 'select w-full cursor-pointer text-left';

/**
 * The panel, `dropdown-end` so it right-aligns under the trigger and grows leftwards - the Icon field
 * is the right-hand half of the row, so a left-aligned panel would hang off the modal.
 *
 * `w-72` is six cells plus their gaps and the padding. `max-h-*` lives on the grid rather than here, so
 * the search box stays put while the glyphs scroll under it.
 *
 * **`overflow-hidden` is what stops a *second* vertical scrollbar, and it is not redundant.** Chromium's
 * UA stylesheet gives every `[popover]` `overflow: auto`, so this element is a scroll container before
 * any class of ours touches it - and the grid inside is a second one. That drew two bars side by side
 * down the right edge, the outer one scrolling nothing anybody wanted. `ColourSelect` never showed it
 * because there the popover element *is* the scrolling list, so there is only ever one container.
 * Hiding it here is safe precisely because the only thing that may scroll is the grid, which owns its
 * own `overflow-y-auto`.
 */
const PANEL =
  'dropdown dropdown-end rounded-box bg-base-100 z-10 w-72 overflow-hidden p-2 shadow-md';

/**
 * A cell, in complete literals per state.
 *
 * **Never two style modifiers in one string**, which is the trap `frontend/CLAUDE.md` records: two
 * modifiers from one daisyUI component are resolved by the plugin's emission order rather than by the
 * attribute, so `btn-ghost btn-active` would draw whichever `button.css` emits last. `btn-ghost` and
 * `btn-primary` are each the only style modifier in their string. The filled primary cell is what the
 * reference image draws for the chosen glyph.
 *
 * **`w-full aspect-square p-0` rather than `btn-square`, and a browser walk is why.** `btn-square`
 * fixes a cell at the button height, so six of them plus their gaps are a fixed 260px - which fits
 * `w-72`'s content box at 272px right up until the *vertical* scrollbar appears and takes 15px of it.
 * Then the grid overflows horizontally, and because `overflow-y: auto` makes `overflow-x: visible`
 * compute to `auto`, the panel grew a second scrollbar along the bottom. Letting each cell fill its
 * grid column instead makes the columns fractional, so they cannot overflow at any scrollbar width;
 * `aspect-square` keeps them square and `p-0` stops `btn`'s own inline padding fighting the width.
 */
const CELL: Record<'chosen' | 'plain', string> = {
  chosen: 'btn btn-primary aspect-square w-full p-0',
  plain: 'btn btn-ghost aspect-square w-full p-0',
};

/** The grid: six across, scrolling under the search box rather than growing the panel. */
const GRID = 'grid max-h-56 grid-cols-6 gap-1 overflow-y-auto';

/** What the trigger reads before a palette has supplied anything. See `AddCategoryModal`. */
const NO_ICON = 'Select…';

/** Shown when a search matches nothing. Invented - no frame draws it. */
const NO_MATCHES = 'No icons match that.';

type IconSelectProps = {
  id: string;
  /** The Figma "Label" property, which is "Icon". */
  label: string;
  /** In the server's order, rendered as given until a search narrows it. */
  options: PaletteIcon[];
  /** `''` before a palette has landed, which is the disabled case. */
  value: IconName | '';
  /** Called with the chosen lucide name, already the contract's union. See `ColourSelect`. */
  onChange: (name: IconName) => void;
  disabled?: boolean;
};

export function IconSelect({ id, label, options, value, onChange, disabled }: IconSelectProps) {
  const [open, setOpen] = useState(false);

  /** The search term. Reset when the panel closes, so reopening never shows a stale filter. */
  const [query, setQuery] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const panelId = `${id}-picker`;
  const anchor = `--${id}-anchor`;

  const selected = options.find((icon) => icon.name === value);
  const TriggerIcon = categoryIcon(value);

  /**
   * **Matched on the label *and* the lucide name**, which is the whole point of having a search here.
   * The two vocabularies disagree often enough to matter - "Television" is `tv`, "Bank" is `landmark`,
   * "Bolt" is `zap` - and a person typing has no way to know which one they hold. Trimmed and
   * lowercased on both sides so a stray space or a capital never hides a glyph that is there.
   */
  const needle = query.trim().toLowerCase();
  const matches =
    needle === ''
      ? options
      : options.filter(
          (icon) =>
            icon.label.toLowerCase().includes(needle) || icon.name.toLowerCase().includes(needle),
        );

  return (
    <FieldShell id={id} label={label}>
      <button
        type="button"
        id={id}
        popoverTarget={panelId}
        disabled={disabled}
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={TRIGGER}
        style={{ anchorName: anchor } as React.CSSProperties}
      >
        <span className="flex items-center gap-2">
          {/* The chosen glyph, repeated on the closed control exactly as `ColourSelect` repeats the
              swatch. `createElement` rather than JSX for `react-hooks/static-components`, which reads a
              capitalised local in JSX as a component created during render - `CategoryCard` carries the
              full account. */}
          {TriggerIcon === null
            ? null
            : createElement(TriggerIcon, {
                className: 'size-4.5 shrink-0',
                'aria-hidden': 'true',
              })}
          <span id={`${id}-value`}>{selected?.label ?? NO_ICON}</span>
        </span>
      </button>

      {/* A `div` rather than a `ul`, and no `menu` class: this holds a text input above a grid, which
          is neither a list nor what `menu`'s row styling is for. */}
      <div
        popover="auto"
        id={panelId}
        className={PANEL}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        onToggle={(event) => {
          const isOpen = event.newState === 'open';
          setOpen(isOpen);

          // Focus lands in the search box on open, which is the one thing that makes 64 glyphs
          // navigable without arrow keys: type two letters and Tab reaches the cell you wanted. The
          // popover has already been shown by the time `toggle` fires, so this needs no deferral.
          if (isOpen) {
            searchRef.current?.focus();

            // **Centred on open, so the chosen glyph is never off-screen behind eleven rows.** Focusing
            // the search box first is deliberate: it sits above the grid rather than inside it, so it
            // cannot move the grid's own scroll and the two do not fight. See `centreChosenRow` for why
            // this is not `scrollIntoView`.
            centreChosenRow(gridRef.current);
            return;
          }

          // Cleared on close rather than on open, so nothing flashes the full grid before filtering.
          setQuery('');
        }}
      >
        {/* **`onKeyDown` stopping Enter is mandatory, not defensive.** `(app)/Modal.tsx` wraps the body
            in a real `<form>` precisely so Enter submits it, which is right for every other field and
            catastrophic here: Enter after typing two letters of a search would create the category.
            The popover's own light dismiss still handles Escape, so only this one key is intercepted.

            No `type="search"`, which would add a browser-drawn clear button the design does not draw
            and which varies per engine. */}
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          placeholder="Search icons…"
          aria-label={`Search ${label.toLowerCase()}s`}
          className="input input-sm mb-2 w-full"
        />

        {matches.length === 0 ? (
          <p className="text-base-content/60 px-1 py-2 text-sm">{NO_MATCHES}</p>
        ) : (
          <div ref={gridRef} className={GRID}>
            {matches.map((icon) => {
              const Glyph = categoryIcon(icon.name);
              const isChosen = icon.name === value;

              return (
                <button
                  key={icon.name}
                  type="button"
                  popoverTarget={panelId}
                  popoverTargetAction="hide"
                  aria-current={isChosen ? true : undefined}
                  onClick={() => onChange(icon.name)}
                  className={CELL[isChosen ? 'chosen' : 'plain']}
                >
                  {Glyph === null
                    ? null
                    : createElement(Glyph, { className: 'size-5', 'aria-hidden': 'true' })}
                  {/* **The cell's accessible name, and without it every cell is nameless.** The grid
                      draws glyphs only - the reference image has no captions - and a glyph is
                      `aria-hidden`, so a screen reader would meet 64 buttons called "button". A
                      visually hidden span is `(app)/Modal.tsx`'s own answer for its close button, and
                      it keeps `getByRole('button', { name: 'Television' })` true. */}
                  <span className="sr-only">{icon.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
