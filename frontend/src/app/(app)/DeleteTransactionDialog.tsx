'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { DeleteTransactionResult } from '@/lib/deleteTransaction';
import { formatCurrency, formatIsoDayMonth } from '@/lib/format';

import { Modal, type ModalHandle } from './Modal';

// 12 Delete confirmation (node 31:302): the warning, and the one request it makes.
//
// The box, the scrim and every close affordance belong to `(app)/Modal.tsx`, which PET-33 gave
// its centred shape for this frame - see `align` there. What is here is the copy, the
// interpolation and the write.
//
// **It draws no form**, unlike `AddTransactionModal`, and `Modal`'s `onSubmit` is deliberately
// left off: there is nothing to type, so Enter has nothing to submit and a `<form>` around two
// buttons would only invite one of them to become a submit by accident.
//
// **The target arrives as values rather than as an id to fetch.** DEL-1's copy quotes the
// merchant, the amount and the date, and every entry point already has all three on screen -
// the row, the detail page's header, the edit modal's own fields. Fetching them again to render
// a sentence would put a round trip between the click and the dialog, and there is no designed
// state for a confirmation that is still loading.

/** What the dialog needs to name the thing it is about to remove. */
export type DeleteTarget = {
  id: string;
  merchant: string;
  /** The stored positive magnitude, rendered by `formatCurrency` rather than negated. */
  amount: number;
  /** `YYYY-MM-DD`, as stored. */
  date: string;
};

/**
 * Every message this dialog can show (A29).
 *
 * All of it ours, like `AddTransactionModal`'s: the Figma file draws no error visual anywhere,
 * so both the pattern and the words owe a designer sign-off and the story exists to put them in
 * front of one.
 *
 * Three lines for three reasons, and the differences are the whole reason
 * `DeleteTransactionResult` has three arms. `missing` must not say "try again" - the row is
 * already gone, and trying again answers 404 forever.
 */
const MESSAGES = {
  missing: 'That transaction is already gone. Close this to see the current list.',
  unauthenticated: 'Your session has expired. Log in again to delete this.',
  failed: "We couldn't delete this transaction. Please try again.",
} as const;

type DeleteTransactionDialogProps = {
  target: DeleteTarget;
  /**
   * The delete action.
   *
   * A prop rather than an import, which is `RegisterForm`'s and `AddTransactionModal`'s pattern
   * and buys the same thing: the suite passes a `jest.fn()` and needs no module mock, so the
   * `@/` alias trap that `jest.mock` cannot resolve never comes up.
   */
  remove: (id: string) => Promise<DeleteTransactionResult>;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
  /**
   * Called after a delete that really removed the row, and only then.
   *
   * **PET-32 is the caller PET-33 was waiting for.** That ticket deliberately left this out,
   * because AC7's "deleting from the detail page lands back on the list" looked like a callback
   * nothing passed - the shape `TransactionsTable`'s unreachable `pending` prop already took. The
   * edit modal is a real caller: with the confirmation opened over it, a successful delete has to
   * take that modal down too, since the row it is editing no longer exists.
   *
   * **Not on the failure arms, including `missing`.** A 404 means the row was already gone, which
   * is a state its own copy asks the user to close the dialog to see - so the modal behind it
   * stays open with the message in front of it, rather than being dismissed by something that
   * failed. PET-34's redirect will want the same distinction.
   *
   * Optional, so the row menu's call site stays `open(target)` with no second argument.
   */
  onDeleted?: () => void;
};

/**
 * DEL-1's body copy, with the target quoted into it.
 *
 * **`formatCurrency`, not `formatNegative`.** Every amount in the table is drawn negative
 * because every one is a debit, and this sentence is not a table cell: it is naming a purchase,
 * and "removes Whole Foods - −$62.40" reads as removing a credit. The frame draws `$62.40`
 * too.
 *
 * **`formatIsoDayMonth`, the same short date the DATE column draws.** The year is absent for
 * the same reason it is there: the row this quotes is on screen behind the dialog, and the two
 * should read identically.
 *
 * Exported so no test or story restates a shipped string, which is `TransactionsEmpty.tsx`'s
 * rule.
 */
export function deleteTransactionBody({ merchant, amount, date }: DeleteTarget): string {
  return `This permanently removes "${merchant} - ${formatCurrency(amount)}" (${formatIsoDayMonth(date)}) from your records. This can't be undone.`;
}

export const DELETE_TRANSACTION_TITLE = 'Delete this transaction?';

