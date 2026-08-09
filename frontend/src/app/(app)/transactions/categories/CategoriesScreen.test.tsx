import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Allocation, Category } from '../../../../lib/categories';
import type { Palette } from '../../../../lib/palette';

import { CategoriesScreen } from './CategoriesScreen';

// Frame 13 as a whole (AC1, AC4, AC5's read half).
//
// The figures are the frame's, with one deliberate exception the ticket itself records: the
// mock's caps sum to $2,970 against a stated allocation of $1,800, so A25 and A44 say to compute
// every figure rather than to reproduce the mock's. `ALLOCATION` below is therefore internally
// consistent where the frame is not.

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: '0198c2a1-0000-7000-8000-0000000000a1',
    name: 'Groceries',
    color: 'success',
    icon: 'shopping-basket',
    note: null,
    isFallback: false,
    monthlyCap: 500,
    spent: 397,
    transactionCount: 24,
    percentUsed: 79.4,
    remaining: 103,
    over: null,
    status: 'near',
    ...overrides,
  };
}

const CATEGORIES: Category[] = [
  category(),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a2',
    name: 'Dining out',
    color: 'error',
    icon: 'utensils',
    monthlyCap: 300,
    spent: 312,
    transactionCount: 18,
    percentUsed: 104,
    remaining: null,
    over: 12,
    status: 'over',
  }),
  category({
    id: '0198c2a1-0000-7000-8000-0000000000a3',
    name: 'Transport',
    color: 'info',
    icon: 'car',
    monthlyCap: 350,
    spent: 223,
    transactionCount: 12,
    percentUsed: 63.7,
    remaining: 127,
    over: null,
    status: 'on_track',
  }),
];

const ALLOCATION: Allocation = { monthlyBudget: 2000, allocated: 1150, unallocated: 850 };

/**
 * Two colours and two icons, which is all this screen needs.
 *
 * **Deliberately not the 16 and 64 a real palette carries**, for the reason `lib/palette.ts` states:
 * nothing in the frontend writes either number down, so a fixture that reproduced them would be
 * asserting a fact no code depends on and would have needed editing when PET-65 took the icons from
 * 13 to 64. The screen never renders these at all - they exist so the trigger has something to hand
 * the modal - and `AddCategoryModal.test.tsx` is where the lists are actually exercised.
 */
const PALETTE: Palette = {
  colors: [
    { token: 'success', label: 'Emerald' },
    { token: 'primary', label: 'Indigo' },
  ],
  icons: [
    { name: 'shopping-basket', label: 'Basket' },
    { name: 'tv', label: 'Television' },
  ],
};

/** 397 + 312 + 223, which is what the screen has to sum for itself. */
const SPENT_TOTAL = '$932';

/**
 * The summary card, scoped so a query cannot stray into a category card.
 *
 * "On track" is also a category chip, so a page-wide `getByText` matches twice and says nothing
 * about which element it found.
 */
const summaryCard = () =>
  screen.getByRole('heading', { name: /spending$/ }).closest('section') as HTMLElement;

function renderScreen(props: Partial<React.ComponentProps<typeof CategoriesScreen>> = {}) {
  return render(
    <CategoriesScreen
      categories={CATEGORIES}
      allocation={ALLOCATION}
      transactionCount={128}
      palette={PALETTE}
      {...props}
    />,
  );
}

// The delete confirmation calls `useRouter`, which throws outside a mounted router. A package
// specifier, which is the one case `jest.mock` takes without the relative-path dance.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

