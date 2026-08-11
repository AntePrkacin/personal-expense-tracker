import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Allocation } from '@/lib/categories';

import { render } from '../shellRender';
import {
  category,
  FALLBACK_CATEGORY,
  UNCAPPED_CATEGORY,
} from '../transactions/categories/categoryFixture';

import { MANAGE_EMPTY, MANAGE_SUBTITLE, ManageCategoriesModal } from './ManageCategoriesModal';

// The Manage categories modal (PET-48's follow-up), from the design system's
// `ManageCategoriesModal.jsx`.
//
// **What this file pins is that the modal reaches the right seams and draws the right figures**,
// because it performs no write of its own - `AddCategoryModal`, `EditCategoryModal` and
// `DeleteCategoryDialog` own every one, and each has its own suite. So the two providers are mocked
// rather than mounted, which is `CategoryCardMenu.test.tsx`'s shape for the same situation: mounting
// them here would put three more dialogs in the tree and make every query ambiguous.
//
// Relative specifiers, because `jest.mock('@/...')` fails with "Cannot find module" from anywhere in
// this repo - the alias trap `frontend/src/app/CLAUDE.md` records.
const openEdit = jest.fn();
const openDelete = jest.fn();
jest.mock('../transactions/categories/EditCategoryProvider', () => ({
  useEditCategory: () => ({ open: openEdit }),
}));
jest.mock('../transactions/categories/DeleteCategoryProvider', () => ({
  useDeleteCategory: () => ({ open: openDelete }),
}));

// `AddCategoryButton` owns its own modal and its own state; this suite is about the footer slot it
// sits in, not about what it opens. Stubbed to a bare button so the footer stays assertable without
// dragging the Add modal's fields into the tree.
jest.mock('../transactions/categories/AddCategoryButton', () => ({
  AddCategoryButton: ({ variant }: { variant?: string }) => (
    <button type="button" data-variant={variant}>
      Add category
    </button>
  ),
}));

const GROCERIES = category({ id: 'a', name: 'Groceries', monthlyCap: 500, spent: 397 });
const TRANSPORT = category({ id: 'b', name: 'Transport', monthlyCap: 350, spent: 223 });

const ALLOCATION: Allocation = { monthlyBudget: 2000, allocated: 850, unallocated: 1150 };

