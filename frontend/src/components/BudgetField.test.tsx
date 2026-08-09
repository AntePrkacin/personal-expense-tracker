import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { BudgetField } from './BudgetField';

// The Monthly budget field, and the four things about it that are easy to break silently: the
// accessible name of the currency trigger, the suffix being decoration rather than value, the
// label pointing at the amount input rather than at the picker, and the picker handing back an
// ISO code rather than a display string.
//
// **jsdom 26 implements none of the Popover API**, and `jest.setup.ts` deliberately polyfills none
// of it - the call `TransactionRowMenu` and `ColourSelect` both record. So the panel is permanently
// "open" here, which is what lets these query its rows directly; opening, light dismiss and Escape
// are Storybook and browser checks rather than assertions over a fake.

const NOOP = () => {};

/** Renders with the value controlled, so typing behaves the way it does at a real call site. */
function Harness({ currency = 'USD', ...rest }: { currency?: string; error?: string }) {
  const [value, setValue] = useState('2,000');

  return (
    <BudgetField
      id="budget"
      label="Monthly budget"
      currency={currency}
      onCurrencyChange={NOOP}
      value={value}
      onValueChange={(event) => setValue(event.currentTarget.value)}
      {...rest}
    />
  );
}

const amount = () => screen.getByLabelText('Monthly budget');
const trigger = () => screen.getByRole('button', { name: /^Currency/ });

describe('BudgetField', () => {
  describe('the label', () => {
    it('names the amount input rather than the currency picker', () => {
      // `ui/FieldShell`'s `htmlFor` points at the `id` prop, so the id has to land on the thing
      // being typed in. On the picker instead, clicking "Monthly budget" would open the currency
      // list, which reads as a glitch rather than as a label.
      render(<Harness />);

      expect(amount()).toHaveValue('2,000');
      expect(amount().tagName).toBe('INPUT');
    });
  });

  describe('the currency trigger', () => {
    it('is named for what it is and what it holds', () => {
      // Built from the subtree: an `sr-only` "Currency" plus the code. An `aria-label="Currency"`,
      // which the design system's own version uses, replaces the subtree and drops the value.
      render(<Harness />);

      expect(trigger()).toHaveAccessibleName('Currency USD');
    });

    it('follows the stored currency', () => {
      render(<Harness currency="GBP" />);

      expect(trigger()).toHaveAccessibleName('Currency GBP');
    });

    it('shows the code for a currency the picker cannot offer', () => {
      // The backend accepts every ISO 4217 code, so a profile can hold one this app never lists.
      // The trigger says what is stored rather than guessing a glyph.
      render(<Harness currency="JPY" />);

      expect(trigger()).toHaveAccessibleName('Currency JPY');
    });

    it('reports its own collapsed state and does not claim to be a menu', () => {
      // `aria-haspopup` is absent for `TransactionRowMenu`'s reason: its useful values name ARIA
      // patterns this is not one of, and `"true"` means menu.
      render(<Harness />);

      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(trigger()).not.toHaveAttribute('aria-haspopup');
    });
  });

  describe('the picker', () => {
    it('offers the three currencies as buttons, not as options', () => {
      // No `role="listbox"`/`role="option"`: those promise arrow keys, Home/End and type-ahead,
      // none of which this implements. The fourth time this app declines that promise.
      render(<Harness />);

      expect(screen.getByRole('button', { name: /US Dollar/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Euro/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /British Pound/ })).toBeInTheDocument();
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.queryAllByRole('listbox')).toHaveLength(0);
    });

    it('marks the chosen row with aria-current and nothing else', () => {
      render(<Harness currency="EUR" />);

      expect(screen.getByRole('button', { name: /Euro/ })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: /US Dollar/ })).not.toHaveAttribute('aria-current');
    });

    it('hands the caller an ISO code, never the display name', async () => {
      // The whole reason this is a control of our own rather than a `<select>`: the value never
      // round-trips through the DOM as text, so the caller needs no lookup to satisfy the DTO.
      const user = userEvent.setup();
      const onCurrencyChange = jest.fn();

      render(
        <BudgetField
          id="budget"
          label="Monthly budget"
          currency="USD"
          onCurrencyChange={onCurrencyChange}
          value="2,000"
          onValueChange={NOOP}
        />,
      );

      await user.click(screen.getByRole('button', { name: /British Pound/ }));

      expect(onCurrencyChange).toHaveBeenCalledWith('GBP');
    });

    it('is inert when no handler is wired, keeping the code readable', () => {
      render(
        <BudgetField
          id="budget"
          label="Monthly budget"
          currency="USD"
          value="2,000"
          onValueChange={NOOP}
        />,
      );

      expect(trigger()).toBeDisabled();
      expect(trigger()).toHaveAccessibleName('Currency USD');
    });
  });

  describe('the amount', () => {
    it('is a text input with a numeric keypad, never type=number', () => {
      // `type="number"` renders spinners, discards a half-typed `24.` mid-keystroke, and throws on
      // `selectionStart` - which would make the caller's caret restore impossible. `ui/Input`
      // records all three.
      render(<Harness />);

      expect(amount()).toHaveAttribute('type', 'text');
      expect(amount()).toHaveAttribute('inputmode', 'decimal');
    });

    it('reports every keystroke to the caller', async () => {
      // The formatting itself is the caller's: `reformatAmountInput` writes to the DOM and moves
      // the caret, so it stays at the call site rather than being buried in this component.
      const user = userEvent.setup();
      const onValueChange = jest.fn();

      render(
        <BudgetField
          id="budget"
          label="Monthly budget"
          currency="USD"
          value=""
          onValueChange={onValueChange}
        />,
      );

      await user.type(screen.getByLabelText('Monthly budget'), '25');

      expect(onValueChange).toHaveBeenCalledTimes(2);
    });

    it('keeps the "/ month" suffix out of the value and out of the name', () => {
      // It is a property of the field the label already carries. Announced after the value, a
      // reader would hear the amount as a fraction.
      render(<Harness />);

      expect(amount()).toHaveValue('2,000');
      expect(screen.getByText('/ month')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('the error state', () => {
    it('marks the input invalid and describes it with the message', () => {
      render(<Harness error="Enter an amount greater than 0." />);

      expect(amount()).toHaveAttribute('aria-invalid', 'true');
      expect(amount()).toHaveAccessibleDescription('Enter an amount greater than 0.');
    });

    it('carries no aria-invalid while it is valid', () => {
      render(<Harness />);

      expect(amount()).not.toHaveAttribute('aria-invalid');
    });

    it('shows the invalid border on the box, which is the visible half', () => {
      // The daisyUI state-class exception this repo allows: the class is the visible half of the
      // aria attribute the test above pins, so both are asserted together.
      render(<Harness error="Enter an amount greater than 0." />);

      expect(amount().parentElement).toHaveClass('input-error');
    });
  });
});
