'use client';

import type { DeleteCategoryResult } from '@/lib/deleteCategory';

import { ConfirmDeleteDialog } from '../../ConfirmDeleteDialog';

// 20 Delete confirmation for category (node 102:1078): the warning, and the one request it makes.
//
// The box, the scrim, the tinted circle and every close affordance belong to `(app)/Modal.tsx`,
// whose centred shape names this frame in its own doc comment as one of the two it was built for.
// The request and the four behaviours around it belong to `(app)/ConfirmDeleteDialog.tsx`, which is
// where they moved once this file turned out to be a copy of the transaction confirmation. **What
// is left here is the copy, the interpolation and the target** - which is the whole of what this
// frame does not share with frame 12.
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

/**
 * The one failure arm that still refreshes.
 *
 * `missing` means the category is gone from the server, so the grid behind this dialog is showing a
 * card that no longer exists - which is precisely what that arm's copy tells the user closing the
 * dialog will fix. `fallback` deliberately is not here: that request is refused because the row is
 * still there, so there is nothing stale to re-read.
 */
const STALE_REASONS = ['missing'] as const;

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

/** The toast's sentence, interpolated exactly as the body is - see the call site. */
function deletedToast(fallbackName: string): string {
  return `Category deleted. Its transactions moved to ${fallbackName}.`;
}

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
  // **The box, the request and every behaviour around it are `(app)/ConfirmDeleteDialog.tsx`'s.**
  // This file shipped as a copy of `DeleteTransactionDialog` with the nouns changed, which put four
  // code-review fixes into a second place where the next one would not have reached them; that file
  // records what moved and why it was lifted at the second consumer rather than the third.
  //
  // **What stays here is this frame's own copy and its target.** The two dialogs share no target
  // shape - one quotes a merchant, an amount and a date, this one a name and a period count - and
  // `MESSAGES` carries four lines of A29-owed prose about categories where the other carries three
  // about transactions.
  //
  // **No `navigates`, unlike the transaction wrapper.** Every entry point this dialog has is on a
  // route that survives the delete; `/transactions/[id]` is what made that option necessary next
  // door. The prop exists on the shared component and is simply not passed, which is the same call
  // PET-33 made about `onDeleted` and was right about twice.
  return (
    <ConfirmDeleteDialog
      title={DELETE_CATEGORY_TITLE}
      body={deleteCategoryBody(target, fallbackName)}
      // **It names where the transactions went, where the transaction confirmation names nothing
      // (PET-77).** A category delete is two effects and the second one is the surprising half -
      // the rows are not deleted, they are reassigned - so a bare "Category deleted." would be
      // true and misleading. `fallbackName` is the account's own, resolved off the list response
      // rather than assumed, which is the rule this file already follows for the body above.
      confirmation={deletedToast(fallbackName)}
      messages={MESSAGES}
      // Bound here, so the shared component never learns what a category is.
      remove={() => remove(target.id)}
      // The 404 arm, and only that one: `fallback` is a category that is still very much there,
      // and the other two change nothing on the server.
      staleReasons={STALE_REASONS}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
