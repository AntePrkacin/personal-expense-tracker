import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Stat } from './Stat';

const meta: Meta<typeof Stat> = {
  title: 'Components/Stat',
  component: Stat,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default rounded-xl border p-8">
        <Story />
      </div>
    ),
  ],
  args: { value: '$1,240', label: 'Spent this month' },
};

export default meta;

type Story = StoryObj<typeof Stat>;

export const WithValue: Story = {};

/**
 * A missing value renders the designed em dash rather than a zero or an empty
 * gap. The glyph is hidden from assistive technology and replaced with the
 * words "No value", because a lone em dash is announced inconsistently.
 */
export const NoValue: Story = {
  args: { value: undefined, label: 'Top category' },
};

/**
 * The three dashboard readouts as they appear on the empty state. Note that
 * "0" and "$0" are real values: only Top category gets the dash.
 */
export const EmptyDashboardRow: Story = {
  render: () => (
    <div className="flex gap-12">
      <Stat value={0} label="Transactions" />
      <Stat value="$0" label="Avg / day" />
      <Stat label="Top category" />
    </div>
  ),
};
