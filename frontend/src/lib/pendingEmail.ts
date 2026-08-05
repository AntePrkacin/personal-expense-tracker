import { cookies } from 'next/headers';

import { isEmailValid } from '@/lib/email';

// How the address submitted on 22 Register or 23 Log in reaches 24 Check your
// email, which interpolates it into VER-1's copy and resends to it (VER-2).
//
// Something has to carry it: the onboarding draft is cleared on a successful
// register, which is the only natural moment to clear it, and at this screen there
// is no session yet - the whole point is that the link has not been opened.
//
// **It is a cookie because of the access log, not the address bar.** PET-11 shipped
// `/check-email?email=<encoded>`, and Next's own request log, plus any proxy or CDN
// in front of it, records the full path including the query string - so every
// registration wrote a user's email address into logs on the host and everywhere
// upstream. `history.replaceState` does not fix that: the value is logged before the
// page mounts, so stripping it after is cosmetic. Browser history and referrers were
// the secondary concern. A sessionStorage handoff would keep it out of the logs just
// as well, and was rejected for a different reason: sessionStorage does not exist on
// the server, so the interpolated address could not come from a Server Component and
// screen 24 would need a client boundary plus the `useSyncExternalStore` hydration
// dance SetupDraftProvider documents.
//
// Nothing here is a Server Action. The two that wrap `setPendingEmail` are, and
// they are the public surface; this module is the cookie's shape and nothing else.

/**
 * The cookie's name.
 *
 * Same `spendifico.` namespace as `SETUP_DRAFT_KEY`, and deliberately **not** the
 * session cookie, which is PET-52's and still unnamed anywhere in the repo. The two
 * are unrelated: this one carries an address for one screen's copy, that one carries
 * a credential. Do not merge them.
 */
export const PENDING_EMAIL_COOKIE = 'spendifico.pending_email';

/**
 * How long the address outlives its submission, in **seconds** - `maxAge` is seconds
 * and `Max-Age` is what reaches the browser.
 *
 * Chosen to mirror the login link's own lifetime, which the backend takes from
 * `LOGIN_LINK_TTL_M` (see docs/guides/configuration.md). Once the link is dead the
 * screen's promise is stale anyway, so a cookie outliving it would only keep a
 * stale address around. The frontend cannot read a backend variable, so a
 * deployment that moves that value drifts from this one: raise it and a live link
 * gets the no-address fallback, lower it and the cookie outlives the link. Both
 * degrade to copy that still reads correctly rather than to anything misleading,
 * which is what makes the duplication acceptable rather than fixed.
 */
const MAX_AGE_S = 15 * 60;

/**
 * Stashes the address screen 24 will show, replacing whatever was there.
 *
 * **Callable only from a Server Action** (or a route handler). Nothing will tell you
 * otherwise until it throws at runtime: `cookies()` resolves to a type whose `.set`
 * typechecks inside a Server Component too, and the guard is a runtime phase check
 * (`ReadonlyRequestCookiesError`) that also rejects a write deferred into a `.then`
 * or an `after()`. So call it in the action body, awaited, or not at all.
 *
 * `httpOnly` because no client code has any use for it - screen 24 renders on the
 * server. `secure` only outside development, since local dev is plain HTTP; note a
 * plain-HTTP staging host would silently drop the cookie, where localhost is exempt.
 * `sameSite: 'lax'` rather than `'strict'`, and **PET-52 needs the same value**: the
 * emailed verify link arrives as a cross-site top-level GET, which `'strict'`
 * withholds cookies from.
 */
export async function setPendingEmail(email: string): Promise<void> {
  const store = await cookies();

  store.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_S,
  });
}

/**
 * The stashed address, or `null` when there is none to show.
 *
 * `null` is an ordinary outcome rather than an error: the cookie expires, a second
 * browser has never had one, and screen 24 answers with copy that reads correctly
 * without an address (AC7) plus a way back to Log in.
 *
 * **Validated rather than trusted**, which is the same call `parseDraft` makes about
 * sessionStorage and for the same reason. `httpOnly` keeps script out, not devtools,
 * and this value is both interpolated into the screen's copy and POSTed as the
 * resend address - so anything the field could not have produced answers `null` and
 * takes the fallback, instead of rendering a hand-written string as the user's own
 * address.
 *
 * Reading it makes the calling route dynamic, which is exactly what `/check-email`
 * wants; no `export const dynamic` belongs on that page as a result.
 */
export async function readPendingEmail(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(PENDING_EMAIL_COOKIE)?.value;

  return value && isEmailValid(value) ? value : null;
}
