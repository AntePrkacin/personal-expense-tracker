'use client';

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';

import type { Transaction } from '@/lib/transactions';

import { useDeleteTransaction } from '../DeleteTransactionProvider';

// 10 Row menu (node 30:257): the kebab on a list row, and the two actions behind it (MNU-1,
// MNU-2, TRN-8).
//
// **It is daisyUI's popover dropdown, not a React-state menu, and that is the argument
// `(app)/Modal.tsx` makes about the dialog element and `ui/Select.tsx` about the native select,
// applied a third time.** AC1 asks for "clicking elsewhere or pressing Escape closes it", which
// is light dismiss and the Escape default action: the platform gives both, plus the top layer, so
// nothing here picks a z-index and nothing here listens on `document`. The hand-rolled version
// is a click listener, a keydown listener and a chosen stacking order - three of our
// approximations in place of three browser guarantees. daisyUI 5 requires it independently: the
// `dropdown` component's own rules forbid the legacy `tabindex`, `<details>` and focus-based
// forms.
//
// The consequence is that this component holds **no state at all**. `popovertarget` opens it and
// `popovertargetaction="hide"` closes it, both declaratively. The `'use client'` is here only
// because Delete calls into a context - which also means PET-29's prediction was pessimistic:
// it split `TransactionRow.tsx` out so the kebab's open state would not drag the table into the
// client bundle, and the boundary turns out to land one level smaller still, on this file, with
// the row staying a Server Component.
//
// **Two things the popover costs, both recorded rather than fixed.**
//
// jsdom 26.1.0 implements none of the Popover API - `showPopover` is undefined and
// `popoverTargetElement` is not on HTMLButtonElement - and `jest.setup.ts` deliberately does
// **not** polyfill it, unlike `<dialog>`. Faking light dismiss would turn AC1 into a test of the
// fake, passing just as happily with `popover` deleted from the markup, which is the call that
// file already makes about Escape. So under Jest this menu is permanently "open": the suite
// asserts the wiring, and opening and closing are Chrome and Storybook checks.
//
// Firefox does not support CSS anchor positioning. daisyUI ships an
// `@supports not (position-area: bottom)` fallback that renders the popover centred with a
// dimmed backdrop instead of anchored to the kebab. Degraded rather than broken, and cheaper
// than hand-rolling positioning for one engine.
//
// **No `role="menu"` or `role="menuitem"`.** Those roles come with a keyboard contract - arrow
// keys move between items, Home and End jump - and this repo does not publish ARIA it has not
// implemented; `app/setup/SetupShell.tsx` records the same refusal about `aria-current="step"`.
// A `<ul>` of ordinary buttons is what is actually here, Tab reaches both from the trigger, and
// that is what it announces.

type TransactionRowMenuProps = {
  transaction: Transaction;
};

export function TransactionRowMenu({ transaction }: TransactionRowMenuProps) {
  const { open } = useDeleteTransaction();

  /**
   * The popover's id and its anchor name, both derived from the transaction's own id.
   *
   * They have to be document-unique - a full table mounts one of these per row - and the
   * transaction id already is. Note these are **inline styles, not classes**: Tailwind's scanner
   * would compile nothing from an interpolated class, which is the rule `frontend/CLAUDE.md`
   * states, and `anchor-name` has no utility to interpolate in the first place. daisyUI's own
   * syntax puts both in `style` for exactly this reason.
   */
  const menuId = `row-menu-${transaction.id}`;
  const anchor = `--row-menu-${transaction.id}`;

  return (
    <>
      {/* The name is the merchant rather than a bare "More actions", because a page of ten
          identical "More actions" buttons tells a screen-reader user which control they are on
          and nothing about which row. `aria-haspopup` is deliberately absent: its useful values
          name ARIA patterns this is not one of, and "true" means menu. */}
      <button
        type="button"
        className="btn btn-ghost btn-square btn-sm"
        popoverTarget={menuId}
        style={{ anchorName: anchor } as React.CSSProperties}
        aria-label={`Actions for ${transaction.merchant}`}
      >
        <EllipsisVertical className="text-base-content/40 size-4" aria-hidden="true" />
      </button>

      {/* `dropdown-end` right-aligns the card under the kebab, which is where node 30:257 puts
          it. `w-40` is the frame's own width; the rest of the box - radius, surface, shadow,
          item padding and hover - is `dropdown menu` and the theme's. */}
      <ul
        className="dropdown dropdown-end menu rounded-box bg-base-100 w-40 p-2 shadow-sm"
        popover="auto"
        id={menuId}
        style={{ positionAnchor: anchor } as React.CSSProperties}
      >
        {/* **Edit is disabled, and that amends AC2 rather than ignoring it.** MNU-2 opens the
            edit modal, which is PET-32 and does not exist. The alternatives were a live item
            that does nothing - the failure every inert control on this screen was built to
            avoid - or dropping the item, which makes frame 10 a different design and costs
            PET-32 a re-layout instead of a flag. `menu-disabled` dims it and `aria-disabled`
            says so; PET-32 turns this `<span>` into a `<button>` and deletes both. */}
        <li className="menu-disabled">
          <span aria-disabled="true">
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </span>
        </li>

        <li>
          {/* `popovertargetaction="hide"` closes the menu declaratively on the way out, so the
              dialog never opens underneath an open popover - two top-layer elements competing
              is exactly the mess the platform is being used to avoid. The click handler runs
              either way; the attribute is not a substitute for it. */}
          <button
            type="button"
            className="text-error"
            popoverTarget={menuId}
            popoverTargetAction="hide"
            onClick={() =>
              open({
                id: transaction.id,
                merchant: transaction.merchant,
                amount: transaction.amount,
                date: transaction.date,
              })
            }
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </button>
        </li>
      </ul>
    </>
  );
}
