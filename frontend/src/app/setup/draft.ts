import { formatAmountInput, parseAmountInput } from '@/lib/format';

// The onboarding draft: everything screens 02, 03 and 22 collect before there is
// an account to save it to.
//
// Nothing here is persisted server side. The account does not exist until step 3
// posts one `POST /api/auth/register` body (A32), so steps 1 and 2 hold their
// values in the browser and this module is the shape of that holding.
//
// Deliberately pure: no React, no `'use client'`. SetupDraftProvider owns the
// state and this owns the data, which keeps two things possible - PET-11 can
// build the register body without dragging a client boundary along, and this
// file's tests need no jsdom.

/**
 * The key the draft is stored under, in **sessionStorage**.
 *
 * sessionStorage rather than localStorage: the draft is scoped to one tab and
 * dies with it, so a shared machine does not offer the next person a
 * half-finished registration carrying somebody's name and email. It is also why
 * A32 still holds literally - nothing here ever leaves the browser.
 *
 * Namespaced because sessionStorage is a flat per-origin bucket shared with
 * anything else this origin ever stores.
 */
export const SETUP_DRAFT_KEY = 'spendifico.setup.draft';

/** A6: only "USD - $" appears anywhere in the design file. */
export const DEFAULT_CURRENCY = 'USD';

export type SetupDraft = {
  /**
   * An ISO 4217 code, not the "USD - $" label the select shows.
   * `RegisterDto.currency` is validated with `@IsISO4217CurrencyCode()`, so the
   * code is what eventually crosses the wire.
   */
  currency: string;
  /**
   * The **display** string, grouped, e.g. `'2,000'`. Not a number.
   *
   * AC5 requires the field to come back showing what was typed, and no number
   * can represent `'2000.'` or `'2,000.5'` mid-type. The conversion to the major
   * units the backend wants happens once, at the boundary, when step 3 builds
   * its request - the same rule `backend/src/common/money.ts` follows.
   */
  budget: string;
};

/**
 * There is deliberately **no `categories` field yet**.
 *
 * PET-10 owns step 2 and nothing here can know whether it wants names, ids or
 * something else, so declaring the field now would be a claim about nothing.
 * `parseDraft` ignores keys it does not recognise, which is what lets PET-10 add
 * one without a stored payload from before the change failing to load.
 */
export const EMPTY_DRAFT: SetupDraft = {
  currency: DEFAULT_CURRENCY,
  budget: '',
};

export function serializeDraft(draft: SetupDraft): string {
  return JSON.stringify(draft);
}

/** A string field, or the fallback when the stored value is not one. */
function readString(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Reads a stored draft, **never throwing**, whatever is in the slot.
 *
 * Total by design rather than by defensiveness. sessionStorage is writable from
 * that tab's devtools console and survives a deploy that changes this shape, so
 * `JSON.parse` here can genuinely see a `SyntaxError`, a bare `3`, an array, or
 * an object whose `budget` is a number. Every one of those has to degrade to an
 * empty form: a throw in the provider's mount effect would white-screen the
 * whole onboarding flow, which is a far worse failure than a lost draft.
 *
 * Note `typeof null === 'object'`, so the null check is not redundant with the
 * object check.
 *
 * **The budget is re-canonicalised on the way out, not trusted.** Returning the
 * stored string verbatim looked harmless and was not: a value that did not come
 * from `formatAmountInput` renders straight into a controlled input and passes
 * `isBudgetValid` unchanged. A stored `'2.000,50'` - which is what a European
 * paste produces, or an older build of the formatter - read back as
 * `parseAmountInput` = `2.0005`, four decimals, which `RegisterDto`'s
 * `@IsNumber({ maxDecimalPlaces: 2 })` rejects. The screen would have shown a
 * plausible number, validated it, and handed step 3 a payload the backend 400s
 * on, with no error state designed for that (A29). Running it through the
 * formatter here means every value this module hands out is one the field could
 * have produced itself. Idempotence is what makes it free for the normal case.
 */
export function parseDraft(raw: string | null): SetupDraft {
  if (raw === null) return EMPTY_DRAFT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return EMPTY_DRAFT;
  }

  const source = parsed as Record<string, unknown>;
  return {
    currency: readString(source, 'currency', DEFAULT_CURRENCY),
    budget: formatAmountInput(readString(source, 'budget', '')),
  };
}

/**
 * Whether the budget is a value "Continue" may proceed on: a number greater than
 * zero (A5, BUD-6).
 *
 * A validity rule rather than display formatting, which is why it lives here and
 * not beside `formatAmountInput` in `lib/format.ts`.
 *
 * `NaN > 0` is `false`, so an empty field, a bare `'.'` and unparseable junk all
 * fail on the same comparison as `'0'` and `'0.00'`. There is no upper bound:
 * A5 designs none, and the backend's own cap is its business to enforce.
 */
export function isBudgetValid(budget: string): boolean {
  return parseAmountInput(budget) > 0;
}
