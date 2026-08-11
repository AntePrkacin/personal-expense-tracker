import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { BudgetField } from './BudgetField';

// **Open these rather than reading them.** Three of the things this field is built out of are
// unassertable under Jest and only visible here: jsdom implements no Popover API, so the panel is
// permanently open in the suite and opening, light dismiss and Escape have no coverage at all;
// next/jest maps every CSS import to an empty object, so nothing in the suite can see that
// daisyUI's `join` really collapsed the seam between the two segments; and the focus ring is the
// one deviation from the design system's own version, which is a thing to look at rather than a
// class to assert.
//
// Firefox is worth a second look for the same reason `ColourSelect`'s stories are: it has no CSS
// anchor positioning, so daisyUI's `@supports` fallback centres the panel over a dimmed backdrop
// instead of anchoring it under the trigger. Degraded rather than broken.

const meta: Meta<typeof BudgetField> = {
  title: 'Components/BudgetField',
  component: BudgetField,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof BudgetField>;

/**
 * Controlled, because an uncontrolled story would show a field that cannot be typed into and the
 * amount half is half of what there is to look at.
 *
 * The formatting is deliberately **not** wired here. `reformatAmountInput` is the caller's job at
 * a real call site - it writes to the DOM and restores the caret - so a story that pulled it in
 * would be showing `app/setup/BudgetForm.tsx` rather than this component.
 */
function Controlled({
  currency: initialCurrency = 'USD',
  value: initialValue = '2,000',
  ...rest
}: Partial<React.ComponentProps<typeof BudgetField>>) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [value, setValue] = useState(initialValue);

  return (
    <div className="max-w-105">
      <BudgetField
        id="story-budget"
        label="Monthly budget"
        currency={currency}
        onCurrencyChange={setCurrency}
        value={value}
        onValueChange={(event) => setValue(event.currentTarget.value)}
        {...rest}
      />
    </div>
  );
}

/** The resting state, as `SettingsScreen.jsx` draws it at `maxWidth: 420`. */
export const Default: Story = {
  render: () => <Controlled />,
};

/** A currency whose symbol is not the dollar, which is what PET-47 made reachable at all. */
export const Euro: Story = {
  render: () => <Controlled currency="EUR" value="1,750" />,
};

/**
 * A code the picker does not offer.
 *
 * Reachable because the backend validates `@IsISO4217CurrencyCode()` rather than an allowlist, so
 * a profile can hold one set through the API. The trigger shows the code rather than guessing a
 * glyph, and the panel still offers the three.
 */
export const UnofferedCurrency: Story = {
  render: () => <Controlled currency="JPY" value="240,000" />,
};

/** BUD-6 and A5's one message, which is the state A29 owes a designer a sign-off on. */
export const WithError: Story = {
  render: () => <Controlled value="0" error="Enter an amount greater than 0." />,
};

/**
 * The standing hint, for a caller that has something permanently true to say about the field.
 *
 * Note this is **not** the design system's "Changing your budget applies from the next month
 * onward." That line was dropped rather than reworded: the budget is one column and every read
 * compares the current period against it immediately, so the sentence was false here and directly
 * contradicted PET-47's AC4.
 */
export const WithHint: Story = {
  render: () => <Controlled hint="Used for every budget figure across the app." />,
};

/** Both halves frozen, which is what a form does while its save is in flight. */
export const Disabled: Story = {
  render: () => <Controlled disabled />,
};

/**
 * No currency handler wired, so the segment is inert and the code stays readable.
 *
 * Not a state either consumer renders today - both pass a handler - but the one a read-only
 * rendering would want, and it is here so the choice to keep the segment visible is reviewable.
 */
export const ReadOnlyCurrency: Story = {
  render: () => (
    <div className="max-w-105">
      <BudgetField
        id="story-budget-readonly"
        label="Monthly budget"
        currency="USD"
        value="2,000"
        onValueChange={() => {}}
      />
    </div>
  ),
};