beforeEach(() => {
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
  jest.useFakeTimers().setSystemTime(new Date(2025, 9, 8));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the screen chrome (AC1)', () => {
  it('keeps the Transactions header and its overline', () => {
    // The same page as the sibling tab, so the same h1 - the tab bar is what distinguishes
    // them, not the title.
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByText('October 2025')).toBeInTheDocument();
  });

  // **This assertion is the inverse of the one PET-36 shipped**, which pinned `aria-disabled="true"`
  // on a control announcing it was not available yet. PET-37 is the ticket that note named, so the
  // criterion flips rather than the test being deleted: the button is now a live trigger, and the
  // absence of `aria-disabled` is the part worth pinning, because that attribute silently surviving
  // would leave the screen's most prominent action announced as unavailable while working.
  it('swaps the header action to a live "Add category" trigger', () => {
    renderScreen();

    const add = screen.getByRole('button', { name: 'Add category' });

    expect(add).not.toBeDisabled();
    expect(add).not.toHaveAttribute('aria-disabled');
  });

  it('draws no dialog until the trigger is used, so the closed modal contributes no text', () => {
    // `(app)/pages.test.tsx` depends on this beyond this file: a closed <dialog> is invisible to
    // getByRole but its labels are still found by queryAllByLabelText, so a modal mounted
    // unconditionally would make every label query on this screen ambiguous.
    renderScreen();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Add category', { selector: 'h2' })).not.toBeInTheDocument();
  });

  it('shows no search field, unlike the sibling tab', () => {
    // CTG-1, and the visible difference from frame 06. `TransactionsScreen` keeps its field in
    // the header for reconciliation reasons that only apply to a screen with a filter bar.
    renderScreen();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('marks Categories as the current tab and shows both counts', () => {
    renderScreen();

    expect(screen.getByRole('link', { name: /Categories/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /All transactions/ })).not.toHaveAttribute(
      'aria-current',
    );

    expect(screen.getByText('Categories').parentElement).toContainElement(screen.getByText('3'));
    expect(screen.getByText('All transactions').parentElement).toContainElement(
      screen.getByText('128'),
    );
  });

  it('offers no filter controls of its own', () => {
    // The frame draws none, and there is nothing on this screen to filter. A combobox here
    // would be a control nobody designed.
    renderScreen();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

/**
 * The grid, told apart from the card menus.
 *
 * **PET-39 is why this is not `getByRole('list')` any more, and the reason is jsdom rather than
 * the markup.** Every card now carries a `CategoryCardMenu`, whose panel is a `<ul popover>`. In a
 * browser a closed popover is `display: none` and so is not in the accessibility tree at all, which
 * means there is exactly one list on this screen; jsdom implements none of the Popover API and
 * `jest.setup.ts` deliberately polyfills none of it, so here the menus are permanently "open" and
 * every one of them is a list.
 *
 * Filtering on `popover` rather than adding an `aria-label` to the grid: naming the list would be
 * changing what the screen announces to work around a test-environment artifact, and the artifact
 * is one this repo has chosen to live with rather than fake.
 */
const grid = () => screen.getAllByRole('list').find((list) => !list.hasAttribute('popover'))!;

/**
 * The grid's own cards, not the menu items nested inside them.
 *
 * `within(grid()).getAllByRole('listitem')` descends the whole subtree, so it also returns the
 * `<li>`s of every card's menu - three per card rather than one. Same jsdom artifact as above,
 * caught one layer down.
 */
const gridItems = () =>
  within(grid())
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === grid());

describe('the card grid (AC1)', () => {
  it('renders one card per category, as a list', () => {
    renderScreen();

    expect(gridItems()).toHaveLength(CATEGORIES.length);
    expect(screen.getByRole('heading', { level: 2, name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Dining out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Transport' })).toBeInTheDocument();
  });

  it('keeps the badge and the grid in agreement', () => {
    // AC5's read half: whatever the response holds is what both the count and the grid show,
    // so a create or delete landing in a later ticket cannot move one without the other.
    renderScreen({ categories: [category()] });

    expect(gridItems()).toHaveLength(1);
    expect(screen.getByText('Categories').parentElement).toContainElement(screen.getByText('1'));
  });
});

describe('the spending summary (AC4)', () => {
  it('sums the period spend from the categories and states it against the budget', () => {
    // Nothing on `GET /api/categories` publishes a period total, and the sum is sound rather
    // than approximate: spend whose category was tombstoned is folded into the fallback, so
    // every transaction in the period is in exactly one of these rows.
    renderScreen();

    expect(screen.getByText(SPENT_TOTAL)).toBeInTheDocument();
    expect(screen.getByText('spent of $2,000 monthly budget')).toBeInTheDocument();
  });

  it('names the month, at the default start day', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 2, name: 'October spending' })).toBeInTheDocument();
  });

  it('reports the unassigned budget in a banner', () => {
    renderScreen();

    expect(
      screen.getByText(/\$850 of your budget isn’t assigned to a category\./),
    ).toBeInTheDocument();
  });

  it('says nothing when every dollar is assigned', () => {
    renderScreen({ allocation: { monthlyBudget: 2000, allocated: 2000, unallocated: 0 } });

    expect(screen.queryByText(/isn’t assigned to a category/)).not.toBeInTheDocument();
  });

  it('says nothing when the caps exceed the budget', () => {
    // **`unallocated` is returned unclamped and the contract says it can go negative** (A43:
    // nothing stops caps summing past the budget, and no over-allocation state is designed).
    // A truthy guard would tell somebody who has over-allocated that money is unassigned, which
    // is the opposite of what is true.
    renderScreen({ allocation: { monthlyBudget: 2000, allocated: 2400, unallocated: -400 } });

    expect(screen.queryByText(/isn’t assigned to a category/)).not.toBeInTheDocument();
    expect(screen.queryByText(/−\$400|-\$400/)).not.toBeInTheDocument();
  });

  it('flips the chip once spending passes the budget', () => {
    renderScreen({
      categories: [category({ spent: 2400, monthlyCap: 2500, percentUsed: 96, remaining: 100 })],
    });

    expect(screen.getByText('Over budget')).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
  });

  it('never hands the bar a max of zero, however small the budget', () => {
    // **`monthlyBudget` is only `@IsPositive()`, so $0.40 is a real budget** and rounds to zero.
    // `<progress max="0">` is invalid: the spec says fall back to max=1, so the bar rendered
    // empty - and announced 0% - beside a chip reading "Over budget" for an account that had
    // overspent everything it had. The overspent case must fill the bar, not empty it.
    renderScreen({
      allocation: { monthlyBudget: 0.4, allocated: 0, unallocated: 0.4 },
      categories: [category({ spent: 30, monthlyCap: 50, percentUsed: 60, remaining: 20 })],
    });

    const bar = within(summaryCard()).getByRole('progressbar');

    expect(bar).toHaveAttribute('max', '1');
    expect(bar).toHaveValue(1);
    expect(within(summaryCard()).getByText('Over budget')).toBeInTheDocument();
  });

  it('gives the summary bar a real accessible name', () => {
    renderScreen();

    const bars = screen.getAllByRole('progressbar');

    expect(bars[0]).toHaveAttribute('aria-label', 'Monthly budget spent');
  });

  it('gives the summary bar the same tone as its chip', () => {
    // **A class assertion, which this repo otherwise avoids** - the standing rule is to assert
    // behaviour and semantics, with daisyUI's state classes the documented exception. This is
    // that exception: the tone *is* the state, it is the visible half of the chip beside it, and
    // the bar has no accessible property that carries which colour it took. The defect this
    // pins shipped once - the bar stayed `progress-primary` while the chip went green - and
    // nothing but a colour check could have seen it.
    const { unmount } = renderScreen();

    expect(within(summaryCard()).getByRole('progressbar')).toHaveClass('progress-success');
    expect(within(summaryCard()).getByText('On track')).toBeInTheDocument();
    unmount();

    renderScreen({
      categories: [category({ spent: 2400, monthlyCap: 2500, percentUsed: 96, remaining: 100 })],
    });

    expect(within(summaryCard()).getByRole('progressbar')).toHaveClass('progress-error');
    expect(within(summaryCard()).getByText('Over budget')).toBeInTheDocument();
  });
});

describe('the delete seam', () => {
  // **This exists because the prop shipped once with nothing able to reach it.**
  // `DeleteCategoryProvider` takes an injectable `remove` so Storybook cannot fire a real Server
  // Action in the browser, and `CategoriesScreen` constructs that provider itself - so for one
  // commit the seam was there and `Screens/13 Categories` still ran `deleteCategory`, with the
  // prop's own comment claiming otherwise. A code review found it. Asserting the thread here is
  // what stops the prop being quietly dropped again, since nothing else in the suite would notice.

  it('threads its remove prop through to the confirmation', async () => {
    // `advanceTimers` is mandatory here and its absence is a five-second timeout rather than a
    // failed assertion: this suite runs on fake timers so `monthOverline(new Date())` is pinned,
    // and user-event's default real-timer waits never resolve against them.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const remove = jest.fn().mockResolvedValue({ ok: true });
    renderScreen({ categories: [category()], remove });

    // jsdom implements no Popover API, so the menu is permanently open and both items are
    // reachable without opening anything - the caveat `CategoryCardMenu.test.tsx` records.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledWith(category().id);
  });

  it('falls back to the real action when no prop is passed, rather than doing nothing', () => {
    // The other half of the same guard: a default of `undefined` would make every card's Delete
    // silently inert in the app while every story kept working.
    renderScreen({ categories: [category()] });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
