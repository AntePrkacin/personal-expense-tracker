import { render, screen } from '@testing-library/react';

import { Button } from './ui/Button';
import { EmptyState } from './EmptyState';

// The shared card. Its measurements are diffed in Storybook against node 45:1044; what is
// worth asserting here is the structure the two consuming frames rely on, and the accessible
// shape that has no Figma counterpart at all.

/**
 * A glyph that asks to be announced, unlike every real one in the repo.
 *
 * `role="img"` with a label, and deliberately **not** `aria-hidden`. The point is to prove the
 * card hides the icon subtree itself. An earlier version of this fixture set `aria-hidden` and
 * the test below then asserted the fixture's own attribute - which no change to `EmptyState`
 * could ever fail, since the component did not set it. Handing it the hardest input is what
 * makes the assertion mean something.
 */
function Glyph() {
  return <svg viewBox="0 0 30 30" className="size-7.5" role="img" aria-label="three bars" />;
}

describe('EmptyState', () => {
  it('renders the icon, heading, body and action', () => {
    const { container } = render(
      <EmptyState
        icon={<Glyph />}
        heading="No transactions yet"
        body="Log your first expense."
        action={<Button label="Add transaction" />}
      />,
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No transactions yet' })).toBeInTheDocument();
    expect(screen.getByText('Log your first expense.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it('renders no action when none is passed', () => {
    // Presence is the switch, so there is no state where a flag and a node disagree.
    render(<EmptyState icon={<Glyph />} heading="Nothing here" body="Not a thing." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is an h2 by default, because PageHeader owns the h1', () => {
    render(<EmptyState icon={<Glyph />} heading="No transactions yet" body="Copy." />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No transactions yet');
  });

  it('takes a deeper level for a card that already has a heading', () => {
    render(
      <EmptyState icon={<Glyph />} heading="No transactions yet" body="Copy." headingLevel={3} />,
    );

    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('hides the icon and its circle from the accessible tree, whatever the caller passes', () => {
    // The heading carries the meaning. Same call ui/Tag's dot and ui/Input's $ prefix make -
    // except those own their own glyph, and this component takes one from outside. So the
    // guarantee has to be enforced here rather than requested in a doc comment: `Glyph` above
    // asks to be announced, and this asserts it still is not.
    const { container } = render(
      <EmptyState icon={<Glyph />} heading="No transactions yet" body="Copy." />,
    );

    // Still drawn - hiding it from assistive tech is not the same as not rendering it.
    expect(container.querySelector('svg')).toBeInTheDocument();

    // And announced by nothing, despite the fixture's role and label.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'three bars' })).not.toBeInTheDocument();
  });

  it('draws the card without a shadow, unlike every other card in the app', () => {
    // Pinned because it is the one thing a reader would "fix": node 45:1044 carries no shadow,
    // and reaching for AccessCard's box string would add shadow-card silently.
    const { container } = render(
      <EmptyState icon={<Glyph />} heading="No transactions yet" body="Copy." />,
    );

    expect(container.querySelector('.shadow-card')).toBeNull();
    expect(container.firstElementChild).toHaveClass('rounded-lg');
  });
});
