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

  it('gives the label an id, which is how a button trigger is named', () => {
    // `(app)/DateField.tsx` points its `aria-labelledby` at this id: its trigger is a
    // `<button>`, and HTML-AAM computes a button's name from its own subtree, so `htmlFor`
    // alone would leave the label unannounced. Pinned here rather than only there, because the
    // string is this file's to keep.
    render(
      <FieldShell id="date" label="Date">
        <button type="button" aria-labelledby="date-label date-value">
          <span id="date-value">Oct 8, 2025</span>
        </button>
      </FieldShell>,
    );

    expect(screen.getByRole('button')).toHaveAccessibleName('Date Oct 8, 2025');
  });

  it('keeps the label as narrow as its text rather than stretching it', () => {
    // Inherited from the deleted `ui/Field`, whose own suite pinned this, and re-pinned here
    // because the axis changed with the element: daisyUI's `fieldset` is a one-column grid, so
    // a full-width label needs `justify-self-start` where the old flex column needed
    // `self-start`. Without it the label spans the whole field and every click in the empty
    // strip beside the word is forwarded to the control - which on a `<select>` focuses it
    // without opening the list, so the field lights up and nothing happens.
    render(
      <FieldShell id="merchant" label="Merchant">
        <input id="merchant" />
      </FieldShell>,
    );

    expect(screen.getByText('Merchant')).toHaveClass('justify-self-start');
  });

  it('publishes no ARIA group, because one field is not a set of fields', () => {
    // The shell wears daisyUI's `fieldset` class on a `div`. The real `<fieldset>` element
    // publishes `role="group"`, and with no `legend` that group is nameless - one around every
    // field in the app, five of them in the Add transaction modal alone.
    render(
      <FieldShell id="merchant" label="Merchant">
        <input id="merchant" />
      </FieldShell>,
    );

    expect(screen.queryByRole('group')).toBeNull();
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
