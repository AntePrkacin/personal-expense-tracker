'use client';

import { EllipsisVertical } from 'lucide-react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';

// The kebab menu behind a row or a card: frame 10 (transaction row) and frame 18 (category card).
//
// **It is the platform popover, and that argument is this app's most-repeated one.** AC1 on both
// tickets asks for "clicking elsewhere or pressing Escape closes it", which is light dismiss and the
// Escape default action - the platform gives both, plus the top layer, so nothing here picks a
// z-index and nothing here listens on `document`. `(app)/Modal.tsx` makes the same argument about
// `<dialog>`, `ui/Select.tsx` about the native select, and this screen's own `ColourSelect` and
// `IconSelect` about their panels. The hand-rolled version is a click listener, a keydown listener
// and a chosen stacking order: three approximations in place of three browser guarantees. daisyUI 5
// requires it independently, its `dropdown` rules forbidding the legacy `tabindex`, `<details>` and
// focus-based forms.
//
// **Lifted at the second consumer rather than the third, and a code review is why.** The rule of
// three is right about markup; what is here is not only markup. `triggerRef.current?.focus()` in
// `PopoverMenuItem` is a fix a review found on the transaction menu, with a ten-line explanation,
// and PET-39 copied it verbatim into the category menu - so the next such fix would have had to be
// found and applied twice. One owner is what stops the third menu being a third copy.
//
// **Two costs come with the popover, both recorded rather than fixed.** jsdom implements none of
// the Popover API and `jest.setup.ts` deliberately polyfills none of it - faking light dismiss
// would turn AC1 into a test of the fake - so under Jest a menu is permanently "open", suites
// assert the wiring, and opening and closing are Chrome and Storybook checks. Firefox did not
// support CSS anchor positioning, where daisyUI's `@supports` fallback centres the popover behind a
// dimmed backdrop; `docs/TODO.md` records that Firefox 153 now does.
//
// **No `role="menu"`, no `role="menuitem"` and no `aria-haspopup`.** Those roles come with a
// keyboard contract - arrow keys between items, Home and End - and this repo does not publish ARIA
// it has not implemented; `app/setup/SetupShell.tsx` records the same refusal about
// `aria-current="step"`. A `<ul>` of ordinary buttons is what is actually here, Tab reaches them
// from the trigger, and that is what it announces.

/**
 * What an item needs from the menu around it: which popover to close, and where focus belongs.
 *
 * A context rather than cloned children or a render prop, so an item is an ordinary element a
 * caller can wrap, map over or omit - which is what `CategoryCardMenu` does to drop Delete on the
 * fallback card.
 */
type PopoverMenuContext = {
  menuId: string;
  focusTrigger: () => void;
};

const MenuContext = createContext<PopoverMenuContext | null>(null);

function useMenu(): PopoverMenuContext {
  const value = useContext(MenuContext);

  if (value === null) {
    throw new Error('PopoverMenuItem must be used inside PopoverMenu.');
  }

  return value;
}

type PopoverMenuProps = {
  /**
   * The popover's id, which has to be document-unique.
   *
   * **The caller owns the whole string rather than handing over a bare row id**, so each menu keeps
   * a prefix that says what it is - `row-menu-<uuid>`, `category-menu-<uuid>` - in the DOM, in
   * devtools and in the two suites that assert the pairing. A prefix invented here would have made
   * every menu in the app read the same and would have silently rewritten both.
   */
  id: string;
  /**
   * The trigger's accessible name, e.g. "Actions for Groceries".
   *
   * Named per row rather than a bare "More actions": a page of ten identical buttons tells a
   * screen-reader user which control they are on and nothing about which row.
   */
  label: string;
  /** Extra classes for the trigger, for a caller whose layout needs them. */
  triggerClassName?: string;
  /**
   * Extra classes for the kebab glyph.
   *
   * **This exists only to preserve a difference the two callers already had**, and it is a
   * difference nobody decided: the transaction row dims its glyph with `text-base-content/40` and
   * the category card does not. Unifying either way is a visible change to one screen, so it is
   * left as it was and `docs/TODO.md` carries the question for a designer.
   */
  glyphClassName?: string;
  /** The items, normally `PopoverMenuItem`s. */
  children: React.ReactNode;
};

