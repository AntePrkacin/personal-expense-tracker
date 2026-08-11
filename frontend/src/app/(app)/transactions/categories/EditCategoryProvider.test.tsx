import { screen, within } from '@testing-library/react';

// `render` comes from the shell wrapper: the modal below prefixes the profile's currency symbol as
// of PET-47, so it reaches `useMoney()`/`useCurrency()`. See `shellRender.tsx`.
import { render } from '../../shellRender';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Category } from '../../../../lib/categories';
import type { Palette } from '../../../../lib/palette';

import { DELETE_CATEGORY_TITLE } from './DeleteCategoryDialog';
import { DeleteCategoryProvider } from './DeleteCategoryProvider';
import { EditCategoryProvider, useEditCategory } from './EditCategoryProvider';
import { category, CATEGORY_PERIODS } from './categoryFixture';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

// Relative specifiers, because `jest.mock('@/lib/...')` fails with "Cannot find module" from
// anywhere - the alias trap `frontend/src/app/CLAUDE.md` records. Both providers import their real
// action as a default rather than taking a required prop (the modal and the dialog are the seams
// that take props), so these genuinely need mocking or the assertions would reach a real fetch.
jest.mock('../../../../lib/updateCategory', () => ({ updateCategory: jest.fn() }));
jest.mock('../../../../lib/deleteCategory', () => ({ deleteCategory: jest.fn() }));

const PALETTE: Palette = {
  colors: [{ token: 'primary', label: 'Indigo' }],
  icons: [{ name: 'tv', label: 'Television' }],
};

const SUBSCRIPTIONS = category({
  id: '0198c2a1-0000-7000-8000-0000000000b7',
  name: 'Subscriptions',
  monthlyCap: 250,
  color: 'primary',
  icon: 'tv',
});

/** A trigger inside the provider, so opening is a real interaction rather than a mount. */
function Trigger({
  target = SUBSCRIPTIONS,
  focus,
  label = 'Open it',
}: {
  target?: Category;
  focus?: 'name' | 'monthlyCap';
  label?: string;
}) {
  const { open } = useEditCategory();

  return (
    <button type="button" onClick={() => open(target, focus === undefined ? undefined : { focus })}>
      {label}
    </button>
  );
}

/**
 * Both providers, nested as `CategoriesScreen` nests them.
 *
 * The nesting is a requirement rather than an arrangement: the edit modal's "Delete category" is a
 * `useDeleteCategory()` call, so the edit provider has to sit inside the delete one.
 */
function renderProviders(
  children: React.ReactNode,
  { update, remove }: { update?: jest.Mock; remove?: jest.Mock } = {},
) {
  render(
    <DeleteCategoryProvider fallbackName="Uncategorized" remove={remove}>
      <EditCategoryProvider palette={PALETTE} periods={CATEGORY_PERIODS} update={update}>
        {children}
      </EditCategoryProvider>
    </DeleteCategoryProvider>,
  );
}

/**
 * The confirmation's own dialog, so its Cancel can be told from the form's.
 *
 * **Both are open at once here, which is the arrangement rather than an artefact.** AC7 stacks the
 * confirmation over the form, so "Cancel" is genuinely ambiguous on the page and every query for one
 * has to say which. Located from the heading rather than by a test id, because the heading is what a
 * reader would use to tell the two apart too.
 */
function confirmation(): HTMLElement {
  return screen
    .getByRole('heading', { level: 2, name: DELETE_CATEGORY_TITLE })
    .closest('dialog') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
});

