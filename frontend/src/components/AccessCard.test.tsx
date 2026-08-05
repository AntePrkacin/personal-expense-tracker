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
// a rendered size. That these classes generate real CSS is proved in
// components/ui/utilities.test.ts.

const CEDI = '₵';

function card(container: HTMLElement): HTMLElement {
  const found = container.querySelector('.shadow-card');
  if (!(found instanceof HTMLElement)) {
    throw new Error('no element carrying shadow-card');
  }
  return found;
}

describe('AccessCard', () => {
  it('defaults to the 520px width both new frames draw', () => {
    // Frames 23 (node 132:1139) and 24 (134:1143) are both 520px, which is also
    // steps 1 and 3. Neither screen passes a width, so the default is the design
    // fact rather than a convenience - and it has to be a literal in that file for
    // Tailwind's scanner to find it.
    const { container } = render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    expect(card(container).className).toContain('w-130');
  });

  it('puts a caller width on the element carrying shadow-card', () => {
    // Load-bearing rather than incidental: SetupShell.test.tsx finds the card by
    // that class and then looks for the step's width on it, so a width that landed
    // on a wrapper instead would pass here and fail there.
    const { container } = render(
      <AccessCard width="w-150">
        <p>card body</p>
      </AccessCard>,
    );

    const box = card(container);
    expect(box.className).toContain('w-150');
    expect(box.className).not.toContain('w-130');
  });

  it('carries the designed card treatment', () => {
    const { container } = render(
      <AccessCard>
        <p>card body</p>
      </AccessCard>,
    );

    const box = card(container);
    expect(box.className).toContain('bg-surface-card');
    expect(box.className).toContain('border-border-default');
    expect(box.className).toContain('rounded-xl');
    expect(box).toContainElement(screen.getByText('card body'));
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
