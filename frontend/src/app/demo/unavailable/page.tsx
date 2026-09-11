import { parseDemoReason } from '../reason';

import { DemoUnavailableScreen } from './DemoUnavailableScreen';

// Where `app/demo/route.ts` sends a visitor it could not hand an account to (PET-86).
//
// **This file owns every server-only import on the screen**, which is the precedent
// screen 24 set and the verify failure followed - though here there is nothing to own
// but the query string, because unlike that screen this one reads no cookie and offers
// no action of its own.
//
// **No `export const dynamic`.** Reading `searchParams` opts this route out of static
// rendering by itself, and adding the export would be a claim about nothing.
//
// **Not gated on a session**, for the reason the verify failure is not: arriving here
// means a hand-out failed, and the only way to be holding a live session while doing so
// is to have opened `/demo` twice in two tabs - at which point the honest thing is to
// say what happened to the second one.

export default async function DemoUnavailable({
  searchParams,
}: {
  // A promise in Next 16, and awaited in the body rather than destructured in the
  // signature so the async boundary is visible where it happens.
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return <DemoUnavailableScreen reason={parseDemoReason(reason)} />;
}
