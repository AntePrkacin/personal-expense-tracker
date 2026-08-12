import { render, screen } from '@testing-library/react';

import { SETUP_STEPS, SetupShell, type SetupStep, STEP_DOT, STEP_WIDTH } from './SetupShell';

// The chrome frames 02, 03 and 22 share: the lockup, the step indicator and the
// card box.
//
// next/jest maps every .css import to an empty object, so jsdom never receives a
// stylesheet and nothing here can assert a rendered colour or size. Class names
// are the only appearance signal, and nothing proves they generate real CSS
// since PET-57 retired the compile guard.

// The mark's visible glyphs, which PET-79 changed from one U+20B5 CEDI SIGN to a `$` doing double
// duty as the S in "$PENDIFICO". Both halves are `aria-hidden`, so the accessible name is a
// separate `sr-only` "Spendifico" - which is why the two assertions below differ: one reaches for
// hidden text and one for the name a reader actually gets.
const MARK_GLYPH = '$';
const WORDMARK = 'PENDIFICO';

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
 * colour. The accent fill alone hits the lockup's tile first, so the walk upwards
 * then finds no hidden ancestor and this helper throws - which it did. The compound
 * selector is what makes the pill's geometry part of its identity.
 */
function indicator(container: HTMLElement): HTMLElement {
  const pill = container.querySelector(`.${STEP_DOT.active.split(' ').join('.')}`);
  const wrapper = pill?.closest('[aria-hidden="true"]');
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error('no aria-hidden ancestor above the active step dot');
  }
  return wrapper;
}

/**
 * The card, found by the step's own width classes.
 *
 * This replaced a `querySelector('.shadow-card')` lookup, which the token layer's
 * removal deleted from under it. Not swapped for another of `AccessCard`'s classes on
 * purpose: that component is somebody else's file, and keying this suite off its
 * surface or its radius is what made the old lookup fragile. The width is the one
 * class this shell puts there itself, so it is the honest handle - and the
 * `toContainElement` below is what keeps the assertion meaningful rather than a
 * tautology about a string appearing twice.
 *
 * A compound selector over both classes, so `w-full` and the ceiling have to land on
 * the same element.
 */
function card(container: HTMLElement, step: SetupStep): HTMLElement {
  const found = container.querySelector(`.${STEP_WIDTH[step].split(' ').join('.')}`);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no element carries the step ${step} width, ${STEP_WIDTH[step]}`);
  }
  return found;
}

describe('the step tables', () => {
  it('declares three steps, two dot states and a width per step', () => {
    // Guards the it.each below: an emptied table still passes an iteration over
    // itself, the self-asserting failure mode every table-driven suite here
    // guards the same way.
    expect(SETUP_STEPS).toHaveLength(3);
    expect(Object.keys(STEP_DOT)).toHaveLength(2);
    expect(Object.keys(STEP_WIDTH)).toHaveLength(3);
  });

  it('widens only step 2, which is the one 600px frame', () => {
    // Frames 02 and 22 are 520px and frame 03 is 600px. Asserted as values rather
    // than through the render below, because "the middle step is the wide one" is
    // the design fact, and a map that widened all three would still satisfy every
    // per-step render assertion.
    expect(STEP_WIDTH[1]).toBe(STEP_WIDTH[3]);
    expect(STEP_WIDTH[2]).not.toBe(STEP_WIDTH[1]);
  });

  it('caps the card rather than fixing its width', () => {
    // The responsive half of the same fact: a fixed width overflows a viewport
    // narrower than the card, and only `max-w-*` lets it shrink. Every entry, so
    // one step cannot regress on its own.
    for (const width of Object.values(STEP_WIDTH)) {
      expect(width).toContain('w-full');
      expect(width).toContain('max-w-');
    }
  });

  it('distinguishes the two dot states by more than a colour', () => {
    // The active one is a pill and the inactive ones are dots, which is what makes
    // the indicator readable at all - three shapes in three shades of one accent
    // would not be. The colours themselves are the theme's.
    expect(STEP_DOT.active).not.toBe(STEP_DOT.inactive);
    expect(STEP_DOT.active).toContain('w-7');
    expect(STEP_DOT.inactive).toContain('size-2');
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
    // first dot fails on steps 2 and 3 rather than passing everywhere. Matched
    // against the map rather than a copy of its value, since the shell interpolates
    // the whole string verbatim.
    const active = dots.filter((dot) => dot.className.includes(STEP_DOT.active));
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

    // The announced name, which is `sr-only` and is what six other suites pin.
    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    // The visible halves. `getByText` reads through `aria-hidden`, which is exactly why the line
    // above is the one that proves a reader gets a whole word rather than "dollar P E N D I F...".
    expect(screen.getByText(MARK_GLYPH)).toBeInTheDocument();
    expect(screen.getByText(WORDMARK)).toBeInTheDocument();
    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it.each(SETUP_STEPS)('renders its children inside the step %s card', (step) => {
    // Per step, so a shell that hard-codes one width again fails on the step it is
    // wrong for rather than passing everywhere. The card's own surface, border and
    // radius are AccessCard's and are asserted in AccessCard.test.tsx; this suite
    // owns only the width and the indicator.
    const { container } = render(
      <SetupShell step={step}>
        <p>card body</p>
      </SetupShell>,
    );

    expect(card(container, step)).toContainElement(screen.getByText('card body'));
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
