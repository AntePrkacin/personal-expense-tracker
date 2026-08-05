'use server';

import { type AcceptedResult, postAccepted } from '@/lib/backend';
import { setPendingEmail } from '@/lib/pendingEmail';
import type { components } from '@/types/api';

// "Finish setup" (REG-4): the one request onboarding makes.
//
// A Server Action rather than a route handler, which is what
// docs/agents/api-contract.md prescribes for a *read*. Both keep BACKEND_URL
// server-side; this one does it without also opening a POST endpoint on the
// frontend's own origin that nothing but this form should ever reach. PET-52's
// verify will want the handler instead, and the reason is that the browser
// **navigates to** it - not that it sets a cookie, which this action now does
// perfectly well.
//
// The fetch itself is lib/backend.ts, shared with the login-link actions.

export type RegisterResult = AcceptedResult;

/**
 * Creates the account, sends its login link, and stashes the address screen 24 will
 * show - or reports why it could not.
 *
 * **Stashes rather than redirects.** The ticket's Option A suggests setting the
 * cookie and redirecting from here, and a `redirect()` inside an action does carry
 * the cookie correctly. But it throws, so `await register(body)` never resolves in
 * `RegisterForm` and `clearDraft()` never runs - which is behaviour two of that
 * form's tests pin. So this returns, and the form navigates.
 *
 * The ordering that makes the cookie readable on the next screen is safe rather than
 * lucky: `.set()` writes the `Set-Cookie` header synchronously inside this body, the
 * header precedes the flight body on the wire, and the browser commits it before the
 * client's `await` resolves. Note as a side effect that setting a cookie also marks
 * this route revalidated, clearing the client Router Cache - harmless here, and
 * invisible to every suite, because they all inject or mock this function.
 *
 * The address comes off the **body**, which is the trimmed value `toRegisterBody`
 * produced, rather than off the draft the form still holds.
 */
export async function registerAccount(
  body: components['schemas']['RegisterDto'],
): Promise<RegisterResult> {
  const result = await postAccepted('/api/auth/register', body);

  if (result.ok) {
    await setPendingEmail(body.email);
  }

  return result;
}
