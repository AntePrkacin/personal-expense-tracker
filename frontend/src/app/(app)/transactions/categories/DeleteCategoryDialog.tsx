'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { DeleteCategoryResult } from '@/lib/deleteCategory';

import { Modal, type ModalHandle } from '../../Modal';

// 20 Delete confirmation for category (node 102:1078): the warning, and the one request it makes.
//
// The box, the scrim, the tinted circle and every close affordance belong to `(app)/Modal.tsx`,
// whose centred shape names this frame in its own doc comment as one of the two it was built for -
// so this is the caller it was waiting for rather than a second use of a general thing. What is
// here is the copy, the interpolation and the write.
//
// **It draws no form**, the call `DeleteTransactionDialog` makes: there is nothing to type, so
// `Modal`'s `onSubmit` is left off, Enter has nothing to submit, and a `<form>` around two buttons
// would only invite one of them to become a submit by accident.
//
// **The target arrives as values rather than as an id to fetch.** CED-9's copy quotes the name and
// the count, and the card that opened this already has both on screen. Fetching them again would
// put a round trip between the click and the dialog, and A19 designs no state for a confirmation
// that is still loading.
//
// **It lives beside the Categories route rather than in `(app)/`**, unlike its transaction
// counterpart, and the difference is how many segments each serves. That one is mounted on the
// shell because DEL-1 lists three entry points across three route segments; every entry point this
// one has - the card kebab now, PET-38's edit modal later - is on `/transactions/categories`.
// `DeleteCategoryProvider.tsx` beside it carries the full argument.

/**
 * What the dialog needs to name the thing it is about to remove.
 *
 * **Three fields where PET-38's Edit will hand over the whole category**, which is the same
 * asymmetry `DeleteTransactionDialog` and `EditTransactionModal` already have: a prefilled form
 * cannot do without the cap, the colour and the note, and a confirmation has no business rendering
 * any of them.
 */
export type DeleteCategoryTarget = {
  id: string;
  name: string;
  /**
   * `CategoryResponseDto.transactionCount`, which is **this period's** rather than the category's
   * whole history.
   *
   * That is the figure the card footer already draws, and the copy below says so in as many words
   * rather than quoting it as a total. The delete moves every transaction the category ever held,
   * tombstoned ones included, so the ticket's own "Its 24 transactions will be moved" understates
   * on any account with history. Amended on the issue; see `deleteCategoryBody`.
   */
  transactionCount: number;
};

/**
 * Every message this dialog can show (A29).
 *
 * All of it ours, like `DeleteTransactionDialog`'s: the Figma file draws no error visual anywhere,
 * so both the pattern and the words owe a designer sign-off and the stories exist to put them in
 * front of one.
 *
 * Four lines for four reasons, and two of the differences are the whole reason
 * `DeleteCategoryResult` has four arms. `missing` must not say "try again" - the category is
 * already gone, and trying again answers 404 forever. `fallback` must not either, for a sharper
 * version of the same reason: that request will be refused every time, by design.
 */
const MESSAGES = {
  missing: 'That category is already gone. Close this to see the current list.',
  fallback:
    'That category cannot be deleted: it is where deleting any other category moves its transactions.',
  unauthenticated: 'Your session has expired. Log in again to delete this.',
  failed: "We couldn't delete this category. Please try again.",
} as const;

type DeleteCategoryDialogProps = {
  target: DeleteCategoryTarget;
  /**
   * The name of the category the transactions will land on.
   *
   * **A prop rather than the literal "Other" the ticket asks for, and rather than a literal
   * "Uncategorized" either.** The reassignment target is the account's own `isFallback` row, which
   * the list response already carries, so the copy interpolates the real name and cannot drift
   * from what the backend does. `DeleteCategoryProvider` resolves it once for the screen; see the
   * amendment recorded there and on the issue.
   */
  fallbackName: string;
  /**
   * The delete action.
   *
   * A prop rather than an import, which is `DeleteTransactionDialog`'s and `AddCategoryModal`'s
   * pattern and buys the same thing: the suite passes a `jest.fn()` and needs no module mock, so
   * the `@/` alias trap that `jest.mock` cannot resolve never comes up.
   */
  remove: (id: string) => Promise<DeleteCategoryResult>;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
  /**
   * Called after a delete that really removed the category, and only then.
   *
   * **No caller today, and it is here anyway, which is the opposite of the call PET-33 made.**
   * That ticket left `onDeleted` out precisely because nothing passed it. The difference is that
   * this one has a caller in the same repo one ticket away and a concrete job for it: PET-38's
   * edit modal opens this confirmation over itself, so a delete that really removed the category
   * has to take that modal down too. Optional, so the kebab's call site stays `open(target)`.
   *
   * **Not on the failure arms, including `missing`.** A 404 means the category was already gone,
   * which is a state its own copy asks the user to close the dialog to see - so anything behind it
   * stays open with the message in front of it, rather than being dismissed by something that
   * failed.
   */
  onDeleted?: () => void;
};

export const DELETE_CATEGORY_TITLE = 'Delete this category?';

/**
 * CED-9's body copy, with the target quoted into it.
 *
 * **Two shapes rather than one sentence with a number in it**, because "Its 0 transactions this
 * month will be moved" is a sentence nobody writes, and with nothing in the period the clause that
 * carries the information is the one about earlier months.
 *
 * **The count is named as this month's**, which amends CED-9. `transactionCount` is the current
 * period's, computed against the profile's month window, while the delete reassigns everything the
 * category ever held - so quoting it as a total understates on any account with history. The
 * alternative was a second read for a real all-time count, which costs a round trip between the
 * click and the dialog and a loading state A19 draws nowhere.
 *
 * **The fallback is named from the account's own row**, not the "Other" the ticket asks for. That
 * split is the backend's and is deliberate: "Other" is an ordinary chip anyone can rename or
 * delete, and the row deletions reassign to is `Uncategorized`.
 *
 * Straight quotes and a plain apostrophe where the frame draws curly ones, the call PET-33 made
 * for frame 12: following the frame would make this the only such copy in the repo and would
 * diverge from the text a reviewer diffs the screen against.
 *
 * Exported so no test or story restates a shipped string, which is `TransactionsEmpty.tsx`'s rule.
 */
