import { render, screen } from '@testing-library/react';

import {
  NAV_ITEM_ICON,
  NAV_ITEM_LABEL,
  NAV_ITEM_SURFACE,
  SIDEBAR_HREFS,
  SIDEBAR_ITEMS,
  Sidebar,
  type SidebarItem,
} from './Sidebar';

// next/jest maps every .css import to an empty object, so jsdom never receives
// a stylesheet and no test here can assert a rendered colour or size. These
// assert the class names instead; that the classes generate real CSS is proved
// separately in components/utilities.test.ts.

const ITEMS = [...SIDEBAR_ITEMS];

/** The labels as designed, in sidebar order, keyed by variant. */
const LABELS: Record<SidebarItem, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  insights: 'Insights',
  settings: 'Settings',
};

/**
 * The destinations, read from the component's own map rather than restated.
 *
 * This was a hand-written copy, which made it a second declaration of a contract
 * that also has to satisfy the `(app)` shell and the route folders on disk. It
 * asserted itself against itself and could not notice a divergence, so it now
 * reads `SIDEBAR_HREFS`. What the assertion below still proves is that every item
 * renders *its own* href rather than sharing or transposing one, which is the
 * failure a single shared map can still have.
 */
const HREFS = SIDEBAR_HREFS;

/**
 * A profile that is not the designed sample.
 *
 * Deliberately not "Marko Kovač / marko@email.com": the last test in this file
 * asserts none of Figma's sample values survives in the component, and it can
 * only do that if the fixture the other tests use is different from them.
 */
const profile = {
  firstName: 'Ivana',
  lastName: 'Horvat',
  email: 'ivana@example.test',
} as const;

const renderSidebar = (active: SidebarItem, overrides: Partial<typeof profile> = {}) =>
  render(<Sidebar active={active} {...profile} {...overrides} />);

const itemLink = (item: SidebarItem) => screen.getByRole('link', { name: LABELS[item] });

