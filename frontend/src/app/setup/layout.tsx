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
// No `export const dynamic`. Nothing in this segment reads a request, so it
// prerenders static and correctly - the opposite of `(app)/layout.tsx`, whose
// `force-dynamic` is load-bearing because its pages read `new Date()`. Do not
// copy that here by reflex.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupDraftProvider>{children}</SetupDraftProvider>;
}
