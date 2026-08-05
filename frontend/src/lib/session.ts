import { cookies } from 'next/headers';

import type { components } from '@/types/api';

// The session: the cookie PET-52 named, the one read behind it, and the seam that
// branches on it.
//
// **The backend reads no cookies at all, by design.** So the credential lives in a
// first-party cookie the frontend owns and is lifted into an `Authorization: Bearer
// <token>` header server-side on every read. Nothing about it ever reaches the browser's
// JavaScript, which is AC6 and is the whole reason the cookie is httpOnly and every
// caller here is a Server Component or a route handler.
//
// **There used to be a second seam here, `requireSession()`, and it is deliberately
// gone.** It was the `(app)` shell's gate, and the shell also needed the profile - so it
// made two guarded requests where the second already implied the first's answer, and
// treating any absent profile as "not signed in" produced a redirect loop between
// `/dashboard` and `/login`. `lib/profile.ts` now gates and reads in one call, which is
// where that reasoning is written up. Nothing else ever called `requireSession()`, so
// keeping it would have been an exported function with no consumer.
//
// What remains is the fact three routes outside the shell branch on. They want an answer
// rather than a redirect, because both of their destinations are legitimate: `/` renders
// Welcome or sends you to the Dashboard, and `/login` and `/setup` offer a flow or skip
// it. `readSession()` below is the read behind it, kept separate from the exported
// function so a future caller has to say which of the two it means.

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
 * Why an authorized read did not produce a body.
 *
 * The distinction is the whole point rather than extra structure, and `lib/profile.ts`
 * documents the loop that came from collapsing it: `unauthenticated` is an ordinary
 * signed-out visitor and belongs in the access flow, while `unavailable` is a backend that
 * could not answer, where redirecting anywhere is a guess. Each caller keeps its own policy
 * over the two - `hasSession()` answers false to both, `requireProfile()` redirects on the
 * first and throws on the second.
 */
export type AuthorizedFailure = 'unauthenticated' | 'unavailable';

export type AuthorizedResult<T> = { ok: true; data: T } | { ok: false; reason: AuthorizedFailure };

/**
 * GETs a guarded endpoint with the session lifted into an `Authorization` header.
 *
 * **The one place the cookie becomes a bearer token**, which is why it lives in this file
 * rather than beside `postAccepted` in `lib/backend.ts`: that module serves the two
 * pre-session writes and sends no credential at all, and importing `SESSION_COOKIE` into it
 * would point the dependency back at this file and make a cycle. The split is by credential,
 * not by HTTP verb.
 *
 * **It exists because there were about to be three copies of it.** `readSession()` below and
 * `readProfile()` in `lib/profile.ts` each inlined the same six lines, and
 * `components/ui/utilities.test.ts` sets this repo's rule for that situation: duplicated
 * rather than shared, and lifted into a helper when a third consumer appears.
 * `lib/transactions.ts` is the third.
 *
 * **A 401 is the only status that means signed out**, because every caller's route is guarded
 * and the guard answers nothing else. Everything else - a 500, an unreachable backend, a body
 * that will not parse - is `unavailable`: something is wrong that the user cannot fix by
 * signing in again.
 *
 * `cache: 'no-store'` on every read, without exception. The credential never leaves the
 * server, so nothing about any of these responses may be reused across requests - the rule
 * `docs/agents/api-contract.md` sets - and a cached session read would keep answering for one
 * that has since expired or been revoked.
 *
 * A missing cookie costs no round trip, which is the common case for every signed-out
 * visitor.
 *
 * @param path the backend path including its `/api` prefix and any query string
 */
