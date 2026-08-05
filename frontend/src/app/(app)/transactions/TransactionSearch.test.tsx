import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TransactionFilters } from '../../../lib/transactions';

import { TransactionSearch } from './TransactionSearch';

// The search field's state machine, which is the whole reason this component exists as
// something other than an `<input>` with an `onChange`.
//
// A package specifier, so the `@/` alias trap does not apply here.
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

/** user-event drives its own timers, so it has to be told which ones are running. */
function setup(filters: TransactionFilters = {}) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const view = render(<TransactionSearch filters={filters} />);

  return { user, ...view };
}

const field = () => screen.getByRole('textbox', { name: 'Search transactions' });

/**
 * Runs the debounce out.
 *
 * Wrapped in `act` because the timer callback navigates inside a `startTransition`, which is
 * a state update React otherwise warns is untracked - and a warning nobody reads is a warning
 * that hides the next one.
 */
function flushDebounce(ms = 300) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  replace.mockClear();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('the field itself', () => {
  it('is a real text box now, named by the placeholder the design draws', () => {
    // It was an inert <div> for three tickets. The name is an aria-label rather than the
    // placeholder alone, which stops being an accessible name the moment somebody types.
    setup();

    expect(field()).toBeInTheDocument();
    expect(field()).toHaveAttribute('placeholder', 'Search transactions');
  });

  it('is not a searchbox, so no user agent draws its own cancel button', () => {
    setup();

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('opens showing the term the URL is filtered by', () => {
    setup({ search: 'Uber' });

    expect(field()).toHaveValue('Uber');
  });
});

describe('the debounce', () => {
  it('navigates once after typing stops, not once per keystroke', async () => {
    const { user } = setup();

    await user.type(field(), 'Uber');
    expect(replace).not.toHaveBeenCalled();

    flushDebounce();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/transactions?search=Uber', { scroll: false });
  });

  it('shows every character immediately, whatever the URL says', () => {
    // Stage one of the trap this component exists for: a plain `value={filters.search}`
    // re-renders with the old prop before the server answers, and characters disappear.
    const { user } = setup();

    return user.type(field(), 'Whole').then(() => {
      expect(field()).toHaveValue('Whole');
    });
  });

  it('replaces rather than pushes, so Back leaves the page', async () => {
    // One history entry per typing pause would walk a user through "Wh", "Whol", "Whole".
    const { user } = setup();

    await user.type(field(), 'Uber');
    flushDebounce();

    expect(replace).toHaveBeenCalled();
  });

  it('does not scroll the list to the top on a keystroke', async () => {
    const { user } = setup();

    await user.type(field(), 'U');
    flushDebounce();

    expect(replace.mock.calls[0]![1]).toEqual({ scroll: false });
  });

  it('navigates nothing on mount', () => {
    // The guard that keeps arriving at a filtered URL from immediately re-navigating to it.
    setup({ search: 'Uber' });
    flushDebounce(1000);

    expect(replace).not.toHaveBeenCalled();
  });

  it('flushes on Enter rather than making the user wait', async () => {
    const { user } = setup();

    await user.type(field(), 'Uber{Enter}');

    expect(replace).toHaveBeenCalledWith('/transactions?search=Uber', { scroll: false });
  });
});

describe('the other filters', () => {
  it('keeps them when the search changes', async () => {
    const { user } = setup({ period: 'all', sort: 'date_asc' });

    await user.type(field(), 'Uber');
    flushDebounce();

    expect(replace).toHaveBeenCalledWith('/transactions?period=all&sort=date_asc&search=Uber', {
      scroll: false,
    });
  });

  it('drops the search key entirely when the field is cleared', async () => {
    // `?search=` and no key render the same page, so only one of them may exist.
    const { user } = setup({ search: 'Uber' });

    await user.clear(field());
    flushDebounce();

    expect(replace).toHaveBeenCalledWith('/transactions', { scroll: false });
  });
});

describe('resyncing from the URL', () => {
  it('does not overwrite what is being typed when the prop catches up', async () => {
    // **The regression a future "simplification" reintroduces.** The server answers a
    // keystroke or two behind, so the prop arriving mid-word must not be written back over
    // the field - that is what collapses the caret to the end of the input.
    const { user, rerender } = setup();

    await user.type(field(), 'Whole');
    flushDebounce();

    // The navigation this component itself asked for, arriving as a new prop after the user
    // has typed on.
    await user.type(field(), ' Foods');
    rerender(<TransactionSearch filters={{ search: 'Whole' }} />);

    expect(field()).toHaveValue('Whole Foods');
  });

  it('resyncs when the URL changes for a reason other than this field', () => {
    // The Back button, or a link. Without this the field keeps showing a term the list is
    // no longer filtered by.
    const { rerender } = setup({ search: 'Uber' });

    rerender(<TransactionSearch filters={{ search: 'Netflix' }} />);

    expect(field()).toHaveValue('Netflix');
  });

  it('clears the field when Back reaches an unfiltered URL', () => {
    const { rerender } = setup({ search: 'Uber' });

    rerender(<TransactionSearch filters={{}} />);

    expect(field()).toHaveValue('');
  });

  it('does not resync for a change to a different filter', async () => {
    // A period change re-renders this component with a new `filters` object whose `search`
    // is unchanged. Comparing the object rather than the search term would reset the field.
    const { user, rerender } = setup({ search: 'Uber' });

    await user.type(field(), 'x');
    rerender(<TransactionSearch filters={{ search: 'Uber', period: 'all' }} />);

    expect(field()).toHaveValue('Uberx');
  });
});
