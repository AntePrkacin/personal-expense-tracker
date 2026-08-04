import { SetupBudgetScreen } from './SetupBudgetScreen';

// /setup - 02 Setup, Currency & budget. Step 1 of 3 (PET-9).
//
// The screen lives in its own module so Storybook can render it; this file only
// answers the route. No `export const dynamic`: nothing in this path reads a
// request, so it prerenders static and correctly. `(app)/layout.tsx` needs
// `force-dynamic` because its pages read `new Date()`; copying that here would be
// a claim about nothing.
//
// Deliberately **not** gated on a session. `/` redirects a signed-in visitor to
// the dashboard and the `(app)` shell gates itself, but PET-9 has no session to
// read, and a third call into the `lib/session.ts` stubs would be a claim this
// ticket cannot test. Whether onboarding stays reachable with a live session is
// PET-52's call; docs/TODO.md carries it.
export default function SetupPage() {
  return <SetupBudgetScreen />;
}
