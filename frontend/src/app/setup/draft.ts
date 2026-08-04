import { formatAmountInput, parseAmountInput } from '@/lib/format';
import type { components } from '@/types/api';

import { STARTER_CATEGORIES, type StarterCategoryName } from './starterCategories';

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
  /**
   * The starter chips picked on screen 03, **by name**, in the canonical order
   * `STARTER_CATEGORIES` declares rather than the order they were clicked.
   *
   * Names because that is what the API takes: `RegisterDto.categories` is
   * `@IsIn(STARTER_CATEGORY_NAMES)`, so names are what eventually cross the wire
   * and an id would be a translation layer with nothing on the other side of it.
   * Typed as the union rather than `string[]` so step 3 can hand this array
   * straight to the register body.
   *
   * Empty is a legitimate value, not a missing one: A4 enforces no minimum and a
   * user who deselects everything has made a choice (CAT-4, AC3).
   */
  categories: StarterCategoryName[];
  /**
   * Screen 22's three fields (REG-2), held here rather than in the register form's
   * own state.
   *
   * PET-11 AC5 sends the user back to step 2 and forward again, which unmounts the
   * register route, so component state cannot survive it. Untrimmed, exactly as
   * typed: trimming on read would fight a controlled input the moment somebody
   * types a space between two words. `toRegisterBody` trims at the boundary.
   */
  firstName: string;
  lastName: string;
  email: string;
};

/**
 * Nothing picked, no budget typed, and the one currency the design offers.
 *
 * The canonical shape, for tests and for anything that wants to name the default.
 * **Do not return it from `parseDraft`** - use `emptyDraft()` below, and read its
 * note for why the distinction is load-bearing now that a field is mutable.
 */
export const EMPTY_DRAFT: SetupDraft = {
  currency: DEFAULT_CURRENCY,
  budget: '',
  categories: [],
  firstName: '',
  lastName: '',
  email: '',
};

/**
 * A fresh empty draft, never the shared one.
 *
 * `parseDraft` used to return `EMPTY_DRAFT` itself, which was harmless while every
 * field was a string: two callers holding the same object could not affect each
 * other. `categories` is an **array**, so they can. Handing out the shared instance
 * means `draft.categories.sort()` or `.push()` - both ordinary things to write when
 * building the register body - would mutate the module's own default, and every
 * later draft that fell back to it would come back carrying somebody else's
 * selection. Nothing does that today; the point is that nothing can.
 */
function emptyDraft(): SetupDraft {
  return { ...EMPTY_DRAFT, categories: [] };
}

export function serializeDraft(draft: SetupDraft): string {
  return JSON.stringify(draft);
}

/** A string field, or the fallback when the stored value is not one. */
function readString(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * The picked chips, filtered to names the API will accept and put back in
 * canonical order.
 *
 * Total the same way `readString` is, and canonicalised for the same reason the
 * budget is - see the note on `parseDraft` below. `RegisterDto` carries `@IsIn`,
 * `@ArrayUnique` and `@ArrayMaxSize`, so a stored array holding an unknown name, a
 * duplicate or a non-string is a guaranteed 400 on a screen with no error state
 * designed for it (A29). Dropping the unusable entries here means everything this
 * module hands out is something the picker could have produced itself.
 *
 * Filtering `STARTER_CATEGORIES` rather than the stored array is what does three
 * jobs at once: it drops the unknown, collapses the duplicated, and returns the
 * survivors in the designed order, so two identical selections serialize to
 * identical strings whatever order they were clicked in.
 *
 * An empty array is preserved rather than treated as absent. Deselecting every chip
 * is a valid choice (A4), and falling back to a default would silently undo it.
 */
function readCategories(source: Record<string, unknown>): StarterCategoryName[] {
  const stored = source.categories;
  if (!Array.isArray(stored)) return [];

  const picked = new Set(stored);
  return STARTER_CATEGORIES.filter((category) => picked.has(category.name)).map(
    (category) => category.name,
  );
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
 *
 * The picked categories get the same treatment for the same reason, which
 * `readCategories` above records.
 */
export function parseDraft(raw: string | null): SetupDraft {
  if (raw === null) return emptyDraft();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyDraft();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return emptyDraft();
  }

  const source = parsed as Record<string, unknown>;
  return {
    currency: readString(source, 'currency', DEFAULT_CURRENCY),
    budget: formatAmountInput(readString(source, 'budget', '')),
    categories: readCategories(source),
    firstName: readString(source, 'firstName', ''),
    lastName: readString(source, 'lastName', ''),
    email: readString(source, 'email', ''),
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

/** Whether a name field is filled (REG-2), matching the DTO's `@IsNotEmpty()`. */
export function isNameValid(name: string): boolean {
  return name.trim() !== '';
}

/**
 * One `@`, a dot in the domain, no whitespace.
 *
 * Deliberately looser than `RegisterDto`'s `@IsEmail()`, which is validator.js and
 * is the authority. Matching it would mean either a validation dependency for one
 * field or a copy of its expression that rots silently, so the addresses this
 * accepts and the backend rejects land on the form-level message instead of the
 * inline one - which is the trade PET-11's plan records.
 */
export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * The draft as the register request body (REG-4, A32).
 *
 * The one boundary where `budget` stops being a display string and becomes a
 * number, and the one place the three text fields are trimmed.
 *
 * The email is **not** lowercased. `RegisterDto` carries
 * `@Transform(normalizeEmail)`, so normalisation has an owner; doing it here too
 * would be a second authority that can drift from it.
 *
 * `monthStartDay` is omitted rather than defaulted: onboarding never asks for it,
 * and the backend applies its own default.
 */
export function toRegisterBody(draft: SetupDraft): components['schemas']['RegisterDto'] {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim(),
    currency: draft.currency,
    monthlyBudget: parseAmountInput(draft.budget),
    categories: draft.categories,
  };
}
