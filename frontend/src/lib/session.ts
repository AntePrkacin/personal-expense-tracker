// The two session seams: one the (app) shell is gated on, one the root route
// branches on.
//
// PET-19 AC5 says a request for a view without a valid session must be sent to
// the access flow. That redirect is deliberately NOT implemented here yet, by
// decision: PET-52 ("[FE] verify page, session cookie, signed-in redirects")
// owns the cookie these functions have to read, and the cookie's name is not
// decided anywhere in the repo. Picking one here would mean PET-52 either
// inherits a name it did not choose or renames it in two places.
//
// What ships instead is the seam: two functions with one call site each,
// app/(app)/layout.tsx and app/page.tsx. Filling them in is a change to this file
// alone.
//
// They are separate rather than one function because the two callers want opposite
// things from the same read. The shell wants "let me through or send me away" and
// answers nothing itself; the root route wants a plain fact it can branch on,
// because both of its branches are legitimate destinations. Collapsing them would
// mean the shell either duplicating the redirect or the root route catching one.

/**
 * Ensures the caller has a live session, or sends them to the access flow.
 *
 * **Currently a no-op: every request reaches the shell.** That is what makes the
 * four routes browsable while PET-52 is unbuilt, and it is the whole of PET-19's
 * deferral of AC5.
 *
 * What PET-52 has to put here, in order:
 *
 * 1. Read the httpOnly, first-party session cookie with `cookies()` from
 *    `next/headers`. PET-52 picks the name; nothing reads it today.
 * 2. Missing cookie - `redirect()` to the access flow (23 Log in). That route
 *    does not exist yet either, and is also PET-52's.
 * 3. Otherwise call `GET /api/auth/session` on `BACKEND_URL` with the raw value
 *    lifted into an `Authorization: Bearer <token>` header. The backend reads no
 *    cookies at all, by design, so the value has to move into the header
 *    server-side.
 * 4. A 401 means expired, revoked or forged - clear the cookie and redirect the
 *    same way as a missing one. A 200 returns `{ userId, email, expiresAt }`,
 *    which is also the only real source of the shell's email until PET-45 lands
 *    `GET /api/profile`.
 *
 * Declared as returning a promise, though nothing here awaits: the real body
 * awaits both `cookies()` and a fetch, and having the signature already be the
 * async one means PET-52 changes this file rather than every call site. It is a
 * plain function returning a resolved promise rather than an `async` one with an
 * empty body, which would be an await-nothing async function.
 */
export function requireSession(): Promise<void> {
  return Promise.resolve();
}

/**
 * Whether the caller has a live session. Answers, never redirects.
 *
 * **Currently always `false`: every visitor is treated as signed out.** That is
 * what puts the Welcome screen at `/` while PET-52 is unbuilt, and it is the same
 * deferral `requireSession()` above records.
 *
 * `false` rather than `true` on purpose. A session that cannot exist yet must not
 * hide the one screen this ticket builds; the cost is that `/dashboard` is reached
 * by typed URL only until PET-52 lands, which is already true of the shell, whose
 * gate lets everyone through.
 *
 * What PET-52 has to put here is the first three steps of the list above: read the
 * cookie, and if it is there call `GET /api/auth/session` with the value lifted
 * into `Authorization: Bearer <token>`. A 200 is `true`; a missing cookie or a 401
 * is `false`. The difference from `requireSession()` is only what happens next -
 * this one returns the answer instead of redirecting on it - so the two should
 * share whatever helper does the fetch rather than each doing their own.
 *
 * Note for PET-52: the `cookies()` read opts `/` out of static rendering on its
 * own, so no `export const dynamic` is needed there now or then.
 */
export function hasSession(): Promise<boolean> {
  return Promise.resolve(false);
}
