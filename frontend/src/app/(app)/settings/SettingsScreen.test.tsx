import { render, screen } from '@testing-library/react';

import type { Profile } from '@/lib/profile';

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

function renderScreen() {
  return render(<SettingsScreen profile={PROFILE} save={jest.fn()} themePref="system" />);
}

describe('SettingsScreen', () => {
  it('opens with its designed overline and title', () => {
    renderScreen();

    expect(screen.getByText('Manage your account')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('renders exactly one page-level heading, with the card title below it', () => {
    // The card is an `h2`, because `PageHeader` owns the page's `h1` - which is what keeps
    // `pages.test.tsx`'s one-h1 case passing now that this screen has content.
    renderScreen();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument();
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
