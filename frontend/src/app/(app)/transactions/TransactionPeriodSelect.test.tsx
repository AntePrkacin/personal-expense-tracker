import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import type { TransactionFilters } from '../../../lib/transactions';

import { FilterNavigationProvider } from './FilterNavigation';
import { TransactionPeriodSelect } from './TransactionPeriodSelect';

// The Transactions header's period control (PET-67), and the two things it exists to get right:
// preserving the other three filters, and offering "All time" at all.

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

const CURRENT = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true };

const PREVIOUS = {
  start: '2025-09-01',
  end: '2025-10-01',
  label: 'September 2025',
  current: false,
};

/** A period no month arithmetic could name: the stretched one a pay-day change produces. */
const STRETCHED = {
  start: '2025-07-15',
  end: '2025-09-01',
  label: 'July 2025 / August 2025',
  current: false,
};

const PERIODS = [CURRENT, PREVIOUS, STRETCHED];

/**
 * The provider is real: it owns the router call, and `useFilterNavigation` throws outside it.
 *
 * **One options object rather than two positional parameters**, because the `period=all` case has to
 * pass `selected: undefined` on purpose - and a default parameter fires for an explicitly passed
 * `undefined`, so the positional version silently tested the current period twice and the case that
 * matters not at all. Spelling the key in and defaulting on `'selected' in options` is what makes
 * "absent" and "deliberately undefined" different here.
 */
function setup(options: { filters?: TransactionFilters; selected?: string } = {}) {
  const user = userEvent.setup();

  render(
    <FilterNavigationProvider>
      <TransactionPeriodSelect
        periods={PERIODS}
        filters={options.filters ?? {}}
        selected={'selected' in options ? options.selected : CURRENT.start}
      />
    </FilterNavigationProvider>,
  );

  return { user };
}

const select = () => screen.getByRole('combobox', { name: 'Budgeting period' });

beforeEach(() => {
  replace.mockClear();
});

describe('what it offers', () => {
  it('lists every period the account has, then All time', () => {
    setup();

    expect(Array.from(select().querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'October 2025',
      'September 2025',
      'July 2025 / August 2025',
      'All time',
    ]);
  });

  it('prints a label no month arithmetic could produce', () => {
    // The reason the label is never derived on this side: a period stretched by a pay-schedule
    // change spans three month names, and the fact that makes it do so is a `period_rules` row
    // this app cannot see.
    setup();

    expect(screen.getByRole('option', { name: 'July 2025 / August 2025' })).toBeInTheDocument();
  });

  it('shows the period the response covers, not the URL', () => {
    setup({ selected: PREVIOUS.start });

    expect(select()).toHaveValue(PREVIOUS.start);
  });

  it('shows the current period on a URL carrying no period at all', () => {
    setup();

    expect(select()).toHaveValue(CURRENT.start);
  });

  it('shows All time when the response names no period', () => {
    // `period: null` is exactly `?period=all`, the one filter the contract documents as having no
    // single label. Without the appended entry this is a value matching no option, which browsers
    // draw as blank or as the wrong first one.
    setup({ filters: { period: 'all' }, selected: undefined });

    expect(select()).toHaveValue('all');
  });
});

describe('what it navigates to', () => {
  it('keeps the search, the category and the sort', async () => {
    // The whole reason this component exists rather than `PeriodSelect` being used directly:
    // `periodHref` rebuilds the query string from scratch and would drop all three.
    const { user } = setup({
      filters: {
        search: 'Uber',
        categoryId: '0198c2a1-0000-7000-8000-0000000000a1',
        sort: 'amount_desc',
      },
    });

    await user.selectOptions(select(), PREVIOUS.start);

    expect(replace).toHaveBeenCalledWith(
      // `toQuery` writes keys in the order the object carries them, and `period` is spread on
      // last - pre-existing behaviour the filter bar's own suite already pins this way.
      '/transactions?search=Uber&categoryId=0198c2a1-0000-7000-8000-0000000000a1&sort=amount_desc&period=2025-09-01',
    );
  });

  it('writes a past period as its own start date', async () => {
    const { user } = setup();

    await user.selectOptions(select(), STRETCHED.start);

    expect(replace).toHaveBeenCalledWith('/transactions?period=2025-07-15');
  });

  it('writes the current period as the absent key', async () => {
    // `filters.ts`' rule that one view has one URL, and `periodParam`'s behaviour on the other two
    // screens: a link to `?period=2025-10-01` goes stale the moment that period rolls over.
    const { user } = setup({ filters: { period: 'all' }, selected: undefined });

    await user.selectOptions(select(), CURRENT.start);

    expect(replace).toHaveBeenCalledWith('/transactions');
  });

  it('writes All time as the literal the contract accepts', async () => {
    const { user } = setup();

    await user.selectOptions(select(), 'all');

    expect(replace).toHaveBeenCalledWith('/transactions?period=all');
  });

  it('replaces rather than pushes, and scrolls', async () => {
    // `replace` is `FilterNavigation`'s decision for every control on this screen. No `scroll: false`
    // unlike the search field: this control is at the top of the page already, and the second
    // argument being absent rather than `undefined` is what that provider distinguishes.
    const { user } = setup();

    await user.selectOptions(select(), PREVIOUS.start);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]).toHaveLength(1);
  });

  it('navigates to the current period for a value in no list', () => {
    // Unreachable through the control. Falling back to the current period rather than forwarding
    // the value, because a junk `?period=` is a 400 from the backend, which on this screen means
    // the error boundary rather than a lost filter.
    setup();

    const control = select() as HTMLSelectElement;
    control.value = '';
    control.dispatchEvent(new Event('change', { bubbles: true }));

    expect(replace).toHaveBeenCalledWith('/transactions');
  });
});
