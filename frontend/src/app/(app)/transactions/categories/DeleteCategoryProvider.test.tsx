import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import { DELETE_CATEGORY_TITLE, type DeleteCategoryTarget } from './DeleteCategoryDialog';
import { DeleteCategoryProvider, useDeleteCategory } from './DeleteCategoryProvider';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// A relative specifier, because `jest.mock('@/lib/deleteCategory')` fails with "Cannot find
// module" from anywhere - the alias trap `frontend/src/app/CLAUDE.md` records. The provider
// imports the real action as its default rather than taking it as a required prop (the dialog is
// the seam that takes props), so this one genuinely needs mocking or the assertions would reach a
// real fetch.
jest.mock('../../../../lib/deleteCategory', () => ({ deleteCategory: jest.fn() }));

const TARGET: DeleteCategoryTarget = {
  id: '0198c2a1-0000-7000-8000-0000000000c1',
  name: 'Groceries',
  transactionCount: 24,
};

const FALLBACK = 'Uncategorized';

/** A trigger inside the provider, so opening is a real interaction rather than a mount. */
function Trigger({
  target = TARGET,
  onDeleted,
}: {
  target?: DeleteCategoryTarget;
  onDeleted?: () => void;
}) {
  const { open } = useDeleteCategory();

  return (
    <button
      type="button"
      onClick={() => open(target, onDeleted === undefined ? undefined : { onDeleted })}
    >
      Open it
    </button>
  );
}

function renderProvider(children: React.ReactNode, remove?: jest.Mock) {
  render(
    <DeleteCategoryProvider fallbackName={FALLBACK} remove={remove}>
      {children}
    </DeleteCategoryProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
});

describe('what it renders', () => {
  it('renders nothing of the dialog until a trigger opens it', () => {
    // The property `(app)/pages.test.tsx` leans on, and the reason has to be text rather than
    // roles: a closed <dialog> is display:none so queryByRole cannot see inside it, but
    // queryAllByText can - so "not rendered" is the requirement, not "closed".
    renderProvider(<Trigger />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(DELETE_CATEGORY_TITLE)).not.toBeInTheDocument();
  });

  it('renders its children', () => {
    renderProvider(<p>the grid</p>);

    expect(screen.getByText('the grid')).toBeInTheDocument();
  });

  it('opens the dialog for the target it was given', async () => {
    renderProvider(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(
      screen.getByRole('heading', { level: 2, name: DELETE_CATEGORY_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/"Groceries"/)).toBeInTheDocument();
  });

  it('threads the screen-resolved fallback name into the copy', async () => {
    render(
      <DeleteCategoryProvider fallbackName="Somewhere else">
        <Trigger />
      </DeleteCategoryProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByText(/moved to Somewhere else/)).toBeInTheDocument();
  });

  it('stops rendering the dialog once it closes', async () => {
    renderProvider(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(DELETE_CATEGORY_TITLE)).not.toBeInTheDocument();
  });

  it('shows the second target rather than the first when reopened', async () => {
    // What the single state object buys: the target cannot outlive the open it arrived with, so
    // the copy cannot flash the previous card's name on the way in.
    function TwoTriggers() {
      const { open } = useDeleteCategory();

      return (
        <>
          <button type="button" onClick={() => open(TARGET)}>
            First
          </button>
          <button type="button" onClick={() => open({ ...TARGET, id: 'other', name: 'Transport' })}>
            Second
          </button>
        </>
      );
    }

    renderProvider(<TwoTriggers />);

    await userEvent.click(screen.getByRole('button', { name: 'First' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));

    expect(screen.getByText(/"Transport"/)).toBeInTheDocument();
    expect(screen.queryByText(/"Groceries"/)).not.toBeInTheDocument();
  });
});

describe('the options', () => {
  it('passes onDeleted through to the dialog', async () => {
    const onDeleted = jest.fn();
    renderProvider(<Trigger onDeleted={onDeleted} />, jest.fn().mockResolvedValue({ ok: true }));

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("does not carry a cancelled open's callback into the next one", async () => {
    // The reason `onDeleted` lives in the same state object as the target rather than in a ref:
    // a cancelled open must not leave a callback behind to fire for somebody else's delete.
    const onDeleted = jest.fn();
    const remove = jest.fn().mockResolvedValue({ ok: true });

    function TwoTriggers() {
      const { open } = useDeleteCategory();

      return (
        <>
          <button type="button" onClick={() => open(TARGET, { onDeleted })}>
            With callback
          </button>
          <button type="button" onClick={() => open(TARGET)}>
            Without
          </button>
        </>
      );
    }

    renderProvider(<TwoTriggers />, remove);

    await userEvent.click(screen.getByRole('button', { name: 'With callback' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Without' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('useDeleteCategory', () => {
  it('throws outside the provider rather than returning a no-op', () => {
    // A Delete that silently does nothing is a bug that ships; a throw is a bug that fails the
    // first test to render the screen without the provider.
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger />)).toThrow(
      'useDeleteCategory must be used inside DeleteCategoryProvider.',
    );

    error.mockRestore();
  });
});
