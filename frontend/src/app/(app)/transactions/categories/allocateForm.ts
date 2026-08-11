import type { CategoryColour, IconName } from '@/components/ui/categoryColour';
import { formatAmountInput, parseAmountInput } from '@/lib/format';
import type { Allocation, Category } from '@/lib/categories';
import { withoutFallback } from '@/lib/fallbackCategory';
import type { components } from '@/types/api';

import { isCapValid } from './categoryForm';

/**
 * The Allocate budget modal's arithmetic, with no DOM and no React in it.
 *
 * `categoryForm.ts`'s precedent: the rules a reviewer would want pinned live in a module a fast
 * suite can drive directly, so the modal is left holding state and markup. Everything here is
 * pure.
 *
 * **Every figure is computed in integer cents, and the conversion happens in exactly two places** -
 * `toAllocateLedger` and `capCents` on the way in, `toAllocateBody` on the way out. Floats drift in
 * both directions and neither drift is hypothetical at the scale of a monthly budget: `budget -
 * sum(others)` yields `349.99999999`, and `4.02 * 100` is `401.99999999999994`, which is why the
 * conversion rounds rather than truncates - the same call `backend/src/common/money.ts` makes, for
 * the same reason.
 *
 * **No `BigInt` is needed and none should be added.** `@Max(1_000_000_000)` per cap is 1e11 cents;
 * sixty-four categories is 6.4e12, comfortably inside `Number.MAX_SAFE_INTEGER`.
 */

/** One editable row: the category it belongs to, and its cap as the field's own display string. */
export type AllocateRow = {
  id: string;
  name: string;
  color: CategoryColour;
  icon: IconName | null;
  /** The display string, e.g. `'1,250.50'`. Blank means uncapped. */
  cap: string;
  /** Major units spent this period, for the row's caption. Never edited. */
  spent: number;
};

export type AllocateDraft = AllocateRow[];

/**
 * The two figures every ceiling and every total is derived from.
 *
 * `reservedCents` is the cap held by categories the modal does **not** draw. See
 * `toAllocateLedger` for why it is derived rather than read off the fallback.
 */
export type AllocateLedger = {
  budgetCents: number;
  reservedCents: number;
};

type UpdateCategoryCapsBody = components['schemas']['UpdateCategoryCapsDto'];

/**
 * The most rows one request may carry, mirroring `UpdateCategoryCapsDto`'s own
 * `MAX_CAPS_PER_REQUEST`.
 *
 * **A literal restating a backend bound, which this repo does in exactly one other place and for
 * the same reason.** `app/setup/draft.ts`'s `MAX_PICKED_CATEGORIES` caps the stored draft against
 * `RegisterDto`'s `@ArrayMaxSize` the same way, because the bound is published as OpenAPI
 * `maxItems` and `openapi-typescript` drops every JSON Schema constraint - so there is nothing to
 * read it out of, and `docs/agents/api-contract.md`'s "never restate a contract locally" rule has
 * no alternative to offer. That file records the exception.
 *
 * **It is not a second enforcement, it is what makes the 400 sayable.** Without it a payload of
 * 101 rows is a `@ArrayMaxSize` rejection classified as `invalid`, whose copy asks the user to
 * check amounts that are all perfectly valid - advice that can never work, on a screen offering no
 * way to submit a subset. The modal checks this before sending so the message can name the real
 * limit instead.
 */
export const MAX_CAP_ROWS = 100;

/** Major units to integer cents. `Math.round`, not `Math.trunc` - see the module note. */
function centsOf(major: number): number {
  return Math.round(major * 100);
}

/**
 * The rows the modal draws, which is every category except the fallback.
 *
 * **`Uncategorized` is excluded deliberately, and this extends an existing limitation rather than
 * creating one.** `CategoryCard` already draws no kebab and no banner on that row, because `PATCH`
 * refuses to rename it and `DELETE` refuses to remove it, so nothing is drawn on it that cannot be
 * acted on - which means it was already the one category whose cap the UI could not set, and
 * `frontend/CLAUDE.md` records that cost. The API does accept a cap on it, so a cap set through
 * another client is real and is what `reservedCents` exists to account for.
 *
 * Backend order is preserved (name ascending, id tiebreak), so the rows read in the same order as
 * the cards behind the modal.
 *
 * **The filter itself moved to `lib/fallbackCategory.ts` at PET-48** and this delegates to it. The
 * name stays because it says something true here that the shared spelling cannot - these are the
 * rows a budget can be *allocated* to - which is `lib/amount.ts`'s recorded call about the same kind
 * of lift: one copy of each rule to fix, deliberately not one vocabulary.
 */
export function allocatableCategories(categories: Category[]): Category[] {
  return withoutFallback(categories);
}