function renderModal(
  categories = [GROCERIES, TRANSPORT, FALLBACK_CATEGORY],
  allocation = ALLOCATION,
) {
  return render(
    <ManageCategoriesModal
      categories={categories}
      allocation={allocation}
      palette={null}
      onClose={jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the frame', () => {
  it('names itself and says what it is for', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Manage categories' })).toBeInTheDocument();
    expect(screen.getByText(MANAGE_SUBTITLE)).toBeInTheDocument();
  });

  it('offers "Add category" against "Done", which is the source\'s footer', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('draws "Add category" as the secondary action, because "Done" is the primary', () => {
    // The one thing the stub above still carries: a dialog has a single emphasized action, and the
    // source draws this one secondary against it.
    renderModal();

    expect(screen.getByRole('button', { name: 'Add category' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('closes on "Done" without saving anything, because it saves nothing', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <ManageCategoriesModal
        categories={[GROCERIES]}
        allocation={ALLOCATION}
        palette={null}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('the summary island', () => {
  it('draws the budget, the assigned sum and the remainder', () => {
    renderModal();

    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('$2,000')).toBeInTheDocument();
    expect(screen.getByText('$850')).toBeInTheDocument();
    expect(screen.getByText('$1,150')).toBeInTheDocument();
  });

  it('reports the assigned figure the API published, not a sum of the rows it draws', () => {
    // **The assertion that catches a private re-sum.** `allocated` here is 900 while the two drawn
    // rows carry 850 between them, which is what a cap on the fallback looks like from this side.
    // Summing the visible rows would print $850 and quietly disagree with the Categories tab and the
    // Allocate modal about one account; `toAllocateLedger`'s `reservedCents` is what carries it.
    renderModal([GROCERIES, TRANSPORT, FALLBACK_CATEGORY], {
      monthlyBudget: 2000,
      allocated: 900,
      unallocated: 1100,
    });

    expect(screen.getByText('$900')).toBeInTheDocument();
    expect(screen.queryByText('$850')).not.toBeInTheDocument();
  });

  // **The state `toAllocateTotals`' clamp hides, which a review found reachable here although it is
  // not next door.** Caps over budget are legal (A43) and this modal has no `unallocated > 0` gate.
  it('reports an overage instead of clamping it to a zero remainder', () => {
    renderModal([GROCERIES, TRANSPORT, FALLBACK_CATEGORY], {
      monthlyBudget: 500,
      allocated: 850,
      unallocated: -350,
    });

    expect(screen.getByText('Over budget')).toBeInTheDocument();
    expect(screen.getByText('$350')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('draws no allocation bar while over budget, because its segments would sum past 100%', () => {
    const { container } = renderModal([GROCERIES, TRANSPORT, FALLBACK_CATEGORY], {
      monthlyBudget: 500,
      allocated: 850,
      unallocated: -350,
    });

    expect(
      container.querySelector('[aria-hidden="true"][class*="flex"] > [style*="width"]'),
    ).toBeNull();
  });

  it('counts only the drawn rows as having no limit', () => {
    // `FALLBACK_CATEGORY` is uncapped on every account, so a count taken before the filter reads one
    // high for everybody. `manageCategories.test.ts` pins the arithmetic; this pins the wiring.
    renderModal([GROCERIES, UNCAPPED_CATEGORY, FALLBACK_CATEGORY]);

    expect(
      screen.getByText('1 category has no limit. Set caps per category from Edit.'),
    ).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('draws a row per managed category, with its spend beside what it was given', () => {
    renderModal();

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('$397 spent · $500 assigned')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });

  it('marks an uncapped row rather than leaving its caption half-written', () => {
    // Pairs with the caption above it: the island says how many have no limit, and this is what
    // makes that count findable in the list.
    renderModal([GROCERIES, UNCAPPED_CATEGORY, FALLBACK_CATEGORY]);

    expect(screen.getByText(/No limit$/)).toBeInTheDocument();
  });

  it('never lists Uncategorized, which is the product decision this modal departs from the source on', () => {
    renderModal();

    expect(screen.queryByText(FALLBACK_CATEGORY.name)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Delete ${FALLBACK_CATEGORY.name}` }),
    ).not.toBeInTheDocument();
  });

  it('names each action with its category, because eight identical "Edit"s name nothing', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Edit Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Transport' })).toBeInTheDocument();
  });

  it('opens the edit modal with the whole category, which is what makes the prefill free', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Edit Groceries' }));

    expect(openEdit).toHaveBeenCalledWith(GROCERIES);
  });

  it('opens the confirmation with the three fields it renders, and no more', async () => {
    // The asymmetry `DeleteCategoryTarget` documents: a confirmation has no business reading a cap,
    // a colour or a note, so this hands it exactly what its copy quotes.
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Delete Groceries' }));

    expect(openDelete).toHaveBeenCalledWith({
      id: GROCERIES.id,
      name: GROCERIES.name,
      transactionCount: GROCERIES.transactionCount,
    });
  });

  it('carries no control per row beyond those two', () => {
    renderModal([GROCERIES]);

    const row = screen.getByText('Groceries').closest('li');

    expect(row).not.toBeNull();
    expect(within(row!).getAllByRole('button')).toHaveLength(2);
    expect(within(row!).queryByRole('textbox')).not.toBeInTheDocument();
  });

  // **The one thing about these buttons that no rendering assertion would catch.** The card that
  // opens this modal sits inside the Settings `<form>`; a bare `<button>` there defaults to
  // `submit`. The modal is mounted outside that form by `ManageCategoriesProvider`, which is what
  // makes it safe - and this pins the belt as well as the braces.
  it('gives every row action an explicit type, so neither can ever submit a form', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Edit Groceries' })).toHaveAttribute(
      'type',
      'button',
    );
    expect(screen.getByRole('button', { name: 'Delete Groceries' })).toHaveAttribute(
      'type',
      'button',
    );
  });
});

describe('an account with nothing to manage', () => {
  // Reachable rather than defensive: `Uncategorized` cannot be deleted, so an account that has
  // removed everything else opens this on an empty list.
  it('says so, rather than drawing a header over an empty box', () => {
    renderModal([FALLBACK_CATEGORY]);

    expect(screen.getByText(MANAGE_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText('Category')).not.toBeInTheDocument();
  });

  it('still offers "Add category", which is the one thing that helps', () => {
    renderModal([FALLBACK_CATEGORY]);

    expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument();
  });
});
