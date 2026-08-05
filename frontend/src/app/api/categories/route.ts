import { NextResponse } from 'next/server';

import { readCategoryOptions } from '@/lib/categories';

// The Category select's options, served on the frontend's own origin.
//
// **A route handler because the caller is the browser**, which is the same test
// `app/auth/verify/route.ts` records: an action or a Server Component cannot answer a
// `fetch()` from an already-open modal. `docs/agents/api-contract.md` fixes reads at "an
// async Server Component or a route handler", and this is the second kind.
//
// **The modal fetches on open rather than the page fetching on load**, and that is the
// decision this file exists to serve. The alternatives were each `page.tsx` reading
// categories and prop-drilling them into the trigger, or `(app)/layout.tsx` reading them
// once for the whole shell. Both pay for the request on every page load whether or not
// anybody opens the modal, both make host pages async that have no other reason to be,
// and the layout version puts a second guarded read into the shell - which is the shape
// the `/dashboard` to `/login` redirect loop came out of. This way the common case, a
// page nobody adds a transaction from, costs nothing.
//
// It publishes no capability the Categories tab will not: a GET returning the caller's
// own category names, authorised by the caller's own httpOnly cookie, which the browser
// attaches to a same-origin request without any script touching it. `BACKEND_URL` and
// the bearer token both stay server-side.
//
// **Deliberately not declared in `lib/routes.ts`.** `ACCESS_ROUTES` is the access
// screens' paths and nothing else, and its suite classifies every key into `BUILT`,
// `HANDLERS` or `PENDING` precisely so a new one cannot escape the check. Adding an
// internal data endpoint would mean a fourth category for a path no screen navigates to.
// The one string that must not drift is the fetch path in
// `(app)/AddTransactionProvider.tsx`, and that provider's suite asserts it exactly.

/**
 * No caching, at either hop.
 *
 * `lib/categories.ts` already sends `cache: 'no-store'` to the backend; this is the
 * other half, telling the browser not to reuse the response either. Without it a second
 * open in the same session could render a list that no longer matches the account - which
 * is exactly what re-fetching on every open exists to prevent.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const result = await readCategoryOptions();

  if (result.ok) {
    // An envelope rather than a bare array, matching the backend's own
    // `CategoriesResponseDto` shape. A top-level array cannot grow a sibling field
    // without every consumer changing shape with it.
    return NextResponse.json({ categories: result.data }, { headers: NO_STORE });
  }

  // No body on either failure. The modal owns the copy - A29 leaves all of it to us, and
  // one message per reason lives beside the other eight in the component - so a JSON
  // error string here would be a second place to write something the screen never reads.
  //
  // 401 travels through unchanged rather than becoming a redirect: the modal is already
  // open, and it offers a way back to Log in rather than navigating out from under a
  // half-typed form. 503 for `unavailable`, because the backend not answering is exactly
  // what that status means and it keeps the two failures distinguishable in a network log.
  return new NextResponse(null, {
    status: result.reason === 'unauthenticated' ? 401 : 503,
    headers: NO_STORE,
  });
}
