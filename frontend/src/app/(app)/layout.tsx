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

/**
 * Forces dynamic rendering for the whole segment.
 *
 * The pages below read `new Date()` for the header overline. Without this Next
 * prerenders them at build time and every screen reads whatever month the build
 * ran in, forever - a bug that only shows up a month after deploying.
 *
 * PET-52's session read makes the segment dynamic anyway (`cookies()` opts a
 * route out on its own), so this line becomes redundant rather than wrong.
 */
export const dynamic = 'force-dynamic';

/**
 * The profile the sidebar footer shows. **None of this is real.**
 *
 * TODO(PET-52): replace with `GET /api/profile`, reached with the session
 * cookie. The endpoint exists now (PET-45) and answers all three fields in one
 * read; what is missing is the cookie, which has no branch yet - and note the
 * three fields do not come from one place on the backend either: names
 * live in the per-user database's `profile` row while the email lives on the
 * central `users` row, which is why `GET /api/auth/session` knows the email and
 * nothing knows the names.
 *
 * These are Figma's own sample values (nodes 18:246 and 40:687) on purpose, so
 * the shell diffs against the design rather than against invented copy. That
 * also makes them look convincing in a screenshot, which is the reason the
 * constant is named this loudly. Note ui/Sidebar itself is clean: its test pins
 * that these three strings appear nowhere in the component.
 */
const PLACEHOLDER_PROFILE = {
  firstName: 'Marko',
  lastName: 'Kovač',
  email: 'marko@email.com',
} as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Currently a no-op, which is PET-19's deferral of AC5. See lib/session.ts for
  // what PET-52 puts behind it.
  await requireSession();

  return (
    // `flex flex-1` rather than a height of its own: the root layout already
    // makes <body> `flex min-h-full flex-col`, so this fills what is left and
    // lays the two columns out side by side.
    <div className="flex flex-1">
      <SidebarNav {...PLACEHOLDER_PROFILE} />
      {/* min-w-0 so a wide child - the transactions table, later - overflows
          itself rather than pushing the 260px sidebar off-screen. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
