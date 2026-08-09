'use server';

import type { ScannedTransactionFields } from '@/app/(app)/transactionForm';
import { formatAmountInput } from '@/lib/format';
import { authorizedPostFormData } from '@/lib/session';
import type { components } from '@/types/api';

// Extracts a transaction's fields from a photo or PDF of a receipt (PET-59).
//
// **A Server Action over `authorizedPostFormData`, for `lib/createTransaction.ts`'s
// reason**: the session cookie lives on the frontend origin, and this is a submit from a
// page the user stays on rather than a navigation, so a route handler is the wrong shape
// and a direct browser `fetch` would 401 regardless of CORS. It is named after the
// operation, in `lib/` rather than beside `app/(app)/AddTransactionModal.tsx`, matching
// `createTransaction`'s own reasoning.
//
// **Every field the backend could not fill is `null`, and this file does not decide what
// that means to the form.** `AddTransactionModal` merges the result over whichever fields
// the user has not typed into and renders its own copy for `missing` - this module's whole
// job is the network call and the one unit conversion the boundary needs.

/** The response, off the contract rather than declared. */
type ScanReceiptResponse = components['schemas']['ScanReceiptResponseDto'];

/**
 * Why a scan produced nothing to show, or nothing at all.
 *
 * Six reasons rather than one, because each wants different advice and the plan's own
 * outcome table is explicit that a generic "something went wrong" is actively wrong for
 * more than one of them: `unavailable` must not say "try again" (scanning is switched off,
 * not broken), and `rejected` must not either (the upload itself was refused, and retrying
 * the same file fails again forever).
 *
 * - **`rejected`** is a 400: the upload was refused - wrong file type, no file at all, or a
 *   PDF sent beside another file. `AddTransactionModal` catches most of these client-side
 *   before a request is ever sent, so reaching this means the two disagreed.
 * - **`tooLarge`** is a 413: a file passed multer's own cap. The compression step should
 *   have kept every image under it; a PDF is the likelier way to reach this in practice.
 * - **`unauthenticated`** is a 401: the session died with the modal open.
 * - **`unavailable`** is a 503: `GEMINI_API_KEY` is unset on this deployment. Scanning is
 *   off, not failing - the transaction can still be added by hand.
 * - **`rateLimited`** is a 429: over the per-user scan limit. Temporary, unlike `rejected`.
 * - **`timedOut`** is a 504: the extraction call did not finish in time.
 * - **`failed`** is everything else, including the request that never completed.
 */
export type ScanReceiptFailureReason =
  | 'rejected'
  | 'tooLarge'
  | 'unauthenticated'
  | 'unavailable'
  | 'rateLimited'
  | 'timedOut'
  | 'failed';

export type ScanReceiptResult =
  | { ok: true; data: ScannedTransactionFields & { missing: ScanReceiptResponse['missing'] } }
  | { ok: false; reason: ScanReceiptFailureReason };

/**
 * Scans one or more images, or a single PDF, of a receipt.
 *
 * **`amount` is normalized through `formatAmountInput(amount.toFixed(2))`**, the exact call
 * `toTransactionFormValues` already makes for a stored row - so a scanned amount and an
 * edited one are byte-identical in the DOM the moment they land in the field.
 * `TransactionFormValues.amount` is a display string, not a number, and writing the raw
 * JSON number into it directly would diverge from every other path into that control.
 */
export async function scanReceipt(formData: FormData): Promise<ScanReceiptResult> {
  const result = await authorizedPostFormData<ScanReceiptResponse>(
    '/api/transactions/scan',
    formData,
  );

  if (result.ok) {
    return {
      ok: true,
      data: {
        merchant: result.data.merchant,
        amount: result.data.amount === null ? null : formatAmountInput(result.data.amount.toFixed(2)),
        date: result.data.date,
        categoryId: result.data.categoryId,
        note: result.data.note,
        missing: result.data.missing,
      },
    };
  }

  switch (result.status) {
    case 400:
      return { ok: false, reason: 'rejected' };
    case 401:
      return { ok: false, reason: 'unauthenticated' };
    case 413:
      return { ok: false, reason: 'tooLarge' };
    case 429:
      return { ok: false, reason: 'rateLimited' };
    case 503:
      return { ok: false, reason: 'unavailable' };
    case 504:
      return { ok: false, reason: 'timedOut' };
    default:
      return { ok: false, reason: 'failed' };
  }
}
