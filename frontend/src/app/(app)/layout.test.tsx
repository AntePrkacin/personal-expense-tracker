import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';

// Relative rather than the `@/lib/*` alias every other file uses, and it
// has to be: `jest.mock('@/lib/session')` fails with "Cannot find module". A plain
// `import` through the alias works fine, which is what makes the failure confusing.
//
// This comment used to blame the parentheses of the `(app)` route group. It is not
// them: PET-8 reproduced the identical failure from `src/app/` and `src/lib/`, with
// no parentheses anywhere in the path. The resolved Jest config carries no
// moduleNameMapper entry for `@/*` and a null modulePaths, so the alias is simply
// unresolvable from `jest.mock`. Plain imports work because SWC rewrites aliased
// specifiers at transform time from tsconfig `paths`, while `jest.mock`'s argument
// is a runtime string the resolver sees verbatim.
//
// The relative path resolves to the same module, and Jest's registry keys on the
// resolved path, so this still intercepts layout.tsx's own aliased import.
import { readProfile } from '../../lib/profile';
import { requireSession } from '../../lib/session';

import AppLayout from './layout';

// The shell layout's three jobs: gate the segment, fetch the footer's profile, and lay
// the two columns out. The first two fail silently when dropped, which is why they are
// asserted directly rather than through the markup alone.
//
// SidebarNav is a client component that calls usePathname(), and jsdom has no
// App Router, so the mock below is what lets the layout render here at all. `redirect`
// joins it because the profile branch calls it.
//
// **The redirect mock throws, unlike the plain `jest.fn()` the other route suites use.**
// The real one is typed `never` and throws NEXT_REDIRECT, which is what lets this layout
// treat everything after the null check as unreachable and read `profile.firstName`
// without a second guard. A mock that returns undefined would fall through into markup
// the real app never reaches and fail on a TypeError, testing nothing.
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

jest.mock('../../lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('../../lib/profile', () => ({
  readProfile: jest.fn(),
}));

const SESSION = {
  userId: '0198c2a1-0000-7000-8000-000000000001',
  email: 'marko@email.com',
  expiresAt: '2026-09-04T10:00:00.000Z',
};

const PROFILE = {
  firstName: 'Ana',
  lastName: 'Horvat',
  email: 'ana@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireSession as jest.Mock).mockResolvedValue(SESSION);
  (readProfile as jest.Mock).mockResolvedValue(PROFILE);
});

describe('the (app) segment configuration', () => {
  it('declares no `dynamic` export, because the cookie read forces it', async () => {
    // This used to assert `export const dynamic === 'force-dynamic'`, which existed so
    // the pages' `new Date()` was not frozen at build time. PET-52's `cookies()` read
    // opts the segment out on its own, so the export became a claim about something no
    // longer load-bearing and was deleted - the exact condition the old assertion's own
    // comment set for removing it. Inverted rather than dropped, so nobody restores it.
    const layout = await import('./layout');

    expect(layout).not.toHaveProperty('dynamic');
  });
});

describe('AC5: the shell is gated on a session', () => {
  it('asks for one before rendering anything', async () => {
    render(await AppLayout({ children: null }));

    expect(requireSession).toHaveBeenCalled();
  });

  it('leaves the redirect to requireSession rather than branching itself', async () => {
    // The gate answers by redirecting, so a live session reaches here with nothing to
    // decide. Two call sites deciding the same thing is how they come to disagree.
    render(await AppLayout({ children: null }));

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('the sidebar footer profile', () => {
  it('shows the signed-in user, not Figma sample data', async () => {
    // PLACEHOLDER_PROFILE lived here for three tickets and looked entirely real in a
    // screenshot, which is why it was named that loudly. Asserting on a *different*
    // person than the sample one is what makes this test able to fail.
    render(await AppLayout({ children: null }));

    expect(screen.getByText('Ana H.')).toBeInTheDocument();
    expect(screen.getByText('ana@email.com')).toBeInTheDocument();
  });

  it('shows no trace of the placeholder it replaced', async () => {
    render(await AppLayout({ children: null }));

    expect(screen.queryByText(/Marko/)).not.toBeInTheDocument();
    expect(screen.queryByText('marko@email.com')).not.toBeInTheDocument();
  });

  it('reads the profile concurrently with the gate', async () => {
    // Both are issued before either is awaited, so the shell costs an extra request
    // rather than an extra round trip. A sequential rewrite passes every other
    // assertion here.
    let profileStarted = false;
    (requireSession as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(SESSION), 0);
        }),
    );
    (readProfile as jest.Mock).mockImplementation(() => {
      profileStarted = true;
      return Promise.resolve(PROFILE);
    });

    const rendered = AppLayout({ children: null });

    expect(profileStarted).toBe(true);
    render(await rendered);
  });

  it('sends a session with no profile back to Log in', async () => {
    // A broken invariant rather than an empty state: verification writes the profile row
    // before it clears the onboarding payload, so a verified session implies one. The
    // alternative is a sidebar with holes where a name should be.
    (readProfile as jest.Mock).mockResolvedValue(null);

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('AppLayout', () => {
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
