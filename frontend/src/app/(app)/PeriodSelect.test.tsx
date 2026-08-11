import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { PeriodSelect } from './PeriodSelect';

// The control that makes PET-72's history navigable, and the one that replaced `dashboard/MonthPill`
// - an inert `<div>` A8 asked for "until month navigation is designed".
//
// A package specifier, the one case `jest.mock` takes without the relative-path dance.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const CURRENT = { start: '2026-03-01', end: '2026-04-01', label: 'March 2026', current: true };

const PREVIOUS = {
  start: '2026-02-01',
  end: '2026-03-01',
  label: 'February 2026',
  current: false,
};

/** A period no month arithmetic could name: the stretched one a pay-day change produces. */
const STRETCHED = {
  start: '2025-12-15',
  end: '2026-01-14',
  label: 'December 2025 / January 2026',
  current: false,
};

const PERIODS = [CURRENT, PREVIOUS, STRETCHED];

const replace = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ replace, push: jest.fn(), refresh: jest.fn() });
});

function renderSelect(selected = CURRENT.start) {
  return render(<PeriodSelect periods={PERIODS} selected={selected} pathname="/dashboard" />);
}

const select = () => screen.getByRole('combobox', { name: 'Budgeting period' });

describe('what it draws', () => {
  it('names itself, because the design draws no visible label', () => {
    // `FilterPill`'s call, and the reason its own prop is called `label`.
    renderSelect();

    expect(select()).toBeInTheDocument();
  });

  it('is a real select rather than the inert div it replaced', () => {
    renderSelect();

    expect(select().tagName).toBe('SELECT');
  });

  it('offers one option per period, in the order it was handed them', () => {
    // Newest first is the backend's guarantee; re-sorting here would be a second authority.
    renderSelect();

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'March 2026',
      'February 2026',
      'December 2025 / January 2026',
    ]);
  });

  it('prints the backend label verbatim, including one no month arithmetic could produce', () => {
    // The whole reason the label is not derived here: a period stretched by a pay-schedule change
    // spans three month names, and the fact that makes it do so is a `period_rules` row this app
    // cannot see.
    renderSelect();

    expect(
      screen.getByRole('option', { name: 'December 2025 / January 2026' }),
    ).toBeInTheDocument();
  });

  it('shows the period the screen is on as the chosen value', () => {
    // Taken from the response rather than from the URL, which is what makes the control show a value
    // on a bare `/dashboard` instead of an empty box - the sparse-URL trap `filters.ts` records.
    renderSelect(PREVIOUS.start);

    expect(select()).toHaveValue(PREVIOUS.start);
  });

  it('shows the current period on a URL carrying no period at all', () => {
    renderSelect();

    expect(select()).toHaveValue(CURRENT.start);
  });
});

describe('what it navigates to', () => {
  it('replaces rather than pushes, so twelve periods browsed is not twelve back presses', async () => {
    // `TransactionFilterBar`'s recorded decision for the identical reason: changing which period you
    // are looking at is not a place you navigated to.
    const user = userEvent.setup();
    renderSelect();

    await user.selectOptions(select(), PREVIOUS.start);

    expect(replace).toHaveBeenCalledWith('/dashboard?period=2026-02-01');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('goes to the bare route for the current period, because a default is the absent key', async () => {
    const user = userEvent.setup();
    renderSelect(PREVIOUS.start);

    await user.selectOptions(select(), CURRENT.start);

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates within whichever route it was given', async () => {
    // Two screens draw it, which is why it lives at the `(app)` root rather than under `dashboard/`.
    const user = userEvent.setup();
    render(
      <PeriodSelect
        periods={PERIODS}
        selected={CURRENT.start}
        pathname="/transactions/categories"
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Budgeting period' }),
      STRETCHED.start,
    );

    expect(replace).toHaveBeenCalledWith('/transactions/categories?period=2025-12-15');
  });

  it('navigates nowhere for a value that is not in the list', () => {
    // Unreachable through the control itself; guarded rather than asserted because the alternative is
    // navigating to `undefined`.
    renderSelect();

    const control = select() as HTMLSelectElement;
    control.value = '';
    control.dispatchEvent(new Event('change', { bubbles: true }));

    expect(replace).not.toHaveBeenCalled();
  });
});
