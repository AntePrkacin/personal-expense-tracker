import { render, screen } from '@testing-library/react';

import { SIDEBAR_HREFS, SIDEBAR_ITEMS, Sidebar, type SidebarItem } from './Sidebar';

// next/jest maps every .css import to an empty object, so jsdom never receives
// a stylesheet and no test here can assert a rendered colour or size. Styling is
// daisyUI's as of PET-57, so these assert semantics; the one class asserted is
// menu-active, the visible half of aria-current.

const ITEMS = [...SIDEBAR_ITEMS];

/**
 * The labels as designed, in sidebar order, keyed by variant.
 *
 * `insights` reads "AI Assistant" as of PET-76, so the item and the page it opens finally agree.
 * The **key** deliberately did not move with the label, which is what kept `SIDEBAR_ITEMS`,
 * `SIDEBAR_HREFS` and the route folder out of that change.
 */
const LABELS: Record<SidebarItem, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  insights: 'AI Assistant',
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
  fullName: 'Ivana Horvat',
  email: 'ivana@example.test',
} as const;

// Overrides are typed against the component's props rather than `typeof
// profile`: the fixture is `as const`, so Partial of it narrows every field to
// its literal and rejects any other name - which is exactly what the
// long-profile test passes.
const renderSidebar = (
  active: SidebarItem,
  overrides: Partial<React.ComponentProps<typeof Sidebar>> = {},
) =>
  // `logOut` is stubbed by default and overridable, which is the whole reason
  // that prop is injected rather than imported: the real action reaches
  // `cookies()` from `next/headers`, so a suite that could not replace it would
  // have to mock the module by specifier - and `jest.mock('@/lib/logOut')` cannot
  // resolve the alias at all, which `frontend/src/app/CLAUDE.md` records.
  render(<Sidebar active={active} logOut={jest.fn()} {...profile} {...overrides} />);

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

    for (const heading of ['MENU', 'INSIGHTS', 'ACCOUNT']) {
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
    // the MENU / INSIGHTS / ACCOUNT structure. The ids are derived from the headings
    // themselves, so PET-76's rename moved the second one with it.
    expect(lists.map((list) => list.getAttribute('aria-labelledby'))).toEqual([
      'sidebar-menu',
      'sidebar-insights',
      'sidebar-account',
    ]);
    for (const list of lists) {
      const label = document.getElementById(list.getAttribute('aria-labelledby')!);
      expect(label).not.toBeNull();
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

  it.each(ITEMS)('%s takes the active treatment while the others do not', (active) => {
    renderSidebar(active);

    for (const item of ITEMS) {
      const link = itemLink(item);

      // menu-active is daisyUI's active-item state, the visible half of the
      // aria-current the test above pins.
      if (item === active) {
        expect(link).toHaveClass('menu-active');
      } else {
        expect(link).not.toHaveClass('menu-active');
      }
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

    // One per nav item, plus the footer's logout mark since PET-84. Counted
    // rather than merely iterated, so a glyph that arrives without a decision
    // fails here: the loop below would pass happily on any number of them, which
    // is what makes the count the half worth keeping.
    const glyphs = container.querySelectorAll('svg');
    expect(glyphs).toHaveLength(ITEMS.length + 1);
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

    // It carries no information the adjacent text does not already give in
    // words. aria-hidden sits on the avatar wrapper rather than the initials
    // span, so the whole tile is out of the tree.
    expect(screen.getByText('IH').closest('[aria-hidden="true"]')).not.toBeNull();
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

  describe('the footer logout control (PET-84, inverting AC5)', () => {
    // **This block used to assert the opposite**, and the inversion is the point
    // rather than an artifact: AC5 said the panel offers no sign-out affordance,
    // because no frame in the file draws one (A39), and the case existed so that
    // adding one by reflex would fail rather than ship. The product owner
    // overruled A39 in PET-84, so the guard is kept and turned around - a panel
    // that silently *lost* this control should fail here just as loudly as one
    // that gained it while the design said otherwise.

    it('names the control for a screen reader, not just with a glyph', () => {
      renderSidebar('settings');

      // The whole accessible name comes from `aria-label`: the button's subtree
      // is one `aria-hidden` glyph, so without it this announces as "button".
      const control = screen.getByRole('button', { name: 'Log out' });
      expect(control).toHaveAttribute('type', 'submit');
    });

    it('submits a form rather than handling a click, so the panel needs no client boundary', () => {
      const logOut = jest.fn();
      renderSidebar('settings', { logOut });

      const control = screen.getByRole('button', { name: 'Log out' });
      // `closest('form')` rather than a class or a DOM walk: what matters is that
      // the button is a submitter inside the form carrying the action, which is
      // what makes a press reach a Server Action with no `onClick` anywhere.
      expect(control.closest('form')).not.toBeNull();
      // Not called on render. The action fires on submit, and jsdom does not run
      // React's form action, so the press itself is a browser check.
      expect(logOut).not.toHaveBeenCalled();
    });

    it('hides the glyph, because the label already carries the name', () => {
      renderSidebar('settings');

      const glyph = screen.getByRole('button', { name: 'Log out' }).querySelector('svg');
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
    });

    it('is the only button in the panel, so nothing else became a control by accident', () => {
      renderSidebar('settings');

      // The other half of the old assertion, kept: every other affordance in this
      // panel is a link, and a second button appearing here would mean something
      // grew one without a decision.
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  it('truncates a long name and email rather than widening the panel', () => {
    // Figma clips instead, because it only ever draws the short sample address.
    // Truncation is the honest equivalent at a fixed 260px.
    renderSidebar('dashboard', {
      fullName: 'Maximiliana Wolfeschlegelsteinhausenbergerdorff',
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
