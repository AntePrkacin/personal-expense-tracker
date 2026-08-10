import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';
import { toQuery } from '@/lib/transactionQuery';
import type { TransactionFilters } from '@/lib/transactions';

// The filter bar's state, as it lives in the address bar (TRN-3, AC3 to AC5).
//
// **PET-30 left the choice open and this is it: `searchParams`, not client state.**
// `page.tsx` already had the shape for it - `readTransactionsView(filters)` takes exactly
// this object - so the URL becomes the one place the filters live, and the table stays a
// Server Component with one read path instead of two. What that buys beyond tidiness: a
// filtered view survives a reload, can be linked to, and comes back from the Back button.
//
// **The keys are the backend's own parameter names, verbatim.** `search`, `categoryId`,
// `period`, `sort`. Renaming them here - `category` for `categoryId`, say - would make this
// module a translation layer, and the reason `TransactionFilters` is read out of
// `operations` rather than declared is precisely that the frontend does not keep a second
// vocabulary for the same four things. It also means `filterHref` can hand the same
// `toQuery` the API request uses to the address bar, so the two are one string rather than
// two implementations that happen to agree.
//
// **Validation is not defensive, it is load-bearing.** Every one of these four keys is
// validated by `backend/src/transactions/dto/list-transactions-query.dto.ts` and answers
// **400** when it fails - `@IsIn` on the two enums, `@IsUUID` on the category, `@MaxLength(200)`
// on the search. `authorizedGet` collapses everything non-401 into `unavailable`, and
// `readTransactions` throws on that, so a single junk query parameter is not an ignored
// filter, it is the whole screen replaced by the error boundary. `?sort=lol` has to become
// `{}` here or it takes `/transactions` down. (Until PET-21 added `app/error.tsx` the page
// it was replaced by was Next's built-in one, which made this worse and not better.)
//
// The same call `parseReason` makes about its query parameter and `parseDraft` makes about
// sessionStorage: the value is typed by whoever is holding the address bar.

/** What Next hands a page as its resolved `searchParams`. A repeated key arrives as an array. */
export type TransactionSearchParams = Record<string, string | string[] | undefined>;

/**
 * Every value the contract's `period` accepts, which since PET-72 is **not a closed set**.
 *
 * It was `'current' | 'previous' | 'all'`, a real enum in the spec. PET-72 widened it to accept a
 * period `start` in `YYYY-MM-DD` as well, so that the period select can reach further back than
 * "last month" - and no enum can express "these three literals or any date". The contract publishes
 * a `pattern` instead, which `openapi-typescript` renders as `string`.
 */
type Period = NonNullable<TransactionFilters['period']>;

/**
 * The three period values that are **named** rather than dated.
 *
 * Declared here because the contract can no longer declare it: this is the closed half of an open
 * field, and it is what the select's options are proved exhaustive against. Restating three literals
 * is the price of that proof, and the alternative - dropping the proof - is what would let a fourth
 * named value ship with no option for it. A date value is deliberately not representable here; it
 * comes from `GET /api/periods` and reaches this file only as a raw string.
 */
type NamedPeriod = 'current' | 'previous' | 'all';

type Sort = NonNullable<TransactionFilters['sort']>;

/** One entry in a filter select. Matches `ui/Select`'s option shape, though these are not Selects. */
export type FilterOption<T extends string> = { value: T; label: string };

/**
 * The period select's three options (TRN-3).
 *
 * **This amends A16**, which records that Figma never draws the dropdown open, so only the
 * closed "This month" is known. Shipping one option would leave AC4's period half
 * unimplementable and the control as inert as it was before, so the list is the contract's
 * own `current | previous | all` and nothing invented on top - every option is one the API
 * can honour. The labels are ours and owe a designer's sign-off with the rest of what A29
 * tracks.
 *
 * `as const satisfies` rather than an annotation, for the reason `STARTER_CATEGORIES`
 * records: an annotation widens `value` to the union and the exhaustiveness proof below
 * stops being able to see what is missing.
 */
export const PERIOD_OPTIONS = [
  { value: 'current', label: 'This month' },
  { value: 'previous', label: 'Last month' },
  { value: 'all', label: 'All time' },
] as const satisfies readonly FilterOption<NamedPeriod>[];

/**
 * The sort select's two options (TRN-3, A16).
 *
 * Two rather than four: the contract sorts by date only, so "Highest amount" would be an
 * option the API cannot serve. Same amendment as the periods above.
 */
export const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
] as const satisfies readonly FilterOption<Sort>[];

