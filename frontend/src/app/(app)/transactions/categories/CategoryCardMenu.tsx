'use client';

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { Category } from '@/lib/categories';

import { useDeleteCategory } from './DeleteCategoryProvider';

// 18 Categories - Row menu (node 75:806): the kebab on a category card, and the two actions behind
// it (CED-1, CED-2, A19).
//
// **It is the platform popover, not a React-state menu**, which is the argument
// `transactions/TransactionRowMenu.tsx` makes at length and this screen's own `ColourSelect` and
// `IconSelect` already make twice more. AC1 asks for "clicking elsewhere or pressing Escape closes
// it", which is light dismiss and the Escape default action: the platform gives both, plus the top
// layer, so nothing here picks a z-index and nothing here listens on `document`. daisyUI 5 requires
// it independently, its `dropdown` rules forbidding the legacy `tabindex`, `<details>` and
// focus-based forms.
//
// Two costs come with it, both inherited rather than re-litigated and both already in
// `docs/TODO.md`. **jsdom implements none of the Popover API** and `jest.setup.ts` deliberately
// does not polyfill it, so under Jest this menu is permanently "open": the suite asserts the
// wiring, and opening and closing are Chrome and Storybook checks. And **Firefox does not support
// CSS anchor positioning**, where daisyUI's `@supports` fallback centres the popover behind a
// dimmed backdrop instead of anchoring it to the kebab.
//
// **No `role="menu"` or `role="menuitem"`.** Those roles come with a keyboard contract - arrow keys
// between items, Home and End - and this repo does not publish ARIA it has not implemented. A `<ul>`
// of ordinary buttons is what is actually here, Tab reaches them from the trigger, and that is what
// it announces. Fourth refusal of the same kind, after `SetupShell`, `TransactionTabs` and the two
// pickers on this screen.
//
// **`CategoryCard` stays a Server Component**, exactly as `TransactionRow` did when this file's
// sibling came out of it: the popover means there is no open state to hold, so the only reason for
// the directive here is that Delete calls into a context.

type CategoryCardMenuProps = {
  category: Category;
};

