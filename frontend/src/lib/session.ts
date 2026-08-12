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
 *
 * **PET-34 added `missing`, and it is a third statement rather than a shade of the second.**
 * `unavailable` means the question could not be asked; `missing` means it was asked and the
 * answer is that the thing is not there. Only one read in the app can produce it -
 * `GET /api/transactions/:id`, whose own contract says a 404 always means the id in the URL -
 * so the other four readers never see the arm and keep the policy they already had, which is
 * to throw on anything that is not `unauthenticated`. The detail read calls `notFound()` on
 * it, which is the whole reason the distinction is worth carrying: collapsed into
 * `unavailable` it would throw, and a mistyped or stale URL would read as "the app is broken"
 * rather than "no such transaction".
 */
export type AuthorizedFailure = 'unauthenticated' | 'missing' | 'unavailable';

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
 * `readProfile()` in `lib/profile.ts` each inlined the same six lines, and this repo's rule for
 * that situation - duplicated rather than shared, and lifted into one owner when a third
 * consumer appears - is written down in `frontend/src/components/CLAUDE.md`.
 * `lib/transactions.ts` is the third. (This used to cite `components/ui/utilities.test.ts`,
 * which PET-57 deleted with the token layer it pinned.)
 *
 * **A 401 is the only status that means signed out**, because every caller's route is guarded
 * and the guard answers nothing else. Everything else - a 500, an unreachable backend, a body
 * that will not parse - is `unavailable`: something is wrong that the user cannot fix by
 * signing in again.
 *
 * **A 404 is the one exception to that, and it is `missing`.** Three of the five reads here
 * are on routes that cannot answer one at all, so the arm costs them nothing; the fourth,
 * `GET /api/transactions`, answers an empty list rather than a 404 for a filter matching
 * nothing. It exists for the detail read, which needs to tell a deleted transaction from a
 * backend that fell over, because those are a 404 page and an error page respectively.
 *
 * `cache: 'no-store'` on every read, without exception. The credential never leaves the
 * server, so nothing about any of these responses may be reused across requests - the rule
 * `docs/agents/api-contract.md` sets - and a cached session read would keep answering for one
 * that has since expired or been revoked.
 *
 * A missing cookie costs no round trip, which is the common case for every signed-out
 * visitor.
 *
 * **`timeoutMs` is opt-in, and the default of no timeout is the right one for a read that is
 * the content of its screen.** A read the page cannot render without has nothing better to do
 * than wait: giving up early would only trade a slow screen for an error page. It exists for
 * the opposite case - a read whose caller degrades to something usable - where a backend that
 * hangs rather than refusing would otherwise hold a whole page that was ready to draw. An
 * abort lands in the `catch` below and reports `unavailable`, which is the same answer that
 * caller already handles for a refused read. `readPalette` is the one caller that passes it;
 * see `lib/palette.ts` for why that read in particular must not be able to block a render.
 *
 * @param path the backend path including its `/api` prefix and any query string
 * @param options `timeoutMs` aborts the request after that many milliseconds
 */
