import { render, screen } from '@testing-library/react';

import { SectionHeader } from './SectionHeader';

// jsdom has no stylesheet under next/jest, so these assert class names rather
// than rendered appearance.

describe('SectionHeader', () => {
  it('renders the title as a real heading', () => {
    // A heading rather than a styled <p>, so card titles land in the document
    // outline and the screen-reader heading rotor. Queried the same way
    // src/app/page.test.tsx queries its heading.
    render(<SectionHeader title="Recent transactions" />);

    const heading = screen.getByRole('heading', { name: 'Recent transactions', level: 2 });
    expect(heading).toHaveClass('text-heading-m', 'text-text-primary');
  });

  it('renders the action as a link on the right when one is supplied', () => {
    render(
      <SectionHeader
        title="Recent transactions"
        action={{ label: 'View all', href: '/transactions' }}
      />,
    );

    const link = screen.getByRole('link', { name: 'View all' });
    expect(link).toHaveAttribute('href', '/transactions');
    expect(link).toHaveClass('text-strong-s', 'text-brand-accent');
  });

  it('shows only the title when no action is supplied', () => {
    // Both halves matter: asserting the link is gone without asserting the
    // title survives would pass on a component that rendered nothing at all.
    render(<SectionHeader title="Spending trend" />);

    expect(screen.getByRole('heading', { name: 'Spending trend' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('moves the heading level when the header nests inside a titled card', () => {
    render(<SectionHeader title="Recent in Groceries" headingLevel={3} />);

    expect(
      screen.getByRole('heading', { name: 'Recent in Groceries', level: 3 }),
    ).toBeInTheDocument();
  });
});