/**
 * The budget and the cap held by rows the modal does not draw.
 *
 * **`reservedCents` is derived rather than read off the fallback, and the difference is not
 * pedantry.** `allocation.allocated` is the sum of *every* live cap, the fallback's included, so
 * subtracting the visible rows' caps leaves exactly the caps of the excluded ones:
 *
 *     reservedCents = allocatedCents - Σ visible capCents = Σ excluded capCents
 *
 * That is exact rather than approximately exact, because every figure on the wire is a safe integer
 * divided by 100, so `centsOf` inverts `fromCents` without loss. And it stays correct if the row
 * filter ever widens - an archived-category flag, a per-row exclusion - where a constant reading
 * "the fallback's cap" would silently under-count and start the ledger disagreeing with the
 * backend's own `unallocated`.
 *
 * Takes the whole list rather than the filtered one, because the sum it subtracts has to be over
 * the rows that will actually be drawn.
 */
export function toAllocateLedger(allocation: Allocation, categories: Category[]): AllocateLedger {
  const visibleCents = allocatableCategories(categories).reduce(
    (total, category) => total + (category.monthlyCap === null ? 0 : centsOf(category.monthlyCap)),
    0,
  );

  return {
    budgetCents: centsOf(allocation.monthlyBudget),
    reservedCents: centsOf(allocation.allocated) - visibleCents,
  };
}

/**
 * The prefill, one row per drawable category.
 *
 * The cap is formatted so the field starts holding a string it could itself have produced, which is
 * `toCategoryFormValues`' rule and what keeps the first keystroke behaving like the tenth.
 */
export function toAllocateDraft(categories: Category[]): AllocateDraft {
  return allocatableCategories(categories).map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color as CategoryColour,
    icon: category.icon as IconName | null,
    cap: category.monthlyCap === null ? '' : formatAmountInput(category.monthlyCap.toFixed(2)),
    spent: category.spent,
  }));
}

/**
 * A field's cap in cents, or `null` for a row that carries none.
 *
 * **`NaN` answers `null`, and that is a statement about the ledger only.** `formatAmountInput`
 * preserves a lone `'.'` and a trailing point, because deleting the character the user just typed
 * is the most infuriating possible behaviour - so a field mid-type can hold a string naming no
 * amount. Such a row contributes nothing to the totals, which is the same answer as blank.
 * `invalidRows` still rejects it, so it can never reach the wire and silently uncap a category.
 */
export function capCents(cap: string): number | null {
  if (cap.trim() === '') {
    return null;
  }

  const major = parseAmountInput(cap);

  return Number.isFinite(major) ? centsOf(major) : null;
}

/**
 * How far a row's spend exceeds the cap currently drafted for it, in cents, or `null`.
 *
 * Lives here rather than in the modal so the comparison happens in cents like every other figure -
 * inline, it would be the one place on this screen comparing two floats - and so the row's caption
 * is drivable without a DOM. An uncapped or unparseable field answers `null`: there is no cap to be
 * over.
 */
export function overCents(row: AllocateRow): number | null {
  const cap = capCents(row.cap);

  if (cap === null) {
    return null;
  }

  const spent = centsOf(row.spent);

  return spent > cap ? spent - cap : null;
}

/** What the ledger's "Assigned to categories" reads, including the rows not drawn. */
export function assignedCents(draft: AllocateDraft, ledger: AllocateLedger): number {
  return draft.reduce((total, row) => total + (capCents(row.cap) ?? 0), ledger.reservedCents);
}

/** The three whole-dollar figures the summary island prints. See `toAllocateTotals`. */
export type AllocateTotals = {
  budgetWhole: number;
  assignedWhole: number;
  /** What "Left to assign" reads. **Never negative**, which is the whole of the design's rule. */
  unassignedWhole: number;
};

/**
 * The ledger as displayed: **rounded once, with the remainder derived from the rounded pair.**
 *
 * `dashboard/BudgetCard.tsx` and `SpendingSummaryCard.tsx` both state this rule and a review of
 * PET-70 found this modal breaking it. The three figures sit in one column with a rule above the
 * total, so a reader reads them as a sum - and rounding each independently lets that sum be wrong by
 * a dollar. A budget of `$2,000.50` against caps of `$1,000.25` printed "Monthly budget $2,001 /
 * Assigned $1,000 / Unassigned $1,000", which is $2,000 under a stated $2,001. Reachable with a
 * whole budget too, since a cap may carry cents.
 *
 * So the two independent figures round and the third is their difference, which makes the column
 * add up by construction rather than by luck. `unassignedWhole` keeps the clamp `unassignedCents`
 * carried, for the same reason: the design's rule is that this figure never goes negative, and the
 * stale-ledger case is the one that can otherwise make it.
 *
 * Deliberately **not** derived by rounding `budgetCents - assignedCents`: that is the version this
 * replaces. The clamp is applied to the rounded difference and stays out of `ceilingCents`, which
 * computes its own sum in cents from scratch for exactly that reason.
 */
export function toAllocateTotals(draft: AllocateDraft, ledger: AllocateLedger): AllocateTotals {
  const budgetWhole = Math.round(ledger.budgetCents / 100);
  const assignedWhole = Math.round(assignedCents(draft, ledger) / 100);

  return {
    budgetWhole,
    assignedWhole,
    unassignedWhole: Math.max(0, budgetWhole - assignedWhole),
  };
}

