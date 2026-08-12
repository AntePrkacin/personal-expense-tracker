import { AccessCard } from '@/components/AccessCard';

import { sendLoginLink } from './actions';
import { LoginForm } from './LoginForm';

// 23 Log in (node 132:1138), the only route into the returning-user flow.
//
// **No step indicator and no overline** (LOG-1), which is the whole reason the card
// chrome had to come out of `app/setup/SetupShell.tsx`: this is not a step in
// anything. The card is the same box as frames 02 and 22, so `AccessCard`'s default
// width is the one this screen wants.
//
// No password field exists anywhere in the frame, which is A31 - passwordless access
// is the design - rather than an omission.

/** Hoisted so the test asserts one string rather than a fragment of markup (LOG-1). */
const SUPPORTING_COPY =
  "Enter the email you signed up with and we'll send you a secure login link.";

export function LoginScreen() {
  return (
    <AccessCard>
      {/* gap-2 is the designed 8px from heading to copy: the header block is 70px
          tall with the heading at y 0 and the copy at y 36 (node 132:1145). The same
          block on the onboarding steps has an overline above the heading; this one
          starts at the heading. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Log in</h1>
        <p className="text-base-content/70">{SUPPORTING_COPY}</p>
      </div>

      {/* The action, imported here and handed down, which is the ordinary way a Server
          Component passes one to a client component - and it means LoginForm's suite
          injects a jest.fn() and needs no module mock at all. */}
      <LoginForm sendLink={sendLoginLink} />
    </AccessCard>
  );
}
