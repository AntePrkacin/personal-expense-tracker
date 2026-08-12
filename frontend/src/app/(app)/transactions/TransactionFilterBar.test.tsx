import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CategoryLabel } from '../../../lib/categories';
import type { TransactionFilters } from '../../../lib/transactions';

import { FilterNavigationProvider } from './FilterNavigation';
import { TransactionFilterBar } from './TransactionFilterBar';

// The bar's controls (TRN-3, AC4, AC5): a category select, the search field and a sort select.
//
// **The period pill left and the search field arrived, both at PET-67.** So this suite now renders a
// real `TransactionSearch`, which owns a debounce - every assertion about typing is that file's, and
// the two cases here only prove the field is present, named and prefilled from the URL. Nothing in
// this file advances a timer.

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

/** The search field, by its `aria-label`: the design draws no visible label for it either. */
const searchField = () => screen.getByRole('textbox', { name: 'Search transactions' });

beforeEach(() => {
  replace.mockClear();
});

describe('the three controls', () => {
  it('renders a category select, the search field and a sort select', () => {
    // By role rather than by class, so the assertion survives a restyling: PET-57 replaced a
    // hand-drawn box plus an overlaid SVG chevron with a stock daisyUI `select`, and nothing
    // in this suite had to change - which is the point of pinning behaviour.
    setup();

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(pill('Category')).toBeInTheDocument();
    expect(pill('Sort')).toBeInTheDocument();
    expect(searchField()).toBeInTheDocument();
  });

  it('no longer draws a period pill, which moved to the header (PET-67)', () => {
    // Worth asserting the absence rather than just dropping the old case: the date-form option
    // workaround went with it, and a pill reappearing here would mean two controls filtering one
    // key - the state `filters.ts` calls two URLs for one view.
    setup();

    expect(screen.queryByRole('combobox', { name: 'Period' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Budgeting period' })).not.toBeInTheDocument();
  });

  it('names each one, since the design draws no visible labels', () => {
    // The controls are label-less in the frame, which is why these are not `ui/Select` - that
    // component always renders a `FieldShell` label above the control. An aria-label is what
    // keeps three unnamed controls from being three unnamed controls.
    setup();

    expect(screen.queryByText('Category')).not.toBeInTheDocument();
    expect(pill('Category')).toHaveAccessibleName('Category');
    expect(searchField()).toHaveAccessibleName('Search transactions');
  });

  it('opens on the values frame 06 draws closed', () => {
    // "All categories", an empty search box and "Newest first", on a bare /transactions.
    setup();

    expect(pill('Category')).toHaveDisplayValue('All categories');
    expect(pill('Sort')).toHaveDisplayValue('Newest first');
    expect(searchField()).toHaveValue('');
  });

  it('prefills the search field from the URL', () => {
    setup({ search: 'Uber' });

    expect(searchField()).toHaveValue('Uber');
  });
});

describe('the options', () => {
  it('lists the account’s categories under "All categories"', () => {
    setup();

    expect(
      Array.from(pill('Category').querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['All categories', 'Groceries', 'Transport']);
  });

  it('offers the four sorts the API can serve', () => {
    // This is A16's amendment: Figma never draws the dropdown open, so shipping one option would
    // leave AC5 unimplementable. The two amount entries are PET-67's, and they are the half of A16
    // the designer never drew at all.
    setup();

    expect(
      Array.from(pill('Sort').querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Newest first', 'Oldest first', 'Highest amount', 'Lowest amount']);
  });
});

describe('changing a filter', () => {
  it('navigates with the chosen category', async () => {
    const { user } = setup();

    await user.selectOptions(pill('Category'), GROCERIES);

    expect(replace).toHaveBeenCalledWith(`/transactions?categoryId=${GROCERIES}`);
  });

  it('navigates with the chosen sort', async () => {
    const { user } = setup();

    await user.selectOptions(pill('Sort'), 'date_asc');

    expect(replace).toHaveBeenCalledWith('/transactions?sort=date_asc');
  });

  it('navigates with an amount sort, which is PET-67', async () => {
    // Worth its own case rather than leaning on the one above: the amount values are the two
    // this screen could not serve until the contract grew, so a regression that dropped them
    // from `SORT_OPTIONS` would leave the date case above passing.
    const { user } = setup();

    await user.selectOptions(pill('Sort'), 'amount_desc');

    expect(replace).toHaveBeenCalledWith('/transactions?sort=amount_desc');
  });

  it('replaces rather than pushes', async () => {
    // Views of one page, not places - so Back should leave the screen rather than walk every
    // category the user tried.
    const { user } = setup();

    await user.selectOptions(pill('Category'), GROCERIES);

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
    setup({ categoryId: GROCERIES, period: 'all', sort: 'date_asc', search: 'Uber' });

    expect(pill('Category')).toHaveDisplayValue('Groceries');
    expect(pill('Sort')).toHaveDisplayValue('Oldest first');
    expect(searchField()).toHaveValue('Uber');
  });

  it('carries an unrendered period through a change it does not draw', async () => {
    // The bar no longer has a period control and still has to preserve the filter: `apply` spreads
    // the whole set, so `?period=all` survives a category change even though nothing here can show
    // it. That is what makes losing the pill a move rather than a deletion.
    const { user } = setup({ period: 'all' });

    await user.selectOptions(pill('Sort'), 'amount_desc');

    expect(replace).toHaveBeenCalledWith('/transactions?period=all&sort=amount_desc');
  });
});

describe('resetting to a default', () => {
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
