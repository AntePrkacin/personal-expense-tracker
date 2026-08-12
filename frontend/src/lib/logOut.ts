'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { SESSION_COOKIE, authorizedPost } from '@/lib/session';

// The sidebar footer's logout control (PET-84), and the app's tenth write.
//
// **A Server Action rather than a Server Component, and that is a requirement rather than the
// usual split.** A Server Component's cookie jar is read-only: `.delete()` throws
// `ReadonlyRequestCookiesError` at runtime with nothing in the types to warn you, which is the
// trap `lib/pendingEmail.ts` records for `.set` and which `lib/session.ts` records as the reason
// nothing clears a stale cookie on a 401. An action's jar is writable, so this is where the
// cookie can actually go.
//
// **A route handler was the other candidate and is not needed.** PET-73's assistant send is one
// because a turn must be cancellable, and `/auth/verify` is one because the browser *navigates
// to* it. Neither applies: this is a button on a page the user is already on, and the whole call
// is a single fire-and-forget write.
//
// **It takes no token and no user id, and must never take either**, which is `generateInsights`'s
// rule and the reason publishing this as an action is safe: the credential comes off the httpOnly
// cookie inside `authorizedPost`, so a caller can only ever end their own session.

/**
 * How long to wait for the revoke before leaving anyway.
 *
 * Generous for what it covers - one indexed UPDATE against central - and deliberately short
 * against what it protects, which is a user standing in front of a control that has visibly done
 * nothing. See the call site for the failure this bounds.
 */
const REVOKE_TIMEOUT_MS = 2_000;

/**
 * Signs the user out, and does not come back.
 *
 * Three steps, and the **order and the missing error handling are the whole design**: ask the API
 * to revoke the session, clear the cookie whatever it answered, then redirect to Log in.
 *
 * **This is the one write in this app with no failure taxonomy, deliberately.** Every other one
 * publishes named reasons because a caller does something different per reason - see the nine
 * result types across `lib/`. Here there is nothing to do differently and nowhere to say it: the
 * surface a message would render on is being navigated away from, PET-77's own rule sends
 * `failed` and `unauthenticated` out of the form because they name nothing the user can act on,
 * and a toast cannot survive the redirect either.
 *
 * **So local sign-out is guaranteed and revocation is best effort.** Clearing the cookie only on
 * a 2xx would leave a user unable to sign out of their own browser whenever the API is
 * unreachable, on the one screen whose entire purpose is leaving. That is the worse failure by a
 * distance. A 401 needs no special case for the same reason and reaches the same three lines: the
 * session was already dead, which is exactly what the user asked for.
 *
 * The cost, stated rather than hidden: during a backend outage this is a local sign-out with a
 * live token still in the database, and the user is told it worked, because from where they stand
 * it did. **Nothing reports that**, and that is a deliberate absence rather than an oversight -
 * this app has no logging seam at all (no `console.error` anywhere under `src/`), so the choice
 * was to invent one for a line nothing reads or to record the asymmetry here. The token still
 * dies at `SESSION_TTL_D`, and `docs/TODO.md`'s manual-tombstone entry is the operator's path in
 * the meantime.
 */
export async function logOut(): Promise<void> {
  // Fire and forget in effect: the result is deliberately unread, which is what every paragraph
  // above is about. `authorizedPost` never throws - it returns `{ ok: false }` for a request that
  // never completed - so there is nothing here to catch either.
  //
  // **The timeout is what makes the guarantee above true, and a code review is why it is here.**
  // Clearing the cookie on every arm is worth nothing if the arm never arrives: a backend that
  // refuses fails in milliseconds, but one that accepts the connection and never answers - a
  // wedged machine, a proxy holding the request - would keep this `await` open for undici's 300s
  // header timeout. The user has pressed "Log out" by then and **nothing happens at all**: the
  // cookie is still set, the redirect has not run, and this control carries no pending state to
  // say so. Two seconds is far more than a single indexed UPDATE against central needs, and an
  // abort is reported as an ordinary failed write, which the two lines below already ignore.
  //
  // The cookie cannot simply be cleared first instead: `authorizedPost` reads it to get the
  // bearer, so clearing it would revoke nothing.
  await authorizedPost('/api/auth/logout', {}, { timeoutMs: REVOKE_TIMEOUT_MS });

  // `{ name, path }` rather than the bare name, matching how `/auth/verify` deletes the
  // pending-address cookie: a delete has to agree with the `path: '/'` it was written under, or
  // the browser keeps a cookie that only looks gone.
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/' });

  // Log in rather than Welcome. Both are legitimate for a signed-out visitor, and this is the one
  // with a control on it. No loop: the cookie is gone by the time that route's own `hasSession()`
  // gate runs, so it renders instead of bouncing a live session to the Dashboard.
  redirect(ACCESS_ROUTES.login);
}
