import { render, screen } from '@testing-library/react';

import { SETUP_STEPS, SetupShell, STEP_DOT } from './SetupShell';

// The chrome frames 02, 03 and 22 share: the lockup, the step indicator and the
// card box.
//
// next/jest maps every .css import to an empty object, so jsdom never receives a
// stylesheet and nothing here can assert a rendered colour or size. Class names
// are the only appearance signal; that they generate real CSS is proved in
// components/ui/utilities.test.ts.

const CEDI = '₵';

/**
 * The indicator wrapper, found by walking **up** from the active pill.
 *
 * Two things about the lookup are deliberate, and both were mistakes first.
 *
 * Not `container.querySelector('[aria-hidden="true"]')`: that matches the
 * lockup's cedi glyph before it reaches the indicator, which is the trap
 * WelcomeScreen.test.tsx records for its own `panel()` helper.
 *
 * And the pill is matched on **every** class in `STEP_DOT.active`, not just the
 * colour. `bg-brand-accent` alone hits the lockup's 38px tile first, so the walk
 * upwards then finds no hidden ancestor and this helper throws - which it did.
 * The compound selector is what makes the pill's geometry part of its identity.
 */
function indicator(container: HTMLElement): HTMLElement {
  const pill = container.querySelector(`.${STEP_DOT.active.split(' ').join('.')}`);
  const wrapper = pill?.closest('[aria-hidden="true"]');
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error('no aria-hidden ancestor above the active step dot');
  }
  return wrapper;
}

describe('the step tables', () => {
  it('declares three steps and two dot states', () => {
    // Guards the it.each below: an emptied table still passes an iteration over
    // itself, which is the failure mode utilities.test.ts sets the precedent for.
    expect(SETUP_STEPS).toHaveLength(3);
    expect(Object.keys(STEP_DOT)).toHaveLength(2);
  });

  it('fills the active dot with brand-accent, not the overline colour', () => {
    // The two sit 60px apart on the frame and are easy to conflate: Figma binds
    // the pill to Brand/Accent and the card's "STEP 1 OF 3" to Brand/Accent
    // Pressed. Getting it wrong is a one-token diff nothing else would catch.
    expect(STEP_DOT.active).toContain('bg-brand-accent');
    expect(STEP_DOT.active).not.toContain('brand-accent-pressed');
    expect(STEP_DOT.inactive).toContain('bg-border-strong');
  });
});

describe('SetupShell', () => {
  it.each(SETUP_STEPS)('draws three dots with only step %s active', (step) => {
    const { container } = render(
      <SetupShell step={step}>
        <p>card body</p>
      </SetupShell>,
    );

    const dots = [...indicator(container).children];
    expect(dots).toHaveLength(3);

    // The active one is at the step's own index, so a shell that always fills the
    // first dot fails on steps 2 and 3 rather than passing everywhere.
    const active = dots.filter((dot) => dot.className.includes('bg-brand-accent'));
    expect(active).toHaveLength(1);
    expect(dots.indexOf(active[0]!)).toBe(step - 1);
  });

  it('hides the indicator from assistive technology', () => {
    // Load-bearing. The card's own overline says "STEP 1 OF 3" in text, so three
    // unlabelled shapes add nothing a reader is missing - unhidden they announce
    // as three empty generics.
    const { container } = render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    expect(indicator(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts nothing focusable inside the hidden indicator', () => {
    // aria-hidden on an ancestor does NOT remove focusable descendants from the
    // tab order - the classic footgun, which DecorativePanel documents and
    // WelcomeScreen.test.tsx pins for the same reason. Three bare spans today.
    const { container } = render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    expect(
      indicator(container).querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  it('shows the brand lockup, not the pre-rename wordmark', () => {
    render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.getByText(CEDI)).toBeInTheDocument();
    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('renders its children inside the card', () => {
    const { container } = render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    const card = container.querySelector('.shadow-card');
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByText('card body'));
  });

  it('carries the designed card treatment', () => {
    // The one class assertion worth making here, because `shadow-card` is a token
    // PET-9 added and re-inlining it as an arbitrary literal would look identical
    // on screen while escaping the compile guard - which is exactly the state the
    // Welcome panel's two shadows were in before this ticket.
    const { container } = render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    const card = container.querySelector('.shadow-card')!;
    expect(card.className).toContain('bg-surface-card');
    expect(card.className).toContain('border-border-default');
    expect(card.className).toContain('rounded-xl');
    // 520px, the designed width of frames 02 and 22. Frame 03 is 600px, so PET-10
    // changes this and this assertion together.
    expect(card.className).toContain('w-130');
  });

  it('renders no heading of its own', () => {
    // Each step owns its h1, the way each access screen does. A heading here would
    // compete with it on all three steps at once.
    render(
      <SetupShell step={1}>
        <p>card body</p>
      </SetupShell>,
    );

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });
});