describe('Sidebar', () => {
  it('exposes exactly the four designed variants', () => {
    // Guards every it.each below: dropping a variant would otherwise shrink them
    // to three silent cases and still pass. The order is the Figma component
    // set's own (node 18:252).
    expect(ITEMS).toEqual(['dashboard', 'transactions', 'insights', 'settings']);
  });

  it('renders the wordmark, all three headings and all four items (AC1)', () => {
    renderSidebar('dashboard');

    // "Spendifico", not Figma's "Expensa". See the comment in Sidebar.tsx and
    // "The Figma file still says Expensa" in docs/TODO.md; this pins the
    // deliberate divergence so the rename cannot be half-reverted.
    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.queryByText('Expensa')).not.toBeInTheDocument();

    for (const heading of ['MENU', 'ASSISTANT', 'ACCOUNT']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }

    expect(screen.getAllByRole('link')).toHaveLength(ITEMS.length);
    for (const item of ITEMS) {
      expect(itemLink(item)).toBeInTheDocument();
    }
  });

  it('groups the items under their own heading, without inventing headings', () => {
    renderSidebar('dashboard');

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(3);

    // Each list is named by its own overline, which is what gives a screen reader
    // the MENU / ASSISTANT / ACCOUNT structure.
    expect(lists.map((list) => list.getAttribute('aria-labelledby'))).toEqual([
      'sidebar-menu',
      'sidebar-assistant',
      'sidebar-account',
    ]);
    for (const list of lists) {
      const label = document.getElementById(list.getAttribute('aria-labelledby')!);
      expect(label).not.toBeNull();
      expect(label).toHaveClass('text-overline');
    }

    // The overlines are labels, not headings: promoting them would put three
    // entries in the heading rotor ahead of the page's own title, and the design
    // draws them as small captions.
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });

  it('names the navigation landmark', () => {
    renderSidebar('insights');

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it.each(ITEMS)('%s marks only itself as the current page (AC2, AC3)', (active) => {
    renderSidebar(active);

    // aria-current is the real signal, not the fill: this is what a screen reader
    // announces and what makes "the highlight moves with it" testable.
    expect(itemLink(active)).toHaveAttribute('aria-current', 'page');

    for (const item of ITEMS.filter((candidate) => candidate !== active)) {
      // Absent, not "false". aria-current="false" is a valid value meaning "not
      // current", so asserting absence is what pins the attribute being omitted
      // rather than negated.
      expect(itemLink(item)).not.toHaveAttribute('aria-current');
    }
  });

  it.each(ITEMS)('%s takes the active fill and label while the others do not', (active) => {
    renderSidebar(active);

    for (const item of ITEMS) {
      const state = item === active ? 'active' : 'inactive';
      const link = itemLink(item);

      expect(link).toHaveClass(NAV_ITEM_SURFACE[state], NAV_ITEM_LABEL[state]);
      // The glyph does not inherit the label colour: active draws it in the brand
      // accent against a white label, so it carries its own class.
      expect(link.firstElementChild).toHaveClass(NAV_ITEM_ICON[state]);
    }
  });

  it.each(ITEMS)('%s points at its route (AC3)', (item) => {
    renderSidebar('dashboard');

    // The hrefs have no Figma counterpart and are the contract PET-19 has to
    // match when it creates the four routes.
    expect(itemLink(item)).toHaveAttribute('href', HREFS[item]);
  });

  it('hides every glyph from assistive technology', () => {
    const { container } = renderSidebar('settings');

    const glyphs = container.querySelectorAll('svg');
    expect(glyphs).toHaveLength(ITEMS.length);
    for (const glyph of glyphs) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('derives the footer from the two names and the email (AC4)', () => {
    renderSidebar('dashboard');

    expect(screen.getByText('IH')).toBeInTheDocument();
    expect(screen.getByText('Ivana H.')).toBeInTheDocument();
    expect(screen.getByText(profile.email)).toBeInTheDocument();
  });

  it('hides the initials tile, which only repeats the name beside it', () => {
    renderSidebar('dashboard');

    // Same call ListRow makes for its category tile: it carries no information
    // the adjacent text does not already give in words.
    expect(screen.getByText('IH')).toHaveAttribute('aria-hidden', 'true');
  });

  it('contains none of the designed sample values (AC4)', () => {
    // "No hardcoded sample values", turned into an assertion. Figma draws "MK",
    // "Marko K." and "marko@email.com", and those strings are the ones a
    // half-finished implementation leaves behind. They appear in the stories,
    // where they belong, and must not appear here.
    renderSidebar('dashboard');

    for (const sample of ['MK', 'Marko K.', 'marko@email.com']) {
      expect(screen.queryByText(sample)).not.toBeInTheDocument();
    }
  });

  it('offers no sign-out affordance (AC5)', () => {
    // Deliberate, not an omission. No frame in the file draws a logout control,
    // including Settings, even though sessions exist; the designer still owes an
    // answer (A39). This test is here so adding one by reflex fails rather than
    // ships.
    renderSidebar('settings');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/log ?out|sign ?out/i)).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent).not.toMatch(/log ?out|sign ?out/i);
    }
  });

  it('truncates a long name and email rather than widening the panel', () => {
    // Figma clips instead, because it only ever draws the short sample address.
    // Truncation is the honest equivalent at a fixed 260px.
    renderSidebar('dashboard', {
      firstName: 'Maximiliana',
      lastName: 'Wolfeschlegelsteinhausenbergerdorff',
      email: 'maximiliana.wolfeschlegelsteinhausenbergerdorff@a-very-long-domain.example',
    });

    expect(screen.getByText('Maximiliana W.')).toHaveClass('truncate');
    expect(
      screen.getByText(
        'maximiliana.wolfeschlegelsteinhausenbergerdorff@a-very-long-domain.example',
      ),
    ).toHaveClass('truncate');
  });
});
