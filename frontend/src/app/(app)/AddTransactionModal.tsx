'use client';

import { Camera, Images, Info, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CategoryOption } from '@/lib/categories';
import type { CreateTransactionResult } from '@/lib/createTransaction';
import { todayIsoDate } from '@/lib/date';
import { amountCaret, formatAmountInput } from '@/lib/format';
import {
  compressReceiptFiles,
  MAX_PDF_BYTES,
  MAX_RECEIPT_FILES,
  RECEIPT_PDF_MIME_TYPE,
} from '@/lib/receiptCompression';
import type { ScanReceiptResult } from '@/lib/scanReceipt';
import type { components } from '@/types/api';

import { DateField } from './DateField';
import { Modal, type ModalHandle } from './Modal';
import {
  invalidFields,
  mergeScannedFields,
  scannedFieldsToFill,
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

  // PET-59's receipt scanning, added to the same table rather than a second
  // one: each line below is one row of the plan's outcome table, kept beside
  // the four failures above because both sets answer the same question -
  // "why did this not just work" - to the same reader.
  scanNothingExtracted: 'Nothing readable in that photo. Try again with the whole receipt in frame.',
  scanRejected: "That file isn't a receipt we can read. Use photos, or a single PDF.",
  scanMixedPdf: "Send a PDF on its own - it already holds every page.",
  scanTooMany: `Send up to ${MAX_RECEIPT_FILES} photos, or a single PDF.`,
  scanTooLarge: 'That file is too big. Photos can be up to 1.5 MB after compressing, a PDF up to 4 MB.',
  scanUnavailable: 'Receipt scanning is switched off right now. You can still add the transaction by hand.',
  scanRateLimited: "You've scanned a lot in a short time. Wait a minute and try again.",
  scanTimedOut: 'That scan took too long. Try again, or add the transaction by hand.',
  scanFailed: "We couldn't read that receipt. Please try again.",
  // The phone copy names the control this device actually has; the desktop
  // copy names the one fix a device with no camera control can act on.
  compressionFailedPhone:
    "This phone saves photos in a format the browser can't read (HEIC). Use Scan receipt, or convert the file first.",
  compressionFailedDesktop: "This file is in a format the browser can't read (HEIC). Convert it to a JPEG or PNG first.",
} as const;

/** What each scan failure reason (`lib/scanReceipt.ts`) reads as. */
const SCAN_FAILURE_MESSAGES = {
  rejected: MESSAGES.scanRejected,
  tooLarge: MESSAGES.scanTooLarge,
  unauthenticated: MESSAGES.unauthenticated,
  unavailable: MESSAGES.scanUnavailable,
  rateLimited: MESSAGES.scanRateLimited,
  timedOut: MESSAGES.scanTimedOut,
  failed: MESSAGES.scanFailed,
} as const;

/** The label a missing field's own name reads as in the note below the scan controls. */
const MISSING_FIELD_LABELS: Record<ScannedField, string> = {
  merchant: 'merchant',
  amount: 'amount',
  date: 'date',
  categoryId: 'category',
};

type ScannedField = 'merchant' | 'amount' | 'date' | 'categoryId';

/**
 * The note beside the scan controls naming which fields to fill in by hand or
 * photograph again - never `note`, which is supplementary and not something a
 * retry photo reliably fixes (see `ScanReceiptService` on the backend, whose
 * `missing` array already excludes it for the same reason).
 */
function missingFieldsNote(missing: readonly ScannedField[]): string {
  const names = missing.map((field) => MISSING_FIELD_LABELS[field]);
  const joined =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return `Couldn't read the ${joined}. Fill ${names.length === 1 ? 'it' : 'them'} in below, or photograph the rest of the receipt.`;
}

/** Field ids, which `ui/FieldShell` requires rather than generating; see its note on useId. */
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
  /**
   * The scan action (PET-59).
   *
   * A prop for `create`'s own reason: the suite injects a `jest.fn()` and needs no module
   * mock, so the `@/` alias `jest.mock` cannot resolve never comes up.
   */
  scan: (formData: FormData) => Promise<ScanReceiptResult>;
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
};

