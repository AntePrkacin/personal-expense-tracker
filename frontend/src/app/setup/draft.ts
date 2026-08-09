import { formatAmountInput, parseAmountInput } from '@/lib/format';
import { isFilled, isPositiveAmount } from '@/lib/amount';
import { DEFAULT_CURRENCY } from '@/lib/money';
import type { components } from '@/types/api';

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

/**
 * What a draft starts with, re-exported from `lib/money.ts` rather than declared here.
 *
 * It said "A6: only 'USD - $' appears anywhere in the design file", which was the whole story while
 * one currency was offered and is now only half of it: PET-47 offers three, taken from the team's
 * Claude Design system, so this is the **default** rather than the only value. `lib/money.ts` owns
 * it alongside the list, because a default that lives apart from the options it defaults to is how
 * the two stop agreeing. Re-exported rather than moved outright so `BudgetForm` and `parseDraft`
 * keep importing the draft's own vocabulary from the draft.
 */
export { DEFAULT_CURRENCY };

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
   * The starter chips picked on screen 03, **by `category_templates.id`**.
   *
   * Ids since PET-64, and that reverses what this field used to say in as many
   * words: it held names, because `RegisterDto.categories` was
   * `@IsIn(STARTER_CATEGORY_NAMES)` and "an id would be a translation layer with
   * nothing on the other side of it". There is something on the other side now -
   * an admin-managed table - so a name is no longer a stable key and the API
   * takes ids.
   *
   * Plain `string[]` rather than a union, for the same reason: the offered list
   * is data, so the contract publishes no enum for it and there is nothing to
   * type this as. `RegisterDto.categories` is `string[]` too, so step 3 still
   * hands this array straight to the register body with no cast.
   *
   * Empty is a legitimate value, not a missing one: A4 enforces no minimum and a
   * user who deselects everything has made a choice (CAT-4, AC3).
   */
  categories: string[];
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
 * A hard ceiling on the stored selection, matching `RegisterDto`'s own.
 *
 * The DTO's bound is a literal for the reason that file gives - there is no
 * compile-time length once the offered list is a table - and this is the same
 * number for the same reason. Deliberately not the length of the fetched list:
 * this module is React-free and fetches nothing.
 */
const MAX_PICKED_CATEGORIES = 100;

/**
 * The picked chips, deduplicated and capped.
 *
 * Total the same way `readString` is, and canonicalised for the same reason the
 * budget is - see the note on `parseDraft` below. `RegisterDto` carries
 * `@ArrayUnique`, `@ArrayMaxSize` and `@IsUUID`, so a stored array holding a
 * duplicate, a non-string or two hundred entries is a guaranteed 400 on a screen
 * with no error state designed for it (A29).
 *
 * **It has lost a guarantee, and this states it rather than letting it be
 * discovered.** It used to filter the canonical list, which dropped unknown
 * names, collapsed duplicates and restored the designed order in one pass - so
 * "everything this module hands out is something the picker could have produced"
 * held completely. With ids there is no canonical list here to filter against:
 * the offered set is fetched by the page, and duplicating it into a React-free
 * module would be a second authority that goes stale. So membership becomes the
 * server's to reject, and what survives is the deduplication and the cap.
 *
 * Order is the stored order rather than the designed one, for the same reason.
 * Two identical selections clicked in different orders therefore serialize to
 * different strings - which nothing depends on, since the seed orders by the
 * template's own `sort_order` backend-side.
 *
 * An empty array is preserved rather than treated as absent. Deselecting every chip
 * is a valid choice (A4), and falling back to a default would silently undo it.
 */
function readCategories(source: Record<string, unknown>): string[] {
  const stored = source.categories;
  if (!Array.isArray(stored)) return [];

  return [...new Set(stored.filter((value): value is string => typeof value === 'string'))].slice(
    0,
    MAX_PICKED_CATEGORIES,
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
  return isPositiveAmount(budget);
}

/** Whether a name field is filled (REG-2), matching the DTO's `@IsNotEmpty()`. */
export function isNameValid(name: string): boolean {
  return isFilled(name);
}

// `isEmailValid` used to sit here, beside the other two rules, and moved to
// `lib/email.ts` when PET-12 gave 23 Log in an email field of its own. That screen
// is deliberately outside `/setup` and holds no draft, so importing this module for
// one regular expression would couple the returning-user flow to onboarding. The
// two rules above stay, because both describe fields only onboarding collects.

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
