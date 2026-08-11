import { screen, within } from '@testing-library/react';

import { render } from '../../shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Allocation, Category } from '../../../../lib/categories';
import type { Palette } from '../../../../lib/palette';

import { category } from './categoryFixture';
import { CategoriesScreen } from './CategoriesScreen';

// Frame 13 as a whole (AC1, AC4, AC5's read half).
//
// The figures are the frame's, with one deliberate exception the ticket itself records: the
// mock's caps sum to $2,970 against a stated allocation of $1,800, so A25 and A44 say to compute
// every figure rather than to reproduce the mock's. `ALLOCATION` below is therefore internally
// consistent where the frame is not.

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

/**
 * The period the header names and the list its select offers, both off the response as of PET-72.
 *
 * The label is the backend's, so the heading below it - "{period} spending" - is pinned to a fixture
 * rather than to whatever month the suite is run in.
 */
const PERIOD = { start: '2025-10-01', end: '2025-11-01', label: 'October 2025', current: true };

const PERIODS = [
  PERIOD,
  { start: '2025-09-01', end: '2025-10-01', label: 'September 2025', current: false },
];

function renderScreen(props: Partial<React.ComponentProps<typeof CategoriesScreen>> = {}) {
  return render(
    <CategoriesScreen
      period={PERIOD}
      periods={PERIODS}
      currency="USD"
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
    // Scoped to the header's own paragraph: as of PET-72 the period select beside it offers an
    // option carrying the identical label, so a page-wide query matches twice.
    expect(screen.getByText('October 2025', { selector: 'p' })).toBeInTheDocument();
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

  it('offers the period select and no other control of its own', () => {
    // **Narrowed rather than inverted, and the distinction matters.** This used to assert no
    // combobox at all, because the frame draws no filters and there is nothing here to filter.
    // PET-72 adds one control that is not a filter: the period select, which chooses *which*
    // period every figure on the screen is for rather than narrowing the set within one. So the
    // criterion is still "no filters of its own", stated against the one combobox that is now
    // designed - which is why this asserts the count as well as the name.
    renderScreen();

    const comboboxes = screen.getAllByRole('combobox');

    expect(comboboxes).toHaveLength(1);
    expect(comboboxes[0]).toHaveAccessibleName('Budgeting period');
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

  it('names the period the figures are for, from the response', () => {
    // **The heading carries the year now, and that is the label rather than a formatting choice.**
    // It read "October spending" while the frontend composed period names itself; PET-72 publishes
    // exactly one label per period, and a shorter form for this heading would mean deriving a month
    // name from a period again - the thing that cannot be done correctly once a pay-day change can
    // stretch a period across two months. So the card, the overline and the select all print the
    // same string.
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 2, name: 'October 2025 spending' }),
    ).toBeInTheDocument();
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

describe('the allocate seam', () => {
  // The fourth of four, and it exists for the reason the delete block's comment records at length:
  // this screen builds the card that builds the banner that owns the modal, so a seam any shallower
  // than the screen is one no story could reach - which is exactly how the delete seam shipped inert
  // for a commit. Note the thread is two components deep here rather than one, since
  // `SpendingSummaryCard` takes a prop it does not itself render.

  it('threads its save prop through to the modal', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const save = jest.fn().mockResolvedValue({ ok: true });
    renderScreen({ save });

    await user.click(screen.getByRole('button', { name: 'Allocate' }));
    const field = screen.getByLabelText(`Monthly cap for ${CATEGORIES[0].name}`);
    await user.clear(field);
    await user.type(field, '250');
    await user.click(screen.getByRole('button', { name: 'Save caps' }));

    // The save now passes through the cap-anchor question; confirming on the default (current)
    // period is what sends the body, with no `capsFrom` - absent means current.
    const question = screen.getByRole('heading', { name: 'From which period?' }).closest('dialog')!;
    await user.click(within(question).getByRole('button', { name: 'Save caps' }));

    expect(save).toHaveBeenCalledWith({
      categories: [{ id: CATEGORIES[0].id, monthlyCap: 250 }],
    });
  });

  it('threads the categories through, so the modal has rows to draw', async () => {
    // The other prop `SpendingSummaryCard` carries without rendering. Dropped, the modal would open
    // on an empty list with a ledger that still claimed money was unassigned.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Allocate' }));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Allocate your budget' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(`Monthly cap for ${CATEGORIES[0].name}`)).toBeInTheDocument();
  });

  it('falls back to the real action when no prop is passed, rather than doing nothing', () => {
    // The other half of the same guard, and the one that matters most on this control: "Allocate"
    // was inert by design for four tickets, so a silently-inert version would look exactly like the
    // state it just left.
    renderScreen();

    expect(screen.getByRole('button', { name: 'Allocate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Allocate' })).not.toHaveAttribute('aria-disabled');
  });

  it('draws no Allocate action once the budget is fully assigned', () => {
    // Unchanged from PET-36, and asserted here because this ticket had every reason to touch it:
    // `unallocated` is returned unclamped, so a truthy check would show the banner to somebody who
    // has over-allocated and tell them an amount is unassigned when the opposite is true.
    renderScreen({ allocation: { monthlyBudget: 2000, allocated: 2000, unallocated: 0 } });

    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();
  });
});

describe('the edit seam', () => {
  // `remove`'s twin, and it exists for the reason that block's own comment records at length: this
  // screen constructs its own providers, so a seam on `EditCategoryProvider` alone would be one no
  // story could reach - which is exactly how the delete seam shipped inert for a commit.

  it('threads its update prop through to the modal', async () => {
    // `advanceTimers` is mandatory here and its absence is a five-second timeout rather than a
    // failed assertion: this suite runs on fake timers so `monthOverline(new Date())` is pinned,
    // and user-event's default real-timer waits never resolve against them.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const update = jest.fn().mockResolvedValue({ ok: true });
    renderScreen({ categories: [category()], update });

    // jsdom implements no Popover API, so the menu is permanently open and both items are
    // reachable without opening anything - the caveat `CategoryCardMenu.test.tsx` records.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Food');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(update).toHaveBeenCalledWith(category().id, { name: 'Food' });
  });

  it('threads the palette into the edit modal as well as the header trigger', async () => {
    // One prop, two destinations as of PET-38. A picker opening on "Select…" for a category whose
    // colour is right there in the palette would mean the thread was dropped.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderScreen({ categories: [category()] });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('button', { name: /^Color/ })).toHaveAccessibleName('Color Emerald');
  });

  it('opens the same modal from an uncapped card’s "Set limit", focused on the budget', async () => {
    // The feature's second entry point, and the reason the provider is screen-scoped rather than
    // per-card: a category with no cap draws two ways into one modal.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderScreen({
      categories: [
        category({
          name: 'Subscriptions',
          monthlyCap: null,
          percentUsed: null,
          remaining: null,
          over: null,
          status: 'uncapped',
        }),
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Set limit for Subscriptions' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Edit category' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly budget (optional)')).toHaveFocus();
  });

  it('falls back to the real action when no prop is passed, rather than doing nothing', () => {
    // The other half of the same guard: a default of `undefined` would make every card's Edit
    // silently inert in the app while every story kept working.
    renderScreen({ categories: [category()] });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('renders neither modal until something opens one', () => {
    // The property `(app)/pages.test.tsx` leans on: a closed <dialog> is display:none so
    // `queryByRole` cannot see inside it, but `queryAllByLabelText` can - so two always-mounted
    // modals would make every label query on this screen ambiguous forever.
    renderScreen();

    expect(screen.queryByText('Edit category')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});

describe('the create seam', () => {
  // **`remove`'s and `update`'s third sibling, and it shipped with no test until a code review asked
  // for one.** That is the exact defect class this screen has now produced twice: a seam that exists,
  // whose comment says it is threaded, and which nothing asserts actually is - so dropping
  // `create={create}` from the `AddCategoryButton` call site would silently put `Screens/13
  // Categories` back to firing a real Server Action in the browser, with the `docs/TODO.md` entry
  // that used to warn about it now deleted.

  it('threads its create prop through to the Add category modal', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const create = jest.fn().mockResolvedValue({ ok: true });
    renderScreen({ categories: [category()], create });

    // The header trigger and the modal's submit share the label "Add category", so once the modal
    // is open every query for it has to say which. Scoped to the dialog, which is also how a reader
    // tells them apart.
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const modal = within(screen.getByRole('dialog'));
    await user.type(modal.getByLabelText('Name'), 'Subscriptions');
    await user.click(modal.getByRole('button', { name: 'Add category' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Subscriptions', color: 'success', icon: 'shopping-basket' }),
    );
  });

  it('falls back to the real action when no prop is passed, rather than doing nothing', () => {
    // The other half of the same guard, matching `remove`'s and `update`'s: a default of `undefined`
    // would make the header button silently inert in the app while every story kept working.
    renderScreen({ categories: [category()] });

    expect(screen.getByRole('button', { name: 'Add category' })).toBeEnabled();
  });
});

describe('the fallback card on a real grid', () => {
  it('draws no kebab and no banner, where every other card draws both', () => {
    // AC6 as amended: both actions behind a kebab are refused for `Uncategorized`, so nothing on
    // that card is drawn rather than drawn and refused. Asserted here as well as on the card,
    // because the count is what says the other cards are unaffected.
    renderScreen({
      categories: [
        category({ name: 'Groceries' }),
        category({
          id: '0198c2a1-0000-7000-8000-0000000000a9',
          name: 'Uncategorized',
          isFallback: true,
          monthlyCap: null,
          percentUsed: null,
          remaining: null,
          over: null,
          status: 'uncapped',
        }),
      ],
    });

    expect(screen.getByRole('button', { name: 'Actions for Groceries' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Uncategorized' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set limit/ })).not.toBeInTheDocument();
  });
});

describe('a historical period view', () => {
  // Finding 2 of PR #84's review, pinned: every cap write drafts from the live configuration and
  // expresses a backdate through the cap-anchor question, so on a non-current period the mutating
  // controls are not drawn at all - the fallback card's own rule, applied to the whole screen.
  const historical = PERIODS[1];

  it('draws no cap-writing control and no kebab', () => {
    renderScreen({ period: historical });

    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set limit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('still draws the period’s own figures under its own name', () => {
    // The figures are that period's record; only the writes are gone.
    renderScreen({ period: historical });

    expect(screen.getByRole('heading', { name: 'September 2025 spending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
  });
});
