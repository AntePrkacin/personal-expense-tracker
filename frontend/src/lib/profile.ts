import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '@/lib/session';
import type { components } from '@/types/api';

// The signed-in user's own profile: the read that finally replaces the sidebar footer's
// `PLACEHOLDER_PROFILE`, and the app's **first read of real data from the backend**.
//
// `GET /api/profile` is the endpoint PET-45 shipped, and it exists because the six
// fields do not come from one place: the names, currency, budget and month start day
// live in the per-user database's single `profile` row, while the email is the login
// identifier on the central `users` row. The endpoint stitches them, which is exactly
// the seam `PLACEHOLDER_PROFILE`'s comment describes and the reason the sidebar could
// not be fixed by reading the session alone - `GET /api/auth/session` knows the email
// and nothing about the names.
//
// **A second read rather than folded into the gate, on purpose.** The shell therefore
// makes two requests where this one alone would have satisfied both, since /api/profile
// is guarded and a 401 from it means exactly "no live session". The two are separate
// because they are different concerns and have different callers: `/`, `/login` and
// `/setup` want the gate and have no use for a profile, and folding them would make
// `lib/session.ts` depend on a Settings-shaped endpoint that three of its four callers
// do not want. It is the same trade `backend/CLAUDE.md` accepts and documents for the
// dashboard reading the profile row up to three times in one request. The layout runs
// the two concurrently, so it costs a request rather than a round trip.

/** What `GET /api/profile` answers. Read from the contract, never restated. */
type Profile = components['schemas']['ProfileResponseDto'];

/**
 * The signed-in user's profile, or `null` when there is no live session.
 *
 * The same cookie-plus-bearer shape as `lib/session.ts`'s own read, and the same
 * never-throw discipline: a missing cookie, a 401 and an unreachable backend are all
 * `null`, because a rejection inside a Server Component reaches the client as an opaque
 * digest nothing can branch on.
 *
 * **A `null` behind a live session is a broken invariant rather than an empty state.**
 * Verification inserts the profile row before it clears the onboarding payload, so a
 * verified session implies one exists - which is why the backend answers 500 rather than
 * 404 for a missing one, and why the caller redirects instead of rendering a sidebar
 * with holes in it.
 *
 * `cache: 'no-store'` for the reason the session read gives, plus one of its own: the
 * Settings form can change every field here, and a cached footer would keep showing the
 * old name.
 */
export async function readProfile(): Promise<Profile | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    return response.ok ? ((await response.json()) as Profile) : null;
  } catch {
    return null;
  }
}
