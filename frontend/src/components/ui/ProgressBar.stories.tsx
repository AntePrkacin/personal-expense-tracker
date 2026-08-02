import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default w-[480px] rounded-xl border p-8">
        <Story />
      </div>
    ),
  ],
  args: { value: 1240, max: 2000, label: 'Monthly budget' },
};

export default meta;

type Story = StoryObj<typeof ProgressBar>;

/** The monthly budget card: $1,240 of $2,000. */
export const UnderCap: Story = {};

/**
 * Exactly at the cap. Still the accent fill, not the danger tone: Housing at
 * $1,100 of $1,100 is tagged "Full" rather than "Over".
 */
export const AtCap: Story = {
  args: { value: 1100, max: 1100, label: 'Housing' },
};

/** Past the cap, so the fill turns red. Dining out, $312 of $300. */
export const OverCap: Story = {
  args: { value: 312, max: 300, label: 'Dining out' },
};

/** The empty dashboard, where nothing has been spent yet. */
export const Empty: Story = {
  args: { value: 0, max: 2000 },
};

/** A category with no cap set. The bar stays empty rather than breaking. */
export const NoCap: Story = {
  args: { value: 88, max: 0, label: 'Uncapped category' },
};
