import { render, screen } from '@testing-library/react';

import { FIELD_CONTROL_SURFACE } from './Field';
import { INPUT_VARIANTS, Input, type InputVariant } from './Input';

const VARIANTS = Object.keys(INPUT_VARIANTS) as InputVariant[];

const renderInput = (props: Partial<React.ComponentProps<typeof Input>> = {}) =>
  render(<Input id="merchant" label="Merchant" {...props} />);

describe('Input', () => {
  it('exposes exactly the two designed variants', () => {
    expect(VARIANTS).toEqual(['default', 'currency']);
  });

  it.each(VARIANTS)('%s is reachable by its label', (variant) => {
    renderInput({ variant });

    expect(screen.getByLabelText('Merchant')).toBe(screen.getByRole('textbox'));
  });

  it.each(VARIANTS)('%s applies its designed type style and padding', (variant) => {
    renderInput({ variant });

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass(...INPUT_VARIANTS[variant].split(' '));
  });

  it.each(VARIANTS)('%s keeps every padded pixel on the control, not the box', (variant) => {
    // A padded wrapper makes its own 14-16px band a dead zone: clicking the left
    // edge of the Amount field would hit the div and place no caret. Select made
    // this choice already; this asserts Input matches it.
    renderInput({ variant });

    const box = screen.getByRole('textbox').parentElement;
    expect(box?.className).not.toMatch(/(^|\s)(p|px|py|pt|pr|pb|pl)-/);
  });

  it('defaults to the default variant and renders no prefix', () => {
    renderInput();

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass(...INPUT_VARIANTS.default.split(' '));
    expect(screen.queryByText('$')).toBeNull();
  });

  it('renders the "$" prefix over the input rather than beside it', () => {
    renderInput({ variant: 'currency', label: 'Amount' });

    const prefix = screen.getByText('$');
    expect(prefix).toHaveAttribute('aria-hidden', 'true');
    // Inside the bordered box, not floating beside the field.
    expect(prefix.parentElement).toBe(screen.getByRole('textbox').parentElement);
    // Layered and click-through, so the glyph places a caret like the rest of the
    // field instead of swallowing the click.
    expect(prefix).toHaveClass('absolute', 'pointer-events-none');
  });

  it('looks inert when disabled, not merely refuse input', () => {
    // Author styles beat the user agent's own disabled treatment, so without an
    // explicit disabled fill the field renders identically to an editable one and
    // a user types into it expecting something to happen.
    renderInput({ disabled: true });

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:text-text-tertiary', 'disabled:cursor-not-allowed');
    expect(input.parentElement).toHaveClass(...FIELD_CONTROL_SURFACE.disabled.split(' '));
    // Never both fills at once: they have equal specificity, so the winner would
    // depend on stylesheet order.
    expect(input.parentElement).not.toHaveClass('bg-surface-card');
  });

  it('carries the editable fill when enabled', () => {
    renderInput();

    expect(screen.getByRole('textbox').parentElement).toHaveClass(
      ...FIELD_CONTROL_SURFACE.default.split(' '),
    );
  });

  it('gives the currency variant a numeric keypad without a number input', () => {
    // type="number" would render spinners the design does not draw and would
    // discard a half-typed "24." mid-keystroke.
    renderInput({ variant: 'currency', label: 'Amount' });

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('leaves inputMode unset on the default variant', () => {
    renderInput();

    expect(screen.getByRole('textbox')).not.toHaveAttribute('inputmode');
  });

  it('names the field after its id unless told otherwise', () => {
    // Every form in the design submits these, and a control with no name is
    // silently dropped from the payload.
    renderInput();
    expect(screen.getByRole('textbox')).toHaveAttribute('name', 'merchant');

    renderInput({ id: 'note', label: 'Note (optional)', name: 'description' });
    expect(screen.getByLabelText('Note (optional)')).toHaveAttribute('name', 'description');
  });

  it('renders an email field for Register and Log in', () => {
    renderInput({ id: 'email', label: 'Email', type: 'email' });

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('is valid and undescribed until an error is passed', () => {
    renderInput();

    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('wires an error to the control it belongs to', () => {
    renderInput({ id: 'amount', label: 'Amount', variant: 'currency', error: 'Enter an amount.' });

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'amount-error');
    expect(screen.getByText('Enter an amount.')).toHaveAttribute('id', 'amount-error');
    expect(input.parentElement).toHaveClass('border-status-danger');
  });

  it('carries no browser focus ring of its own', () => {
    // The wrapper's accent border is the focus indicator; a second ring drawn
    // just inside it reads as a rendering bug.
    renderInput();

    expect(screen.getByRole('textbox')).toHaveClass('outline-none');
  });
});