export function deleteCategoryBody(
  { name, transactionCount }: DeleteCategoryTarget,
  fallbackName: string,
): string {
  const opening = `This permanently removes "${name}" from your categories.`;

  if (transactionCount === 0) {
    return `${opening} Any transactions filed under it will be moved to ${fallbackName}. This can't be undone.`;
  }

  // The app's third pluralized string, after `BudgetCard`'s "days left" and `CategoryCard`'s own
  // `transactionCountLabel`. Still a local ternary rather than a helper, for that file's reason:
  // three call sites with three different nouns is not a pluralization library.
  const counted = `${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'}`;

  return `${opening} Its ${counted} this month will be moved to ${fallbackName}, along with any from earlier months. This can't be undone.`;
}

export function DeleteCategoryDialog({
  target,
  fallbackName,
  remove,
  onClose,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setFailure(null);
    setPending(true);

    /**
     * **The `try` is load-bearing, and `deleteCategory`'s "never throws" does not cover it.** That
     * guarantee is about the action's own body: it classifies every status and every fetch
     * rejection into a result. What it cannot classify is the RPC *carrying* the call - the
     * client-to-Server-Action request itself rejects when the browser is offline, the connection
     * drops, or a deployment moves the action id out from under an open tab. Without this catch
     * the rejection escapes the handler, `setPending(false)` never runs, and Delete stays disabled
     * with no message and no way back except Escape: the exact state the `failed` copy exists for,
     * never reached. A code review found it on PET-33, and the suite could not, because every test
     * there mocked a *resolved* value.
     */
    let result: DeleteCategoryResult;

    try {
      result = await remove(target.id);
    } catch {
      result = { ok: false, reason: 'failed' };
    }

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);

      // **A 404 refreshes even though it failed**, which is the one failure arm that does.
      // `missing` means the category is gone from the server, so the grid behind this dialog is
      // showing a card that no longer exists - which is precisely what its copy tells the user
      // closing the dialog will fix. The other three arms change nothing on the server and so have
      // nothing to re-read; `fallback` in particular is a category that is still very much there.
      if (result.reason === 'missing') router.refresh();

      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `AddCategoryModal` documents both halves. `router.refresh()` re-runs the Server Components of
    // this route, which is what drops the card, the "Categories" badge and the allocation summary
    // together (AC3) - all three read the same response, so one refresh recomputes them at once.
    // It also brings the fallback card's own spend and count up by what this category held, which
    // is as close as this screen gets to showing AC4.
    //
    // **No `navigates` option, unlike the transaction confirmation.** That one has an entry point
    // on `/transactions/[id]`, a route about to 404 on the row it just deleted; every entry point
    // this dialog has is on a route that survives the delete, so there is no caller for the
    // parameter and it stays out until there is - the call PET-33 made about `onDeleted` and was
    // right about twice.
    //
    // The focus restore `modalRef.current.close()` buys has one case it cannot serve here, and it
    // is the common one: the kebab that opened this dies with its card, so `Modal`'s `isConnected`
    // guard finds nothing and focus lands on `<body>`. Recorded in `docs/TODO.md` beside the
    // identical gap the transaction delete already leaves.
    router.refresh();
    modalRef.current?.close();

    // Last, and the order matters when PET-38's edit modal is open behind this: `close()` above
    // restores focus to whatever opened this dialog, and only then does this line unmount that
    // modal, which restores focus onward. Calling it before `close()` would detach the element the
    // restore was aiming at, which is the trap `Modal`'s own focus effect exists for.
    onDeleted?.();
  }

  return (
    <Modal
      ref={modalRef}
      title={DELETE_CATEGORY_TITLE}
      align="center"
      icon={<Trash2 className="size-6" aria-hidden="true" />}
      onClose={onClose}
      footer={
        <>
          {/* Cancel closes and does nothing (AC5) - **before Delete is pressed**, which is the
              whole of what AC5 asks for and the only thing this control promises. It does not
              abort a delete already in flight and deliberately does not pretend to: aborting the
              RPC would not un-delete anything, because by then the server may already have
              reassigned the transactions. Still not disabled while pending, which is
              `DeleteTransactionDialog`'s call - no fetch in this app carries a timeout, so a hung
              request is when a visible way out matters most, and the centred shape has no X. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* `danger` is `btn btn-error`, already in ui/Button for both confirmation dialogs.
              Disabled while the request is out: a second delete cannot remove a second category,
              but it does answer 404, so a double click would replace a succeeding delete with
              "that category is already gone". */}
          <Button label="Delete" variant="danger" onClick={onDelete} disabled={pending} />
        </>
      }
    >
      {/* Centred to match the header; `Modal` deliberately has no opinion about children. */}
      <p className="text-base-content/70 text-center text-sm">
        {deleteCategoryBody(target, fallbackName)}
      </p>

      {/* `role="alert"` where ui/FieldShell's inline message has none, for the reason
          `AddCategoryModal` and `DeleteTransactionDialog` both give: this appears after a network
          round trip with nothing else on screen changing, so nothing else would tell a screen
          reader the delete failed. */}
      {failure !== null ? (
        <p role="alert" className="text-error text-center text-sm">
          {failure}
        </p>
      ) : null}
    </Modal>
  );
}
