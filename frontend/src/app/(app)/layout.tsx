import { redirect } from 'next/navigation';

import { readProfile } from '@/lib/profile';
import { ACCESS_ROUTES } from '@/lib/routes';
import { requireSession } from '@/lib/session';

import { SidebarNav } from './SidebarNav';

// The app shell: the fixed dark sidebar beside a content column, which every
// signed-in view renders inside (DSH-1, tech spec section 1 - "four routed views
// behind a shared app shell, plus a set of unauthenticated screens outside it").
//
// A route group rather than a path segment, so the four routes stay at
// /dashboard, /transactions, /insights and /settings - the hrefs ui/Sidebar
// already declares - while sharing this layout. The access screens (01, 02, 03,
// 22, 23, 24) sit outside the group and get none of it.
//
// The page header is not here. It is per-route, because a layout cannot know the
// page's own title; app/(app)/PageHeader.tsx is the shared component that keeps
// all four identical.
//
// **`export const dynamic = 'force-dynamic'` used to be here and is deliberately gone.**
// It existed because the pages read `new Date()` for the header overline, and without it
// Next prerendered them at build time so every screen showed whatever month the build
// ran in. PET-52's `cookies()` read now opts the segment out on its own, at which point
// the export becomes a claim about nothing rather than a safeguard - which is the
// condition `frontend/src/app/CLAUDE.md` set for deleting it.
//
// **Two reads, run concurrently.** The gate and the profile are different concerns with
// different callers - `/`, `/login` and `/setup` want the gate and have no use for a
// profile - so folding them into one guarded read would make `lib/session.ts` depend on
// a Settings-shaped endpoint. `Promise.all` is what keeps that costing an extra request
// rather than an extra round trip; `lib/profile.ts` records the trade in full.

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // `requireSession()` redirects on its own when there is nothing live, which is AC5 and
  // PET-19's long-deferred AC5 both. Its rejection propagates out of the Promise.all
  // exactly as it would out of a bare await.
  const [, profile] = await Promise.all([requireSession(), readProfile()]);

  // A live session with no profile is a broken invariant rather than an empty state:
  // verification inserts the row before it clears the onboarding payload, so a verified
  // session implies one exists - which is why the backend answers 500 for a missing one
  // rather than 404. Sending the user back to Log in is the only honest thing left; the
  // alternative is a sidebar with holes where a name should be.
  if (profile === null) {
    redirect(ACCESS_ROUTES.login);
  }

  return (
    // `flex flex-1` rather than a height of its own: the root layout already
    // makes <body> `flex min-h-full flex-col`, so this fills what is left and
    // lays the two columns out side by side.
    <div className="flex flex-1">
      {/* The footer's name and email are real as of PET-52, and were Figma's own sample
          data ("Marko", "Kovač", "marko@email.com") for three tickets before it. They
          take two rows in two databases to assemble - the names from the per-user
          `profile` row, the email from the central `users` row - which is exactly what
          `GET /api/profile` stitches, and the reason the session read alone could never
          have fixed this. */}
      <SidebarNav firstName={profile.firstName} lastName={profile.lastName} email={profile.email} />
      {/* min-w-0 so a wide child - the transactions table, later - overflows
          itself rather than pushing the 260px sidebar off-screen. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