export function DeleteTransactionDialog({
  target,
  remove,
  onClose,
  onDeleted,
}: DeleteTransactionDialogProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setFailure(null);
    setPending(true);

    /**
     * **The `try` is load-bearing, and `deleteTransaction`'s "never throws" does not cover it.**
     * That guarantee is about the action's own body: it classifies every status and every fetch
     * rejection into a result. What it cannot classify is the RPC *carrying* the call - the
     * client-to-Server-Action request itself rejects when the browser is offline, the connection
     * drops, or a deployment moves the action id out from under an open tab. Without this catch
     * the rejection escapes the handler, `setPending(false)` never runs, and Delete stays
     * disabled with no message and no way back except Escape: the exact state the `failed` copy
     * exists for, never reached. A code review found it, and the suite could not - every test
     * here mocks a *resolved* value, so nothing exercised the rejecting path until
     * `rejects with a network error` was added beside them.
     */
    let result: DeleteTransactionResult;

    try {
      result = await remove(target.id);
    } catch {
      result = { ok: false, reason: 'failed' };
    }

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);

      // **A 404 refreshes even though it failed**, which is the one failure arm that does.
      // `missing` means the row is gone from the server, so the list behind this dialog is
      // showing something that no longer exists - which is precisely what its copy tells the
      // user closing the dialog will fix. Without this the promise is false until a manual
      // reload: delete a row in one tab, then delete it again from a second, and the second
      // tab keeps rendering it. The other two arms change nothing on the server and so have
      // nothing to re-read.
      if (result.reason === 'missing') router.refresh();

      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `AddTransactionModal` documents both halves. `router.refresh()` re-runs the Server
    // Components of whichever route the user is on, which is what drops the row and the count
    // badge together (AC4) without this file knowing which route that is.
    //
    // The focus restore `modalRef.current.close()` buys has one case it cannot serve here, and
    // it is the common one: the kebab that opened this dies with its row, so `Modal`'s
    // `isConnected` guard finds nothing and focus lands on `<body>`. Recorded in
    // `docs/TODO.md` beside the identical gap saving from the empty state leaves.
    router.refresh();
    modalRef.current?.close();

    // **Last, and the order is the interesting part when something is open behind this.** With
    // the edit modal underneath, the two dialogs come down top-first: `close()` above restores
    // focus to whatever opened this - the edit modal's own "Delete transaction" - and only then
    // does this line unmount that modal, which restores focus onward to the kebab. Calling it
    // before `close()` would detach the element the restore was aiming at, which is the same
    // trap `Modal`'s own focus effect exists for.
    //
    // The kebab dies with its row, so the chain ends on `<body>` regardless; what this ordering
    // buys is that it does so for one reason rather than two, and it is already correct for the
    // detail page, where the element behind survives.
    onDeleted?.();
  }

  return (
    <Modal
      ref={modalRef}
      title={DELETE_TRANSACTION_TITLE}
      align="center"
      icon={<Trash2 className="size-6" aria-hidden="true" />}
      onClose={onClose}
      footer={
        <>
          {/* Cancel closes and does nothing (DEL-2, AC5) - **before Delete is pressed**, which
              is the whole of what AC5 asks for and the only thing this control promises.

              **It does not abort a delete already in flight, and it deliberately does not
              pretend to.** A code review asked for an `AbortController` here; that would abort
              the RPC without un-deleting anything, because by then the server may already have
              removed the row - so it would report a cancellation that did not happen, which is
              worse than the honest version. There is no cancel to offer until the operation
              itself is cancellable.

              What follows from that is the refresh in `onDelete` staying outside this
              component's lifetime: cancel mid-flight and the delete still lands, and the list
              still re-reads, so the screen agrees with the database rather than keeping a row
              the server dropped. Still not disabled while pending, which is
              `AddTransactionModal`'s call - no fetch in this app carries a timeout, so a hung
              request is when a visible way out matters most, and the centred shape has no X
              beside it. `docs/TODO.md` records what a real cancel would take. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* `danger` is `btn btn-error`, already in ui/Button for both confirmation dialogs.
              Disabled while the request is out: a second delete cannot remove a second row,
              but it does answer 404, so a double click would replace a succeeding delete with
              "that transaction is already gone". */}
          <Button label="Delete" variant="danger" onClick={onDelete} disabled={pending} />
        </>
      }
    >
      {/* Centred to match the header; `Modal` deliberately has no opinion about children. */}
      <p className="text-base-content/70 text-center text-sm">{deleteTransactionBody(target)}</p>

      {/* `role="alert"` where ui/FieldShell's inline message has none, for the reason
          RegisterForm and AddTransactionModal both give: this appears after a network round
          trip with nothing else on screen changing, so nothing else would tell a screen reader
          the delete failed. */}
      {failure !== null ? (
        <p role="alert" className="text-error text-center text-sm">
          {failure}
        </p>
      ) : null}
    </Modal>
  );
}
