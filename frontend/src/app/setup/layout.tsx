import { redirect } from 'next/navigation';

import { hasSession } from '@/lib/session';

import { SetupDraftProvider } from './SetupDraftProvider';

// The layout the three onboarding steps share: /setup (02, step 1),
// /setup/categories (03, step 2) and /setup/register (22, step 3).
//
// **Its only job is holding the draft.** Three nested routes rather than one
// route rendering three steps from client state, because all three tickets carry
// an explicit "Back keeps my values" criterion (PET-9 AC5, PET-10 AC4, PET-11
// AC5): back-navigation is a first-class path here, and the one-route design
// makes the browser's own Back button exit onboarding and discard everything
// typed. Nesting them under this layout is what preserves the draft across a
// step-to-step move, because React keeps a layout's subtree mounted while
// navigating between its own children.
//
// **The shared chrome is deliberately NOT here.** The logo, the step indicator
// and the card box are identical on frames 02, 03 and 22, but the active step
// differs per route, and an App Router layout cannot read the pathname on the
// server. That is the same trap `ui/Sidebar`'s `active` prop was built around, so
// the chrome is `SetupShell`, a component each step renders with its own `step`.
//
// A Server Component: `SetupDraftProvider` carries the `'use client'` boundary, so
// this file and the three step pages stay off the client bundle. React preserves
// the provider element across sibling navigation either way, so nothing about
// AC5 depends on which of the two files holds the directive.
//
// **Its second job, as of PET-52, is the session gate**, which the previous version of
// this comment recorded as PET-52's to decide. Onboarding was reachable by typed URL
// with a live session, so a signed-in user could re-run it - harmless, because nothing
// persists until step 3 and the account already exists, but pointless. `docs/TODO.md`
// asked for this and `/login` to be answered together, and they are.
//
// It sits here rather than on the three step pages because one call site covers all
// three, in the file they already share. The cost is a session read per step navigation,
// which is what `GET /api/auth/session` skipping both throttlers exists for - the
// backend documents it as "a whoami the frontend calls on navigation".
//
// No `export const dynamic`, and now for a second reason on top of the first: the
// `cookies()` read behind `hasSession()` opts this segment out of static rendering on
// its own, so the export would be a claim about nothing. That is still the opposite of
// `(app)/layout.tsx` - do not copy anything from it here by reflex.
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  if (await hasSession()) {
    // Hard-coded rather than read from SIDEBAR_HREFS, the same call `app/page.tsx` and
    // `app/login/page.tsx` make, and for the reason the first of those records.
    redirect('/dashboard');
  }

  return <SetupDraftProvider>{children}</SetupDraftProvider>;
}
