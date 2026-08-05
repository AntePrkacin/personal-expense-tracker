import type { TransactionFilters } from '@/lib/transactions';

// The list read's query string, in the one place both sides of it can reach.
//
// **This is a module rather than a function inside `lib/transactions.ts` because of the
// client boundary.** PET-29 puts the same filters in the address bar that PET-28's read
// puts in the request, and the whole point of that is the two being one string rather
// than two implementations that agree today. But the filter bar and the search field are
// client components, and `lib/transactions.ts` reaches `next/headers` through
// `authorizedGet` - so importing the builder from there is not a style question, it is
// the "you're importing a component that needs next/headers" build error.
//
// So the builder sits here, pure and importable from either side, and
// `lib/transactions.ts` reads it out of this file. Same split, and the same reasoning,
// as `lib/date.ts` against `lib/format.ts`: the wire form is its own concern and must not
// drag a rendering dependency along with it.
//
// The type still comes from `lib/transactions.ts`, which reads it off the contract. A
// **type-only** import, so nothing at runtime crosses back and the client bundle stays
// clean - `import type` is erased entirely.

/**
 * The filters as a query string, omitting anything blank.
 *
 * An empty `search` is dropped rather than sent. The backend trims it and applies no
 * predicate either way, so this is about the request being readable in a network log -
 * and, since PET-29, about `/transactions` having exactly one URL for the default view
 * rather than one per way of spelling it.
 */
export function toQuery(filters: TransactionFilters): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }

  return query.size > 0 ? `?${query}` : '';
}