describe('what it renders', () => {
  it('renders nothing of the modal until a trigger opens it', () => {
    // The property `(app)/pages.test.tsx` leans on, and the reason has to be text and labels rather
    // than roles: a closed <dialog> is display:none so queryByRole cannot see inside it, but
    // queryAllByText and queryAllByLabelText can - so "not rendered" is the requirement, not
    // "closed".
    renderProviders(<Trigger />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit category')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('renders its children', () => {
    renderProviders(<p>the grid</p>);

    expect(screen.getByText('the grid')).toBeInTheDocument();
  });

  it('opens the modal prefilled for the category it was given', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Edit category' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Subscriptions');
    expect(screen.getByLabelText('Monthly budget (optional)')).toHaveValue('250.00');
  });

  it('threads the palette through to the pickers', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByRole('button', { name: /^Color/ })).toHaveAccessibleName('Color Indigo');
  });

  it('stops rendering the modal once it closes', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Edit category')).not.toBeInTheDocument();
  });

  it('shows the second category rather than the first when reopened', async () => {
    // What the single state object buys: the category cannot outlive the open it arrived with, so
    // the form cannot flash the previous card's values on the way in.
    renderProviders(
      <>
        <Trigger label="First" />
        <Trigger label="Second" target={category({ id: 'other', name: 'Transport' })} />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'First' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Transport');
  });
});

describe('the focus option, which is why the two trigger kinds differ', () => {
  it('opens on the name by default, for the kebab’s Edit', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('opens on the budget when the trigger asked for it, for "Set limit"', async () => {
    renderProviders(<Trigger focus="monthlyCap" />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByLabelText('Monthly budget (optional)')).toHaveFocus();
  });

  it("does not carry one open's focus request into the next", async () => {
    renderProviders(
      <>
        <Trigger label="Set limit" focus="monthlyCap" />
        <Trigger label="Edit" />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});

describe('AC7: the modal’s Delete category', () => {
  it('opens the confirmation over the form, quoting the stored name', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete category' }));

    expect(
      screen.getByRole('heading', { level: 2, name: DELETE_CATEGORY_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/"Subscriptions"/)).toBeInTheDocument();
    // Over it, not instead of it: a cancelled confirmation has to return to the form.
    expect(screen.getByRole('heading', { level: 2, name: 'Edit category' })).toBeInTheDocument();
  });

  it('quotes the stored name rather than whatever is currently typed', async () => {
    // The dialog describes the row about to be removed, not the edit in progress.
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Streaming');
    await userEvent.click(screen.getByRole('button', { name: 'Delete category' }));

    expect(screen.getByText(/"Subscriptions"/)).toBeInTheDocument();
  });

  it('leaves the form and its edits intact when the confirmation is cancelled', async () => {
    renderProviders(<Trigger />);

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Streaming');
    await userEvent.click(screen.getByRole('button', { name: 'Delete category' }));
    await userEvent.click(within(confirmation()).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(DELETE_CATEGORY_TITLE)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Streaming');
  });

  it('takes the modal down when the delete really lands', async () => {
    // The caller PET-39 shipped `onDeleted` for, with no caller at the time.
    renderProviders(<Trigger />, { remove: jest.fn().mockResolvedValue({ ok: true }) });

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete category' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByText('Edit category')).not.toBeInTheDocument();
  });

  it('leaves the modal up when the delete failed', async () => {
    // `onDeleted` is deliberately not on the failure arms, including a 404: the message has to stay
    // in front of something rather than being dismissed by what failed.
    renderProviders(<Trigger />, {
      remove: jest.fn().mockResolvedValue({ ok: false, reason: 'failed' }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete category' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText("We couldn't delete this category. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Edit category' })).toBeInTheDocument();
  });
});

describe('the Storybook seam', () => {
  it('uses the injected update rather than the real action', async () => {
    const update = jest.fn().mockResolvedValue({ ok: true });
    renderProviders(<Trigger />, { update });

    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Streaming');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(update).toHaveBeenCalledWith(SUBSCRIPTIONS.id, { name: 'Streaming' });
  });
});

describe('useEditCategory', () => {
  it('throws outside the provider rather than returning a no-op', () => {
    // An Edit that silently does nothing is a bug that ships; a throw is a bug that fails the first
    // test to render the screen without the provider.
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <DeleteCategoryProvider fallbackName="Uncategorized">
          <Trigger />
        </DeleteCategoryProvider>,
      ),
    ).toThrow('useEditCategory must be used inside EditCategoryProvider.');

    error.mockRestore();
  });
});