/**
 * Compile-time proof that every value the contract accepts is offered.
 *
 * `AssertNever` fails to instantiate for anything but `never`, so a fourth *named* period added to
 * the backend breaks `npm run build` rather than shipping a filter nobody can reach. The reverse
 * needs no guard - `satisfies` already rejects a value the contract does not accept. The
 * technique and its reasoning are `app/setup/starterCategories.ts`'s; these are its second
 * and third users.
 *
 * **PET-72 rewrote the period half of this pair, and what it proves is genuinely weaker.** The
 * assertion used to read `Exclude<Period, ...>`, against a `Period` that was a three-member union;
 * widening the field to accept a date made that type `string`, so `Exclude` yielded `string` and the
 * proof failed - the deliberate tripwire the plan expected. It is now stated against `NamedPeriod`,
 * the locally-declared closed half. That still catches a fourth named value, which is the case worth
 * catching, and it cannot catch a change to the *date* form, which no type could express. The
 * `Period`-typed parse below is what keeps the open half honest at runtime.
 */
type AssertNever<T extends never> = T;

export type EveryNamedPeriodIsOffered = AssertNever<
  Exclude<NamedPeriod, (typeof PERIOD_OPTIONS)[number]['value']>
>;

export type EverySortIsOffered = AssertNever<Exclude<Sort, (typeof SORT_OPTIONS)[number]['value']>>;

/**
 * The backend's own defaults, and the one thing in this file that is restated rather than read.
 *
 * `DEFAULT_PERIOD` and `DEFAULT_SORT` in
 * `backend/src/transactions/dto/list-transactions-query.dto.ts` are the source of truth.
 * `openapi-typescript` publishes an OpenAPI `default:` as documentation and not as a value, so
 * there is nothing in `types/api.d.ts` to read them out of - unlike the two unions above,
 * which are real literal types. If they ever drift, the symptom is a select rendering a value
 * the list is not actually sorted by.
 *
 * They exist here because **the parsed filters are sparse and the rendered selects are not**:
 * a bare `/transactions` parses to `{}`, and a select needs a resolved value or it renders
 * blank on the app's most common URL.
 */
export const DEFAULT_PERIOD: Period = 'current';
export const DEFAULT_SORT: Sort = 'date_desc';

/** `@MaxLength(200)` on the DTO's `search`. Anything longer is a 400, so it is cut rather than sent. */
const SEARCH_MAX_LENGTH = 200;

/** `@IsUUID()` on the DTO's `categoryId`. Any version, since the DTO does not pin one. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The first value of a possibly-repeated key.
 *
 * `?period=all&period=current` is one address-bar edit away and arrives as an array, which
 * would serialize back out as `all,current` and fail `@IsIn`. Note
 * `app/auth/verify/failed/page.tsx` types its own `searchParams` as `{ reason?: string }`,
 * which quietly assumes this never happens; that narrowing is not copied here.
 */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isPeriod(value: string | undefined): value is Period {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

function isSort(value: string | undefined): value is Sort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/**
 * The URL's filters, with anything the API would reject dropped.
 *
 * **An invalid value is dropped rather than corrected**, so it falls back to the backend's
 * own default and the page renders. The alternative - substituting `current` for a junk
 * period - shows the same screen while claiming the URL said something it did not, and the
 * select would then disagree with the address bar.
 *
 * The returned object is sparse: a key is present only when it is both valid and not the
 * backend's default's business to supply. That is what keeps one view at one URL.
 */
export function parseTransactionFilters(params: TransactionSearchParams): TransactionFilters {
  const filters: TransactionFilters = {};

  const search = one(params.search)?.trim().slice(0, SEARCH_MAX_LENGTH);
  if (search) {
    filters.search = search;
  }

  const categoryId = one(params.categoryId);
  if (categoryId !== undefined && UUID_PATTERN.test(categoryId)) {
    filters.categoryId = categoryId;
  }

  const period = one(params.period);
  if (isPeriod(period)) {
    filters.period = period;
  }

  const sort = one(params.sort);
  if (isSort(sort)) {
    filters.sort = sort;
  }

  return filters;
}

/**
 * Where a change to one filter navigates to.
 *
 * **A default is written as the absent key, never as `?period=current`.** `toQuery` already
 * drops anything blank, the backend already applies both defaults, and one view must not have
 * two URLs - a shared link and a freshly reset bar would otherwise differ by a string nobody
 * can see the effect of. So resetting a filter is `undefined`, not the default's value.
 *
 * The path comes from `SIDEBAR_HREFS`, which `frontend/src/app/CLAUDE.md` calls the single
 * declaration of the four app routes, rather than a literal `/transactions`. `SidebarNav` is
 * already a client component importing from that module, so this costs the bundle nothing new.
 */
export function filterHref(filters: TransactionFilters): string {
  return `${SIDEBAR_HREFS.transactions}${toQuery(filters)}`;
}
