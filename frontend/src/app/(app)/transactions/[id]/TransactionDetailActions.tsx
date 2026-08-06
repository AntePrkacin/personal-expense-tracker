'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import type { Transaction } from '@/lib/transactions';

import { useDeleteTransaction } from '../../DeleteTransactionProvider';
import { useEditTransaction } from '../../EditTransactionProvider';

// Frame 08's header pair, and the only client component on this page (DET-2).
//
// **Both modals are already mounted, once, on the shell**, so this is two calls into two
// contexts rather than two dialogs. That is what `EditTransactionProvider` meant by describing
// this page's entry point as costing two lines, and it is why the rest of the detail screen
// stays a Server Component.
//
// **Edit needs no request.** `useEditTransaction().open()` takes a whole `Transaction`, which
// this page already holds - the asymmetry with the confirmation's four fields is deliberate,
// and it is what makes PET-32's "every field is prefilled" free here.
//
// **Delete is the caller `onDeleted` was added for.** PET-32 added the option so the edit modal
// could close itself over a successful delete; PET-33 recorded the detail page's redirect as
// the other use and deliberately did not build it. Deleting from here navigates to the list,
// which is A18 and PET-33's AC7 - and it sidesteps the focus-restore gap `docs/TODO.md` records
// rather than adding a fourth route to it, because the whole page goes away.

type TransactionDetailActionsProps = {
  transaction: Transaction;
  /** Where Delete lands, filters included, so it matches where the breadcrumb goes. */
  backHref: string;
};

export function TransactionDetailActions({ transaction, backHref }: TransactionDetailActionsProps) {
  const router = useRouter();
  const { open: openEdit } = useEditTransaction();
  const { open: openDeleteConfirmation } = useDeleteTransaction();

  return (
    <>
      <Button label="Edit" variant="secondary" onClick={() => openEdit(transaction)} />
      <Button
        label="Delete"
        // Soft rather than solid, unlike the confirmation's own Delete: there that is the
        // dialog's answer, here it sits beside Edit on a page whose job is reading.
        variant="dangerSoft"
        onClick={() =>
          openDeleteConfirmation(
            {
              id: transaction.id,
              merchant: transaction.merchant,
              amount: transaction.amount,
              date: transaction.date,
            },
            {
              // `replace`, not `push`. This page is about to describe a transaction that no
              // longer exists, so leaving it in history means Back lands on a 404 - the one
              // destination the user certainly did not ask for. Replacing drops the dead
              // entry, so Back reaches whatever preceded the detail page.
              //
              // Fires on success only, after the dialog's own close and its router.refresh(),
              // so the list this lands on is already re-read.
              onDeleted: () => router.replace(backHref),
            },
          )
        }
      />
    </>
  );
}
