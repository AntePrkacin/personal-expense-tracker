'use client';

import type { DeleteTransactionResult } from '@/lib/deleteTransaction';
import { formatIsoDayMonth } from '@/lib/format';
import type { MoneyFormatters } from '@/lib/money';

import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useMoney } from './PreferencesProvider';

// 12 Delete confirmation (node 31:302): the warning, and the one request it makes.
//
// The box, the scrim and every close affordance belong to `(app)/Modal.tsx`, which PET-33 gave
// its centred shape for this frame - see `align` there. The request and the four behaviours around
// it belong to `(app)/ConfirmDeleteDialog.tsx` as of PET-39, which is the ticket that produced a
// second confirmation by copying this one; that file records what moved and why it moved at the
// second consumer rather than the third. **What is left here is the copy, the interpolation and
// the target.**
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

/**
 * The one failure arm that still refreshes.
 *
 * A 404 means the row is gone from the server, so the list behind this dialog is showing something
 * that no longer exists - precisely what `missing`'s copy tells the user closing the dialog will
 * fix. Without it the promise is false until a manual reload: delete a row in one tab, then delete
 * it again from a second, and the second tab keeps rendering it.
 */
const STALE_REASONS = ['missing'] as const;

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
  /**
   * Whether `onDeleted` navigates away, in which case the success path must not refresh.
   *
   * `DeleteTransactionProvider` carries the full account. The short version: a refresh re-runs
   * the route the user is **currently** on, and on the transaction detail page that route is
   * about to 404 on the row this dialog just deleted.
   */
  navigates?: boolean;
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
 *
 * **The formatters are a parameter rather than a module import, because this is not a component.**
 * PET-47 made money formatting follow the profile's currency, which the shell publishes through a
 * context - and a context is only reachable from a hook. Passing `MoneyFormatters` in keeps this
 * function pure and keeps its suite free of a provider, which is the same property that made it
 * worth exporting in the first place. The caller below reads it once with `useMoney()`.
 */
export function deleteTransactionBody(
  { merchant, amount, date }: DeleteTarget,
  { formatCurrency }: MoneyFormatters,
): string {
  return `This permanently removes "${merchant} - ${formatCurrency(amount)}" (${formatIsoDayMonth(date)}) from your records. This can't be undone.`;
}

export const DELETE_TRANSACTION_TITLE = 'Delete this transaction?';

export function DeleteTransactionDialog({
  target,
  remove,
  onClose,
  onDeleted,
  navigates = false,
}: DeleteTransactionDialogProps) {
  const money = useMoney();

  // **The box, the request and every behaviour around it are `(app)/ConfirmDeleteDialog.tsx`'s
  // now.** That file records why it was lifted at the second consumer rather than the third: what
  // moved is four behaviours a code review found and fixed once each - the `try` around the RPC,
  // the 404 arm that still refreshes, the refresh-then-close-then-`onDeleted` ordering, and Delete
  // disabling while Cancel does not - all of which PET-39 had duplicated by copy-paste into the
  // category confirmation, where the next such fix would not have reached them.
  //
  // **What stays here is this frame's own copy and its target**, which is the whole reason this
  // wrapper still exists rather than the row menu calling the shared component directly:
  // `DeleteTarget` and the category's target share no shape, and `MESSAGES` is three lines of
  // A29-owed prose about transactions.
  return (
    <ConfirmDeleteDialog
      title={DELETE_TRANSACTION_TITLE}
      body={deleteTransactionBody(target, money)}
      messages={MESSAGES}
      // Bound here, so the shared component never learns what a transaction is.
      remove={() => remove(target.id)}
      // The 404 arm: the row is gone from the server, so the list behind is showing something
      // that no longer exists - which is exactly what `missing`'s copy asks the user to close the
      // dialog to see. The other two arms change nothing on the server.
      staleReasons={STALE_REASONS}
      onClose={onClose}
      onDeleted={onDeleted}
      navigates={navigates}
    />
  );
}
