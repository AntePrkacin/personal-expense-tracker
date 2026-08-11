import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Profile } from '@/lib/profile';

// `shellRender`'s `render` as of PET-48, because the Categories card calls `useMoney()`. Same swap
// `SettingsForm.test.tsx` made, for the same reason.
import { render } from '../shellRender';

import { category, FALLBACK_CATEGORY } from '../transactions/categories/categoryFixture';

import { SettingsScreen } from './SettingsScreen';

// Thin on purpose. The form's behaviour is `SettingsForm.test.tsx`'s and the diff is
// `settingsForm.test.ts`'s; what is left for this file is the screen's own shape - the header it
// draws, the heading levels, and the one control the page carries.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const PROFILE: Profile = {
  fullName: 'Marko Kovač',
  email: 'marko@email.com',
  currency: 'USD',
  monthlyBudget: 2000,
  monthStartDay: 1,
};

/** Two managed rows and the fallback, which is what the Manage modal's own filter is about. */
const CATEGORIES = [category(), category({ id: 'b', name: 'Transport' }), FALLBACK_CATEGORY];

const ALLOCATION = { monthlyBudget: 2000, allocated: 1800, unallocated: 200 };

/** One period, flagged current, which is what the Manage button needs to be enabled at all. */
const PERIODS = [{ start: '2026-08-01', end: '2026-09-01', label: 'August 2026', current: true }];

function renderScreen() {
  return render(
    <SettingsScreen
      profile={PROFILE}
      save={jest.fn()}
      themePref="system"
      categories={{ categories: CATEGORIES, allocation: ALLOCATION }}
      palette={null}
      periods={PERIODS}
    />,
  );
}

describe('SettingsScreen', () => {
  it('opens with its designed overline and title', () => {
    renderScreen();

    expect(screen.getByText('Manage your account')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('renders exactly one page-level heading, with the card titles below it', () => {
    // Every card is an `h2`, because `PageHeader` owns the page's `h1` - which is what keeps
    // `pages.test.tsx`'s one-h1 case passing now that this screen has content.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Categories' })).toBeInTheDocument();
  });

  it('draws frame 17 whole: three cards over one Save', () => {
    // The assertion PET-46 and PET-47 could not make, because the frame's third card did not exist.
    // A fourth `h2` appearing here means a card was added without anybody deciding it belonged.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('keeps the header free of controls, which is SET-1 AC2', () => {
    // "Save changes" belongs at the foot of the form, so `PageHeader` gets no `action` at all.
    // Scoped to the header, because the page now has a button in it.
    const { container } = renderScreen();
    const header = container.querySelector('header');

    expect(header).not.toBeNull();
    expect(header!.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('puts the form under main, with the one Save the page has', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main');

    expect(main).not.toBeNull();
    expect(main!.querySelector('form')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Save changes' })).toHaveLength(1);
  });
});

// **The one invariant `ManageCategoriesProvider` exists for, which had no assertion until a review
// said so.** The dialogs it and the two category providers mount must render as *siblings* of
// `SettingsForm`'s `<form>`, never inside it: `AddCategoryModal` and `EditCategoryModal` both pass
// `onSubmit`, so `Modal` wraps their bodies in a real `<form>`, and a `<dialog>` does not break form
// association. Nested, pressing Enter in the new category's Name field would submit the profile form
// instead of creating the category.
//
// This is the only place it can be pinned. `SettingsForm.test.tsx` mocks the provider module away
// and `ManageCategoriesProvider.test.tsx` mounts it around a synthetic trigger with no form in
// sight, so both would survive the modal being moved back inside the card.
describe('the Manage modal is mounted outside the page form', () => {
  it('renders the dialog as a sibling of the form rather than a descendant', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    const dialog = container.querySelector('dialog');

    expect(dialog).not.toBeNull();
    expect(container.querySelector('form')).not.toBeNull();
    expect(dialog!.closest('form')).toBeNull();
  });

  it('disables Manage when the categories read failed, rather than opening onto zeroes', () => {
    render(
      <SettingsScreen
        profile={PROFILE}
        save={jest.fn()}
        themePref="system"
        categories={null}
        palette={null}
        periods={PERIODS}
      />,
    );

    expect(screen.getByRole('button', { name: 'Manage' })).toBeDisabled();
  });

  it('disables Manage when the period list is missing, because a cap edit would go unanchored', () => {
    render(
      <SettingsScreen
        profile={PROFILE}
        save={jest.fn()}
        themePref="system"
        categories={{ categories: CATEGORIES, allocation: ALLOCATION }}
        palette={null}
        periods={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Manage' })).toBeDisabled();
  });
});
