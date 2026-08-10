import { redirect } from 'next/navigation';
import { cache } from 'react';

import { ACCESS_ROUTES } from '@/lib/routes';
import { authorizedGet } from '@/lib/session';
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

/**
 * What `GET /api/profile` answers. Read from the contract, never restated.
 *
 * Exported since PET-46, for the Settings form: that screen prefills from this shape and diffs
 * against it, and every consumer naming `components['schemas']['ProfileResponseDto']` for itself
 * would be a second spelling of one alias rather than a second reading of the contract.
 */
export type Profile = components['schemas']['ProfileResponseDto'];

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
 * one that terminates. Note the design draws no error screen anywhere (A19, A29), so the
 * one the reader sees is ours: `app/error.tsx` is the boundary as of PET-21, and until then
 * this sentence described Next's built-in page rather than anything in this repo.
 *
 * **The read itself is `authorizedGet` in `lib/session.ts`**, which owns the cookie, the
 * bearer lift, `cache: 'no-store'` and the 401-versus-everything-else classification - all
 * of which this file used to inline. What stays here is the only part that was ever this
 * module's own: the *policy* over that classification. The no-store matters for a reason
 * specific to this endpoint, which is worth keeping written down: the Settings form can
 * change every field it returns, and a cached footer would keep showing the old name.
 *
 * **Wrapped in React's `cache()` since PET-47, and that does not undo the `no-store` above.**
 * The two are different scopes and it is worth being precise, because they read as contradictory:
 * `cache()` memoizes on the arguments for the lifetime of **one render pass**, so a second caller
 * inside the same request gets the first caller's promise, while `no-store` governs whether the
 * result survives **across** requests, which it still must not. Every render still makes exactly
 * one `GET /api/profile`.
 *
 * It exists because the profile stopped being the shell's private business. `(app)/layout.tsx`
 * reads it to gate the route and fill the sidebar footer, and PET-47 gives the pages a second
 * reason to want it: a Server Component needs the currency to format money with, and a layout
 * cannot pass props to the page it wraps. Without the memo, every page that formatted an amount
 * would add a guarded HTTP round trip to its own render. `settings/page.tsx` already made that
 * second read deliberately - see `frontend/src/app/CLAUDE.md` - and this makes it free rather
 * than merely acceptable.
 *
 * Note this is `export const` rather than `export async function`, which is what `cache()`
 * requires: the identity of the wrapped function is the cache key's owner, so re-wrapping per
 * call would memoize nothing.
 */
export const requireProfile = cache(async function requireProfile(): Promise<Profile> {
  const result = await authorizedGet<Profile>('/api/profile');

  if (result.ok) {
    return result.data;
  }

  if (result.reason === 'unauthenticated') {
    redirect(ACCESS_ROUTES.login);
  }

  throw new Error('Could not load the profile: the backend did not answer.');
});
