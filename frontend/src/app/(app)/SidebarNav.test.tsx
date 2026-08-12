import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import { SIDEBAR_HREFS, SIDEBAR_ITEMS } from '@/components/ui/Sidebar';

import { DRAWER_TOGGLE_ID } from './drawer';
import { matchItem, SidebarNav } from './SidebarNav';

// jsdom has no App Router, so usePathname() throws without this. Mocking it is
// also the only way to drive the component through all four states.
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const mockPathname = (pathname: string) => {
  (usePathname as jest.Mock).mockReturnValue(pathname);
};

/**
 * Every prop this component needs, spread by each render below.
 *
 * `logOut` is a stub here because this file asserts nothing about it: the panel's
 * own control is `Sidebar.test.tsx`'s and the threading through to it is
 * `layout.test.tsx`'s. What it does prove by being required is that this wrapper
 * forwards it - the prop is unused by `SidebarNav` itself, so nothing else in this
 * suite would notice it being dropped on the way past.
 *
 * Worth knowing how its absence surfaced, because it is the trap
 * `frontend/CLAUDE.md` documents: adding the prop left this file eight type errors
 * that `npm run build` and all 3222 Jest tests missed, because the build never
 * reads a test file and Jest transpiles without checking types.
 * `npx tsc --noEmit` is what found them.
 */
const PROFILE = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  logOut: () => Promise.resolve(),
};

// The labels are the only thing this file states for itself. The keys come from
// SIDEBAR_ITEMS and the paths from SIDEBAR_HREFS, both Sidebar's own, so no
// assertion below can pass against a table that disagrees with the links it is
// checking. Restating the hrefs here is what made an earlier version of this file
// unable to notice a divergence.
const LABELS: Record<(typeof SIDEBAR_ITEMS)[number], string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  // "AI Assistant" since PET-76. The key is still `insights`, so nothing about the matching
  // this file is really about moved with the label.
  insights: 'AI Assistant',
  settings: 'Settings',
};

const CASES = SIDEBAR_ITEMS.map((key) => [key, SIDEBAR_HREFS[key], LABELS[key]] as const);

describe('matchItem', () => {
  it('has a case for every sidebar item', () => {
    // Guards the table above: a shrunken list still passes an it.each over it.
    expect(CASES).toHaveLength(SIDEBAR_ITEMS.length);
    expect(CASES.map(([key]) => key)).toEqual([...SIDEBAR_ITEMS]);
  });

  it.each(CASES)('matches %s at %s', (key, href) => {
    // Falsifiable for all four, including dashboard. matchItem returns undefined
    // rather than defaulting, so a broken lookup fails here instead of returning
    // the value this assertion happens to expect - which is exactly how the
    // landing route ended up untested before.
    expect(matchItem(href)).toBe(key);
  });

  it.each(CASES)('keeps %s lit on a nested route', (key, href) => {
    // A transaction detail view is still Transactions. Equality matching would
    // silently unhighlight the whole sidebar here.
    expect(matchItem(`${href}/abc`)).toBe(key);
  });

  it.each(CASES)('does not match a path merely prefixed by %s', (_key, href) => {
    // Why the boundary check needs the trailing slash: without it
    // `/settings-import` matches `/settings`. Asserted for all four rather than
    // just the one that prompted it, since the bug is in the comparison and not
    // in any single route.
    expect(matchItem(`${href}-archive`)).toBeUndefined();
  });

  it('matches nothing outside the four views', () => {
    expect(matchItem('/nowhere')).toBeUndefined();
    expect(matchItem('/')).toBeUndefined();
  });
});

describe('the route folders behind those hrefs', () => {
  // The one copy of the contract that no other test can reach. SIDEBAR_HREFS is
  // now the single declaration in code, but a route only exists if there is a
  // directory with a page.tsx in it, and renaming one is invisible to every
  // assertion above: the link would 404 with the whole suite green.
  it.each(CASES)('%s has a page at app/(app)%s', (_key, href) => {
    // __dirname is app/(app)/, and href starts with a slash, so this resolves to
    // the route segment directly.
    const page = path.join(__dirname, href, 'page.tsx');

    expect(fs.existsSync(page)).toBe(true);
  });
});

describe('SidebarNav', () => {
  it.each(CASES)('marks %s as the current page', (_key, href, label) => {
    mockPathname(href);
    render(<SidebarNav {...PROFILE} />);

    // aria-current, not the highlight class: this is the machine-readable half
    // of AC4, and the class is only how it looks.
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  });

  it.each(CASES)('marks nothing else current on %s', (_key, href, label) => {
    mockPathname(href);
    render(<SidebarNav {...PROFILE} />);

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(label);
  });

  it.each(CASES)('points the %s link at %s', (_key, href, label) => {
    mockPathname('/dashboard');
    render(<SidebarNav {...PROFILE} />);

    // Ties the rendered link back to the same map matchItem reads, so the
    // highlight and the destination cannot drift apart.
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('falls back to the dashboard on an unmatched pathname', () => {
    // The fallback lives in this component rather than in matchItem, so this is
    // where it has to be covered. Unreachable in the app, but a crashed layout
    // would be a worse answer than a wrong highlight.
    mockPathname('/nowhere');
    render(<SidebarNav {...PROFILE} />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('unchecks the drawer toggle when the pathname changes', () => {
    // The (app) layout - the checkbox included - persists across a soft
    // navigation, so this effect is the only thing that ever closes the
    // off-canvas drawer after a link is followed. The checkbox is rendered by
    // the layout, not by this component, so the test supplies one the same way.
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = DRAWER_TOGGLE_ID;
    document.body.appendChild(toggle);

    try {
      mockPathname('/dashboard');
      const { rerender } = render(<SidebarNav {...PROFILE} />);

      toggle.checked = true;
      mockPathname('/transactions');
      rerender(<SidebarNav {...PROFILE} />);

      expect(toggle.checked).toBe(false);
    } finally {
      toggle.remove();
    }
  });

  it('unchecks the drawer toggle when the link for the current section is tapped', () => {
    // The regression the pathname effect above cannot cover: `usePathname()` returns the same
    // string, so the effect never re-runs, and below `lg` the drawer and its scrim stayed over
    // the page. Nothing else can close it - the toggle id has three references in the app and
    // no other link carries a handler - so the tap was a dead end on the one item a user
    // looking at that page is most likely to reach for.
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = DRAWER_TOGGLE_ID;
    document.body.appendChild(toggle);

    try {
      mockPathname('/transactions');
      render(<SidebarNav {...PROFILE} />);

      toggle.checked = true;
      fireEvent.click(screen.getByRole('link', { name: 'Transactions' }));

      expect(toggle.checked).toBe(false);
    } finally {
      toggle.remove();
    }
  });

  it('passes the profile through to the footer', () => {
    // The shell supplies these; the sidebar derives the initials and the short
    // name from them. Asserting the derived forms proves the props arrived
    // rather than that the sidebar rendered.
    mockPathname('/dashboard');
    render(<SidebarNav {...PROFILE} />);

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('Ada L.')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
