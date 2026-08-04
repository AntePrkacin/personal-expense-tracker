'use server';

import { type AcceptedResult, postAccepted } from '@/lib/backend';
import { readPendingEmail } from '@/lib/pendingEmail';
import type { components } from '@/types/api';

// "Resend link" on screen 24 (VER-2): asks the backend for a fresh link to the
// address this browser last submitted.
//
// Safe to call repeatedly by design rather than by luck: the backend sends a new link
// and invalidates the previous one instead of duplicating (REG-6, A35), which is what
// makes this the only recovery the design gives (A36) and why it needs no confirmation
// step.

/**
 * What a resend reports back.
 *
 * `{ ok: false }` with no status covers both an unreachable backend and having no
 * address to resend to - the screen has one failure line either way, and the second
 * case is unreachable from the rendered UI anyway, since a screen with no address
 * shows a link back to Log in instead of this control.
 */
export type ResendResult = AcceptedResult;

/**
 * Sends a fresh login link to the stashed address.
 *
 * **Takes no argument, deliberately.** A Server Action is reachable by anyone who
 * finds it, so an address parameter would turn this into a link-sender for arbitrary
 * addresses - a spam relay pointed at the project's own mail credentials. Reading the
 * address from the httpOnly cookie instead means the caller has to have submitted it
 * on this browser first.
 *
 * That raises the bar rather than closing the door: the cookie is httpOnly against
 * script, not against devtools, so somebody determined can still set one. What makes
 * that acceptable is the same thing that makes the endpoint safe to expose at all -
 * the backend answers 202 for every address, so nothing is learned, and its
 * per-address throttler is the real limit on volume.
 */
export async function resendLoginLink(): Promise<ResendResult> {
  const email = await readPendingEmail();

  if (!email) {
    return { ok: false };
  }

  const body: components['schemas']['RequestLoginLinkDto'] = { email };

  return postAccepted('/api/auth/login-link', body);
}
