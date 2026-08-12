import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Relative rather than the `@/lib/*` alias every other file uses, and it
// has to be: `jest.mock('@/lib/profile')` fails with "Cannot find module". A plain
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
import { requireProfile } from '../../lib/profile';

import { useDeleteTransaction } from './DeleteTransactionProvider';
import { DELETE_TRANSACTION_TITLE } from './DeleteTransactionDialog';
import { useEditTransaction } from './EditTransactionProvider';
import { useMoney } from './PreferencesProvider';
import { assertiveAnnouncement, politeAnnouncement, toastMessages } from './toastQueries';
import { useToast } from './ToastProvider';
import AppLayout from './layout';

// The shell layout's two jobs: gate the segment and lay the two columns out. The gate is
// one line whose deletion no rendering assertion would notice, so it is asserted
// directly.
//
// SidebarNav is a client component that calls usePathname(), and jsdom has no
// App Router, so the mock below is what lets the layout render here at all.
// `useRouter` joined it for PET-32: the layout now mounts a third provider whose modal calls it,
// so rendering the shell with that modal open reaches the hook. `refresh` is never asserted here -
// `EditTransactionModal.test.tsx` owns that - it just has to exist.
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock('../../lib/profile', () => ({ requireProfile: jest.fn() }));

const PROFILE = {
  fullName: 'Ana Horvat',
  email: 'ana@email.com',
  currency: 'EUR',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireProfile as jest.Mock).mockResolvedValue(PROFILE);
});

/** Frame 11's row, for the provider-nesting test at the bottom of this file. */
const TRANSACTION = {
  id: '0198c2a1-0000-7000-8000-0000000000b1',
  amount: 24,
  categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
  date: '2025-10-08',
  merchant: 'Whole Foods',
  note: 'Weekly groceries',
  createdAt: '2025-10-08T09:30:00.000Z',
  updatedAt: '2025-10-08T09:30:00.000Z',
};

/**
 * A child that opens the **delete confirmation**, for the provider-ordering test.
 *
 * That dialog formats the amount it is about to remove, so it is the one place a `useMoney()` call
 * renders in a *dialog's* position rather than in `children`'s - which is what makes the ordering
 * assertable at all.
 */
function OpenDeleteDialog() {
  const { open } = useDeleteTransaction();

  return (
    <button
      type="button"
      onClick={() =>
        open({
          id: TRANSACTION.id,
          merchant: TRANSACTION.merchant,
          amount: TRANSACTION.amount,
          date: TRANSACTION.date,
        })
      }
    >
      Delete it
    </button>
  );
}

/** A page-shaped child that opens the edit modal, standing in for the row menu's kebab. */
function OpenEditModal() {
  const { open } = useEditTransaction();

  return (
    <button type="button" onClick={() => open(TRANSACTION)}>
      Edit it
    </button>
  );
}

/** A child that posts a notification, standing in for any of the twelve call sites (PET-77). */
function PostAToast() {
  const { post } = useToast();

  return (
    <button type="button" onClick={() => post({ kind: 'success', message: 'Transaction added.' })}>
      Post it
    </button>
  );
}

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

