import { render, screen } from '@testing-library/react';

import { WelcomeScreen } from './WelcomeScreen';

// AC1 to AC4 of PET-8.
//
// No mocks at all: the screen is a synchronous Server Component with no data, no
// clock and no router hook, and next/link renders an <a> under jsdom unaided. The
// session branch lives one level up in page.tsx and is tested there.
//
// next/jest maps every .css import to an empty object, so jsdom never receives a
// stylesheet and nothing here can assert a rendered colour or size. Class names are
// the only appearance signal a Jest test has, and nothing proves they generate real
// CSS since PET-57 retired the compile guard; review is what holds that line now.

// The three non-ASCII glyphs the design draws, written as escapes so a substitution
// fails loudly rather than reading as an identical-looking diff. That is the same
// call lib/format.ts makes for U+2212: the failure
// message `expected "on plan — all", received "on plan - all"` is close to invisible
// in a terminal otherwise.
const EM_DASH = '—';
const MIDDLE_DOT = '·';
const CEDI = '₵';

const INTRO =
  'Track every expense, set budgets by category, and get AI insights that keep you ' +
  `on plan ${EM_DASH} all in one calm, focused space.`;

describe('the Welcome screen', () => {
  it('shows the logo, overline, heading, intro copy and footer microcopy', () => {
    // AC1, WEL-1, all five elements the requirement lists.
    render(<WelcomeScreen />);

    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.getByText(CEDI)).toBeInTheDocument();
    expect(screen.getByText('PERSONAL FINANCE, SIMPLIFIED')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Take control of your money.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.getByText('Made for mindful spending.')).toBeInTheDocument();
  });

  it('carries the wordmark, not the pre-rename one', () => {
    // The Figma file still says "Expensa" and is the last holdout of the 2026-08-02
    // rename. ui/Sidebar.test.tsx pins the same thing for the same reason: this is
    // the most visible string in the product, and a half-revert from a screenshot is
    // exactly how it comes back.
    render(<WelcomeScreen />);

    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('renders exactly one page-level heading', () => {
    // There is no PageHeader out here, so the pitch is the screen's own h1. The
    // overline and the wordmark are both <p>, and the sample card's title inside the
    // decorative panel is too.
    render(<WelcomeScreen />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('the two entry routes', () => {
  it('sends "Get started" to setup', () => {
    // AC2, WEL-2, A1. Hard-coded rather than read from ACCESS_ROUTES: that constant
    // is the single declaration and this test is the independent half of the
    // contract, so importing it would let both move together and stay wrong. Same
    // reasoning as page.test.tsx's '/dashboard'.
    //
    // (SidebarNav.test.tsx reads its constant for the opposite reason: four
    // hand-written copies of those hrefs already existed there.)
    render(<WelcomeScreen />);

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/setup');
  });

  it('sends "I already have an account" to log in', () => {
    // AC3, WEL-3, A2. The only route into the returning-user flow.
    render(<WelcomeScreen />);

    expect(screen.getByRole('link', { name: 'I already have an account' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('renders both exits as links and no buttons at all', () => {
    // Both change the page location, so both have to be <a>. This is the assertion
    // that catches "Get started" being regressed to a <button> with a router.push,
    // which would force 'use client' onto the whole screen.
    render(<WelcomeScreen />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the decorative panel', () => {
  it('is hidden from assistive technology', () => {
    // AC4, WEL-4, and a real assertion rather than a formality. Role queries only
    // match the accessibility tree, so queryByRole('progressbar') passing null is
    // exactly the proof that aria-hidden is in place: the sample card's native
    // <progress> carries that role implicitly, and unhidden it would announce a
    // real-sounding 62% of a budget that is not the reader's.
    render(<WelcomeScreen />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    // getByText ignores accessibility hiding, so this pair proves the content is
    // present and merely hidden, rather than absent because somebody deleted it.
    expect(screen.getByText('October budget')).toBeInTheDocument();
    expect(screen.getByText('$1,240')).toBeInTheDocument();
    expect(screen.getByText(`$760 left ${MIDDLE_DOT} 8 days to go`)).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });

  it('contains nothing focusable, so nothing is hidden but still tabbable', () => {
    // aria-hidden on an ancestor removes the subtree from the accessibility tree but
    // does NOT remove focusable descendants from the tab order - the classic
    // footgun, and a WCAG 4.1.2 failure when it happens. There is nothing focusable
    // in there today; this is what stops a later ticket adding one.
    render(<WelcomeScreen />);

    expect(panel().querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(
      0,
    );
  });

  it('is a plain div rather than a landmark', () => {
    // An aria-hidden landmark is self-contradictory, so this must not become an
    // <aside> by reflex just because it is a side panel.
    render(<WelcomeScreen />);

    expect(panel().tagName).toBe('DIV');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

/**
 * The decorative panel, found by walking up from content only it contains.
 *
 * Deliberately not `container.querySelector('[aria-hidden="true"]')`, which was the
 * first attempt and silently matched the wrong element: the cedi glyph in the logo
 * lockup is also aria-hidden and comes first in document order, so the landmark
 * assertion read SPAN. Walking up from the sample card's title says what is meant -
 * "whatever is hiding this fabricated content" - and cannot drift onto another
 * hidden node.
 *
 * Not keyed off a class either (`.bg-neutral`), which would couple the panel's
 * identity to its fill.
 */
function panel(): HTMLElement {
  const found = screen.getByText('October budget').closest('[aria-hidden="true"]');

  if (!(found instanceof HTMLElement)) {
    throw new Error('The sample budget card is not inside an aria-hidden subtree.');
  }

  return found;
}
