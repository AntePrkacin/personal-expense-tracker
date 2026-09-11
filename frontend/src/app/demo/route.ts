import { NextResponse } from 'next/server';

import { ACCESS_ROUTES } from '@/lib/routes';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import type { components } from '@/types/api';

import type { DemoFailureReason } from './reason';

// The shareable demo link, and the app's **second route handler that sets a session
// cookie** - `auth/verify/route.ts` was the first and, until PET-86, the only one.
//
// **The navigation is what forces a handler, not the cookie**, exactly as it does one
// route over. A Server Action sets a cookie perfectly well, but this URL is meant to be
// pasted into a README and a message and *followed*, and an action cannot answer a GET
// navigation. That also means the Welcome screen's "Try the demo" is a plain link here
// rather than a second implementation: one code path serves the button and the shared
// link both.
//
// **This is a GET with side effects, which is a real cost and is accepted knowingly.**
// Following it leases an account and may rewrite a few thousand rows, so anything that
// fetches a URL without a human deciding to - a `<Link>` prefetch, a crawler, a chat
// client building a preview - burns a lease. Three things bound it rather than one,
// because no single one of them is enough: the Welcome link sets `prefetch={false}`,
// `robots.txt` disallows this path, and the backend's `demo` throttler caps hand-outs
// per IP. What makes the residue tolerable is that a burned lease is self-healing: it
// elapses, and the next visitor's hand-out restores the account before handing it over.
//
// The alternative was a POST from a client component, which would make the link
// unshareable - and an unshareable demo link is the one thing this ticket exists to
// produce.

/** The two fields of the contract this handler consumes. Never restated by hand. */
type DemoSessionResponse = components['schemas']['DemoSessionResponseDto'];

/**
 * Which failure screen a backend status means.
 *
 * **503 is the one that is not really a failure**: every pooled account is leased right
 * now, and coming back shortly will work. It is the answer this table exists for.
 *
 * **404 means the deployment has no demo**, which is the backend's deliberate answer
 * when `DEMO_ENABLED` is off - it refuses to advertise a feature it does not have. A
 * visitor who followed a link here still deserves to be told that rather than shown a
 * generic fault.
 *
 * Everything absent from this table - a 429 from the throttler, a 500, or no response at
 * all - falls through to `failed`, whose copy claims the least.
 */
const REASON_BY_STATUS: Record<number, DemoFailureReason> = {
  404: 'disabled',
  503: 'busy',
};

// Relative `Location` on every redirect, for the reason `auth/verify/route.ts` sets out
// at length: `NextResponse.redirect()` demands an absolute URL, and neither `request.url`
// nor `request.nextUrl` is guaranteed to be the public origin behind a proxy that does
// not rewrite `Host`. Getting it wrong sends a visitor to `http://localhost:3000` and no
// local test reproduces it.
function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: path,
      // A hand-out is never the same twice - it leases a different account and
      // sets a different cookie - so nothing between here and the browser may
      // keep this response.
      'Cache-Control': 'no-store',
    },
  });
}

function failed(reason: DemoFailureReason) {
  return redirectTo(`${ACCESS_ROUTES.demoUnavailable}?reason=${reason}`);
}

export async function GET() {
  let response: Response;
  try {
    response = await fetch(`${process.env.BACKEND_URL}/api/demo/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No body at all: the endpoint takes none, and `forbidNonWhitelisted` on the
      // backend would reject anything sent anyway.
      cache: 'no-store',
    });
  } catch {
    // Unreachable backend. Deliberately **not** folded into `busy`: "every demo account
    // is in use" is a specific claim, and nothing here has heard from the pool at all.
    return failed('failed');
  }

  if (!response.ok) {
    return failed(REASON_BY_STATUS[response.status] ?? 'failed');
  }

  let session: DemoSessionResponse;
  try {
    session = (await response.json()) as DemoSessionResponse;
  } catch {
    return failed('failed');
  }

  const options = sessionCookieOptions(session.expiresAt);
  if (options === null) {
    // An expiry already past, or unparseable. Writing it anyway would set a cookie the
    // browser deletes on arrival, which looks exactly like a successful sign-in that
    // instantly signs the visitor out.
    return failed('failed');
  }

  // Straight to the Dashboard, the same landing `auth/verify/route.ts` chooses and
  // hard-coded for the same reason: it is deliberately not read from `SIDEBAR_HREFS`, so
  // two independent contracts cannot silently move together and stay wrong.
  const signedIn = redirectTo('/dashboard');
  signedIn.cookies.set(SESSION_COOKIE, session.token, options);
  return signedIn;
}
