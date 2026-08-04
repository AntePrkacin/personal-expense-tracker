'use client';

import { usePathname } from 'next/navigation';

import { Sidebar, type SidebarItem } from '@/components/ui/Sidebar';

// The (app) shell's mount point for ui/Sidebar, and the one client component in
// the shell.
//
// It exists because of a constraint PET-18 recorded in advance: Sidebar takes
// `active` as a required prop so it can stay a Server Component like every other
// file in ui/, but an App Router layout cannot read the pathname on the server.
// Somebody has to call usePathname(), and this is the smallest thing that can.
// Deriving it inside Sidebar instead would force 'use client' onto the whole
// component and break ui.stories.test.tsx, which renders every story under Jest
// with no router in context.
//
// The profile comes down as props rather than being fetched here, which keeps
// the fetch (and, for now, the placeholder standing in for one) in the Server
// Component layout.

/**
 * Pathname prefix to sidebar key.
 *
 * The hrefs are Sidebar's own, declared in its NAV_SECTIONS, and this is the
 * other half of that contract: the routes under app/(app)/ have to match both.
 *
 * Matched by prefix rather than equality, so a nested route keeps its section
 * lit - `/transactions/abc` is still Transactions. Ordered longest-first is
 * unnecessary here because no href is a prefix of another, but the boundary
 * check (`/` after the href) is not: without it `/settings-import` would light
 * Settings.
 */
const ROUTES: readonly { href: string; key: SidebarItem }[] = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/transactions', key: 'transactions' },
  { href: '/insights', key: 'insights' },
  { href: '/settings', key: 'settings' },
];

export function activeItem(pathname: string): SidebarItem {
  const match = ROUTES.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));

  // Unreachable from inside the group, since every route below (app)/ is one of
  // the four. Falling back rather than throwing because a highlight is not worth
  // a crashed layout, and `active` has no "none" value by design - the Figma
  // component set draws no such variant.
  return match?.key ?? 'dashboard';
}

type SidebarNavProps = {
  firstName: string;
  lastName: string;
  email: string;
};

export function SidebarNav({ firstName, lastName, email }: SidebarNavProps) {
  const active = activeItem(usePathname());

  return (
    // Sidebar is `h-full` and pins its footer with justify-between, so it needs
    // a constrained height from whatever mounts it - its own comment names this
    // exact shape. sticky keeps it in place while the content column scrolls,
    // which is what AC4's "the sidebar persists" means on a page taller than the
    // viewport; shrink-0 stops a wide table squeezing its 260px.
    <div className="sticky top-0 h-screen shrink-0">
      <Sidebar active={active} firstName={firstName} lastName={lastName} email={email} />
    </div>
  );
}