/**
 * The largest cap row `index` may hold: the budget, less everything that is not this row.
 *
 * **Written as "excluding row `index`" rather than as "the remainder plus this row's own cap".**
 * The two are equal, and only this form is safe: the remainder the footer prints is clamped at
 * zero, so deriving a ceiling from it would let that clamp leak into the arithmetic the moment
 * somebody refactored the obvious way.
 *
 * **A consequence worth knowing, because it is what makes the design's promise hold.** For any row
 * `j`, `ceilingCents(j) >= capCents(draft[j])` as long as the caps sum within the budget - and
 * `applyCap` is the only writer and maintains exactly that. So the snap can only ever clamp the row
 * being typed into, never reach across and lower a row the user is not touching. On open the same
 * inequality is strict, because the Allocate action renders only while `unallocated > 0`.
 */
export function ceilingCents(draft: AllocateDraft, index: number, ledger: AllocateLedger): number {
  const others = draft.reduce(
    (total, row, at) => (at === index ? total : total + (capCents(row.cap) ?? 0)),
    0,
  );

  return Math.max(0, ledger.budgetCents - ledger.reservedCents - others);
}

/**
 * Writes a cap, snapping it down to the row's ceiling when it would overrun the budget.
 *
 * Returns the ceiling in cents when a snap happened, so the caller can say why; `null` otherwise.
 *
 * **The snapped value is re-formatted rather than written raw**, so it is a string the field could
 * have produced itself - `toCategoryFormValues`' rule again, and what makes the snap idempotent:
 * typing another digit onto a snapped value is truncated back by `formatAmountInput`, so it takes
 * the no-snap branch and does not announce a second time.
 *
 * `raw` arrives already formatted by `reformatAmountInput`. Re-running `formatAmountInput` is free
 * because it is idempotent, which `lib/format.test.ts` pins.
 *
 * **A ceiling of zero clears the field instead of writing `0.00`, and that case was found in a
 * browser rather than by any gate.** Snapping to the ceiling literally, the way the design system's
 * own version does, writes a cap of zero - which `isCapValid` and `@IsPositive()` both reject, so the
 * app would plant an invalid value the user never typed and then answer "Enter an amount greater than
 * 0" as though they had. Blank is both valid and the truthful state: there is nothing left to give
 * this category, so it has no limit. The caller says why, which is what `snappedToCents === 0`
 * distinguishes.
 */
export function applyCap(
  draft: AllocateDraft,
  index: number,
  raw: string,
  ledger: AllocateLedger,
): { draft: AllocateDraft; snappedToCents: number | null } {
  const formatted = formatAmountInput(raw);
  const wanted = capCents(formatted);
  const ceiling = ceilingCents(draft, index, ledger);

  const write = (cap: string): AllocateDraft =>
    draft.map((row, at) => (at === index ? { ...row, cap } : row));

  if (wanted === null || wanted <= ceiling) {
    return { draft: write(formatted), snappedToCents: null };
  }

  if (ceiling === 0) {
    return { draft: write(''), snappedToCents: 0 };
  }

  return {
    draft: write(formatAmountInput((ceiling / 100).toFixed(2))),
    snappedToCents: ceiling,
  };
}

/**
 * The ids of rows whose cap names no usable amount, all of them at once.
 *
 * `invalidFields`' rule: a form must be able to show every offending row rather than stopping at
 * the first. `isCapValid` is reused rather than restated, so a blank field stays valid - an
 * uncapped category is a first-class choice - while a typed `0` and a lone `'.'` are not.
 */
export function invalidRows(draft: AllocateDraft): string[] {
  return draft.filter((row) => !isCapValid(row.cap)).map((row) => row.id);
}

/**
 * The body, carrying only the rows whose cap actually changed.
 *
 * **Compared in cents, not on the display string.** `'250'` and `'250.00'` are the same cap, and a
 * string comparison would report an edit the user did not make - which would also defeat the
 * modal's close-without-a-request path for an untouched form.
 *
 * **A blank field sends `null`**, the only way a capped category becomes uncapped, and the
 * asymmetry with `toCreateCategoryBody` is the same one rule stated against two DTOs:
 * `CreateCategoryDto` reads an absent cap as "no cap" and does not accept `null` at all, while this
 * endpoint requires the field on every entry and reads `null` as "clear it".
 *
 * **Call `invalidRows` first.** A row holding junk answers `null` from `capCents`, which would
 * serialise as a deliberate uncapping.
 */
export function toAllocateBody(
  original: AllocateDraft,
  draft: AllocateDraft,
): UpdateCategoryCapsBody {
  const changed = draft.filter((row, index) => {
    const was = original[index];
    return was !== undefined && capCents(row.cap) !== capCents(was.cap);
  });

  return {
    categories: changed.map((row) => {
      const cents = capCents(row.cap);
      return { id: row.id, monthlyCap: cents === null ? null : cents / 100 };
    }),
  };
}

/**
 * Whether anything would be sent.
 *
 * Derived from `toAllocateBody` rather than comparing again, so the button's enabled state and the
 * request can never disagree about what counts as a change.
 */
export function isDirty(original: AllocateDraft, draft: AllocateDraft): boolean {
  return toAllocateBody(original, draft).categories.length > 0;
}
