import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from './Input';

// Type-only Storybook import; see the note in Button.stories.tsx.

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default w-[520px] rounded-xl border p-8">
        <Story />
      </div>
    ),
  ],
  args: { id: 'merchant', label: 'Merchant', defaultValue: 'Whole Foods' },
};

export default meta;

type Story = StoryObj<typeof Input>;

/** One field, driven by the controls. */
export const Playground: Story = {};

/**
 * Both variants. Click into either to see the designed focus style, a 1.5px
 * accent border (02 node 42:721, 09 node 28:393, 19 node 102:1432).
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Input id="story-name" label="Name" defaultValue="Subscriptions" />
      <Input id="story-budget" label="Monthly budget" variant="currency" defaultValue="250.00" />
    </div>
  ),
};

/** The amount field on 09 and the budget field on 02, at their designed scale. */
export const Currency: Story = {
  args: { id: 'amount', label: 'Amount', variant: 'currency', defaultValue: '24.00' },
};

/** Empty, with the placeholder in `text-tertiary`. */
export const WithPlaceholder: Story = {
  args: {
    id: 'note',
    label: 'Note (optional)',
    defaultValue: undefined,
    placeholder: 'Streaming, apps & memberships',
  },
};

/**
 * Not designed anywhere in the Figma file. It has to exist all the same: author
 * styles beat the browser's own disabled treatment, so without an explicit inert
 * fill a disabled field is indistinguishable from an editable one.
 */
export const Disabled: Story = {
  args: { id: 'currency', label: 'Currency', defaultValue: 'USD - $', disabled: true },
};

/**
 * The inline validation pattern. No error visual exists anywhere in the Figma file
 * (assumption A29), so this is ours: the border turns `status-danger`, one line of
 * `status-danger-text` sits beneath, and the control gets `aria-invalid` plus an
 * `aria-describedby` pointing at that line. Select uses the identical pattern.
 */
export const WithError: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Input
        id="story-email"
        label="Email"
        defaultValue="marko@"
        error="Enter a valid email address."
      />
      <Input
        id="story-amount"
        label="Amount"
        variant="currency"
        defaultValue="0.00"
        error="Enter an amount greater than 0."
      />
    </div>
  ),
};
