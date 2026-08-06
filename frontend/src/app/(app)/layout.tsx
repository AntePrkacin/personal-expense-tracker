import { requireProfile } from '@/lib/profile';

import { AddTransactionProvider } from './AddTransactionProvider';
import { DRAWER_TOGGLE_ID } from './drawer';
import { SidebarNav } from './SidebarNav';

// The app shell: the dark sidebar beside a content column, which every
// signed-in view renders inside (DSH-1, tech spec section 1 - "four routed views
// behind a shared app shell, plus a set of unauthenticated screens outside it").
//
// A route group rather than a path segment, so the four routes stay at
// /dashboard, /transactions, /insights and /settings - the hrefs ui/Sidebar
// already declares - while sharing this layout. The access screens (01, 02, 03,
// 22, 23, 24) sit outside the group and get none of it.
//
// PET-57 made the shell a daisyUI `drawer`: the sidebar column is fixed open at
// `lg` and up, and collapses into an off-canvas panel behind a hamburger below
// it - the small-screen behaviour the fixed 1440px Figma frames never specified.
// The toggle is the drawer's own checkbox, so this layout stays a Server
// Component; no JavaScript is involved in opening it. Closing it after a
// navigation does take one effect - the checkbox is uncontrolled and this layout
// persists across a soft navigation, so nothing else would ever uncheck it - and
// that effect lives in SidebarNav, beside the pathname read it keys on.
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
// **One read gates the shell and fills the footer**, because `GET /api/profile` is
// guarded and so already answers "is this a live session" on its way to answering
// "whose". This was briefly two - a session read for the gate and a profile read for the
// data - and that had a redirect loop in it: a live session whose profile read failed
// bounced to `/login`, which sends a signed-in visitor back to `/dashboard`. One read
// cannot disagree with itself. `lib/profile.ts` records the whole of it.

function HamburgerGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
      <rect y="2.5" width="20" height="2.6" rx="1.3" />
      <rect y="8.7" width="20" height="2.6" rx="1.3" />
      <rect y="14.9" width="20" height="2.6" rx="1.3" />
    </svg>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Redirects to Log in when there is no live session, and throws when the
  // backend could not answer - deliberately not a redirect, because "we could
  // not ask" is not "you are signed out".
  const profile = await requireProfile();

  return (
    // `flex-1` rather than a height of its own: the root layout already makes
    // <body> `flex min-h-full flex-col`, so the drawer fills what is left.
    <div className="drawer lg:drawer-open flex-1">
      <input id={DRAWER_TOGGLE_ID} type="checkbox" className="drawer-toggle" />
      {/* min-w-0 so a wide child - the transactions table, later - overflows
          itself rather than pushing the sidebar column off-screen. */}
      <div className="drawer-content flex min-w-0 flex-col">
        {/* The mobile-only bar whose whole job is reaching the collapsed
            sidebar; at lg and up the drawer is fixed open and this disappears. */}
        <div className="navbar bg-base-100 border-base-300 border-b lg:hidden">
          <label
            htmlFor={DRAWER_TOGGLE_ID}
            aria-label="Open sidebar"
            className="btn btn-square btn-ghost drawer-button"
          >
            <HamburgerGlyph />
          </label>
          <span className="font-display px-2 text-lg font-bold">Spendifico</span>
        </div>
        {/* The pages' shared horizontal gutter, stated exactly once. The header
            and every <main> below it read their left and right edges from this
            wrapper, which is what keeps a page's title and its content on the
            same grid at every breakpoint - as five hand-kept copies of the same
            three classes, one of them could drift and no test would notice.

            **One Add transaction modal for the whole shell**, which is a correctness
            requirement rather than a tidiness one: Transactions draws two triggers (its header
            and its empty card), and a component owning its own modal would mount two dialogs
            there - two focus traps and two copies of every field id, which makes
            `getByLabelText` ambiguous. `AddTransactionProvider` records the whole of it.

            This layout stays a Server Component, and the provider carries the `'use client'`
            boundary, so neither this file nor any of the four pages joins the client bundle.
            Same shape `app/setup/layout.tsx` uses for `SetupDraftProvider`, and the same rule
            `SidebarNav` follows: push the boundary into the smallest wrapper.

            Inside the gutter wrapper rather than around the drawer, so the provider's own
            subtree does not sit between the drawer's two children. The modal itself renders
            in the top layer regardless of where it is mounted. */}
        <div className="flex flex-1 flex-col px-4 sm:px-6 lg:px-10">
          <AddTransactionProvider>{children}</AddTransactionProvider>
        </div>
      </div>
      <div className="drawer-side">
        <label
          htmlFor={DRAWER_TOGGLE_ID}
          aria-label="Close sidebar"
          className="drawer-overlay"
        ></label>
        {/* The footer's name and email are real as of PET-52. They take two rows
            in two databases to assemble - the names from the per-user `profile`
            row, the email from the central `users` row - which is exactly what
            `GET /api/profile` stitches, and the reason the session read alone
            could never have fixed this. */}
        <SidebarNav
          firstName={profile.firstName}
          lastName={profile.lastName}
          email={profile.email}
        />
      </div>
    </div>
  );
}