export function PopoverMenu({
  id,
  label,
  triggerClassName = '',
  glyphClassName = '',
  children,
}: PopoverMenuProps) {
  /**
   * The popover's id and its anchor name, both derived from the caller's key.
   *
   * Note these are **inline styles, not classes**: Tailwind's scanner would compile nothing from an
   * interpolated class, which is the rule `frontend/CLAUDE.md` states, and `anchor-name` has no
   * utility to interpolate in the first place. daisyUI's own syntax puts both in `style` for
   * exactly this reason.
   */
  const menuId = id;
  const anchor = `--${id}`;

  /**
   * Whether the popover is open, mirrored from the platform for `aria-expanded` alone.
   *
   * This is the state the popover API was chosen to avoid, and it buys nothing else: opening,
   * closing, light dismiss and Escape all still belong to the browser, and nothing below reads it
   * to decide what to render. It exists so a screen reader is told the menu opened.
   */
  const [menuOpen, setMenuOpen] = useState(false);

  /** The trigger, so an item can hand focus back before a dialog captures it. See the item. */
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Memoized for the reason `DeleteCategoryProvider`'s value is, which a code review found there
   * and which would have been reintroduced here by copying the obvious shape.
   *
   * `children` keeps its identity across this component's own `menuOpen` change, so React would
   * otherwise skip re-rendering the items entirely - a fresh object literal is the one thing that
   * would drag every item back through render on each open and close. `focusTrigger` closes over a
   * ref rather than over state, so it has nothing to go stale against and the empty dependency list
   * is honest.
   */
  const menu = useMemo(
    () => ({ menuId, focusTrigger: () => triggerRef.current?.focus() }),
    [menuId],
  );

  return (
    <MenuContext.Provider value={menu}>
      {/* `aria-haspopup` is deliberately absent: its useful values name ARIA patterns this is not
          one of, and "true" means menu. `aria-expanded` is present, and the distinction is the
          point - `haspopup` promises a keyboard contract this does not implement, while `expanded`
          reports state, which is exactly what a reader is missing when the popover opens with focus
          still on this button. */}
      <button
        ref={triggerRef}
        type="button"
        className={`btn btn-ghost btn-square btn-sm ${triggerClassName}`.trim()}
        popoverTarget={menuId}
        style={{ anchorName: anchor } as React.CSSProperties}
        aria-label={label}
        aria-expanded={menuOpen}
      >
        <EllipsisVertical className={`size-4 ${glyphClassName}`.trim()} aria-hidden="true" />
      </button>

      {/* `dropdown-end` right-aligns the panel under the kebab, which is where both frames put it.
          `w-40` is frame 10's own width; the rest of the box - radius, surface, shadow, item
          padding and hover - is `dropdown menu` and the theme's. */}
      <ul
        className="dropdown dropdown-end menu rounded-box bg-base-100 w-40 p-2 shadow-sm"
        popover="auto"
        id={menuId}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        // The popover's own `toggle` event, which fires for every route in and out - the trigger, a
        // light-dismiss click, Escape, and an item's `popovertargetaction="hide"`. Reading state
        // from the platform rather than tracking it beside the platform is what keeps
        // `aria-expanded` true to what is on screen; setting it in the trigger's onClick would
        // drift the moment a dismissal happened any other way.
        onToggle={(event) => setMenuOpen(event.newState === 'open')}
      >
        {children}
      </ul>
    </MenuContext.Provider>
  );
}

type PopoverMenuItemProps = {
  /** The item's visible label, which is also its accessible name. */
  label: string;
  /** The glyph beside it. The caller passes it already sized and `aria-hidden`. */
  icon: React.ReactNode;
  /** What the item does. Omitted on a disabled item, which is the only case with nothing to do. */
  onSelect?: () => void;
  /**
   * Whether the item announces that it is not available yet.
   *
   * `menu-disabled` plus `aria-disabled`, which is what both menus' "Edit" shipped as while its
   * modal was unbuilt. **`disabled` is deliberately not used**: it removes the item from the tab
   * order entirely, so a keyboard user finds a gap with no explanation, where `aria-disabled` keeps
   * it focusable and states its condition.
   */
  disabled?: boolean;
  /** Extra classes on the button, for the danger tone a destructive item carries. */
  className?: string;
};

export function PopoverMenuItem({
  label,
  icon,
  onSelect,
  disabled = false,
  className = '',
}: PopoverMenuItemProps) {
  const { menuId, focusTrigger } = useMenu();

  if (disabled) {
    return (
      <li className="menu-disabled">
        <button type="button" aria-disabled="true" className={className || undefined}>
          {icon}
          {label}
        </button>
      </li>
    );
  }

  return (
    <li>
      {/* `popovertargetaction="hide"` closes the menu declaratively on the way out, so a dialog
          never opens underneath an open popover - two top-layer elements competing is exactly the
          mess the platform is being used to avoid. The click handler runs either way; the attribute
          is not a substitute for it. */}
      <button
        type="button"
        className={className || undefined}
        popoverTarget={menuId}
        popoverTargetAction="hide"
        onClick={() => {
          // **Hand focus back to the trigger before anything opens, and this is a fix rather than a
          // nicety.** `Modal` captures `document.activeElement` in its mount effect to restore
          // focus on close. React flushes this discrete click synchronously, so without this line
          // the element it captures is *this* button - which `popovertargetaction="hide"` then
          // hides inside a closed popover. It stays `isConnected`, so Modal's guard passes and it
          // focuses something unfocusable: a no-op, and focus lands on `<body>`. That broke the
          // Cancel path too, not only the delete path where the row is destroyed - a code review
          // caught the wider case. Focusing the trigger first makes the captured element the kebab,
          // which is where focus belonged all along.
          focusTrigger();

          onSelect?.();
        }}
      >
        {icon}
        {label}
      </button>
    </li>
  );
}
