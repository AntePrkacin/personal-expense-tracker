import type { Period } from '@/lib/periods';

// The `?period=` half of period navigation: how a period becomes a URL, and how a URL becomes a
// period again. Three pure functions and no imports but a type, which is the whole point of the file.
//
// **It is separate from `lib/periods.ts` because that module reads cookies.** `periodHref` is called
// from `(app)/PeriodSelect.tsx`, a Client Component, and the read module imports `authorizedGet`,
// which reaches `next/headers` - so importing one function from there dragged a server-only module
// into the browser bundle and `next build` refused it. The same shape `transactions/filters.ts`
// already has beside `lib/transactions.ts`: the read in one module, the query string in another that
// both halves of the app can import.
//
// The type import is erased at compile time, so it costs the client bundle nothing.

/**
 * The `?period=` value a screen should link to for a given period.
 *
 * **The current period is the absent key**, which is `transactions/filters.ts`'s own rule and holds
 * here for the same reason: one view has one URL. A dashboard linking to `?period=2026-03-01` would
 * go stale the moment that period rolled over, so the URL that means "now" has to be the one with
 * nothing in it.
 */
export function periodParam(period: Period): string | undefined {
  return period.current ? undefined : period.start;
}

/**
 * The href for a period on a given route.
 *
 * One function rather than each screen building its own query string, so the Dashboard and the
 * Categories tab cannot disagree about the parameter's name - which is the same argument
 * `filterHref` makes about the four transaction filters.
 */
export function periodHref(pathname: string, period: Period): string {
  const param = periodParam(period);

  return param === undefined ? pathname : `${pathname}?period=${param}`;
}

/**
 * The `?period=` a page was asked for, or `undefined` for the current one.
 *
 * **Validated rather than trusted, and deliberately not canonicalised.** The value is typed by
 * whoever holds the address bar, and it is forwarded to a backend that answers **400** for a date
 * that starts none of the caller's periods - which `authorizedGet` reports as `unavailable` and the
 * reads above throw on, replacing the whole screen with the error boundary. So a malformed value is
 * dropped here, where a *well-formed but unknown* one is still forwarded: this app cannot know which
 * dates are period starts without asking, and the 400 is the honest answer to a link that names a
 * period the account does not have.
 *
 * The shape check is the same `YYYY-MM-DD` the backend's own DTO requires. A repeated key arrives as
 * an array, which is dropped rather than resolved - the same call `parseTransactionFilters` makes.
 */
export function parsePeriodParam(
  searchParams: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = searchParams['period'];

  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return undefined;
  }

  return raw;
}
