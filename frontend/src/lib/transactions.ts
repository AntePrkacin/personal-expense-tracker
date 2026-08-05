import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
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
 * The filters as a query string, omitting anything blank.
 *
 * An empty `search` is dropped rather than sent. The backend trims it and applies no
 * predicate either way, so this is about the request being readable in a network log rather
 * than about behaviour.
 */
function toQuery(filters: TransactionFilters): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }

  return query.size > 0 ? `?${query}` : '';
}

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
 * A caller that already asked for `period=all` with no filters pays one redundant request in
 * the empty case, since its first read was already the probe. No caller does today: the
 * design's period select draws "This month" and A16 leaves its other options unknown.
 * Worth a short-circuit if an "All time" option ever ships.
 */
export async function readTransactionsView(
  filters: TransactionFilters = {},
): Promise<TransactionsView> {
  const list = await readTransactions(filters);

  if (list.total > 0) {
    return { state: 'populated', transactions: list.transactions, total: list.total };
  }

  const anything = await readTransactions({ period: 'all' });

  return anything.total > 0 ? { state: 'noResults', total: 0 } : { state: 'empty', total: 0 };
}
