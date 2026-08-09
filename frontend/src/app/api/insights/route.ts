import { NextResponse } from 'next/server';

import { readInsights } from '@/lib/insights';

// The insight set, served on the frontend's own origin so the browser can poll it.
//
// **A route handler because the caller is the browser**, the same test
// `app/api/categories/route.ts` and `app/auth/verify/route.ts` both record: a Server
// Component renders once and a Server Action is a write, so neither can answer a `fetch()`
// from a page that is already on screen. `docs/agents/api-contract.md` fixes reads at "an
// async Server Component or a route handler", and this is the second consumer of the second
// kind.
//
// **The poll is what forces it, and `lib/insights.ts` could not serve the poll directly.**
// That module reads the httpOnly `spendifico.session` cookie through `next/headers` and uses
// the server-only `BACKEND_URL`, neither of which exists in a browser - so the page's
// `setTimeout` loop has nowhere to call but here. The alternative, a Server Action polled
// from a client component, is a write pretending to be a read.
//
// It publishes no capability the page above it does not: a GET returning the caller's own
// insight set, authorised by the caller's own httpOnly cookie, which the browser attaches to
// a same-origin request without any script touching it. `BACKEND_URL` and the bearer token
// both stay server-side.
//
// **Deliberately not declared in `lib/routes.ts`**, exactly as the categories handler is not.
// `ACCESS_ROUTES` is the access screens' paths, and its suite classifies every key into
// `BUILT`, `HANDLERS` or `PENDING` precisely so a new one cannot escape the check - an
// internal data endpoint no screen navigates to would need a fourth category. The one string
// that must not drift is the fetch path in the page's poll, and that suite asserts it
// exactly.

/**
 * No caching, at either hop.
 *
 * `authorizedGet` already sends `cache: 'no-store'` to the backend; this is the other half,
 * telling the browser not to reuse the response either. It matters more here than for the
 * categories handler: this endpoint is polled on a timer specifically to observe a value
 * changing, so a cached response would make the page skeleton forever while the run behind it
 * finished.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const result = await readInsights();

  if (result.ok) {
    // The backend's own response shape, passed through rather than projected. Unlike the
    // categories handler - which narrows a whole screen's payload down to the two fields a
    // `<select>` needs - every field here is drawn: the page already renders `summary`,
    // `insights` and `monthLabel` from the server read, and the poll's whole job is
    // replacing them with the newer set.
    return NextResponse.json(result.data, { headers: NO_STORE });
  }

  // No body on either failure. The page owns the copy, and there is not much of it: a poll
  // that fails leaves the last-good set on screen rather than rendering an error, because
  // A26 records that a failed run is invisible by contract and inventing a banner here would
  // contradict it.
  //
  // 401 travels through unchanged rather than becoming a redirect, for the reason the
  // categories handler gives: a redirect answers the poll with an HTML login page carrying a
  // 200, which the page would parse as a set. 503 for `unavailable`, because the backend not
  // answering is exactly what that status means and it keeps the two distinguishable in a
  // network log.
  return new NextResponse(null, {
    status: result.reason === 'unauthenticated' ? 401 : 503,
    headers: NO_STORE,
  });
}
