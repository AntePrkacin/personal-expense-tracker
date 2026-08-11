import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '../shellRender';
import { category } from '../transactions/categories/categoryFixture';

import { ManageCategoriesProvider, useManageCategories } from './ManageCategoriesProvider';

// The two guarantees this provider exists for: the modal is absent until it is opened, and the seam
// throws rather than going quiet. The modal's own contents are `ManageCategoriesModal.test.tsx`'s.
jest.mock('../transactions/categories/EditCategoryProvider', () => ({
  useEditCategory: () => ({ open: jest.fn() }),
}));
jest.mock('../transactions/categories/DeleteCategoryProvider', () => ({
  useDeleteCategory: () => ({ open: jest.fn() }),
}));
jest.mock('../transactions/categories/AddCategoryButton', () => ({
  AddCategoryButton: () => <button type="button">Add category</button>,
}));

const CATEGORIES = [category({ name: 'Groceries' })];
const ALLOCATION = { monthlyBudget: 2000, allocated: 500, unallocated: 1500 };

function Trigger() {
  const { open } = useManageCategories();

  return (
    <button type="button" onClick={open}>
      Manage
    </button>
  );
}

function renderProvider() {
  return render(
    <ManageCategoriesProvider categories={CATEGORIES} allocation={ALLOCATION} palette={null}>
      <Trigger />
    </ManageCategoriesProvider>,
  );
}

describe('ManageCategoriesProvider', () => {
  it('renders its children and no dialog at rest', () => {
    renderProvider();

    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // **Not an optimisation.** A closed `<dialog>` is `display: none`, so `queryByRole` cannot see
  // inside it - but `queryAllByText` can, so an always-mounted modal would put a row per category
  // into the Settings tree forever and make every text query on that screen ambiguous.
  // `(app)/pages.test.tsx` depends on this.
  it('puts none of the modal’s text in the tree until it is opened', () => {
    renderProvider();

    expect(screen.queryByText('Manage categories')).not.toBeInTheDocument();
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
  });

  it('mounts the modal when the seam is called', async () => {
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    expect(screen.getByRole('heading', { name: 'Manage categories' })).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  // The call `AddTransactionProvider` and `useFilterNavigation` both make: a control that quietly
  // stops opening is a bug that looks like a slow render, so the seam is loud outside its provider.
  it('throws outside the provider rather than returning a no-op', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger />)).toThrow(/ManageCategoriesProvider/);

    errors.mockRestore();
  });
});
