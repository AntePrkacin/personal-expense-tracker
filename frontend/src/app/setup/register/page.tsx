import { SetupRegisterScreen } from './SetupRegisterScreen';

// /setup/register - 22 Register. Step 3 of 3 (PET-11), and where the account is
// finally created.
//
// Nested under /setup for the same reason step 2 is: it puts the route inside
// app/setup/layout.tsx and so inside the draft provider, which is the mechanism
// behind "Back keeps my values" (AC5).
//
// The screen lives in its own module so Storybook can render it; this file only
// answers the route. No `export const dynamic`, and not gated on a session, both for
// the reasons app/setup/page.tsx records.
export default function SetupRegisterPage() {
  return <SetupRegisterScreen />;
}
