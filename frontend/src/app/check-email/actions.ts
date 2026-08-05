'use server';

import { postAccepted } from '@/lib/backend';
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
 * Three outcomes rather than two, because **"there is no address" is reachable while
 * this screen is open** and needs different advice from a failure. The cookie carrying
 * the address expires after fifteen minutes, and screen 24 is precisely the screen a
 * user leaves open while waiting for mail - so a resend twenty minutes in finds nothing
 * to send to. Told "please try again" the user would retry forever, on a screen whose
 * only other exit was deliberately removed (AC6); told it has expired, they get the one
 * control that does work.
 *
 * `reason` rather than a fabricated status: `lib/backend.ts` documents an absent status
 * as meaning "the request never completed", so inventing a 410 the backend never sent
 * would make that distinction a lie. Nothing here was requested of the backend at all.
 */
export type ResendResult =
  | { ok: true }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'failed'; status?: number };

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
    return { ok: false, reason: 'expired' };
  }

  const body: components['schemas']['RequestLoginLinkDto'] = { email };

  const result = await postAccepted('/api/auth/login-link', body);

  return result.ok ? { ok: true } : { ok: false, reason: 'failed', status: result.status };
}
