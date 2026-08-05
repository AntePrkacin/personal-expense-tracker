import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ACCESS_ROUTES } from '@/lib/routes';
import { SESSION_COOKIE } from '@/lib/session';
import type { components } from '@/types/api';

// The signed-in user's own profile, and the gate on the `(app)` shell - one read doing
// both, because `GET /api/profile` is guarded and so already answers "is this a live
// session" on its way to answering "whose".
//
// It is the app's **first read of real data from the backend**, and the endpoint PET-45
// shipped. It exists because the six fields do not come from one place: the names,
// currency, budget and month start day live in the per-user database's single `profile`
// row, while the email is the login identifier on the central `users` row. The endpoint
// stitches them, which is why the session read alone could never have fixed the sidebar -
// `GET /api/auth/session` knows the email and nothing about the names.
//
// **This used to be two reads and a redirect, and that combination had a loop in it.**
// The shell called `requireSession()` for the gate and then this for the data, treating
// any absent profile as "send them to Log in". But a *live* session whose profile read
// fails - a 500, a timeout, a restart mid-render - then bounced to `/login`, which
// redirects a signed-in visitor to `/dashboard`, which bounced again: the whole app
// unreachable until the backend settled, with no way to even reach the login screen. The
// fix is this file distinguishing "not signed in" from "could not ask", and only the
// first of those redirecting.

/** What `GET /api/profile` answers. Read from the contract, never restated. */
type Profile = components['schemas']['ProfileResponseDto'];

/**
 * Why a profile read did not produce a profile.
 *
 * The distinction is the whole point rather than extra structure: the two failures want
 * opposite handling. `unauthenticated` is an ordinary signed-out visitor and belongs in
 * the access flow; `unavailable` is a backend that could not answer, where redirecting
 * anywhere is a guess - and redirecting to `/login` specifically is the loop above.
 */
type ProfileFailure = 'unauthenticated' | 'unavailable';

type ProfileResult = { ok: true; profile: Profile } | { ok: false; reason: ProfileFailure };

/**
 * Reads the caller's profile, classifying failure.
 *
 * A **401 is the only status that means signed out**, because the route is guarded and
 * the guard answers nothing else. Everything else - a 500 (the broken invariant of a
 * verified session with no profile row), an unreachable backend, a body that will not
 * parse - is `unavailable`: something is wrong that the user cannot fix by signing in
 * again.
 *
 * `cache: 'no-store'` because the Settings form can change every field here, and a
 * cached footer would keep showing the old name. It is also the rule
 * `docs/agents/api-contract.md` sets for every read: the credential never leaves the
 * server, so nothing about this response may be reused across requests.
 */
async function readProfile(): Promise<ProfileResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, reason: 'unauthenticated' };
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/profile`, {
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

    return { ok: true, profile: (await response.json()) as Profile };
  } catch {
    // Unreachable backend, a dropped connection, or a body that would not parse. All
    // "could not ask", none of them "not signed in".
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * The signed-in user's profile, or the access flow.
 *
 * **This is the `(app)` shell's gate as well as its data**, which is AC5 and PET-19's
 * long-deferred AC5 both. One guarded read answers both questions, so there is no second
 * request restating the first one's conclusion and no way for the two to disagree.
 *
 * **An `unavailable` backend throws rather than redirecting**, and that is the fix for
 * the loop described at the top of this file. It surfaces through Next's error boundary,
 * which a reload retries - the honest response to "we could not reach the backend", and
 * one that terminates. Note the design draws no error screen anywhere (A19, A29), so what
 * the reader sees is the framework's own; `docs/TODO.md` records that a custom `error.tsx`
 * is a designer conversation rather than a gap this ticket could close.
 */
export async function requireProfile(): Promise<Profile> {
  const result = await readProfile();

  if (result.ok) {
    return result.profile;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load the profile: the backend did not answer.');
}
