import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
import { toQuery } from '@/lib/transactionQuery';
import type { components, operations } from '@/types/api';

// The transactions list read, and the one decision the API cannot make for us: which of
// three states an empty answer means.
//
// **`total` is the count after filters, and there is no unfiltered count anywhere in the
// contract.** PET-28's plan considered returning one beside it and dropped it, because no
// frame draws two numbers. So a `total` of 0 is genuinely ambiguous, and the ambiguity is
// not academic:
//
//   1. the account has nothing in it at all - frame 07, the designed empty state;
//   2. a search or a filter matched nothing - a state nobody designed (A15);
//   3. `period` defaults to `current`, so an account whose transactions all sit in an
//      earlier month answers 0 to a request carrying no filters at all.
//
// The third is the one that makes this a real problem rather than a tidiness question.
// Treating it as case 1 renders "Log your first expense" over a full history *and*, because
// TRN-3 removes the filter bar in that state, leaves no control on screen that could change
// the period to go and find it. The user is told they have no data and given no way to
// disagree.
//
// So `readTransactionsView` resolves the ambiguity with a second read rather than a guess.
// Inferring the state from whether a filter looks active was the cheaper alternative and it
// gets case 3 wrong by construction, since case 3 *has* no active filter.

/** The list read's contract: its query is the filter type, its 200 is the response type. */
type ListOperation = operations['TransactionsController_list'];

/**
 * Every filter the list read accepts, straight off the contract.
 *
 * Not restated, so `period` and `sort` carry the backend's own literal unions and a fifth
 * filter appearing in the API is a typecheck away from being usable here. `docs/agents/api-contract.md`
 * sets the rule: a caller reads its types out of `paths`/`operations` rather than declaring
 * them.
 */
export type TransactionFilters = NonNullable<ListOperation['parameters']['query']>;

type TransactionList = ListOperation['responses'][200]['content']['application/json'];

/** One row. The table, the dashboard's recent list and "Recent in {category}" all render these. */
export type Transaction = components['schemas']['TransactionResponseDto'];

/**
 * Which of the three states the page is in, resolved once on the server.
 *
 * A discriminated union rather than a list plus a couple of booleans, because the three
 * states differ in what chrome renders and not only in what data they carry: `empty` drops
 * the filter bar entirely (TRN-3) where `noResults` keeps every control on screen (A15).
 * A boolean pair would make the illegal fourth combination representable.
 *
 * `total` rides on all three so the tab badge is one expression at the call site. It is 0 on
 * both empty states by definition, since it is the count after filters.
 */
export type TransactionsView =
  | { state: 'populated'; transactions: Transaction[]; total: number }
  | { state: 'noResults'; total: 0 }
  | { state: 'empty'; total: 0 };

/**
 * One list read, or the access flow.
 *
 * The failure policy is `lib/profile.ts`'s, deliberately and for the same reason: only a 401
 * or a missing cookie means signed out, and everything else throws so Next's error boundary
 * renders something a reload retries. Redirecting an unreachable backend to `/login` is the
 * loop that file documents, and this read sits inside the same shell.
 *
 * Note the shell has already read the profile through the same guard by the time this runs,
 * so a 401 here means the session died between the two - rare, and still the right
 * destination.
 */
async function readTransactions(filters: TransactionFilters): Promise<TransactionList> {
  const result = await authorizedGet<TransactionList>(`/api/transactions${toQuery(filters)}`);

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load your transactions: the backend did not answer.');
}

/**
 * The account-wide, all-time read that tells an empty account from an empty filter.
 *
 * `period=all` is the contract's way of applying no date predicate, and no other key is set
 * because the question is not "does this filter match anything" - the first read already
 * answered that - but "does this account contain a single transaction".
 */
const PROBE: TransactionFilters = { period: 'all' };

/**
 * Whether a caller's own filters already ask the probe's question.
 *
 * `sort` is deliberately not checked. It reorders a result set and cannot change its size,
 * so "newest first" and "oldest first" answer zero together or not at all.
 */
function isProbe(filters: TransactionFilters): boolean {
  return (
    filters.period === PROBE.period &&
    (filters.search === undefined || filters.search === '') &&
    filters.categoryId === undefined
  );
}

/**
 * The page's state, from one read in the common case and two in the empty one.
 *
 * **The second read fires only when the first returns nothing**, which is what keeps this
 * honest about its cost: every page load with data on it makes exactly one request, and the
 * extra round trip is spent only on the one state that has nothing to render anyway.
 *
 * The probe deliberately sends `period=all` **and no other filter**, because the question it
 * asks is not "does this filter match anything" - the first read already answered that - but
 * "does this account contain a single transaction". Only an account-wide, all-time read
 * answers it, and `period=all` is the contract's way of applying no date predicate.
 *
 * **A caller that already asked the probe's own question does not ask it twice**, which this
 * comment used to describe as a cost worth a short-circuit "if an `All time` option ever
 * ships". PET-29 shipped it: the period select offers "All time", so `period=all` with no
 * search and no category is now a request a user can make by clicking, and its first read is
 * already the probe. Answering zero to that read *is* the account being empty, so there is
 * nothing left to find out.
 */
export async function readTransactionsView(
  filters: TransactionFilters = {},
): Promise<TransactionsView> {
  const list = await readTransactions(filters);

  if (list.total > 0) {
    return { state: 'populated', transactions: list.transactions, total: list.total };
  }

  // The condition is "these filters already are the probe", not "the period is all": a
  // search or a category narrows the read past what the probe asks, so `period=all` with
  // either of them still leaves the two cases apart - a filter matched nothing, or there is
  // nothing to match. Only the unfiltered all-time read answers both at once.
  if (isProbe(filters)) {
    return { state: 'empty', total: 0 };
  }

  const anything = await readTransactions(PROBE);

  return anything.total > 0 ? { state: 'noResults', total: 0 } : { state: 'empty', total: 0 };
}

/**
 * The current period's transaction count, for the tab badge on a screen that renders no
 * transactions (PET-36, TRN-2).
 *
 * **The Categories tab draws both badges, not just its own**, which is what makes this exist:
 * frame 13 shows "All transactions 128" beside "Categories 8", so the route that has no
 * transactions on it still has to state how many there are. `/transactions` needs no mirror of
 * this - it already reads the categories for the table's name-and-colour join, so its own
 * second badge is `categories.length` and costs nothing.
 *
 * **It is not `readTransactionsView`**, and the difference is the probe. That function fires a
 * second request when the first returns zero, to tell an empty account from an empty filter -
 * a distinction that decides which of three screens to render. A badge has no such branch: it
 * prints the number, and 0 is a perfectly good number to print. So this is one request always,
 * where the view is one or two.
 *
 * No filters, so `period` defaults to `current` and this counts the budgeting period the rest
 * of the screen is about. That matches what the badge means on `/transactions` itself, where
 * A17 was amended to "matches after the filter bar" - from here there is no filter bar, so the
 * unfiltered period count is the same question asked with nothing narrowing it.
 *
 * **A failure takes the page down rather than hiding the badge**, deliberately. The policy is
 * inherited from `readTransactions` above rather than softened here, because both reads on that
 * page hit the same backend through the same guard: an account that cannot reach it to count
 * transactions could not reach it to load the categories either, so a degraded badge would be a
 * second answer to a question the other read has already failed.
 */
export async function readTransactionCount(): Promise<number> {
  const list = await readTransactions({});

  return list.total;
}