export async function authorizedGet<T>(
  path: string,
  options: { timeoutMs?: number } = {},
): Promise<AuthorizedResult<T>> {
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
      signal: options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs),
    });

    if (response.status === 401) {
      return { ok: false, reason: 'unauthenticated' };
    }

    if (response.status === 404) {
      return { ok: false, reason: 'missing' };
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
 *
 * **PET-32 was offered exactly that and declined**, which is worth recording so the next
 * ticket does not read the sentence above as an outstanding task. `PATCH /api/transactions/:id`
 * answers 200 with the updated row, and the edit modal closes and calls `router.refresh()`
 * just as the create does - so parsing it would have produced a value with no reader, and
 * the 2xx-is-success-on-the-status rule above would have had to be argued a second time.
 *
 * **PET-59's scan is the case this type's own reasoning anticipated and finally needed.**
 * `POST /api/transactions/scan` inverts the create's situation exactly: the response body
 * *is* the entire point of the call, so a helper that discards it the way this one does would
 * hand the modal nothing to merge into the form. `authorizedPostFormData` below therefore
 * returns `{ ok: true; data: T } | { ok: false; status?: number }` instead of reusing this
 * type - a small, deliberate divergence rather than a shape this file failed to anticipate.
 */
export type AuthorizedWriteResult = { ok: true } | { ok: false; status?: number };

/**
 * What a guarded write whose **response body is the point** reports back.
 *
 * `AuthorizedWriteResult` above with the body carried, for the two writes whose answer the
 * caller actually reads: the receipt scan's extracted fields, and PET-73's assistant reply.
 * See that type's own note for why discarding the body is right for the other four.
 *
 * **It was `AuthorizedFormDataResult` until PET-73**, named after the one caller it then had.
 * The assistant's send is a JSON post over the same shape, so the name described the encoding
 * of one caller rather than what the type means - which is "a write that answers with
 * something". Renamed rather than duplicated, and renamed in its own commit so the diff reads
 * as a rename.
 */
export type AuthorizedBodyResult<T> = { ok: true; data: T } | { ok: false; status?: number };

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
 * **`timeoutMs` is opt-in and defaults to none, which is `authorizedGet`'s rule reached from
 * the write side.** A write whose result the caller reports has nothing better to do than
 * wait, and giving up early would turn a landed write into a reported failure - the one thing
 * this function's own note above forbids. It exists for the opposite case, a caller whose next
 * move does not depend on the answer, where a backend that **hangs rather than refusing** would
 * otherwise leave the user pressing a control that does nothing: a refused connection fails in
 * milliseconds, but a connection accepted and never answered runs to undici's 300s header
 * timeout. An abort lands in the `catch` below and reports no status, which is already what
 * "the request never completed" looks like. `lib/logOut.ts` is the one caller that passes it,
 * and its docblock carries why leaving is not allowed to wait on the API.
 *
 * @param path the backend path including its `/api` prefix
 * @param options `timeoutMs` aborts the request after that many milliseconds
 */
export async function authorizedPost(
  path: string,
  body: unknown,
  options: { timeoutMs?: number } = {},
): Promise<AuthorizedWriteResult> {
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
      signal: options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs),
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
 * DELETEs a guarded endpoint with the session lifted into an `Authorization` header.
 *
 * The third verb, and it reuses `AuthorizedWriteResult` rather than growing a shape of its
 * own: `DELETE /api/transactions/:id` answers 404 when the id names nothing of theirs and
 * 401 when the session died with the dialog open, which is the same "the caller has to tell
 * these apart" argument that type was written for. `lib/deleteTransaction.ts` is the
 * classifier.
 *
 * **A 204 is what success looks like here, and nothing about that needs handling.**
 * `response.ok` covers the whole 2xx range, and the body is never read - which is
 * `authorizedPost`'s decision arrived at from the other direction: there, a 2xx with an
 * unparseable body still means the row exists; here there is no body at all.
 *
 * It takes a `path` and so must not become a Server Action, for the reason `authorizedPost`
 * above and `lib/backend.ts` both record: `'use server'` here would publish an endpoint
 * accepting an arbitrary path. The action that wraps it names one fixed route.
 *
 * @param path the backend path including its `/api` prefix
 */
export async function authorizedDelete(path: string): Promise<AuthorizedWriteResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, status: 401 };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      method: 'DELETE',
      // No `Content-Type`: there is no body. Sending one on a bodiless request is the sort
      // of thing a strict proxy is entitled to complain about, and nothing needs it.
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Unreachable backend, DNS, or a dropped connection. No status, which is what "the
    // request never completed" looks like - and here that genuinely matters, because a
    // delete that may or may not have landed is one the user will come back and retry.
    return { ok: false };
  }
}

/**
 * PATCHes a JSON body to a guarded endpoint with the session lifted into an `Authorization`
 * header.
 *
 * The fourth verb, and the third to reuse `AuthorizedWriteResult` rather than grow a shape of
 * its own. Same reasoning as the two above it, so what is worth reading here is the one way
 * `PATCH /api/transactions/:id` differs from both: **its 404 is ambiguous**. The create's could
 * only ever mean the `categoryId` named no category, and the delete's could only ever mean the
 * id named no transaction; this endpoint answers 404 for either, and tells them apart only in
 * the message text. That is deliberately not resolved here - this function's whole job is
 * moving the status - and `lib/updateTransaction.ts` narrows it from the body it built, which
 * is the one place that knows whether a `categoryId` was in play.
 *
 * A partial body is the endpoint's contract rather than this helper's business: `undefined`
 * leaves a field alone, `null` clears the note, and `JSON.stringify` drops the first of those
 * for us, so the caller expresses "do not touch" by omitting a key.
 *
 * It takes a `path` and so must not become a Server Action, for the reason `authorizedPost`
 * and `lib/backend.ts` both record: `'use server'` here would publish an endpoint accepting an
 * arbitrary path. The action that wraps it names one fixed route.
 *
 * `cache: 'no-store'` for `authorizedPost`'s reason: a write Next decided to cache would
 * silently swallow a second attempt.
 *
 * @param path the backend path including its `/api` prefix
 */