export function CategoryCardMenu({ category }: CategoryCardMenuProps) {
  const { open } = useDeleteCategory();

  /**
   * The popover's id and its anchor name, both derived from the category's own id.
   *
   * They have to be document-unique - the grid mounts one of these per card - and the category id
   * already is. Note these are **inline styles, not classes**: Tailwind's scanner would compile
   * nothing from an interpolated class, which is the rule `frontend/CLAUDE.md` states, and
   * `anchor-name` has no utility to interpolate in the first place.
   */
  const menuId = `category-menu-${category.id}`;
  const anchor = `--category-menu-${category.id}`;

  /**
   * Whether the popover is open, mirrored from the platform for `aria-expanded` alone.
   *
   * The state the popover API was chosen to avoid, and it buys nothing else: opening, closing,
   * light dismiss and Escape all still belong to the browser, and nothing below reads this to
   * decide what to render. It exists so a screen reader is told the menu opened.
   */
  const [menuOpen, setMenuOpen] = useState(false);

  /** The kebab, so Delete can hand focus back before the dialog captures it. See its onClick. */
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * AC6: the fallback category offers no Delete.
   *
   * **Decided here from `isFallback` rather than by letting the backend answer 409.** That row is
   * where deleting any *other* category sends its transactions, so the endpoint refuses to remove
   * it, and offering a control whose only outcome is an error message is the failure every inert
   * control on this screen was built to avoid. `lib/deleteCategory.ts` still classifies the 409,
   * because a hidden control is not an enforcement.
   *
   * One consequence, recorded rather than hidden: until PET-38 lands, this card's menu is a single
   * disabled "Edit", i.e. a menu with nothing operable in it. That is still better than a kebab
   * that opens nothing, and it announces its condition.
   */
  const offersDelete = !category.isFallback;

  return (
    <>
      {/* The name carries the category rather than a bare "More actions", because a grid of eight
          identical "More actions" buttons tells a screen-reader user which control they are on and
          nothing about which card. Kept byte-identical to the `aria-label` PET-36 shipped on the
          inert version, so the two tests that name it did not have to change their query.

          `aria-haspopup` is deliberately absent: its useful values name ARIA patterns this is not
          one of. `aria-expanded` is present, and the distinction is the point - `haspopup` promises
          a keyboard contract this does not implement, while `expanded` reports state, which is
          exactly what a reader is missing when the popover opens with focus still on this button.

          The `aria-disabled` PET-36 put here is **gone**, which is the whole of this ticket's
          change to the card. */}
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-square btn-sm shrink-0"
        popoverTarget={menuId}
        style={{ anchorName: anchor } as React.CSSProperties}
        aria-label={`Actions for ${category.name}`}
        aria-expanded={menuOpen}
      >
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </button>

      {/* `dropdown-end` right-aligns the card under the kebab, which is where node 75:806 puts it.
          `w-40` matches the transaction menu's, and the rest of the box - radius, surface, shadow,
          item padding and hover - is `dropdown menu` and the theme's. */}
      <ul
        className="dropdown dropdown-end menu rounded-box bg-base-100 w-40 p-2 shadow-sm"
        popover="auto"
        id={menuId}
        style={{ positionAnchor: anchor } as React.CSSProperties}
        // The popover's own `toggle` event, which fires for every route in and out - the trigger, a
        // light-dismiss click, Escape, and the `popovertargetaction="hide"` below. Reading state
        // from the platform rather than tracking it beside the platform is what keeps
        // `aria-expanded` true to what is on screen.
        onToggle={(event) => setMenuOpen(event.newState === 'open')}
      >
        {/* **Edit ships disabled, which amends AC1 and is PET-33's call for the same control one
            screen over.** PET-38's Edit category modal does not exist, and the alternatives were
            both worse: a live item that does nothing is the failure every inert control on this
            screen exists to avoid, and dropping the item makes frame 18 a different design.

            `menu-disabled` is daisyUI's own state class, paired with `aria-disabled` so it
            announces honestly. **`disabled` is deliberately not used**: it removes the item from
            the tab order entirely, so a keyboard user would find a menu with one reachable control
            and no explanation for the gap. PET-38 makes this live by deleting the two attributes
            and adding its own opener, exactly as PET-32 did next door. */}
        <li className="menu-disabled">
          <button type="button" aria-disabled="true">
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </button>
        </li>

        {offersDelete ? (
          <li>
            {/* `popovertargetaction="hide"` closes the menu declaratively on the way out, so the
                dialog never opens underneath an open popover - two top-layer elements competing is
                exactly the mess the platform is being used to avoid. The click handler runs either
                way; the attribute is not a substitute for it. */}
            <button
              type="button"
              className="text-error"
              popoverTarget={menuId}
              popoverTargetAction="hide"
              onClick={() => {
                // **Hand focus back to the kebab before the dialog mounts, and this is a fix
                // rather than a nicety.** `Modal` captures `document.activeElement` in its mount
                // effect to restore focus on close. React flushes this discrete click
                // synchronously, so without this line the element it captures is *this* button -
                // which `popovertargetaction="hide"` then hides inside a closed popover. It stays
                // `isConnected`, so Modal's guard passes and it focuses something unfocusable: a
                // no-op, and focus lands on `<body>`. That breaks the Cancel path too, not only
                // the delete path where the card is destroyed.
                triggerRef.current?.focus();

                // **Three fields, where PET-38's Edit will hand over the whole category.** A
                // confirmation quoting a cap, a colour or a note would be rendering things it has
                // no business knowing; the same asymmetry the transaction menu already has.
                open({
                  id: category.id,
                  name: category.name,
                  transactionCount: category.transactionCount,
                });
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}
