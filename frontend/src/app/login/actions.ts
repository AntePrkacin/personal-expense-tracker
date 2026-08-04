'use server';

import { type AcceptedResult, postAccepted } from '@/lib/backend';
import { setPendingEmail } from '@/lib/pendingEmail';
import type { components } from '@/types/api';

// "Log in" on screen 23 (LOG-3): asks the backend to email a login link, and stashes
// the address so screen 24 can say where it went.
//
// A Server Action for the same reasons `app/setup/register/actions.ts` is one - it
// keeps BACKEND_URL server-side without opening a POST endpoint on this origin that
// only this form should reach - plus one this ticket adds: `cookies().set()` is legal
// only inside an action or a route handler, and the browser does not navigate to this
// call, so an action is the shape that fits.

export type LoginLinkResult = AcceptedResult;

/**
 * Sends a login link to an address, or reports why it could not.
 *
 * **An unknown address is indistinguishable from a known one here** (LOG-6, A35). The
 * backend creates nothing and sends nothing for an address with no account, and
 * answers 202 with an empty body either way, so this cannot tell them apart and must
 * not try - which is what makes AC4 fall out of the backend rather than out of the
 * screen.
 *
 * The address is **not** re-validated here. The form checks it for the inline
 * message, and `RequestLoginLinkDto`'s `@IsEmail()` plus its `normalizeEmail`
 * transform are the authority; a second rule on this side would be one that can
 * drift from the first. A crafted call therefore reaches the backend and comes back a
 * 400, which is the correct outcome.
 *
 * The stash happens only on success, so a rejected submission leaves no address
 * behind for a later reload of `/check-email` to claim a link is waiting for.
 */
export async function sendLoginLink(email: string): Promise<LoginLinkResult> {
  const body: components['schemas']['RequestLoginLinkDto'] = { email };

  const result = await postAccepted('/api/auth/login-link', body);

  if (result.ok) {
    await setPendingEmail(email);
  }

  return result;
}
