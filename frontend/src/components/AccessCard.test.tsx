import { render, screen } from '@testing-library/react';

import { AccessCard } from './AccessCard';

// Only what this component owns on its own. The three onboarding steps drive it
// through `app/setup/SetupShell.tsx`, and that file's suite already covers the
// lockup, the card treatment and the per-step width through it - repeating those
// here would assert the same render twice.
//
// So: the width default and where the class lands, the `aboveCard` slot in both
// states, and the two frames that use neither.
//
// next/jest maps every .css import to an empty object, so nothing here can assert
// a rendered size - the card is located by daisyUI's own `card` class, which is
// the one thing the width contract below needs to be attached to.

const CEDI = '₵';

function card(container: HTMLElement): HTMLElement {
  const found = container.querySelector('.card');
  if (!(found instanceof HTMLElement)) {
    throw new Error('no element carrying the card class');
  }
  return found;
}

describe('AccessCard', () => {
  it('defaults to a width that survives a phone', () => {
    // PET-57 replaced the frame's fixed 520px with a maximum: a card wider than the
    // viewport was the design's one unusable layout. Neither screen 23 nor 24 passes
    // a width, so the default is what they get.
    const { container } = render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(card(container).className).toContain('w-full');
    expect(card(container).className).toContain('max-w-lg');
  });

  it('puts a caller width on the element carrying the card class', () => {
    // Load-bearing rather than incidental: SetupShell.test.tsx finds the card by
    // class and then looks for the step's width on it, so a width that landed on a
    // wrapper instead would pass here and fail there.
    const { container } = render(
      <AccessCard width="max-w-2xl">
        <p>card body</p>
      </AccessCard>,
    );

    const box = card(container);
    expect(box.className).toContain('max-w-2xl');
    expect(box.className).not.toContain('max-w-lg');
  });

  it('renders the children inside the card box', () => {
    const { container } = render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(card(container)).toContainElement(screen.getByText('card body'));
  });

  it('shows the brand lockup, not the pre-rename wordmark', () => {
    render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(screen.getByText('Spendifico')).toBeInTheDocument();
    expect(screen.getByText(CEDI)).toBeInTheDocument();
    expect(screen.queryByText(/Expensa/)).not.toBeInTheDocument();
  });

  it('renders aboveCard between the lockup and the card', () => {
    // The order is the whole point of the slot: onboarding's three dots sit under
    // the lockup and over the card, and a slot rendered anywhere else would look
    // right in this assertion's absence and wrong on the frame.
    const { container } = render(
      <AccessCard aboveCard={<span data-testid="slot" />}>
        <p>card body</p>
      </AccessCard>,
    );

    const column = container.firstElementChild!;
    const slot = screen.getByTestId('slot');

    expect([...column.children].indexOf(slot)).toBe(1);
    expect(column.children).toHaveLength(3);
    expect(slot.compareDocumentPosition(card(container))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('adds no element at all when aboveCard is omitted', () => {
    // Screens 23 and 24 have no step indicator (LOG-1, VER-1), and the column's
    // `gap-6` is what makes that free: an omitted node renders nothing, so the two
    // gaps become one with no conditional. An empty wrapper element instead would
    // leave a 24px hole nothing on either frame accounts for.
    const { container } = render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(container.firstElementChild!.children).toHaveLength(2);
  });

  it('renders no heading of its own', () => {
    // Each screen owns its h1. A heading here would compete with it on all five
    // frames at once - the same call SetupShell made before the chrome moved.
    render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });
});
