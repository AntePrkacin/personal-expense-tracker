import { readPendingEmail } from '@/lib/pendingEmail';

import { resendLoginLink } from './actions';
import { CheckEmailScreen } from './CheckEmailScreen';

// 24 Check your email, served here rather than under `/setup`: LOG-3 reaches it from
// 23 Log in too, so it does not belong to onboarding and must not sit inside the setup
// draft provider - by the time it renders, the draft has been cleared anyway.
//
// **This file owns every server-only import on the screen**, which is more than the
// usual three-line route wrapper does. It is what keeps `next/headers` out of anything
// Storybook bundles or the screen's own suite mounts; `CheckEmailScreen.tsx` records
// why that matters.
//
// **No `export const dynamic`.** Reading a cookie opts this route out of static
// rendering on its own, which is the note `lib/session.ts` already carries about `/`.
// Adding the export would be a claim about nothing.

export default async function CheckEmail() {
  const email = await readPendingEmail();

  // Narrowed rather than spread, because `CheckEmailScreen`'s props are an exclusive
  // union: there is nothing to resend to without an address, so the screen does not
  // accept the action without one. That file records the reasoning.
  return email === null ? (
    <CheckEmailScreen email={null} />
  ) : (
    <CheckEmailScreen email={email} resend={resendLoginLink} />
  );
}
