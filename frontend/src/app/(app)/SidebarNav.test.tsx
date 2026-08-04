import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import { SIDEBAR_ITEMS } from '@/components/ui/Sidebar';

import { activeItem, SidebarNav } from './SidebarNav';

// jsdom has no App Router, so usePathname() throws without this. Mocking it is
// also the only way to drive the component through all four states.
jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

const mockPathname = (pathname: string) => {
  (usePathname as jest.Mock).mockReturnValue(pathname);
};

const PROFILE = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };

const ROUTES = [
  ['/dashboard', 'dashboard', 'Dashboard'],
  ['/transactions', 'transactions', 'Transactions'],
  ['/insights', 'insights', 'Insights'],
  ['/settings', 'settings', 'Settings'],
] as const;

describe('activeItem', () => {
  it('covers every sidebar item', () => {
    // Guards the table below: dropping a row would shrink the it.each and still
    // pass. SIDEBAR_ITEMS is Sidebar's own list, so this also catches a fifth
    // view being added there without a route here.
    expect(ROUTES.map(([, key]) => key)).toEqual([...SIDEBAR_ITEMS]);
  });

  it.each(ROUTES)('maps %s to %s', (pathname, key) => {
    expect(activeItem(pathname)).toBe(key);
  });

  it('keeps the section lit on a nested route', () => {
    // A transaction detail view is still Transactions. Equality matching would
    // silently unhighlight the whole sidebar here.
    expect(activeItem('/transactions/abc')).toBe('transactions');
  });

  it('does not match a route that merely starts with the same characters', () => {
    // Why the prefix check requires the trailing slash. Without it
    // /settings-import would light Settings.
    expect(activeItem('/settings-import')).toBe('dashboard');
  });

  it('falls back rather than throwing on an unknown path', () => {
    // Unreachable from inside the group, but a crashed layout is a worse answer
    // than a wrong highlight, and `active` has no "none" value by design.
    expect(activeItem('/nowhere')).toBe('dashboard');
  });
});

describe('SidebarNav', () => {
  it.each(ROUTES)('marks %s as the current page', (pathname, _key, label) => {
    mockPathname(pathname);
    render(<SidebarNav {...PROFILE} />);

    // aria-current, not the highlight class: this is the machine-readable half
    // of AC4, and the class is only how it looks.
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  });

  it.each(ROUTES)('marks nothing else current on %s', (pathname, _key, label) => {
    mockPathname(pathname);
    render(<SidebarNav {...PROFILE} />);

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(label);
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
