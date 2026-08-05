'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CategoryOption } from '@/lib/categories';
import type { CreateTransactionResult } from '@/lib/createTransaction';
import { todayIsoDate } from '@/lib/date';
import { amountCaret, formatAmountInput } from '@/lib/format';
import type { components } from '@/types/api';

import { DateField } from './DateField';
import { Modal, type ModalHandle } from './Modal';
import {
  invalidFields,
  toCreateTransactionBody,
  type TransactionFormField,
  type TransactionFormValues,
} from './transactionForm';

// 09 Add transaction (node 28:384): the five fields, their validation, and the one request
// this feature makes.
//
// The box, the scrim and every close affordance belong to `(app)/Modal.tsx`; what is here is
// the form. The split matters because frames 11, 19, 21 and both delete confirmations draw the
// same box and none of them draws these fields.
//
// **Field order is ADD-2's and is not negotiable**: Amount, Category, then Date beside
// Merchant, then Note. AC1 asserts it.

/**
 * Every message this screen can show (A29).
 *
 * All of it ours: assumption A29 records that **no form error visual exists anywhere in the
 * Figma file**, so both the pattern and the words owe a designer sign-off, and the
 * `WithMessages` story exists to put them in front of one. Shaped after the single message
 * already live in the app, `Enter an amount greater than 0.`
 *
 * **One amount message covers AC3's "missing" and AC4's "zero or negative".** `BudgetForm`
 * already reuses this exact string for both of its cases, and it states the *rule* rather than
 * the symptom, so it is simultaneously true of an empty field and of a typed `0`. The two
 * criteria differ in the behaviour they demand - stays open, nothing saved - not in the copy.
 *
 * The four failure lines are one per `CreateTransactionResult` reason, and their differences
 * are the whole reason that type has four arms. `invalid` must not say "try again", because a
 * body the DTO rejects will be rejected again forever.
 */
const MESSAGES = {
  amount: 'Enter an amount greater than 0.',
  categoryId: 'Choose a category.',
  date: 'Choose a date.',
  merchant: 'Enter a merchant.',
  invalid: "We couldn't add this transaction. Please check the values and try again.",
  categoryMissing: 'That category no longer exists. Pick another one.',
  unauthenticated: 'Your session has expired. Log in again to save this.',
  failed: "We couldn't add this transaction. Please try again.",
  categoriesUnavailable: "We couldn't load your categories. Please close this and try again.",
} as const;

/** Field ids, which `ui/Field` requires rather than generating; see its note on useId. */
const AMOUNT_ID = 'add-transaction-amount';
const CATEGORY_ID = 'add-transaction-category';
const DATE_ID = 'add-transaction-date';
const MERCHANT_ID = 'add-transaction-merchant';
const NOTE_ID = 'add-transaction-note';

/** The `Select…` the Category field opens on. `ui/Select` renders it as a disabled hidden option. */
const CATEGORY_PLACEHOLDER = 'Select…';

type AddTransactionModalProps = {
  /**
   * The account's categories, or `null` while the read is still out.
   *
   * `null` rather than an empty array, because the two mean different things to the control:
   * an empty list is an account with no categories, and `null` is "we do not know yet". The
   * select is disabled for both, but only one of them is a state that resolves.
   */
  categories: CategoryOption[] | null;
  /** Whether the categories read failed outright. Shows a line and blocks submission. */
  categoriesFailed?: boolean;
  /**
   * The create action.
   *
   * A prop rather than an import, which is `RegisterForm`'s pattern and buys the same thing:
   * the suite passes a `jest.fn()` and needs no module mock, so the `@/` alias trap that
   * `jest.mock` cannot resolve never comes up.
   */
  create: (body: components['schemas']['CreateTransactionDto']) => Promise<CreateTransactionResult>;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
};

