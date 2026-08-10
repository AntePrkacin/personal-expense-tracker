'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CategoryOption } from '@/lib/categories';
import { currencySymbol } from '@/lib/money';
import { reformatAmountInput } from '@/lib/amountField';
import type { Transaction } from '@/lib/transactions';
import type { UpdateTransactionResult } from '@/lib/updateTransaction';
import type { components } from '@/types/api';

import { DateField } from './DateField';
import { Modal, type ModalHandle } from './Modal';
import { useCurrency } from './PreferencesProvider';
import {
  invalidFields,
  toTransactionFormValues,
  toUpdateTransactionBody,
  type TransactionFormField,
  type TransactionFormValues,
} from './transactionForm';

// 11 Edit transaction (node 29:196): the same five fields as frame 09, prefilled from the row the
// user opened, and the one request this feature makes.
//
// **A second component rather than a mode on `AddTransactionModal`**, and the difference is
// mostly in what happens on submit. The fields, their order, their validation and the amount
// field's caret handling are shared through `(app)/transactionForm.ts` and the `ui/` primitives;
// what is not shared is the diff, the footer's third control, six of the messages, and the fact
// that submitting nothing is a legitimate no-op. A `mode` prop would have carried all of that as
// branches inside one file, and the two are the same shape only from a distance - which is the
// same call `TransactionsEmpty` makes about its two copy objects.
//
// **Field order is ADD-2's and EDT-4 inherits it unchanged**: Amount, Category, then Date beside
// Merchant, then Note. AC1 asserts the values; the order is frame 11's own.

/**
 * Every message this screen can show (A29).
 *
 * **Ten entries: six reused verbatim from frame 09, four new.** The counts are spelled out because
 * an earlier version of this comment got them wrong in three different ways, and `docs/TODO.md`'s
 * A29 entry restated the same muddle - which is exactly how three facts in this repo have gone
 * silently wrong before.
 *
 * Reused verbatim, six: the four field messages, `unauthenticated` and `categoriesUnavailable`.
 * That is a decision rather than a copy-paste. Each field message states the *rule* rather than the
 * operation, so "Enter an amount greater than 0." is as true of an edit as of a create, and an
 * expired session or an unreadable category list says nothing about which operation was attempted.
 * Rewording any of them here would put two wordings of one fact a modal apart.
 *
 * New, four, and all of them join what A29 owes a designer since no form error visual exists
 * anywhere in the Figma file: `invalid` and `failed` are frame 09's own sentences with the verb
 * changed, because "add" is wrong about an edit; the two 404 lines have no counterpart there at
 * all, because that endpoint's 404 could only ever mean one thing.
 *
 * **`invalid` must not say "try again"**, for `createTransaction`'s reason: a body the DTO
 * rejects will be rejected again forever.
 *
 * **The two 404 lines are the interesting pair.** `PATCH /api/transactions/:id` answers 404 for a
 * transaction it cannot find *and* for a category it cannot find, so `lib/updateTransaction.ts`
 * splits them on whether the patch touched the category - and the copy is what that split is
 * for. The common case gets the plain sentence, and only a patch that really did change the
 * category gets the hedged one.
 */
const MESSAGES = {
  amount: 'Enter an amount greater than 0.',
  categoryId: 'Choose a category.',
  date: 'Choose a date.',
  merchant: 'Enter a merchant.',
  invalid: "We couldn't save this transaction. Please check the values and try again.",
  transactionMissing: 'This transaction no longer exists. Close this and refresh the list.',
  transactionOrCategoryMissing:
    'This transaction or that category no longer exists. Close this and try again.',
  unauthenticated: 'Your session has expired. Log in again to save this.',
  failed: "We couldn't save this transaction. Please try again.",
  categoriesUnavailable: "We couldn't load your categories. Please close this and try again.",
} as const;

/**
 * Field ids, which `ui/FieldShell` requires rather than generating; see its note on useId.
 *
 * Distinct from the Add modal's `add-transaction-*`, and not because both are ever open at once -
 * each provider renders one modal and only while open. They differ so that if the two ever *are*
 * mounted together, the failure is two dialogs rather than duplicate ids making
 * `getByLabelText` ambiguous, which is the harder bug to read.
 */
const AMOUNT_ID = 'edit-transaction-amount';
const CATEGORY_ID = 'edit-transaction-category';
const DATE_ID = 'edit-transaction-date';
const MERCHANT_ID = 'edit-transaction-merchant';
const NOTE_ID = 'edit-transaction-note';

/** The `Select…` the Category field falls back to. Unreachable for a stored transaction. */
const CATEGORY_PLACEHOLDER = 'Select…';

