import { render, screen } from '@testing-library/react';

import { BUTTON_VARIANTS, Button, TrashGlyph, type ButtonVariant } from './Button';

// next/jest maps every .css import to an empty object, so jsdom never receives a
// stylesheet and no test here can assert a rendered colour or size. These assert
// the class names instead; that the classes generate real CSS is proved
// separately in utilities.test.ts.

const VARIANTS = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];

describe('Button', () => {
  it('exposes the three designed variants plus the two text ones', () => {
    // Guards the it.each blocks below: dropping a variant would otherwise shrink
    // them to silent cases and still pass. The order is the Components tile's
    // (Primary, Secondary, Danger) followed by the two the tile does not draw.
    expect(VARIANTS).toEqual(['primary', 'secondary', 'danger', 'text', 'textDanger']);
  });

  it.each(VARIANTS)('%s renders a button carrying its label', (variant) => {
    render(<Button variant={variant} label="Add transaction" />);

    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
  });

  it.each(VARIANTS)('%s applies its designed fill, border and padding', (variant) => {
    render(<Button variant={variant} label="Add transaction" />);

    expect(screen.getByRole('button')).toHaveClass(...BUTTON_VARIANTS[variant].split(' '));
  });

  it('defaults to the primary variant', () => {
    render(<Button label="Continue" />);

    expect(screen.getByRole('button')).toHaveClass(...BUTTON_VARIANTS.primary.split(' '));
  });

  it('defaults to type=button rather than submit', () => {
    // HTML defaults a bare <button> to submit, so a "Cancel" inside a modal form
    // would post it. This test is here so that regression fails rather than
    // ships.
    render(<Button label="Cancel" variant="secondary" />);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('submits when asked to', () => {
    render(<Button label="Save changes" type="submit" />);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('disables itself for in-flight actions', () => {
    // "Regenerate" reads "Generating..." while insights run (15, assumption A26).
    render(<Button label="Generating..." variant="secondary" disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick', () => {
    let clicks = 0;
    // A plain counter rather than a jest.fn or storybook's fn: nothing else in
    // ui/ mocks, and the assertion is the same.
    render(<Button label="Regenerate" onClick={() => (clicks += 1)} />);

    screen.getByRole('button').click();

    expect(clicks).toBe(1);
  });

  it('renders an icon and hides it from assistive technology', () => {
    // The trash glyph on "Delete transaction" (11, node 29:528) carries no
    // information the label does not already give in words.
    render(<Button label="Delete transaction" variant="textDanger" icon={<TrashGlyph />} />);

    const glyph = screen.getByRole('button').firstElementChild;
    expect(glyph?.tagName).toBe('svg');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no icon element when none is passed', () => {
    render(<Button label="Continue" />);

    expect(screen.getByRole('button').querySelector('svg')).toBeNull();
  });
});
