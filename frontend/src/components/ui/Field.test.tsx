import { render, screen } from '@testing-library/react';

import {
  FIELD_CONTROL_BORDER,
  FIELD_CONTROL_SURFACE,
  Field,
  fieldControlClass,
  fieldErrorId,
} from './Field';

// The acceptance criterion this file defends: one inline message pattern, used by
// every form in the app. Input.test.tsx and Select.test.tsx assert that both
// field types wire up to it; these assert the pattern itself.

describe('Field', () => {
  it('labels the control it wraps', () => {
    render(
      <Field id="merchant" label="Merchant">
        <input id="merchant" />
      </Field>,
    );

    // getByLabelText only resolves if htmlFor and id actually match, which is the
    // whole point of making `id` a required prop.
    expect(screen.getByLabelText('Merchant')).toBe(screen.getByRole('textbox'));
  });

  it('renders no message when valid', () => {
    render(
      <Field id="merchant" label="Merchant">
        <input id="merchant" />
      </Field>,
    );

    expect(screen.queryByText(/./, { selector: 'p' })).toBeNull();
  });

  it('keeps the label as narrow as its text rather than stretching it', () => {
    // A real bug this pins rather than a preference. The column is `w-full` and a flex item
    // stretches by default, so the label used to be a full-width block - 472px inside the Add
    // transaction modal against about 55px of text - and clicking anywhere in that invisible
    // strip activated the control. That is `<label for>` behaving exactly as specified, and it
    // reads as a glitch: worst on a `<select>`, where Chrome focuses the control from a forwarded
    // label click but does not open the list, so the border turned accent and nothing happened.
    //
    // jsdom computes no layout, so width cannot be measured here - the class is the assertion,
    // and `ui/utilities.test.ts` proves it compiles to real CSS.
    render(
      <Field id="merchant" label="Merchant">
        <input id="merchant" />
      </Field>,
    );

    expect(screen.getByText('Merchant')).toHaveClass('self-start');
  });

  it('gives the label a pointer, because clicking it does something', () => {
    render(
      <Field id="merchant" label="Merchant">
        <input id="merchant" />
      </Field>,
    );

    expect(screen.getByText('Merchant')).toHaveClass('cursor-pointer');
  });

  it('gives the label an id, which the date field needs and the other two do not', () => {
    // `(app)/DateField.tsx`'s control is a <button>, and HTML-AAM computes a button's name from
    // its own subtree - so a `<label for>` alone would never be announced. That field composes
    // `aria-labelledby` from this id plus its value span.
    render(
      <Field id="date" label="Date">
        <button type="button" id="date" />
      </Field>,
    );

    expect(screen.getByText('Date')).toHaveAttribute('id', 'date-label');
  });

  it('renders the message with an id the control can point at', () => {
    render(
      <Field id="amount" label="Amount" error="Enter an amount greater than 0.">
        <input id="amount" />
      </Field>,
    );

    const message = screen.getByText('Enter an amount greater than 0.');
    expect(message).toHaveAttribute('id', 'amount-error');
    expect(message).toHaveClass('text-body-s', 'text-status-danger-text');
  });

  it('is not a live region', () => {
    // Deliberate. Validation lands on submit alongside every other failed field,
    // and a live region per field would announce them as a burst of
    // interruptions. aria-describedby carries the message instead.
    render(
      <Field id="amount" label="Amount" error="Enter an amount greater than 0.">
        <input id="amount" />
      </Field>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('fieldControlClass', () => {
  it('rests on the strong border', () => {
    expect(fieldControlClass()).toContain(FIELD_CONTROL_BORDER.default);
  });

  it('switches to the danger border when invalid', () => {
    expect(fieldControlClass('Required')).toContain(FIELD_CONTROL_BORDER.error);
  });

  it('never emits both border colours at once', () => {
    // Equal specificity, so whichever came later in the compiled stylesheet would
    // win rather than whichever the author meant. Emitting one is the only
    // reliable option, and this is the test that keeps it that way.
    expect(fieldControlClass()).not.toContain('border-status-danger');
    expect(fieldControlClass('Required')).not.toContain('border-border-strong');
  });

  it('never emits both fills at once', () => {
    expect(fieldControlClass(undefined, true)).not.toContain('bg-surface-card');
    expect(fieldControlClass()).not.toContain('bg-surface-muted');
  });

  it('switches to the inert fill when disabled, in either validity state', () => {
    // Without it a disabled field is pixel-identical to an editable one: author
    // styles beat the user agent's own disabled treatment.
    expect(fieldControlClass(undefined, true)).toContain(FIELD_CONTROL_SURFACE.disabled);
    expect(fieldControlClass('Required', true)).toContain(FIELD_CONTROL_SURFACE.disabled);
  });

  it('applies the same designed focus treatment in both validity states', () => {
    // Focus thickens *and* recolours the border in both rows. An earlier version
    // held the red through focus, which left the 0.5px width change as the entire
    // focus signal on an invalid field - far too little to see. Invalidity is
    // still carried by the message and by aria-invalid, neither of which focus
    // touches.
    for (const classes of [fieldControlClass(), fieldControlClass('Required')]) {
      expect(classes).toContain('focus-within:border-[1.5px]');
      expect(classes).toContain('focus-within:border-brand-accent');
    }
  });

  it('draws a real outline on focus under forced colors', () => {
    // Windows High Contrast forces every border-color to one system colour, so
    // the accent recolour above is invisible there and the width change is all
    // that survives. This is the accessible floor beneath the designed style.
    expect(fieldControlClass()).toContain('focus-within:forced-colors:outline-2');
    expect(fieldControlClass()).toContain('focus-within:forced-colors:outline-offset-2');
  });
});

describe('fieldErrorId', () => {
  it('is undefined when valid, so aria-describedby is omitted entirely', () => {
    // An aria-describedby pointing at an element that does not exist is worse
    // than none: some screen readers announce nothing and others announce the id.
    expect(fieldErrorId('amount')).toBeUndefined();
  });

  it('matches the id Field puts on the message', () => {
    expect(fieldErrorId('amount', 'Required')).toBe('amount-error');
  });
});
