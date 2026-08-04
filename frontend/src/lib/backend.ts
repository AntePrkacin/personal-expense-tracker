// The POST both access writes make: `POST /api/auth/register` (REG-4) and
// `POST /api/auth/login-link` (LOG-3, VER-2).
//
// One helper rather than a copy per action, which is the call lib/session.ts makes
// for its own two callers - "the two should share whatever helper does the fetch
// rather than each doing their own". The two endpoints answer identically (202, no
// body) and differ only in path and body type, so there was nothing left to
// duplicate but the eight lines below.
//
// **PET-52's verify is deliberately not folded in.** It returns a body and reads a
// 409 for a link that a newer one replaced, so it needs a different result shape;
// generalising over it now, with two real cases in hand, would bend this on the
// wrong axis. It is also the one call that wants a route handler rather than an
// action, because the browser navigates *to* it.
//
// Not a Server Action itself, and it must not become one: `'use server'` here would
// publish it as an endpoint taking an arbitrary path. The actions that wrap it are
// the public surface, and each one is a fixed path.

/**
 * What an accepted-or-not POST reports back.
 *
 * A result rather than a throw. Every caller has to stay on its screen and render a
 * message, and an unhandled rejection inside a Server Action reaches the client as
 * an opaque digest with nothing a screen can use - so a rejection here would leave
 * the caller unable to tell a 400 from an unreachable backend.
 *
 * **The absent `status` is not an oversight**: it is what "the request never
 * completed" looks like, as distinct from a status the backend chose.
 */
export type AcceptedResult = { ok: true } | { ok: false; status?: number };

/**
 * POSTs a JSON body to the backend and reports whether it was accepted.
 *
 * **202 is the only success, and it carries no body.** Both endpoints answer it
 * identically whether or not an account exists for the address, which is the
 * enumeration defense REG-6, LOG-6 and A35 ask for - so a duplicate address is not
 * an error case for any caller, and this function cannot tell the two apart either.
 * Note it does not mean the mail was sent: the backend floats that send so a mail
 * failure cannot become a 5xx.
 *
 * `cache: 'no-store'` is explicit because a POST Next decided to cache would
 * silently swallow a second attempt - a resend, most obviously.
 *
 * @param path the backend path including its `/api` prefix, e.g. `/api/auth/register`
 */
export async function postAccepted(path: string, body: unknown): Promise<AcceptedResult> {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    return response.status === 202 ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Backend unreachable, DNS, or a dropped connection. No status to report, and
    // each screen's one message covers it either way (A29).
    return { ok: false };
  }
}
