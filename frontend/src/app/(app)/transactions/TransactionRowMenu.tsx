'use client';

import { Pencil, Trash2 } from 'lucide-react';

import type { Transaction } from '@/lib/transactions';

import { PopoverMenu, PopoverMenuItem } from '../PopoverMenu';
import { useDeleteTransaction } from '../DeleteTransactionProvider';
import { useEditTransaction } from '../EditTransactionProvider';

// 10 Row menu (node 30:257): the kebab on a list row, and the two actions behind it (MNU-1,
// MNU-2, TRN-8).
//
// **Everything about the popover moved to `(app)/PopoverMenu.tsx` when PET-39 built a second one
// of these.** Read that file for the argument this one used to carry at length: why it is the
// platform popover rather than React state, why nothing here decides whether the menu is showing,
// the two costs it comes with (jsdom implements none of the Popover API; Firefox's anchor-position
// fallback), why there is no `role="menu"`, and the trigger refocus a code review found. All of it
// was true of this file and is now true of both.
//
// PET-29's prediction was pessimistic in the useful direction and is worth keeping: it split
// `TransactionRow.tsx` out so the kebab's open state would not drag the table into the client
// bundle, and the boundary landed one level smaller still - on this file, with the row staying a
// Server Component - because the popover means there is no open state at all.
//
// **What is left here is which two items a row offers and what they hand over.**

type TransactionRowMenuProps = {
  transaction: Transaction;
};

export function TransactionRowMenu({ transaction }: TransactionRowMenuProps) {
  const { open } = useDeleteTransaction();
  const { open: openEdit } = useEditTransaction();

  return (
    <PopoverMenu
      id={`row-menu-${transaction.id}`}
      label={`Actions for ${transaction.merchant}`}
      glyphClassName="text-base-content/40"
    >
      {/* **It passes the whole transaction where Delete passes four fields**, and that asymmetry is
          the point rather than an oversight. A row already carries `note` and `categoryId`, so the
          modal prefills every field with no second read (AC1); the confirmation takes four because
          a dialog quoting a note would be rendering something it has no business knowing. */}
      <PopoverMenuItem
        label="Edit"
        icon={<Pencil className="size-4" aria-hidden="true" />}
        onSelect={() => openEdit(transaction)}
      />

      <PopoverMenuItem
        label="Delete"
        icon={<Trash2 className="size-4" aria-hidden="true" />}
        className="text-error"
        onSelect={() =>
          open({
            id: transaction.id,
            merchant: transaction.merchant,
            amount: transaction.amount,
            date: transaction.date,
          })
        }
      />
    </PopoverMenu>
  );
}
