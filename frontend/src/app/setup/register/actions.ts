'use server';

import type { components } from '@/types/api';

// "Finish setup" (REG-4): the one request onboarding makes, and the first call the
// frontend makes to the backend at all.
//
// A Server Action rather than a route handler, which is what
// docs/agents/api-contract.md prescribes for a *read*. Both keep BACKEND_URL
// server-side; this one does it without also opening a POST endpoint on the
// frontend's own origin that nothing but this form should ever reach. PET-52's
// verify will want the handler instead, because it has to set a cookie during a GET
// navigation.

export type RegisterResult = { ok: true } | { ok: false; status?: number };

/**
 * Creates the account and sends its login link, or reports why it could not.
 *
 * Returns a result rather than throwing. The caller has to stay on the screen and
 * render a message, and an unhandled rejection in a server action reaches the client
 * as an opaque digest with nothing usable in it.
 *
 * **202 is the only success, and it carries no body.** The backend answers it
 * identically whether or not the address already has an account, which is the
 * enumeration defense REG-6 and A35 ask for - so a duplicate email is not an error
 * here, and this function cannot tell the two apart either. Note it also does not
 * mean the mail was sent: the backend floats that send so a mail failure cannot
 * become a 5xx.
 */
export async function registerAccount(
  body: components['schemas']['RegisterDto'],
): Promise<RegisterResult> {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    return response.status === 202 ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Backend unreachable, DNS, or a dropped connection. No status to report, and
    // the screen's one message covers it either way (A29).
    return { ok: false };
  }
}