export async function authorizedPatch(path: string, body: unknown): Promise<AuthorizedWriteResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, status: 401 };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    // Any 2xx. The row is edited by now, so nothing below this line may turn a saved change
    // into a reported failure - see `AuthorizedWriteResult`, and note the stakes are gentler
    // here than for the create: a retried edit is idempotent where a retried create is a
    // duplicate the user then has to find and delete.
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Unreachable backend, DNS, or a dropped connection. No status, which is what "the
    // request never completed" looks like.
    return { ok: false };
  }
}

/**
 * POSTs a `FormData` body to a guarded endpoint with the session lifted into an
 * `Authorization` header.
 *
 * **The fifth verb, and the first over a body that is not JSON.** `POST
 * /api/transactions/scan` takes `multipart/form-data`, so this sends `formData` as the
 * fetch body directly with no `Content-Type` header set by hand - the platform's `fetch`
 * derives the header itself, including the multipart boundary, which is not something this
 * function could compute and set correctly on its own.
 *
 * **Returns the parsed body on success**, unlike the four verbs above: see
 * `AuthorizedWriteResult`'s own note on why the scan is the one write whose response is the
 * entire point of the call, rather than a fact this function was missing. PET-73's
 * `authorizedPostJson` below is the second such write, which is what renamed the shared result
 * type.
 *
 * It takes a `path` and so must not become a Server Action, for the reason every other verb
 * here already gives: `'use server'` would publish an endpoint accepting an arbitrary path.
 * `lib/scanReceipt.ts` is the action that wraps it.
 *
 * @param path the backend path including its `/api` prefix
 */
export async function authorizedPostFormData<T>(
  path: string,
  formData: FormData,
): Promise<AuthorizedBodyResult<T>> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, status: 401 };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    // Unreachable backend, DNS, a dropped connection, or a body that would not parse.
    return { ok: false };
  }
}

/**
 * POSTs a JSON body to a guarded endpoint and **returns the parsed response body**.
 *
 * **The sixth verb.** `authorizedPost` deliberately discards the body, and for PET-73's
 * assistant the reply *is* the body - so this is `authorizedPostFormData`'s JSON sibling
 * rather than a widening of `authorizedPost`, which would have made the four writes that want
 * nothing back pay for a parse and, worse, would have let a 2xx with an unparseable body turn a
 * created transaction into a reported failure. The two body-carrying verbs share
 * `AuthorizedBodyResult`; the four that do not share `AuthorizedWriteResult`.
 *
 * **It takes an optional `signal`, which no other verb here does, and that is the abort
 * chain's second hop.** The composer owns an `AbortController` and passes its signal to the
 * browser's `fetch`; the route handler receives that as `request.signal` and passes it here;
 * this threads it into the fetch at the backend, whose Express `close` then aborts the Gemini
 * call. Threaded into the fetch and **nothing else** - the other five verbs omit it, so the
 * widening costs them nothing. See `docs/explainers/cancelling-an-ai-request.md`.
 *
 * **An abort rejects rather than reporting a status, and the caller must tell that apart from
 * a failure.** `fetch` throws an `AbortError` on a signal, which lands in the `catch` below as
 * `{ ok: false }` with no status - the same shape a dropped connection produces. So the caller
 * checks `signal.aborted` itself rather than reading this result, because a deliberate cancel
 * must render no error line at all. `lib/sendAssistantMessage.ts` is where that branch lives.
 *
 * It takes a `path` and so must not become a Server Action, for the reason every verb here
 * gives: `'use server'` would publish an endpoint accepting an arbitrary path.
 *
 * @param path the backend path including its `/api` prefix
 * @param signal aborts the request; the caller distinguishes an abort from a failure
 */
export async function authorizedPostJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<AuthorizedBodyResult<T>> {
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
      signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    // Unreachable backend, DNS, a dropped connection, a body that would not parse - or the
    // caller's own abort, which is why the caller checks its signal rather than this shape.
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
