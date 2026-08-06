import { render, screen } from '@testing-library/react';

import { Input, type InputVariant } from './Input';

// Styling is daisyUI's as of PET-57, so these assert the behaviour the component
// owns - labelling, naming, the error wiring, the currency prefix - rather than
// class strings.

const VARIANTS: InputVariant[] = ['default', 'currency'];

const renderInput = (props: Partial<React.ComponentProps<typeof Input>> = {}) =>
  render(<Input id="merchant" label="Merchant" {...props} />);

describe('Input', () => {
  it.each(VARIANTS)('%s is reachable by its label', (variant) => {
    renderInput({ variant });

    expect(screen.getByLabelText('Merchant')).toBe(screen.getByRole('textbox'));
  });

  it('renders no prefix by default', () => {
    renderInput();

    expect(screen.queryByText('$')).toBeNull();
  });

  it('renders the "$" prefix inside the currency field box', () => {
    renderInput({ variant: 'currency', label: 'Amount' });

    const prefix = screen.getByText('$');
    // Hidden: the label already says "Amount", and a screen reader announcing a
    // bare "dollar sign" before the value is noise. It also keeps the wrapping
    // label from adding "$" to the field's accessible name.
    expect(prefix).toHaveAttribute('aria-hidden', 'true');
    // Inside the box: the wrapper is a label, so a click on the glyph focuses
    // the control instead of doing nothing.
    expect(prefix.parentElement).toBe(screen.getByRole('textbox').parentElement);
    expect(prefix.parentElement?.tagName).toBe('LABEL');
  });

  it('refuses input when disabled', () => {
    renderInput({ disabled: true });

    expect(screen.getByRole('textbox')).toBeDisabled();
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
  });

  it('marks the default variant invalid through the daisyUI error state', () => {
    // input-error is semantic state, not decoration, which is why it survives
    // the no-class-assertions rework: it is the visible half of aria-invalid.
    renderInput({ error: 'Enter a merchant.' });

    expect(screen.getByRole('textbox')).toHaveClass('input-error');
  });
});
