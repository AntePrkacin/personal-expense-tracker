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
      <div className="bg-base-100 border-base-300 rounded-box w-[520px] border p-8">
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

/** Both variants. Click into either to see daisyUI's focus treatment. */
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

/** Empty, with the placeholder in the theme's muted text. */
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
 * (assumption A29), so this is ours: the control takes daisyUI's error state, one
 * line of `text-error` sits beneath, and the control gets `aria-invalid` plus an
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

/**
 * The standing hint, PET-46's addition, and the case worth reviewing is the second one.
 *
 * A hint is not an error: it states something permanently true of the field that the label has no
 * room for, so it keeps the muted treatment and never borrows `aria-invalid`. When a field carries
 * both, the hint renders above the message and the control names **both** ids in
 * `aria-describedby` - a control naming only the error would stop describing its own hint at
 * exactly the moment the reader most needs the whole picture.
 *
 * Undesigned like every other state here, so it owes A29 a sign-off with the rest.
 */
export const WithHint: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Input
        id="story-hint-email"
        label="Email"
        defaultValue="marko@email.com"
        hint="Login links will be sent here."
      />
      <Input
        id="story-hint-invalid"
        label="Email"
        defaultValue="marko@"
        hint="Login links will be sent here."
        error="Enter a valid email address."
      />
    </div>
  ),
};