describe('AC5: the shell is gated', () => {
  it('asks for the profile before rendering anything', async () => {
    // One call, not two. The gate and the footer data come from the same guarded read,
    // which is what makes it impossible for them to disagree.
    render(await AppLayout({ children: null }));

    expect(requireProfile).toHaveBeenCalledTimes(1);
  });

  it('leaves both the redirect and the throw to requireProfile', async () => {
    // Deliberately no branching here. The layout used to inspect a nullable profile and
    // redirect on it, and that second opinion is exactly what produced a loop with
    // /login. Anything this layout can see, requireProfile has already decided.
    const failure = new Error('Could not load the profile: the backend did not answer.');
    (requireProfile as jest.Mock).mockRejectedValue(failure);

    await expect(AppLayout({ children: null })).rejects.toThrow(/Could not load the profile/);
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

  it('wires the logout action all the way to the footer control (PET-84)', async () => {
    render(await AppLayout({ children: null }));

    // Three files have to agree for this to pass - this layout names the action,
    // `SidebarNav` forwards it across the client boundary, and `ui/Sidebar` puts a
    // submitter inside a form carrying it - and a prop dropped in the middle
    // typechecks nowhere but is invisible to every other assertion in this file.
    // Pinned here rather than in `Sidebar.test.tsx`, which renders the panel with
    // a stub and so cannot see the threading at all.
    const control = screen.getByRole('button', { name: 'Log out' });
    expect(control.closest('form')).not.toBeNull();
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

  it('names the drawer toggle exactly once, whichever state it is in', async () => {
    // The toggle is one checkbox with two `<label>`s pointing at it - the hamburger and the
    // scrim - and a label's `aria-label` replaces its subtree in that checkbox's own name
    // computation. With "Open sidebar" on one and "Close sidebar" on the other, Chrome computed
    // the name as "Open sidebar Close sidebar" once the drawer was open: a self-contradiction
    // announced at the moment a screen-reader user is trying to close it. One stable name that
    // is true in both states is the fix, and `checked` is what carries the state.
    render(await AppLayout({ children: null }));

    const toggle = screen.getByRole('checkbox', { name: 'Toggle sidebar' });

    expect(toggle).toHaveAccessibleName('Toggle sidebar');
    expect(screen.queryByLabelText(/Open sidebar|Close sidebar/)).toBeNull();
  });

  it('renders no heading of its own', async () => {
    // The h1 belongs to PageHeader, which each page renders. A heading here
    // would compete with it, and ui/Sidebar deliberately renders none either.
    render(await AppLayout({ children: null }));

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });

  it('mounts the three modal providers, with the edit one inside the delete one', async () => {
    // **PET-32 made the nesting order load-bearing**, where PET-33's comment could still say it
    // carried nothing. `EditTransactionProvider` calls `useDeleteTransaction()` in its own body, so
    // mounted outside that provider it throws while rendering - on every page, not on the first
    // Edit click. Every other test in this file would fail too, which is a fine safety net and a
    // terrible explanation, so this is the one that says why.
    //
    // A child that opens the edit modal is what proves all three are really here: the hook
    // resolving means the edit provider is mounted, and its own render having succeeded means the
    // delete provider is outside it.
    render(await AppLayout({ children: <OpenEditModal /> }));

    await userEvent.click(screen.getByRole('button', { name: 'Edit it' }));

    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument();
  });

  it('mounts ToastProvider, with both announcers empty before anything is posted', async () => {
    // **The region has to be in the tree from the first render**, which is the opposite of the rule
    // every modal here follows. A closed `<dialog>` must not be mounted because `queryAllByText`
    // reads straight through `display: none`; these two are live regions, and one created in the
    // same commit as its content is not announced at all. So the assertion is about their **text**,
    // not their presence - `getByRole('status')` cannot tell a working region from a broken one.
    render(await AppLayout({ children: null }));

    expect(politeAnnouncement()).toBe('');
    expect(assertiveAnnouncement()).toBe('');
  });

  it('lets a child post into that region', async () => {
    // What this proves is that the provider is mounted and the seam resolves. It deliberately does
    // **not** claim the provider is outermost: a probe in `children` resolves however deep the
    // provider sits, which is the trap the `PreferencesProvider` test below records paying for. The
    // property that matters - that a *dialog* can post - is pinned where the dialogs are, in each
    // call site's own suite.
    render(await AppLayout({ children: <PostAToast /> }));

    await userEvent.click(screen.getByRole('button', { name: 'Post it' }));

    expect(politeAnnouncement()).toBe('Transaction added.');
    expect(toastMessages()).toEqual(['Transaction added.']);
  });

  it('mounts PreferencesProvider outside the three modal providers', async () => {
    // **The probe has to render where a *dialog* renders, not where `children` does**, and the first
    // version of this test got that wrong. The three dialogs are conditional siblings of `children`
    // inside their own providers, so a hook probe placed in `children` resolves however deep
    // `PreferencesProvider` sits - verified: with the provider moved to wrap only `{children}`, all
    // of this file passed while the first Delete click threw.
    //
    // Opening the delete confirmation is what puts a `useMoney()` call in the dialog's own position:
    // `DeleteTransactionDialog` formats the amount it is about to remove. If the provider is nested
    // inside `DeleteTransactionProvider`, this render throws instead of showing the dialog.
    render(await AppLayout({ children: <OpenDeleteDialog /> }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }));

    expect(screen.getByRole('dialog', { name: DELETE_TRANSACTION_TITLE })).toBeInTheDocument();
    // The formatted amount is the proof the dialog reached the provider rather than merely mounting.
    // Euro since PET-72 flipped the default, which this fixture now carries.
    expect(screen.getByText(/€24\.00/)).toBeInTheDocument();
  });

  it('binds that provider to the read profile rather than to a default', async () => {
    // The failure this catches is the quiet one: a provider wired to a literal default renders a
    // sterling account's whole dashboard in euros and looks entirely correct doing it. The fixture
    // is `GBP` against a default of `EUR` since PET-72, so the assertion still fails on a hard-coded
    // default rather than accidentally agreeing with one.
    (requireProfile as jest.Mock).mockResolvedValue({ ...PROFILE, currency: 'GBP' });

    function Probe() {
      return <p>{useMoney().formatWhole(1240.5)}</p>;
    }

    render(await AppLayout({ children: <Probe /> }));

    expect(screen.getByText('£1,241')).toBeInTheDocument();
  });

  it('renders none of the three dialogs until something opens one', async () => {
    // The property `(app)/pages.test.tsx` leans on, asserted here at the layout that mounts them:
    // a closed `<dialog>` is invisible to `queryByRole` and entirely visible to
    // `queryAllByLabelText`, so three always-mounted dialogs would make every text and label query
    // on every screen ambiguous forever.
    render(await AppLayout({ children: null }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete this transaction?')).not.toBeInTheDocument();
  });
});