export async function authorizedGet<T>(path: string): Promise<AuthorizedResult<T>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, reason: 'unauthenticated' };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      // Never forwarded as a cookie: the backend reads none, so the value moves into the
      // header here, server-side, where the browser cannot see it happen.
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (response.status === 401) {
      return { ok: false, reason: 'unauthenticated' };
    }

    if (!response.ok) {
      return { ok: false, reason: 'unavailable' };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    // Unreachable backend, DNS, a dropped connection, or a body that would not parse. All
    // "could not ask", none of them "not signed in".
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * What a guarded write reports back.
 *
 * **Deliberately not `AuthorizedResult`**, and the difference is the reason this type
 * exists. That one collapses every non-401 into `unavailable`, which is right for a read -
 * a caller that could not get its data has one thing to say about it - and wrong for a
 * write, where the statuses mean genuinely different things to the person who pressed the
 * button. `POST /api/transactions` answers 400 when the body was rejected, 404 when the
 * `categoryId` names no category of theirs, and 401 when the session died with the form
 * open; those want three different messages, and one of them must not say "try again"
 * because retrying an unacceptable body loops forever.
 *
 * So the status travels, and the caller classifies. **An absent `status` means the request
 * never completed** - the convention `lib/backend.ts` sets for `AcceptedResult` and the one
 * thing about that type its own doc calls out as not being an oversight.
 *
 * **No parsed body, which is a decision rather than laziness.** `POST /api/transactions`
 * answers 201 with the created row, and returning it looked obviously right until the
 * failure mode showed up: if a 2xx arrives with a body that will not parse - a proxy's
 * error page, a truncated response - then the transaction *exists*, and a result saying
 * otherwise would send the user to press the button again and create a second one. A write
 * that cannot be told apart from its own success is the one failure worth engineering
 * against here, so a 2xx is success on the status alone. Nothing needs the row today: the
 * modal closes and `router.refresh()` re-reads the page. PET-32 can parse it when
 * something actually reads it.
 */
export type AuthorizedWriteResult = { ok: true } | { ok: false; status?: number };

/**
 * POSTs a JSON body to a guarded endpoint with the session lifted into an `Authorization`
 * header.
 *
 * The write half of `authorizedGet`, and here for the same reason it is: the cookie
 * becomes a bearer token in one place. It sits beside that function rather than in
 * `lib/backend.ts` on the split PET-30 established - **by credential, not by HTTP verb** -
 * because `SESSION_COOKIE` lives in this file and importing it into `backend.ts` would
 * make a cycle. `postAccepted` over there stays where it is: its two callers are
 * pre-session and send no credential at all.
 *
 * It takes a `path` and so must not become a Server Action, exactly as
 * `lib/backend.ts` records about itself: `'use server'` here would publish an endpoint
 * accepting an arbitrary path. The actions that wrap it are the public surface, and each
 * one names a fixed route.
 *
 * **A missing cookie reports 401 rather than a reason of its own.** `authorizedGet` keeps
 * the two apart only to collapse them again in every caller; for a write the advice is
 * identical either way - the session is gone, sign in again - so one status keeps the
 * caller's table to four rows instead of five.
 *
 * `cache: 'no-store'` is explicit for `postAccepted`'s reason: a POST Next decided to
 * cache would silently swallow a second attempt.
 *
 * @param path the backend path including its `/api` prefix
 */
export async function authorizedPost(path: string, body: unknown): Promise<AuthorizedWriteResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, status: 401 };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    // Any 2xx. See the type's note: the row exists by now, so nothing below this line may
    // turn a created transaction into a reported failure.
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Unreachable backend, DNS, or a dropped connection. No status, which is what "the
    // request never completed" looks like - and the one case where the caller genuinely
    // cannot know whether the write landed.
    return { ok: false };
  }
}

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
 * digest that nothing can branch on, so `hasSession()` could not tell "signed out" from
 * "the network is down" - and it wants to do the same thing either way. Note this is the
 * opposite call from `lib/profile.ts`, which does separate the two: that one gates the
 * shell, where "could not ask" must not be answered by sending somebody to Log in.
 *
 * `authorizedGet` above owns the cookie read, the bearer lift, `cache: 'no-store'` and the
 * classification; this function's whole remaining job is **discarding** that classification,
 * which is the decision worth reading here rather than the six lines that used to be.
 *
 * Not exported: `hasSession()` below is the surface, and a caller wanting the raw
 * session should say so rather than reaching past it.
 */
async function readSession(): Promise<Session | null> {
  const result = await authorizedGet<Session>('/api/auth/session');

  return result.ok ? result.data : null;
}

/**
 * Whether the caller has a live session. Answers, never redirects.
 *
 * The only exported seam left here, with three call sites, all of them routes outside
 * the shell whose two destinations are both legitimate: `app/page.tsx` renders 01 Welcome or sends a signed-in visitor to the
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
