import { readPendingEmail } from '@/lib/pendingEmail';
import { resendLoginLink } from '@/lib/resend';

import { parseReason } from './reason';
import { VerifyFailedScreen } from './VerifyFailedScreen';

// Where `app/auth/verify/route.ts` sends every link that did not sign anybody in (A38).
//
// **This file owns every server-only import on the screen**, which is the precedent
// screen 24 set and the opposite of PET-11's: it reads the cookie and hands both the
// address's presence and the action down, so `VerifyFailedScreen.tsx` imports nothing
// reaching `next/headers` and Storybook can render it with no mocks.
//
// **No `export const dynamic`.** Reading a cookie opts this route out of static
// rendering on its own, which is the note `lib/session.ts` already carries about `/`.
// Adding the export would be a claim about nothing.
//
// **Not gated on a session**, unlike `/login` and `/setup` which this ticket did gate.
// Arriving here means a link failed, and the only way to hold a live session while doing
// so is to verify twice in two tabs - at which point the honest thing is to say the
// second link is spent, which is exactly what the `invalid` copy says.

export default async function VerifyFailed({
  searchParams,
}: {
  // A promise in Next 16, and awaited rather than destructured in the signature so the
  // async boundary is visible where it happens.
  searchParams: Promise<{ reason?: string }>;
}) {
  const [{ reason }, email] = await Promise.all([searchParams, readPendingEmail()]);

  // Narrowed rather than spread, because the screen's props are an exclusive union:
  // there is nothing to resend to without an address, so it does not accept the action
  // without one. That file records the reasoning.
  //
  // The address itself is deliberately not passed on. This screen never shows it - it is
  // a detail nobody asked about on a screen already delivering bad news - and the resend
  // action reads the cookie itself anyway, precisely so no caller can aim it elsewhere.
  return email === null ? (
    <VerifyFailedScreen reason={parseReason(reason)} hasAddress={false} />
  ) : (
    <VerifyFailedScreen reason={parseReason(reason)} hasAddress resend={resendLoginLink} />
  );
}