export function AddTransactionModal({
  categories,
  categoriesFailed = false,
  create,
  onClose,
}: AddTransactionModalProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);

  /**
   * Today, resolved once when the modal mounts rather than at module scope.
   *
   * A tab left open overnight would otherwise default every new transaction to yesterday. The
   * initialiser runs on mount, and because a closed modal renders nothing there is no server
   * render of this field to disagree with the client's clock - so no hydration mismatch.
   */
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    amount: '',
    categoryId: '',
    date: todayIsoDate(),
    merchant: '',
    note: '',
  }));

  const [errors, setErrors] = useState<Partial<Record<TransactionFormField, string>>>({});
  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Writes one field and clears its message, which is this repo's timing rule for forms. */
  function set<K extends keyof TransactionFormValues>(field: K, value: string) {
    setValues((current) => ({ ...current, [field]: value }));

    // Validation appears on submit only and clears as soon as the user starts fixing that
    // field - never on the next keystroke of a different one. Same as BudgetForm and
    // RegisterForm.
    if (field !== 'note') setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  }

  /**
   * The amount field, reformatted under the caret on every keystroke.
   *
   * Lifted wholesale from `app/setup/BudgetForm.tsx`, including why it works: the handler
   * writes the formatted value and the caret onto `event.currentTarget` directly, which is
   * already the node, so `ui/Input` needs no `ref` prop. It depends on `formatAmountInput`
   * being idempotent - `lib/format.test.ts` pins that property for exactly this reason - and
   * on `amountCaret` computing the *semantic* position, because React restores the raw offset
   * and that is wrong precisely when a separator is inserted to the left of the caret.
   *
   * jsdom cannot observe the outcome either way, so the suite asserts `setSelectionRange` was
   * called with the computed offset and the visible behaviour is a Storybook check. That gap
   * is recorded in `docs/TODO.md` against the budget field already.
   */
  function onAmountChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const raw = element.value;
    const caret = element.selectionStart ?? raw.length;
    const formatted = formatAmountInput(raw);

    element.value = formatted;
    const at = amountCaret(raw, caret, formatted);
    element.setSelectionRange(at, at);

    set('amount', formatted);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would
    // close the modal and lose everything typed while looking like a flicker.
    event.preventDefault();

    // Every field at once rather than the first failure, so an empty form shows four messages
    // (AC3). `invalidFields` owns that rule so a fast, jsdom-free test can pin it.
    const invalid = invalidFields(values);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, MESSAGES[field]])));
      return;
    }

    // Nothing to submit against. The select is already disabled and the line already showing;
    // this is the guard that stops Enter in another field getting past it.
    if (categoriesFailed) return;

    setFailure(null);
    setPending(true);

    const result = await create(toCreateTransactionBody(values));

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **Refresh before closing, and close through the dialog rather than by unmounting.**
    // `router.refresh()` re-runs the Server Components of whichever of the three routes the
    // user is on, which is what makes the transactions tab badge tick up (AC5) - and it needs
    // no knowledge of which route that is, unlike a `revalidatePath` inside the action.
    //
    // `modalRef.current.close()` rather than `onClose()` so the browser restores focus to the
    // button that opened this. The close event then calls `onClose` for us.
    router.refresh();
    modalRef.current?.close();
  }

  const categoryOptions = (categories ?? []).map(({ id, name }) => ({ value: id, label: name }));

  return (
    <Modal
      ref={modalRef}
      title="Add transaction"
      onClose={onClose}
      // AC2: frame 09 draws the Amount field focused, and the designed 1.5px accent border is
      // a focus style - so nothing renders it unless focus actually lands here on open.
      initialFocusId={AMOUNT_ID}
      onSubmit={onSubmit}
      footer={
        <>
          {/* Its default type is `button`, which is what stops it submitting the form -
              exactly the case ui/Button's own doc cites this modal for. */}
          <Button
            label="Cancel"
            variant="secondary"
            onClick={() => modalRef.current?.close()}
            disabled={pending}
          />
          {/* Disabled while the request is out. A19 designs no pending state, but a double
              submit here creates two transactions the user then has to find and delete -
              a sharper reason than the throttled attempt RegisterForm guards against. */}
          <Button type="submit" label="Add transaction" disabled={pending} />
        </>
      }
    >
      {/* The currency variant is what draws the `$` prefix and the 22px Display/S value
          (node 28:393). `required` with no asterisk, per A12: required fields are marked only
          by the absence of "(optional)". */}
      <Input
        id={AMOUNT_ID}
        label="Amount"
        variant="currency"
        value={values.amount}
        onChange={onAmountChange}
        error={errors.amount}
        required
      />

      {/* A placeholder rather than the fallback "Uncategorized" preselected. The contract's
          own `isFallback` doc says the transaction form preselects it, and doing so would make
          AC3's "missing category" unreachable by construction - so the criterion is kept real
          at the cost of one interaction. Recorded on the ticket.

          Disabled until the options arrive, or for good if the read failed. A control that is
          inert with no explanation is worse than a message, which is why the line below always
          accompanies the failed case. */}
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

      {/* Date and Merchant share a row at 230px each inside the 472px body (node 28:401).
          A flex row with flex-1 on each child rather than a grid, because ui/Field is w-full
          and the two are separate components rather than cells of one layout. */}
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
          (ADD-5, A12). No `required`, and it can carry no error. */}
      <Input
        id={NOTE_ID}
        label="Note (optional)"
        value={values.note}
        onChange={(event) => set('note', event.currentTarget.value)}
      />

      {/* role="alert" where ui/Field deliberately has none: Field's message appears
          synchronously beside the field the user just left, while these two appear after a
          network round trip with nothing else on screen changing - so nothing else would tell
          a screen reader anything happened. Same call RegisterForm makes. */}
      {categoriesFailed ? (
        <p role="alert" className="text-body-s text-status-danger-text">
          {MESSAGES.categoriesUnavailable}
        </p>
      ) : null}

      {failure !== null ? (
        <p role="alert" className="text-body-s text-status-danger-text">
          {failure}
        </p>
      ) : null}
    </Modal>
  );
}
