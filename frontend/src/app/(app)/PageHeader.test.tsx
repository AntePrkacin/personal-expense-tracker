import { render, screen } from '@testing-library/react';
import Link from 'next/link';

import { PageHeader } from './PageHeader';

// next/jest stubs CSS imports, so nothing here asserts a rendered colour or
// spacing. These assert structure and semantics, which is where the header's
// acceptance criteria actually live; the classes are stock daisyUI plus
// Tailwind defaults as of PET-57, and review is what guards them.

describe('PageHeader', () => {
  it('renders the overline and the title', () => {
    // AC1, in its smallest form.
    render(<PageHeader overline="October 2025" title="Dashboard" />);

    expect(screen.getByText('October 2025')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the title as the page-level heading', () => {
    // Level 1 specifically. ui/Sidebar renders no heading at all - its own test
    // pins that - so this is the first one a screen reader reaches, and the
    // section headings the content tickets add below it start at h2 on the
    // assumption this exists.
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

describe("PageHeader's breadcrumb shape", () => {
  // Frame 08's arm (DET-1, DET-2). The union's `never` halves mean a caller cannot pass an
  // overline and a breadcrumb together, which `npx tsc --noEmit` is what enforces - `npm run
  // build` never reads this file, per the CI note in frontend/CLAUDE.md.

  it('renders the breadcrumb in place of the overline', () => {
    render(
      <PageHeader
        breadcrumb={<Link href="/transactions">All transactions</Link>}
        title="Whole Foods"
      />,
    );

    expect(screen.getByRole('link', { name: 'All transactions' })).toBeInTheDocument();
  });

  it('still renders the title as the only level-1 heading', () => {
    // The reason this is a second shape rather than a second component: one owner, one h1.
    render(
      <PageHeader
        breadcrumb={<Link href="/transactions">All transactions</Link>}
        caption={<span>Oct 8, 2025</span>}
        title="Whole Foods"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Whole Foods' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('renders the caption under the title', () => {
    render(
      <PageHeader
        breadcrumb={<Link href="/transactions">All transactions</Link>}
        caption={<span>Oct 8, 2025</span>}
        title="Whole Foods"
      />,
    );

    expect(screen.getByText('Oct 8, 2025')).toBeInTheDocument();
  });

  it('renders no caption row when none is passed', () => {
    // A transaction always has a date, so this arm is not reached by the detail page today.
    // It is the same call `action` makes: presence is the switch, and an empty row would
    // still take its gap.
    const { container } = render(
      <PageHeader
        breadcrumb={<Link href="/transactions">All transactions</Link>}
        title="Whole Foods"
      />,
    );

    // The breadcrumb and the h1, and nothing after them.
    expect(container.querySelector('header')?.firstElementChild?.children).toHaveLength(2);
  });

  it('renders the action alongside a breadcrumb', () => {
    // Frame 08 draws Edit and Delete in the same slot the four routed views use.
    render(
      <PageHeader
        breadcrumb={<Link href="/transactions">All transactions</Link>}
        title="Whole Foods"
        action={<button type="button">Edit</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
