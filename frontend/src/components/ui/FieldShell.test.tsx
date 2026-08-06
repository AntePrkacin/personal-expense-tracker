import { render, screen } from '@testing-library/react';

import { FieldShell, fieldErrorId } from './FieldShell';

// Input.test.tsx and Select.test.tsx already exercise the shell through the two
// controls that render it; this suite pins only the contract the shell itself
// owns - the label wiring and the error line's identity - so a change here fails
// here first rather than twice, one suite per consumer.

describe('fieldErrorId', () => {
  it('derives the id from the field id when there is an error', () => {
    expect(fieldErrorId('merchant', 'Required.')).toBe('merchant-error');
  });

  it('is undefined without an error, so no attribute points at nothing', () => {
    expect(fieldErrorId('merchant', undefined)).toBeUndefined();
  });
});

describe('FieldShell', () => {
  it('labels the control it wraps', () => {
    render(
      <FieldShell id="merchant" label="Merchant">
        <input id="merchant" />
      </FieldShell>,
    );

    expect(screen.getByLabelText('Merchant')).toBeInTheDocument();
  });

  it('renders the error line under the id the control describes itself by', () => {
    render(
      <FieldShell id="merchant" label="Merchant" error="Enter a merchant.">
        <input id="merchant" aria-describedby={fieldErrorId('merchant', 'Enter a merchant.')} />
      </FieldShell>,
    );

    const message = screen.getByText('Enter a merchant.');
    expect(message).toHaveAttribute('id', 'merchant-error');
    expect(screen.getByLabelText('Merchant')).toHaveAccessibleDescription('Enter a merchant.');
  });

  it('renders no message element at all without an error', () => {
    const { container } = render(
      <FieldShell id="merchant" label="Merchant">
        <input id="merchant" />
      </FieldShell>,
    );

    expect(container.querySelector('p')).toBeNull();
  });
});
