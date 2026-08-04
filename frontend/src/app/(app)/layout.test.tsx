import { render, screen } from '@testing-library/react';

// Relative rather than the `@/lib/session` alias every other file uses, and it
// has to be: `jest.mock('@/lib/session')` from inside this directory fails with
// "Cannot find module", because Jest's resolver mishandles the parentheses of the
// `(app)` route group when it applies the alias mapping. A plain `import` through
// the alias works fine, which is what makes the failure confusing. The relative
// path resolves to the same module, and Jest's registry keys on the resolved
// path, so this still intercepts layout.tsx's own aliased import.
import { requireSession } from '../../lib/session';

import AppLayout, { dynamic } from './layout';

// The shell layout is three lines long and every one of them fails silently if
// deleted, which is why it has a test at all. Two of the three are invisible to
// any rendering assertion, so they are asserted on the module.
//
// SidebarNav is a client component that calls usePathname(), and jsdom has no
// App Router, so the mock below is what lets the layout render here at all.
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

jest.mock('../../lib/session', () => ({
  requireSession: jest.fn().mockResolvedValue(undefined),
}));

describe('the (app) segment configuration', () => {
  it('renders dynamically, so the month is read per request', () => {
    // Delete `export const dynamic` from layout.tsx and nothing else in this
    // suite notices: Next then prerenders the four pages at build time and every
    // header shows whatever month the build ran in, until somebody looks a month
    // later. That is the entire reason this assertion exists.
    //
    // It becomes redundant once PET-52's cookies() read forces the segment
    // dynamic on its own - safe to delete then, and worth deleting rather than
    // leaving as a claim about something that is no longer load-bearing.
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('AppLayout', () => {
  it('gates the shell on a session', async () => {
    // The single call that will be the whole of AC5 once PET-52 implements it.
    // Today requireSession is a documented no-op, so without this assertion the
    // call site could be dropped with the suite green, and the deferral would
    // quietly become an omission.
    render(await AppLayout({ children: null }));

    expect(requireSession).toHaveBeenCalled();
  });

  it('mounts the sidebar', async () => {
    render(await AppLayout({ children: null }));

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('renders the page beside it', async () => {
    render(await AppLayout({ children: <p>page content</p> }));

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders no heading of its own', async () => {
    // The h1 belongs to PageHeader, which each page renders. A heading here
    // would compete with it, and ui/Sidebar deliberately renders none either.
    render(await AppLayout({ children: null }));

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });
});
