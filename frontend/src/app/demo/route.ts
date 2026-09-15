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
 * The two headers that make this handler the backend's only recognized caller.
 *
 * `x-demo-secret` is what `DemoSecretGuard` checks; without it the API answers 404, so a
 * visitor cannot skip this handler, call the public Cloud Run URL directly and drain the
 * pool from as many addresses as they have. `x-demo-client-ip` names the browser this
 * request is being made for, and the backend trusts it **only** once the secret has
 * matched - which is what turns the hand-out limiter from five per hour for the whole
 * internet into five per hour per visitor.
 *
 * Deliberately not `X-Forwarded-For`: `docs/TODO.md` sets out why trusting a
 * client-influenced header by raising `TRUST_PROXY_HOPS` is worse than the state it
 * would replace.
 */
const DEMO_SECRET_HEADER = 'x-demo-secret';
const DEMO_CLIENT_IP_HEADER = 'x-demo-client-ip';

/**
 * The browser this hand-out is for, as the platform reported it.
 *
 * `x-forwarded-for` is a comma-separated chain and the **first** entry is the client;
 * everything after it is a proxy. Vercel sets `x-real-ip` too and it is the simpler of
 * the two, so it is preferred and the chain is the fallback. An empty answer is not an
 * error: the backend falls back to the connecting address, which is this handler, and
 * the limiter is no worse than it was before.
 */
function clientIpOf(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) {
    return real.trim();
  }

  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
}

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
 * **429 is the throttler and is its own reason, not `busy`.** It says this visitor has
 * asked too often and says nothing at all about how many accounts are free, so borrowing
 * `busy`'s sentence would blame the pool for something the visitor did. It only became
 * worth distinguishing once the header above made the limiter count visitors: before
 * that, a 429 here meant the frontend's shared bucket was empty, which no copy could
 * honestly explain to the person reading it.
 *
 * Everything absent from this table - a 500, or no response at all - falls through to
 * `failed`, whose copy claims the least.
 */
const REASON_BY_STATUS: Record<number, DemoFailureReason> = {
  404: 'disabled',
  429: 'throttled',
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

export async function GET(request: Request) {
  let response: Response;
  try {
    response = await fetch(`${process.env.BACKEND_URL}/api/demo/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Server-side only, like `BACKEND_URL` beside it, and therefore with no
        // `NEXT_PUBLIC_` prefix: a secret with that prefix is inlined into the browser
        // bundle and is public forever. An unset value sends the header empty and the
        // backend answers 404, which is the visible failure a misconfiguration deserves.
        [DEMO_SECRET_HEADER]: process.env.DEMO_SHARED_SECRET ?? '',
        [DEMO_CLIENT_IP_HEADER]: clientIpOf(request),
      },
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
