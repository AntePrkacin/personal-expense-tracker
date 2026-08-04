import { render, screen } from '@testing-library/react';

import { BUTTON_BASE, BUTTON_VARIANTS, Button, TrashGlyph, type ButtonVariant } from './Button';

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

// "Get started" on 01 Welcome (WEL-2) changes the page location, so it has to be
// an <a>: a <button> firing router.push() would force 'use client' onto the page
// and break middle-click, copy-link and prefetch. Figma draws it with its own
// Button component, which is why that behaviour lives here rather than in a
// second link-shaped component.
//
// The other half of the union - that `href` cannot be combined with `type`,
// `disabled` or `onClick` - is checked by `npm run build`, this repo's typecheck
// gate, and cannot be asserted at runtime.
describe('Button as a link', () => {
  it('renders a link carrying its label, and no button at all', () => {
    render(<Button label="Get started" href="/setup" />);

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/setup');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(VARIANTS)('%s applies the same designed fill, border and padding', (variant) => {
    // The point of the whole exercise: one BUTTON_VARIANTS, whichever element
    // renders. A second copy of these strings in a link component is exactly what
    // this asserts does not exist.
    render(<Button variant={variant} label="Get started" href="/setup" />);

    expect(screen.getByRole('link')).toHaveClass(...BUTTON_VARIANTS[variant].split(' '));
  });

  it('applies the shared base classes too', () => {
    // Guards the BUTTON_BASE extraction: the two renderings could otherwise drift
    // apart on the focus ring or the radius while every variant test stayed green.
    render(<Button label="Get started" href="/setup" />);

    expect(screen.getByRole('link')).toHaveClass(...BUTTON_BASE.split(' '));
  });

  it('defaults to the primary variant', () => {
    render(<Button label="Get started" href="/setup" />);

    expect(screen.getByRole('link')).toHaveClass(...BUTTON_VARIANTS.primary.split(' '));
  });

  it('carries no type attribute', () => {
    // `type` on an anchor means the linked resource's media type, which is not
    // what the button branch's `type="button"` means at all. Leaking it across
    // would be a quietly wrong attribute rather than a visible bug.
    render(<Button label="Get started" href="/setup" />);

    expect(screen.getByRole('link')).not.toHaveAttribute('type');
  });

  it('still renders a leading glyph', () => {
    render(<Button label="Get started" href="/setup" icon={<TrashGlyph />} />);

    const glyph = screen.getByRole('link').firstElementChild;
    expect(glyph?.tagName).toBe('svg');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });
});
