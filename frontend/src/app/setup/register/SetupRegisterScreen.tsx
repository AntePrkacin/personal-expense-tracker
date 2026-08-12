import { SetupShell } from '../SetupShell';
import { registerAccount } from './actions';
import { RegisterForm } from './RegisterForm';

// 22 Register (Figma node 129:1128), onboarding step 3 of 3 and the end of the flow.
//
// A Server Component, like the other two screens; only RegisterForm needs the client.
// It imports the action and passes it down, which is how a Server Component hands one
// to a client component, and is also what keeps the form testable without module
// mocking.

/**
 * The card's supporting copy (REG-1).
 *
 * Hoisted so the test asserts one string rather than a second hand-typed copy.
 */
const SUPPORTING_COPY = 'Create your account to start tracking your spending.';

export function SetupRegisterScreen() {
  return (
    <SetupShell step={3}>
      <div className="flex flex-col gap-2">
        {/* A <p>, not a heading: it labels position in the flow, and it is where
            "step 3 of 3" is actually readable - which is what lets the indicator
            above it stay aria-hidden. */}
        <p className="text-primary text-xs font-semibold tracking-widest uppercase">STEP 3 OF 3</p>

        <h1 className="font-display text-3xl font-bold">Register</h1>

        <p className="text-base-content/70">{SUPPORTING_COPY}</p>
      </div>

      <RegisterForm register={registerAccount} />
    </SetupShell>
  );
}
