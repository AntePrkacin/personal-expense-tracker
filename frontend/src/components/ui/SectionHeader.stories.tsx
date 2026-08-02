import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SectionHeader } from './SectionHeader';

const meta: Meta<typeof SectionHeader> = {
  title: 'Components/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default w-[560px] rounded-xl border p-8">
        <Story />
      </div>
    ),
  ],
  args: { title: 'Recent transactions' },
};

export default meta;

type Story = StoryObj<typeof SectionHeader>;

/** The dashboard's recent-transactions card. */
export const WithAction: Story = {
  args: { action: { label: 'View all', href: '/transactions' } },
};

/** Omit the action and only the title renders. */
export const TitleOnly: Story = {
  args: { title: 'Spending trend' },
};
