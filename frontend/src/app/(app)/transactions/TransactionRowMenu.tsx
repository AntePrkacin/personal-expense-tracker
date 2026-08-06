'use client';

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { Transaction } from '@/lib/transactions';

import { useDeleteTransaction } from '../DeleteTransactionProvider';
import { useEditTransaction } from '../EditTransactionProvider';

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
// The consequence is that **nothing here decides whether the menu is showing**: `popovertarget`
// opens it and `popovertargetaction="hide"` closes it, both declaratively, and no branch below
// reads any of that. There is one `useState`, added later for `aria-expanded` alone - it mirrors
// the platform rather than driving it, which is why it is fed by the popover's own `toggle`
// event. PET-29's prediction was still pessimistic in the useful direction: it split
// `TransactionRow.tsx` out so the kebab's open state would not drag the table into the client
// bundle, and the boundary lands one level smaller still, on this file, with the row staying a
// Server Component.
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
  const { open: openEdit } = useEditTransaction();

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

  /**
   * Whether the popover is open, mirrored from the platform for `aria-expanded` alone.
   *
   * This is the state the popover API was chosen to avoid, and it is worth being clear that it
   * buys nothing else: opening, closing, light dismiss and Escape all still belong to the
   * browser, and nothing below reads this to decide what to render. It exists so a screen
   * reader is told the menu opened.
   */
  const [menuOpen, setMenuOpen] = useState(false);

  /** The kebab, so Delete can hand focus back before the dialog captures it. See its onClick. */
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* The name is the merchant rather than a bare "More actions", because a page of ten
          identical "More actions" buttons tells a screen-reader user which control they are on
          and nothing about which row. `aria-haspopup` is deliberately absent: its useful values
          name ARIA patterns this is not one of, and "true" means menu.

          **`aria-expanded` is present, and the distinction from `aria-haspopup` is the point.**
          A code review asked for it and it is the right call: `haspopup` promises a *pattern*
          with a keyboard contract this does not implement, while `expanded` reports *state*, and
          state is exactly what a reader is missing when the popover opens with focus still on
          this button and nothing announced. It costs the one piece of React state the popover
          otherwise let us avoid - see `menuOpen` above. */}
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-square btn-sm"
        popoverTarget={menuId}
        style={{ anchorName: anchor } as React.CSSProperties}
        aria-label={`Actions for ${transaction.merchant}`}
        aria-expanded={menuOpen}
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
        // The popover's own `toggle` event, which fires for every route in and out - the
        // trigger, a light-dismiss click, Escape, and the `popovertargetaction="hide"` below.
        // Reading state from the platform rather than tracking it beside the platform is what
        // keeps `aria-expanded` true to what is on screen; setting it in the trigger's onClick
        // would drift the moment a dismissal happened any other way.
        onToggle={(event) => setMenuOpen(event.newState === 'open')}
      >
        {/* **Edit is live as of PET-32, and this is the `<span>` its predecessor predicted
            becoming a `<button>`.** It shipped `menu-disabled` with `aria-disabled` because the
            edit modal did not exist - honest about being unavailable, rather than one more
            control on this screen that looks operable and is not. Both attributes are gone with
            the flag, which closes PET-33's amended AC2.

            **It passes the whole transaction where Delete passes four fields**, and that
            asymmetry is the point rather than an oversight. A row already carries `note` and
            `categoryId`, so the modal prefills every field with no second read (AC1); the
            confirmation takes four because a dialog quoting a note would be rendering something
            it has no business knowing. */}
        <li>
          <button
            type="button"
            popoverTarget={menuId}
            popoverTargetAction="hide"
            onClick={() => {
              // Same fix as Delete's below, and the same reason: `Modal` captures
              // `document.activeElement` on mount, React flushes this click synchronously, and
              // without this line the element it captures is *this* menu item - which
              // `popovertargetaction="hide"` then hides inside a closed popover, still
              // `isConnected` and no longer focusable. Focus would land on `<body>` on the way
              // out, including after Cancel.
              triggerRef.current?.focus();

              openEdit(transaction);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </button>
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
            onClick={() => {
              // **Hand focus back to the kebab before the dialog mounts, and this is a fix
              // rather than a nicety.** `Modal` captures `document.activeElement` in its mount
              // effect to restore focus on close. React flushes this discrete click
              // synchronously, so without this line the element it captures is *this* button -
              // which `popovertargetaction="hide"` then hides inside a closed popover. It stays
              // `isConnected`, so Modal's guard passes and it focuses something unfocusable: a
              // no-op, and focus lands on `<body>`. That broke the Cancel path too, not only
              // the delete path where the row is destroyed - a code review caught the wider
              // case. Focusing the trigger first makes the captured element the kebab, which is
              // where focus belonged all along.
              triggerRef.current?.focus();

              open({
                id: transaction.id,
                merchant: transaction.merchant,
                amount: transaction.amount,
                date: transaction.date,
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </button>
        </li>
      </ul>
    </>
  );
}
