import { NextResponse } from 'next/server';

import { PENDING_EMAIL_COOKIE } from '@/lib/pendingEmail';
import { ACCESS_ROUTES } from '@/lib/routes';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import type { components } from '@/types/api';

import type { VerifyFailureReason } from './failed/reason';

// The landing point of the emailed login link (VER-1, VER-4), and the repo's **first
// route handler**.
//
// **The navigation is what forces a handler, not the cookie.** A Server Action sets a
// cookie perfectly well - `registerAccount` does - but the browser *arrives at* this URL
// by following a link in an email, and an action cannot answer a GET navigation. A page
// could not do it either: a Server Component cannot write a cookie, and POSTing the
// token from a client component would drag a live credential into client-side
// JavaScript, against the mail template's own constraint that this page load no
// third-party resources and consume the token immediately.
//
// **The path is chosen by the backend**, in `backend/src/mail/login-link.template.ts`,
// which builds `${FRONTEND_URL}/auth/verify?token=<raw>`. So this folder's name is a
// contract with another app, and nothing checks the two agree - change either and every
// login email points at a 404 with no gate failing. `docs/TODO.md` records it beside the
// `LOGIN_LINK_TTL_M` coupling of the same shape.
//
// **The token is spent immediately and the response is always a redirect**, so it leaves
// the address bar on the first paint. It still reaches this server's own request log on
// the way in, which is the exposure `docs/TODO.md` records: bounded, because the token is
// single-use and is consumed by the very request that logged it.
//
// A38 designs no screen for any of this, which is why every failure lands on one screen
// of ours with a plain message and a way to request a new link.

/** The 24 characters of the contract this handler consumes. Never restated by hand. */
type VerifyBody = components['schemas']['VerifyLoginLinkDto'];
type VerifyResponse = components['schemas']['VerifyResponseDto'];

/**
 * Which failure screen a backend status means.
 *
 * **409 is the one actionable rejection** and the only reason this is a table rather
 * than a boolean: the link was replaced by a newer one, so the most recent email is the
 * one to open. That distinction exists because Gmail collapses these emails into a
 * single thread - every message has an identical sender and subject - which makes
 * clicking the older of two ordinary rather than exotic. It is distinguishable by
 * status code alone, so nothing here parses a body.
 *
 * **400 folds into `invalid` rather than getting a case of its own.** It means the token
 * was malformed, absent or oversized, which to the person holding the email is
 * indistinguishable from a link that stopped working, and the advice is identical.
 */
const REASON_BY_STATUS: Record<number, VerifyFailureReason> = {
  400: 'invalid',
  401: 'invalid',
  409: 'superseded',
  429: 'busy',
};

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');

  // No POST at all for a link with nothing in it. A body with an undefined token is a
  // guaranteed 400, and spending one of the deployment's shared per-IP verify attempts
  // to learn that would be worse than useless.
  if (!token) {
    return failed(request, 'invalid');
  }

  let response: Response;

  try {
    const body: VerifyBody = { token };

    response = await fetch(`${process.env.BACKEND_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // Backend unreachable, DNS, or a dropped connection. The link may well still be
    // live, so the copy says to try again rather than that it expired.
    return failed(request, 'failed');
  }

  if (!response.ok) {
    return failed(request, REASON_BY_STATUS[response.status] ?? 'failed');
  }

  const { token: sessionToken, expiresAt } = (await response.json()) as VerifyResponse;
  const options = sessionCookieOptions(expiresAt);

  // A session that is already over, or an unparseable instant. Writing the cookie would
  // set a Max-Age the browser deletes on arrival, which reads as a successful sign-in
  // that instantly signs the user out - so this takes the failure path instead.
  if (options === null) {
    return failed(request, 'failed');
  }

  // Hard-coded rather than read from SIDEBAR_HREFS, the same call `app/page.tsx` makes
  // about its own redirect: this string and the sidebar's `/dashboard` href are two
  // independent halves of one contract, and sharing a constant would let them move
  // together and stay wrong. VER-4 lands both a new and a returning account here.
  const signedIn = NextResponse.redirect(new URL('/dashboard', request.url));

  // Set on the response rather than through `cookies()`. Both work inside a handler, but
  // this keeps the header write and the redirect in one object, and makes the whole
  // thing assertable with no request scope - which is the entire reason
  // `lib/pendingEmail.test.ts` has to mock `next/headers` at all.
  signedIn.cookies.set(SESSION_COOKIE, sessionToken, options);

  // The link is spent, so the address screen 24 was showing is stale. Nothing cleared it
  // before this, so it simply expired - harmless, but it left a readable address around
  // for up to fifteen minutes after the account was in. `path` has to match the one it
  // was written with or the delete silently misses.
  signedIn.cookies.delete({ name: PENDING_EMAIL_COOKIE, path: '/' });

  return signedIn;
}

/**
 * The one exit for every unhappy path.
 *
 * The reason travels in the query string, which is safe here in a way it was not for
 * PET-12: that ticket replaced `/check-email?email=` because the address landed in this
 * server's request log and everywhere upstream. `?reason=superseded` is not personal
 * data and identifies nobody, so a cookie would be a mechanism with no threat behind it.
 * The screen validates the value on the way back out regardless.
 */
function failed(request: Request, reason: VerifyFailureReason) {
  const target = new URL(ACCESS_ROUTES.verifyFailed, request.url);
  target.searchParams.set('reason', reason);

  return NextResponse.redirect(target);
}
