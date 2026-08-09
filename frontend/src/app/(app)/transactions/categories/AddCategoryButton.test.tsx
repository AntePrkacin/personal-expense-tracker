import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import type { Palette } from '../../../../lib/palette';

import { AddCategoryButton } from './AddCategoryButton';

// The wiring between the Categories tab's header action and the modal it opens, which is the one
// thing about this feature no other suite can see.
//
// **It exists because the click had no coverage anywhere.** `AddCategoryModal.test.tsx` mounts the
// modal directly with an injected action, `CategoriesScreen.test.tsx` asserts only that the button is
// not disabled and that no dialog is showing at rest, and `screens.stories.test.tsx` smoke-renders
// the stories without clicking anything. So dropping the `onClick`, inverting the `open` branch or
// forgetting to thread `palette` would have left the screen's most prominent action doing nothing
// with every gate green - which is the exact failure the `aria-disabled` assertion this button
// replaced used to make impossible to reach silently. `AddTransactionProvider.test.tsx` is the same
// check for the same reason on the transaction side.
//
// `next/navigation` is mocked because the modal reads `useRouter` on render; the create action is
// left alone, since nothing here submits and its module is never called. Relative specifiers
// throughout, per the `@/` alias trap `frontend/src/app/CLAUDE.md` records.
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

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

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ refresh: jest.fn() });
});

const user = () => userEvent.setup();
const trigger = () => screen.getByRole('button', { name: 'Add category' });

it('draws an enabled trigger with no dialog behind it', () => {
  render(<AddCategoryButton palette={PALETTE} />);

  expect(trigger()).toBeEnabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('opens the modal on click', async () => {
  const u = user();
  render(<AddCategoryButton palette={PALETTE} />);

  await u.click(trigger());

  expect(screen.getByRole('dialog', { name: 'Add category' })).toBeInTheDocument();
});

// The prop rather than the render: a modal that opened with `palette={null}` would draw two disabled
// pickers and a failure line, which looks like a backend problem rather than like a dropped prop.
// The trigger's accessible name carries the chosen value, so the palette's first colour is visible
// from outside the picker.
it('threads the palette into the modal it opens', async () => {
  const u = user();
  render(<AddCategoryButton palette={PALETTE} />);

  await u.click(trigger());

  expect(screen.getByRole('button', { name: 'Color Emerald' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Icon Basket' })).toBeEnabled();
});

// The other half of the conditional render, and the reason it is a conditional at all: a closed
// `<dialog>` is `display: none`, so `queryByRole` cannot see into it, but `queryAllByText` and
// `queryAllByLabelText` can - an always-mounted modal would leave a combobox, a textbox and five
// labels in this screen's tree forever, which `(app)/pages.test.tsx` depends on not happening.
it('unmounts the modal again when it closes', async () => {
  const u = user();
  render(<AddCategoryButton palette={PALETTE} />);

  await u.click(trigger());
  await u.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
});

// A failed palette read must still open the modal, because the modal is where the explanation is.
it('still opens when the palette could not be read', async () => {
  const u = user();
  render(<AddCategoryButton palette={null} />);

  await u.click(trigger());

  expect(screen.getByRole('dialog', { name: 'Add category' })).toBeInTheDocument();
  expect(
    screen.getByText("We couldn't load the colours and icons. Reload the page to try again."),
  ).toBeInTheDocument();
});