export function AddTransactionModal({
  categories,
  categoriesFailed = false,
  create,
  scan,
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

  /**
   * Which fields already hold a value somebody decided on, for `mergeScannedFields`
   * (PET-59): every field `set()` has written, plus every field a scan has filled.
   *
   * **A ref rather than state, and that is a correctness requirement rather than an
   * optimisation.** Nothing renders from it, and `handleFiles` reads it across two awaits -
   * so as state it would be read from the render closure that started the scan, and a field
   * typed into while the receipt was still compressing would be silently overwritten by
   * the result. That is the exact case the set exists to prevent, so it must be read at the
   * moment of the merge rather than at the moment the picker fired.
   *
   * **Replaced, never mutated.** `handleFiles` hands the pre-merge snapshot to `setValues`'s
   * updater, which React runs later; mutating in place would widen the set the deferred
   * updater then reads and the merge would fill nothing at all.
   *
   * It deliberately does not track "is this field empty": `values.date` starts as
   * `todayIsoDate()`, so an emptiness test would refuse to ever overwrite it with the
   * receipt's real date.
   */
  const lockedRef = useRef<ReadonlySet<keyof TransactionFormValues>>(new Set());

  const [scanning, setScanning] = useState(false);
  /** The scan-outcome note beside the controls (missing fields, or nothing extracted). `role="status"`, not an error. */
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Upload, compression and network failures. `role="alert"`, same treatment as `failure`. */
  const [scanFailure, setScanFailure] = useState<string | null>(null);
  /** Whether a scan has ever succeeded, which is what swaps "Scan receipt"/"Upload receipt" for "Scan again"/"Add pages". */
  const [hasScanned, setHasScanned] = useState(false);

  /**
   * Invalidates an in-flight scan when the overlay's Cancel is pressed.
   *
   * There is no way to abort the underlying request once a Server Action call is in flight -
   * unlike `authorizedPost`'s plain `fetch`, nothing here exposes an `AbortController` to
   * cancel by. So "dismissible" means the UI stops waiting rather than the network call
   * stopping: the request may still complete server-side, but its result is discarded if the
   * token it captured no longer matches.
   */
  const scanTokenRef = useRef(0);

  /** Writes one field and clears its message, which is this repo's timing rule for forms. */
  function set<K extends keyof TransactionFormValues>(field: K, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    lockedRef.current = new Set(lockedRef.current).add(field);

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

  /**
   * The whole scan: client-side shape checks, compression, the request, and
   * merging what comes back.
   *
   * **The two file inputs share this one handler** (ADD-... no, PET-59's own
   * decision): the camera and the picker differ only in what the OS shows,
   * never in what happens once a file lands here.
   */
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const hasPdf = files.some((file) => file.type === RECEIPT_PDF_MIME_TYPE);

    // Mirrors the backend's own fileFilter (`receipt-scan.upload.ts`), so the
    // common mistakes answer instantly rather than after a round trip - the
    // backend's 400 stays the real enforcement for anything that reaches it
    // anyway.
    if (hasPdf && files.length > 1) {
      setScanFailure(MESSAGES.scanMixedPdf);
      return;
    }
    if (!hasPdf && files.length > MAX_RECEIPT_FILES) {
      setScanFailure(MESSAGES.scanTooMany);
      return;
    }
    // The one size check worth making on this side, and only for a PDF -
    // `receiptCompression.ts` carries why an image's size here says nothing.
    // Without it the `scanTooLarge` message above promises a 4MB ceiling that
    // nothing enforces until the backend, and a PDF past `bodySizeLimit`
    // never reaches the backend at all: the Server Action call rejects, which
    // is the throw the catch below exists for and a worse answer than this.
    if (hasPdf && files[0]!.size > MAX_PDF_BYTES) {
      setScanFailure(MESSAGES.scanTooLarge);
      return;
    }

    setScanFailure(null);
    setScanNote(null);

    // **The overlay covers compression too, not just the request.** Four 12MP
    // photos take seconds to compress, and until this flips there is no
    // spinner, both file inputs stay enabled and the click reads as ignored -
    // so a user re-picks and starts a second `handleFiles` that silently
    // invalidates the first through the token below. The overlay describes
    // "reading your receipt", and compressing it is part of that.
    const token = ++scanTokenRef.current;
    setScanning(true);

    const compressed = await compressReceiptFiles(files);

    if (scanTokenRef.current !== token) return;

    if (!compressed.ok) {
      setScanning(false);
      // Read at the moment of the failure rather than hoisted to render: this
      // is a one-off event handler, not part of the initial render decision
      // the camera input's `pointer-fine:hidden` has to be, so there is no
      // hydration mismatch to protect against here.
      const isFinePointer =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: fine)').matches;
      setScanFailure(isFinePointer ? MESSAGES.compressionFailedDesktop : MESSAGES.compressionFailedPhone);
      return;
    }

    const formData = new FormData();
    for (const file of compressed.files) formData.append('files', file);

    // **A Server Action call can reject rather than resolve, and nothing above
    // this would catch it.** `handleFiles` is invoked as `void handleFiles(...)`
    // from both onChange handlers, so an escaping rejection is unhandled and -
    // worse - skips `setScanning(false)` and every `setScanFailure`, leaving
    // the overlay up forever with nothing on it but Cancel. The reachable
    // paths are a body over `next.config.ts`'s `bodySizeLimit` and a
    // connection dropped mid-action; both are "we couldn't read that receipt,
    // try again", which is exactly `scanFailed`.
    let result: ScanReceiptResult;
    try {
      result = await scan(formData);
    } catch {
      if (scanTokenRef.current !== token) return;
      setScanning(false);
      setScanFailure(MESSAGES.scanFailed);
      return;
    }

    // The overlay's Cancel was pressed while this was in flight - the result
    // arrived too late to matter, and applying it now would resurrect a
    // scan the user already dismissed.
    if (scanTokenRef.current !== token) return;

    setScanning(false);

    if (!result.ok) {
      setScanFailure(SCAN_FAILURE_MESSAGES[result.reason]);
      return;
    }

    // Snapshotted rather than read twice, because `setValues`'s updater runs
    // later: widening `lockedRef` first would hand the deferred merge a set
    // that already claims every field it was about to fill.
    const locked = lockedRef.current;
    const filled = scannedFieldsToFill(locked, result.data);

    setValues((current) => mergeScannedFields(current, locked, result.data));
    lockedRef.current = new Set([...locked, ...filled]);

    // The merge is the one write to `values` that does not go through `set()`,
    // which is otherwise the only thing that clears a field's message - so
    // without this, submitting an empty form and then scanning a good receipt
    // leaves three red lines under three fields that are now filled and valid.
    if (filled.length > 0) {
      setErrors((current) => {
        const next = { ...current };
        for (const field of filled) {
          if (field !== 'note') delete next[field];
        }
        return next;
      });
    }

    setHasScanned(true);

    const { missing } = result.data;
    if (missing.length === 0) {
      setScanNote(null);
    } else if (missing.length === Object.keys(MISSING_FIELD_LABELS).length) {
      // Every invented field came back null: the photo was read, nothing on
      // it was legible - the plan's "nothing extracted" row, distinct from a
      // partial extraction below.
      setScanNote(MESSAGES.scanNothingExtracted);
    } else {
      setScanNote(missingFieldsNote(missing));
    }
  }

  /** The camera control: one photo at a time, so a second capture merges rather than replaces. */
  function onCameraChange(event: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.currentTarget.files);
    // Cleared so selecting the identical file twice in a row still fires `onChange`.
    event.currentTarget.value = '';
  }

  /** The upload control: up to 4 images, or one PDF. */
  function onUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  }

  /** Stops waiting on the current scan. See `scanTokenRef`'s own doc for what this can and cannot cancel. */
  function cancelScan() {
    scanTokenRef.current += 1;
    setScanning(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would
    // close the modal and lose everything typed while looking like a flicker.
    event.preventDefault();

    // **Before the field checks, not after, and the order is the whole point.** There is nothing
    // to submit against, and the `role="alert"` line already says why - so running validation
    // first would additionally tell the user to "Choose a category." from a disabled select with
    // no options in it, blaming them for something they have no way to do. It also has to be a
    // real guard rather than decoration, because Enter in any other field submits the form.
    if (categoriesFailed) return;

    // Every field at once rather than the first failure, so an empty form shows four messages
    // (AC3). `invalidFields` owns that rule so a fast, jsdom-free test can pin it.
    const invalid = invalidFields(values);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, MESSAGES[field]])));
      return;
    }

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
      // AC2: frame 09 draws the Amount field focused, and a focus ring is a focus style - so
      // nothing renders one unless focus actually lands here on open. The ring is the theme's
      // now rather than the frame's 1.5px accent border, which changes nothing about the
      // criterion: focus still has to arrive.
      initialFocusId={AMOUNT_ID}
      onSubmit={onSubmit}
      footer={
        <>
          {/* Its default type is `button`, which is what stops it submitting the form -
              exactly the case ui/Button's own doc cites this modal for.

              **Deliberately not disabled while the request is out.** Disabling it prevented
              nothing - it cannot double-submit - and the X, Escape and a backdrop click all stay
              live regardless, so it was the one dead exit sitting next to three working ones. No
              fetch in this app carries a timeout, so a hung request is exactly when a visible
              way out matters most. Only the submit is disabled, and only to stop a second
              transaction being created. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* Disabled while the request is out. A19 designs no pending state, but a double
              submit here creates two transactions the user then has to find and delete -
              a sharper reason than the throttled attempt RegisterForm guards against. */}
          <Button type="submit" label="Add transaction" disabled={pending} />
        </>
      }
    >
      {/* `relative` is what lets the loading overlay below cover exactly this content - the
          scan controls and every field - while the header and footer stay live underneath it,
          matching the preview's own plate 2. */}
      <div className="relative flex flex-col gap-4">
        {/* The two scan controls and the disclosure line (PET-59). Above Amount, deliberately:
            scanning is how the fields get filled, so putting this under them would ask the user
            to scroll past the shortcut to find it. */}
        <div className="border-base-300 bg-base-200 rounded-box flex flex-col gap-3 border p-3">
          <div className="flex flex-wrap gap-2">
            {/* `pointer-fine:hidden`, not `hidden pointer-coarse:inline-flex`: two style
                modifiers from one daisyUI component - here, two display utilities - are resolved
                by the plugin's emission order rather than by the attribute, and a device
                reporting neither (`pointer: none`) would lose the one control this ticket exists
                for under the "show on coarse" spelling. `capture="environment"` is a hint desktop
                browsers ignore, which is what makes this camera control the same file picker as
                the one beside it there - hence hiding it rather than merely disabling it, so it
                also leaves the tab order.

                A `<label>` wrapping a `sr-only` file input rather than `ui/Button`, which has no
                shape for triggering a file picker; `btn-outline btn-primary` on both controls -
                peers, not a primary and a secondary - is what keeps "Add transaction" the box's
                one solid `btn-primary`. */}
            <label className="btn btn-sm btn-outline btn-primary pointer-fine:hidden">
              <Camera className="size-4" aria-hidden="true" />
              {hasScanned ? 'Scan again' : 'Scan receipt'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={onCameraChange}
                disabled={scanning}
              />
            </label>
            <label className="btn btn-sm btn-outline btn-primary">
              <Images className="size-4" aria-hidden="true" />
              {hasScanned ? 'Add pages' : 'Upload receipt'}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={onUploadChange}
                disabled={scanning}
              />
            </label>
          </div>

          {/* Mandatory rather than courteous (see the plan's free-tier decision): the first scan
              sends both the photo and a year of merchant names to a training-enabled endpoint,
              and this is what says so at the moment of action. */}
          <p className="flex gap-2 text-xs leading-relaxed opacity-60">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              What you upload, your recent merchant names and your category names are sent to
              Google Gemini to read the receipt, and may be used to improve their models. Nothing
              is stored. Up to {MAX_RECEIPT_FILES} photos or one PDF, all treated as pages of one
              receipt.
            </span>
          </p>

          {/* `role="status"` (polite), not `FormError`'s `role="alert"`: this follows a scan the
              user just watched run, so nothing needs to interrupt - unlike `scanFailure` below,
              which reports a request that failed with nothing else on screen announcing it. */}
          {scanNote ? (
            <p className="text-warning flex gap-2 text-xs leading-relaxed" role="status">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{scanNote}</span>
            </p>
          ) : null}
        </div>

        <FormError message={scanFailure} />

        {/* The currency variant is what draws the `$` prefix and the larger value the frame
            gives this field alone (node 28:393), which is daisyUI's `input-lg` now rather than a
            named type style. `required` with no asterisk, per A12: required fields are marked
            only by the absence of "(optional)". */}
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
          A flex row with flex-1 on each child rather than a grid, because `ui/FieldShell` is
          w-full and the two are separate components rather than cells of one layout. */}
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

      {/* Two form-level lines rather than one, because they answer different questions and can
          both be true: the picker had nothing to offer, and the save was rejected.
          `components/FormError.tsx` owns the treatment and the `role="alert"` argument for both,
          and renders nothing when its message is absent - so neither needs a conditional here
          and a closed modal still contributes no text to the page, which
          `(app)/pages.test.tsx` depends on. */}
        <FormError message={categoriesFailed ? MESSAGES.categoriesUnavailable : null} />
        <FormError message={failure} />

        {/* Covers the scan controls and every field while a scan runs, with its own way out -
            the failure PET-56 was an entire ticket about is a hung or quota-throttled call
            leaving a loading state up forever, so this is always dismissible and a server-side
            timeout sits behind it regardless (`RECEIPT_SCAN_TIMEOUT_MS`). */}
        {scanning ? (
          <div className="bg-base-100/85 rounded-box absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center backdrop-blur-[2px]">
            <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="font-display text-base font-bold" role="status">
                Reading your receipt…
              </p>
              <p className="text-sm opacity-60">This usually takes a few seconds.</p>
            </div>
            <Button label="Cancel scan" variant="text" onClick={cancelScan} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
