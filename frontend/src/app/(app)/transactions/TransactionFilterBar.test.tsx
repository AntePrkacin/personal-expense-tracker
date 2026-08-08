import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CategoryLabel } from '../../../lib/categories';
import type { TransactionFilters } from '../../../lib/transactions';

import { FilterNavigationProvider } from './FilterNavigation';
import { TransactionFilterBar } from './TransactionFilterBar';

// The three selects (TRN-3, AC4, AC5).

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

const GROCERIES = '0198c2a1-0000-7000-8000-0000000000a1';

const CATEGORIES: CategoryLabel[] = [
  { id: GROCERIES, name: 'Groceries', color: 'success' as const, icon: 'shopping-basket' as const },
  {
    id: '0198c2a1-0000-7000-8000-0000000000a2',
    name: 'Transport',
    color: 'info' as const,
    icon: 'car' as const,
  },
];

/** The provider is real: it owns the router call, and the bar throws outside it by design. */
function setup(filters: TransactionFilters = {}, categories = CATEGORIES) {
  const user = userEvent.setup();
  render(
    <FilterNavigationProvider>
      <TransactionFilterBar filters={filters} categories={categories} />
    </FilterNavigationProvider>,
  );

  return { user };
}

const pill = (name: string) => screen.getByRole('combobox', { name });

beforeEach(() => {
  replace.mockClear();
});

describe('the three controls', () => {
  it('renders a category, a period and a sort select', () => {
    // By role rather than by class, so the assertion survives a restyling: PET-57 replaced a
    // hand-drawn box plus an overlaid SVG chevron with a stock daisyUI `select`, and nothing
    // in this suite had to change - which is the point of pinning behaviour.
    setup();

    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(pill('Category')).toBeInTheDocument();
    expect(pill('Period')).toBeInTheDocument();
    expect(pill('Sort')).toBeInTheDocument();
  });

  it('names each one, since the design draws no visible labels', () => {
    // The pills are label-less in the frame, which is why these are not `ui/Select` - that
    // component always renders a `FieldShell` label above the control. An aria-label is what
    // keeps three unnamed comboboxes from being three unnamed comboboxes.
    setup();

    expect(screen.queryByText('Category')).not.toBeInTheDocument();
    expect(pill('Category')).toHaveAccessibleName('Category');
  });

  it('opens on the values frame 06 draws closed', () => {
    // "All categories", "This month" and "Newest first", on a bare /transactions.
    setup();

    expect(pill('Category')).toHaveDisplayValue('All categories');
    expect(pill('Period')).toHaveDisplayValue('This month');
    expect(pill('Sort')).toHaveDisplayValue('Newest first');
  });
});

describe('the options', () => {
  it('lists the account’s categories under "All categories"', () => {
    setup();

    expect(
      Array.from(pill('Category').querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['All categories', 'Groceries', 'Transport']);
  });

  it('offers the three periods and two sorts the API can serve', () => {
    // This is A16's amendment: Figma never draws either dropdown open, so shipping one
    // option each would leave AC4's period half and AC5 unimplementable.
    setup();

    expect(
      Array.from(pill('Period').querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['This month', 'Last month', 'All time']);
    expect(
      Array.from(pill('Sort').querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Newest first', 'Oldest first']);
  });
});

describe('changing a filter', () => {
  it('navigates with the chosen category', async () => {
    const { user } = setup();

    await user.selectOptions(pill('Category'), GROCERIES);

    expect(replace).toHaveBeenCalledWith(`/transactions?categoryId=${GROCERIES}`);
  });

  it('navigates with the chosen period', async () => {
    const { user } = setup();

    await user.selectOptions(pill('Period'), 'previous');

    expect(replace).toHaveBeenCalledWith('/transactions?period=previous');
  });

  it('navigates with the chosen sort', async () => {
    const { user } = setup();

    await user.selectOptions(pill('Sort'), 'date_asc');

    expect(replace).toHaveBeenCalledWith('/transactions?sort=date_asc');
  });

  it('replaces rather than pushes', async () => {
    // Three views of one page, not three places - so Back should leave the screen rather
    // than walk every category the user tried.
    const { user } = setup();

    await user.selectOptions(pill('Period'), 'all');

    expect(replace).toHaveBeenCalled();
  });

  it('scrolls to the top, unlike the search field', async () => {
    // No `scroll: false` here: the selects sit above the table, so whoever touches one is
    // already at the top, and landing on the new first row after a sort change is right.
    const { user } = setup();

    await user.selectOptions(pill('Sort'), 'date_asc');

    expect(replace.mock.calls[0]).toHaveLength(1);
  });
});

describe('the other filters survive a change', () => {
  it('keeps the search, the period and the sort when the category changes', async () => {
    const { user } = setup({ search: 'Uber', period: 'all', sort: 'date_asc' });

    await user.selectOptions(pill('Category'), GROCERIES);

    expect(replace).toHaveBeenCalledWith(
      `/transactions?search=Uber&period=all&sort=date_asc&categoryId=${GROCERIES}`,
    );
  });

  it('renders the values the URL is actually filtered by', async () => {
    setup({ categoryId: GROCERIES, period: 'all', sort: 'date_asc' });

    expect(pill('Category')).toHaveDisplayValue('Groceries');
    expect(pill('Period')).toHaveDisplayValue('All time');
    expect(pill('Sort')).toHaveDisplayValue('Oldest first');
  });
});

describe('resetting to a default', () => {
  it('removes the key rather than writing it out', async () => {
    // One view, one URL: `?period=current` renders exactly what `/transactions` renders.
    const { user } = setup({ period: 'all' });

    await user.selectOptions(pill('Period'), 'current');

    expect(replace).toHaveBeenCalledWith('/transactions');
  });

  it('removes the sort key when "Newest first" is chosen back', async () => {
    const { user } = setup({ sort: 'date_asc' });

    await user.selectOptions(pill('Sort'), 'date_desc');

    expect(replace).toHaveBeenCalledWith('/transactions');
  });

  it('treats "All categories" as no category filter at all', async () => {
    const { user } = setup({ categoryId: GROCERIES, search: 'Uber' });

    await user.selectOptions(pill('Category'), '');

    expect(replace).toHaveBeenCalledWith('/transactions?search=Uber');
  });
});

describe('an account with no categories', () => {
  it('still renders the category select with its "All categories" entry', () => {
    // Not reachable today - provisioning seeds the fallback - but an empty <select> with no
    // options is a control that cannot be operated.
    setup({}, []);

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('All categories');
  });
});
