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

  it('renders the given prefix inside the currency field box', () => {
    renderInput({ variant: 'currency', label: 'Amount', currencySymbol: '$' });

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

  it('prefixes the symbol it is given, not a hard-coded dollar', () => {
    // **The glyph was a literal `$` until PET-47's review.** The profile's currency is
    // user-selectable, so a GBP account read "£1,350 spent" above cap inputs prefixed with dollars.
    // Asserting a non-dollar symbol is what makes this able to fail.
    renderInput({ variant: 'currency', label: 'Amount', currencySymbol: '£' });

    expect(screen.getByText('£')).toBeInTheDocument();
    expect(screen.queryByText('$')).not.toBeInTheDocument();
  });

  it('draws no prefix when the caller supplies none, rather than guessing one', () => {
    // No default on purpose: a fallback is what let the hard-coded glyph survive, so a caller that
    // forgets the prop renders nothing rather than the wrong currency.
    renderInput({ variant: 'currency', label: 'Amount' });

    expect(screen.queryByText('$')).not.toBeInTheDocument();
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

describe('the hint line', () => {
  it('describes the control without marking it invalid', () => {
    // The whole point of the prop: standing guidance is not a validation failure, so it must not
    // borrow aria-invalid or the error colour on its way to being announced.
    renderInput({ id: 'email', label: 'Email', hint: 'Login links will be sent here.' });

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Login links will be sent here.')).toHaveAttribute('id', 'email-hint');
  });

  it('is named alongside the error when the field carries both', () => {
    // The regression this exists for: a control that names only the error stops describing its
    // own hint at exactly the moment the reader most needs the whole picture. Both ids, in the
    // order the two lines render.
    renderInput({
      id: 'email',
      label: 'Email',
      hint: 'Login links will be sent here.',
      error: 'Enter a valid email address.',
    });

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint email-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders no hint element when none is passed', () => {
    renderInput({ id: 'email', label: 'Email', error: 'Enter a valid email address.' });

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'email-error');
    expect(document.getElementById('email-hint')).toBeNull();
  });

  it('reaches the currency variant too, whose control is nested in a label', () => {
    // The currency box wraps the input in a daisyUI prefix label, so the aria wiring travels a
    // different path to the same element. Worth an assertion, because only that variant could
    // lose it.
    renderInput({
      id: 'budget',
      label: 'Monthly budget',
      variant: 'currency',
      hint: 'You can change this anytime.',
    });

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'budget-hint');
  });
});