type EditTransactionModalProps = {
  /**
   * The row being edited, as the list already has it.
   *
   * **The whole transaction rather than an id, so nothing is fetched to open this.**
   * `TransactionResponseDto` carries every field the form draws - including `note` and
   * `categoryId` - so the kebab passes what it already rendered and AC1's "every field is
   * prefilled" costs no round trip. It is also the value the diff is taken against, which is
   * why it stays a prop rather than being copied into state.
   */
  transaction: Transaction;
  /** The account's categories, or `null` while the read is still out. */
  categories: CategoryOption[] | null;
  /** Whether the categories read failed outright. Shows a line and blocks submission. */
  categoriesFailed?: boolean;
  /**
   * The update action.
   *
   * A prop rather than an import, which is `AddTransactionModal`'s pattern and buys the same
   * thing: the suite passes a `jest.fn()` and needs no module mock, so the `@/` alias trap that
   * `jest.mock` cannot resolve never comes up.
   */
  update: (
    id: string,
    body: components['schemas']['UpdateTransactionDto'],
  ) => Promise<UpdateTransactionResult>;
  /**
   * Opens the delete confirmation over this modal (EDT-3, AC6).
   *
   * A callback rather than a `useDeleteTransaction()` call here, so this component knows nothing
   * about that provider and its suite needs neither. The owner also decides what the
   * confirmation is told, which matters: it quotes the **stored** values, not whatever is
   * currently typed in these fields, because it describes the row about to be removed.
   */
  onDelete: () => void;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
};

