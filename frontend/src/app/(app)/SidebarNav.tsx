'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { SIDEBAR_HREFS, SIDEBAR_ITEMS, Sidebar, type SidebarItem } from '@/components/ui/Sidebar';

import { DRAWER_TOGGLE_ID } from './drawer';

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
// The pathname it reads for the highlight also closes the drawer: both jobs are
// "react to a navigation", which is why the effect lives here rather than in a
// second client file.
//
// The profile comes down as props rather than being fetched here, which keeps
// the fetch (and, for now, the placeholder standing in for one) in the Server
// Component layout.

/**
 * Which view a pathname belongs to, or `undefined` for one that matches none.
 *
 * The hrefs are not restated here: `SIDEBAR_HREFS` is Sidebar's own declaration
 * and the only one in the app, so this cannot disagree with the links it is
 * highlighting.
 *
 * Matched by prefix rather than equality, so a nested route keeps its section
 * lit - `/transactions/abc` is still Transactions. Ordering is irrelevant because
 * no href is a prefix of another, but the boundary check (a `/` after the href)
 * is not: without it `/settings-import` would light Settings.
 *
 * **Returning `undefined` rather than defaulting here is deliberate, and it is a
 * testability decision.** With the fallback inside this function, the assertion
 * `matchItem('/dashboard') === 'dashboard'` could never fail - a completely
 * broken lookup returns `'dashboard'` too - which silently made the landing
 * route the one case with no real coverage. The caller defaults instead, so every
 * key here has to be genuinely matched.
 */
export function matchItem(pathname: string): SidebarItem | undefined {
  return SIDEBAR_ITEMS.find((key) => {
    const href = SIDEBAR_HREFS[key];
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

/**
 * What an unmatched pathname falls back to.
 *
 * Unreachable from inside the group, since every route below `(app)/` is one of
 * the four. Falling back rather than throwing because a highlight is not worth a
 * crashed layout, and `active` has no "none" value by design - the Figma
 * component set draws no such variant.
 */
const FALLBACK_ITEM: SidebarItem = 'dashboard';

type SidebarNavProps = {
  fullName: string;
  email: string;
};

/**
 * Unchecks the drawer's toggle, which is what closes the off-canvas panel.
 *
 * Written onto the DOM node rather than lifted into state, so the checkbox stays
 * uncontrolled and *opening* the drawer stays JavaScript-free - the reason the
 * layout can be a Server Component at all.
 */
function closeDrawer() {
  const toggle = document.getElementById(DRAWER_TOGGLE_ID);
  if (toggle instanceof HTMLInputElement) toggle.checked = false;
}

export function SidebarNav({ fullName, email }: SidebarNavProps) {
  const pathname = usePathname();
  const active = matchItem(pathname) ?? FALLBACK_ITEM;

  // Close the off-canvas drawer once a navigation lands. The (app) layout - the
  // checkbox included - persists across a soft navigation, so nothing else ever
  // unchecks it: below lg, following a sidebar link left the drawer and its
  // overlay open over the new page.
  useEffect(() => {
    closeDrawer();
  }, [pathname]);

  // **And on the click itself, which is not the same thing.** The effect above is
  // keyed on the pathname, so tapping the link for the section already open changes
  // nothing, the effect never re-runs, and the drawer plus its scrim stay over the
  // page - a dead-end tap on the one item a user is most likely to reach for while
  // looking at that page. Both are kept rather than the click alone: a navigation can
  // arrive from somewhere other than these five links (the browser's Back button, a
  // redirect out of a page), and only the pathname read sees those.
  return <Sidebar active={active} fullName={fullName} email={email} onNavigate={closeDrawer} />;
}
