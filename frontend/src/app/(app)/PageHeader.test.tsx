import { render, screen } from '@testing-library/react';

import { PageHeader } from './PageHeader';

// next/jest stubs CSS imports, so nothing here asserts a rendered colour or
// spacing; utilities.test.ts is what proves the classes generate CSS. These
// assert structure and semantics, which is where the header's acceptance
// criteria actually live.

describe('PageHeader', () => {
  it('renders the overline and the title', () => {
    // AC1, in its smallest form.
    render(<PageHeader overline="October 2025" title="Dashboard" />);

    expect(screen.getByText('October 2025')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the title as the page-level heading', () => {
    // Level 1 specifically. ui/Sidebar renders no heading at all - its own test
    // pins that - so this is the first one a screen reader reaches, and every
    // SectionHeader below it defaults to h2 on the assumption this exists.
    render(<PageHeader overline="Manage your account" title="Settings" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('does not promote the overline to a heading', () => {
    // It is a period label, not a section title. Making it a heading would put
    // "October 2025" in the heading rotor ahead of the page's own name.
    render(<PageHeader overline="October 2025" title="Dashboard" />);

    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('renders the action when one is passed', () => {
    render(
      <PageHeader
        overline="Your money assistant"
        title="AI Insights"
        action={<button type="button">Regenerate</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('renders no action container at all when none is passed', () => {
    // AC2's second half: "on Settings no header action renders at all". An empty
    // wrapper would still be a flex item and would still take the gap, so the
    // check is on the element count rather than on visible text.
    const { container } = render(<PageHeader overline="Manage your account" title="Settings" />);

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    // Just the overline/title column.
    expect(header?.children).toHaveLength(1);
  });
});
