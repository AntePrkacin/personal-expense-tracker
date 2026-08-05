import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import type { components } from '@/types/api';

// The session: the cookie PET-52 named, the one read behind it, and the two seams that
// branch on it.
//
// **The backend reads no cookies at all, by design.** So the credential lives in a
// first-party cookie the frontend owns and is lifted into an `Authorization: Bearer
// <token>` header server-side on every read. Nothing about it ever reaches the browser's
// JavaScript, which is AC6 and is the whole reason the cookie is httpOnly and every
// caller here is a Server Component or a route handler.
//
// The two exported seams are separate rather than one function because their callers
// want opposite things from the same read. The `(app)` shell wants "let me through or
// send me away" and answers nothing itself; `/`, `/login` and `/setup` want a plain fact
// to branch on, because both of their destinations are legitimate. Collapsing them would
// mean the shell duplicating a redirect or the other three catching one. What they do
// share is `readSession()` below, which is the "give them a shared helper rather than
// two fetches" the stubs asked for.

/**
 * The session cookie's name.
 *
 * Same `spendifico.` namespace as `PENDING_EMAIL_COOKIE` and `SETUP_DRAFT_KEY`, and
 * deliberately a different cookie from the first of those: that one carries an address
 * for one screen's copy and this one carries a credential. Do not merge them.
 *
 * **`__Host-spendifico.session` was considered and rejected.** The prefix is the
 * hardened form - browsers enforce `Secure`, `Path=/` and no `Domain` for it - but it
 * requires `Secure` unconditionally, and `secure` is false in development here, so the
 * cookie would silently fail to set under `npm run dev`. A control that is off in the
 * one environment a developer watches is worse than the plain name.
 */
export const SESSION_COOKIE = 'spendifico.session';

/** What `GET /api/auth/session` answers. Read from the contract, never restated. */
type Session = components['schemas']['SessionResponseDto'];

/**
 * The cookie's write options, or `null` when the session is already dead.
 *
 * **The lifetime is derived from the backend's own `expiresAt` rather than mirroring
 * `SESSION_TTL_D`**, and that is the one place this improves on the cookie beside it.
 * `lib/pendingEmail.ts` hard-codes fifteen minutes to mirror `LOGIN_LINK_TTL_M`, a
 * duplication `docs/TODO.md` records as accepted-because-unfixable: the frontend has no
 * channel to a backend variable. Verify does not have that problem, because it returns
 * the instant in its response body - so there is nothing here to drift.
 *
 * `null` for anything that is not a positive number of seconds: an unparseable string,
 * or an instant already past. A cookie with a non-positive `Max-Age` is one the browser
 * deletes on arrival, so writing it would look like a successful sign-in that instantly
 * signs the user out - the caller treats `null` as a failed verify instead.
 *
 * `sameSite: 'lax'` is **required rather than chosen**: the emailed verify link arrives
 * as a cross-site top-level GET, and `'strict'` withholds cookies from exactly that.
 * `secure` only outside development, since local dev is plain HTTP; note a plain-HTTP
 * staging host would silently drop the cookie, where localhost is exempt.
 */
export function sessionCookieOptions(expiresAt: string) {
  const maxAge = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);

  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    return null;
  }

  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/**
 * Who the cookie belongs to, or `null` when nobody.
 *
 * The one read both seams share. A missing cookie, a 401 and an unreachable backend are
 * all `null`, which is the same never-throw discipline `lib/backend.ts` sets and for the
 * same reason: a rejection inside a Server Component reaches the client as an opaque
 * digest that nothing can branch on, so the two callers below could not tell "signed
 * out" from "the network is down" - and both want to do the same thing either way.
 *
 * `cache: 'no-store'` is explicit. A session read Next decided to cache would keep
 * answering for a session that has since expired or been revoked, which is the one
 * response in this app that must never be served from a cache.
 *
 * Not exported: the two functions below are the surface, and a third caller wanting the
 * raw answer should say which of them it means.
 */
async function readSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/auth/session`, {
      // The cookie is never forwarded as a cookie. The backend reads no cookies, so the
      // value has to move into the header here, server-side, where the browser cannot
      // see it happen.
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    return response.ok ? ((await response.json()) as Session) : null;
  } catch {
    // Backend unreachable, DNS, or a dropped connection. Indistinguishable from signed
    // out as far as both callers are concerned.
    return null;
  }
}

/**
 * Ensures the caller has a live session, or sends them to the access flow.
 *
 * This is PET-19's AC5 and PET-52's own: a request for a view without a valid session is
 * sent to 23 Log in rather than shown app data. Its one call site is
 * `app/(app)/layout.tsx`, so the whole shell is gated in one place.
 *
 * Returns the session, because the shell's one caller would otherwise have to read it
 * again to learn anything about who got through.
 *
 * **It does not clear a stale cookie, and that amends the specification this function
 * shipped with.** The stub's step 4 said "clear the cookie and redirect". It cannot: the
 * only caller is a layout, a Server Component, where `cookies()` is read-only and
 * `.delete()` throws `ReadonlyRequestCookiesError` at runtime with nothing in the types
 * to warn you - the same trap `lib/pendingEmail.ts` documents for `.set`. It also costs
 * almost nothing now that the cookie's own `maxAge` tracks `expiresAt`: an expired
 * session's cookie is gone from the browser before the backend would reject it. The only
 * state that leaves a live cookie holding a dead token is a manual revocation tombstone,
 * which `docs/TODO.md` describes as a hand-run operation with no user-facing path to it.
 * The cost is one wasted round trip per request until the cookie expires on its own.
 */
export async function requireSession(): Promise<Session> {
  const session = await readSession();

  if (session === null) {
    redirect(ACCESS_ROUTES.login);
  }

  return session;
}

/**
 * Whether the caller has a live session. Answers, never redirects.
 *
 * Three call sites, all of them routes outside the shell whose two destinations are both
 * legitimate: `app/page.tsx` renders 01 Welcome or sends a signed-in visitor to the
 * Dashboard (VER-4), and `app/login/page.tsx` and `app/setup/layout.tsx` send one
 * onwards rather than offering a flow they have already finished.
 *
 * Note the `cookies()` read opts each of those routes out of static rendering on its
 * own, so none of them carries an `export const dynamic` - and `/login`, which built
 * static until this landed, correctly stops doing so.
 */
export async function hasSession(): Promise<boolean> {
  return (await readSession()) !== null;
}