export function EditTransactionModal({
  transaction,
  categories,
  categoriesFailed = false,
  update,
  onDelete,
  onClose,
}: EditTransactionModalProps) {
  const router = useRouter();
  // The prefix glyph for `ui/Input`'s currency variant, which drew a literal `$` until PET-47's
  // review. See `useCurrency` for why the symbol is a prop rather than read inside the primitive.
  const currency = useCurrency();
  const modalRef = useRef<ModalHandle>(null);

  /**
   * The form, prefilled from the stored row (EDT-1, AC1).
   *
   * Initialised once on mount rather than synced from the prop, which is what makes this an
   * editable draft instead of a display of the row: a `router.refresh()` triggered by anything
   * else on the page must not overwrite what the user is halfway through typing. The modal is
   * unmounted when it closes, so reopening always re-reads the row.
   */
  const [values, setValues] = useState<TransactionFormValues>(() =>
    toTransactionFormValues(transaction),
  );

  const [errors, setErrors] = useState<Partial<Record<TransactionFormField, string>>>({});
  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Writes one field and clears its message, which is this repo's timing rule for forms. */
  function set<K extends keyof TransactionFormValues>(field: K, value: string) {
    setValues((current) => ({ ...current, [field]: value }));

    // Validation appears on submit only and clears as soon as the user starts fixing that
    // field - never on the next keystroke of a different one. Same as the Add modal.
    if (field !== 'note') setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  }

  /**
   * The amount field, reformatted under the caret on every keystroke.
   *
   * **This paragraph used to defend copying the body from `AddTransactionModal` rather than lifting
   * it, and the fourth copy is what ended that.** `lib/amountField.ts` owns the seven lines and the
   * reasoning now. The one thing that is this file's rather than that one's still holds: the
   * prefilled value is one the field could have produced, which `transactionForm.test.ts` asserts
   * directly, so the first keystroke here behaves exactly as the tenth does in the Add modal.
   */
  function onAmountChange(event: React.ChangeEvent<HTMLInputElement>) {
    set('amount', reformatAmountInput(event.currentTarget));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would
    // close the modal and lose every edit while looking like a flicker.
    event.preventDefault();

    // **There is deliberately no `if (categoriesFailed) return;` here, and that is the one place
    // this form must not copy `AddTransactionModal`.** That guard exists there because a create
    // has no category until the options arrive, so there is genuinely nothing to submit. An edit
    // has one: `values.categoryId` is prefilled from the row, `invalidFields` passes on it, and
    // `toUpdateTransactionBody` omits the key entirely while it is untouched - so a failed
    // categories read leaves every other field perfectly saveable, and fixing a typo in Merchant
    // while the picker is unavailable is a reasonable thing to do.
    //
    // The guard was here and was a real defect rather than a redundancy: it returned before any
    // state changed, and the "We couldn't load your categories" line was already on screen from
    // the read itself, so pressing Save did nothing observable at all - the dead control every
    // provider in this shell throws to avoid. Note it could never have prevented a bad request
    // either: when the read fails the select is `disabled`, so no `categoryId` the backend could
    // reject can reach the body.

    // Every field at once rather than the first failure, so a form with two fields cleared shows
    // two messages (AC4). `invalidFields` is frame 09's, unchanged.
    const invalid = invalidFields(values);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, MESSAGES[field]])));
      return;
    }

    const body = toUpdateTransactionBody(transaction, values);

    // **Nothing changed, so nothing is sent.** The endpoint answers 400 `Provide at least one
    // field to update.` for an empty body, which is a correct answer to a question the user did
    // not ask - they pressed Save on a form they had not edited, and the honest response is the
    // same as Cancel's. No `router.refresh()` either: there is nothing new to read.
    if (Object.keys(body).length === 0) {
      modalRef.current?.close();
      return;
    }

    setFailure(null);
    setPending(true);

    // **The RPC itself can reject**, offline or when a deploy moves the action id, and that is a
    // rejection rather than a result - so without this the modal would throw past its own error
    // handling and leave the user with a spinner. `DeleteTransactionDialog` had to add this after
    // a review; `AddTransactionModal` still lacks it, which is a gap rather than a precedent.
    let result: UpdateTransactionResult;
    try {
      result = await update(transaction.id, body);
    } catch {
      result = { ok: false, reason: 'failed' };
    }

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `router.refresh()` re-runs the Server Components of whichever route the user is on, which
    // is what puts the new value in the list (AC3) - and it needs no knowledge of which route
    // that is. `modalRef.current.close()` rather than `onClose()` so the browser restores focus
    // to whatever opened this; the close event then calls `onClose` for us.
    router.refresh();
    modalRef.current?.close();
  }

  const categoryOptions = (categories ?? []).map(({ id, name }) => ({ value: id, label: name }));

  return (
    <Modal
      ref={modalRef}
      title="Edit transaction"
      onClose={onClose}
      // Frame 11 draws the Amount field focused, exactly as frame 09 does. Without this the
      // browser focuses the first tabbable descendant, which is the X.
      initialFocusId={AMOUNT_ID}
      onSubmit={onSubmit}
      footerStart={
        // EDT-3 and AC6: opens the confirmation, and deletes nothing itself. `textDanger` is the
        // ghost-plus-`text-error` variant `ui/Button`'s own doc already reserves for "Delete
        // transaction" on frames 11 and 21, and the trash comes from lucide like every other
        // glyph in the app.
        //
        // **Deliberately live while a save is in flight**, which is the call the Add modal makes
        // about Cancel: no fetch in this app carries a timeout, so a hung request is exactly when
        // a way out matters most. If the delete lands first, the in-flight patch answers 404 and
        // this modal is already gone.
        <Button
          label="Delete transaction"
          variant="textDanger"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          onClick={onDelete}
        />
      }
      footer={
        <>
          {/* Its default type is `button`, which is what stops it submitting the form. Live
              while the request is out for the Add modal's reason: it cannot double-submit, and
              the X, Escape and a backdrop click all stay live regardless. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* Disabled while the request is out. A double submit here is gentler than the Add
              modal's - a repeated patch is idempotent where a repeated post makes a duplicate -
              but it would still fire two requests and race their two answers into one line. */}
          <Button type="submit" label="Save changes" disabled={pending} />
        </>
      }
    >
      {/* The currency variant draws the `$` prefix and the larger value frame 11 gives this
          field alone, exactly as frame 09 does. `required` with no asterisk, per A12. */}
      <Input
        id={AMOUNT_ID}
        label="Amount"
        variant="currency"
        currencySymbol={currencySymbol(currency)}
        value={values.amount}
        onChange={onAmountChange}
        error={errors.amount}
        required
      />

      {/* Prefilled with the stored category rather than the placeholder, which is the one field
          where editing and adding genuinely differ: `CATEGORY_PLACEHOLDER` exists here only for
          the state where the options have not arrived yet, and a stored transaction always has a
          category. That is also why `lib/categories.ts`'s invitation to carry `isFallback` was
          declined - nothing here preselects anything.

          Disabled until the options arrive, or for good if the read failed. Note the select
          shows nothing selected while `categories` is null, because an option cannot be selected
          before it exists; the value is in state throughout and reappears with the list. */}
      <Select
        id={CATEGORY_ID}
        label="Category"
        options={categoryOptions}
        placeholder={CATEGORY_PLACEHOLDER}
        value={values.categoryId}
        onChange={(event) => set('categoryId', event.currentTarget.value)}
        error={errors.categoryId}
        disabled={categories === null || categoriesFailed}
        required
      />

      {/* Date and Merchant share a row, as they do on frame 09. */}
      <div className="flex w-full gap-3">
        <div className="flex-1">
          <DateField
            id={DATE_ID}
            label="Date"
            value={values.date}
            onChange={(iso) => set('date', iso)}
            error={errors.date}
          />
        </div>
        <div className="flex-1">
          <Input
            id={MERCHANT_ID}
            label="Merchant"
            value={values.merchant}
            onChange={(event) => set('merchant', event.currentTarget.value)}
            error={errors.merchant}
            required
          />
        </div>
      </div>

      {/* The one field marked optional, which is what makes the other four read as required
          (ADD-5, A12). Clearing it is how a note is deleted, and `toUpdateTransactionBody` is
          what turns that into the `null` the DTO wants. */}
      <Input
        id={NOTE_ID}
        label="Note (optional)"
        value={values.note}
        onChange={(event) => set('note', event.currentTarget.value)}
      />

      {/* Two form-level lines rather than one, because they answer different questions and can
          both be true: the picker had nothing to offer, and the save was rejected.
          `components/FormError.tsx` renders nothing when its message is absent, so neither needs
          a conditional here and a closed modal contributes no text to the page. */}
      <FormError message={categoriesFailed ? MESSAGES.categoriesUnavailable : null} />
      <FormError message={failure} />
    </Modal>
  );
}
