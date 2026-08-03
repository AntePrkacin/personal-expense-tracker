import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CATEGORY_TILE, type CategoryColour } from './categoryColour';
import { ListRow } from './ListRow';

const meta: Meta<typeof ListRow> = {
  title: 'Components/ListRow',
  component: ListRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default w-[560px] rounded-xl border px-7 py-6">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Whole Foods',
    subtitle: 'Groceries · Today',
    amount: 24,
    categoryColour: 'green',
  },
};

export default meta;

type Story = StoryObj<typeof ListRow>;

/** `amount` is the stored magnitude; the row renders it as a debit. */
export const Default: Story = {};

/** The dashboard's recent list, with the divider the card draws between rows. */
export const InAList: Story = {
  render: () => (
    <div className="divide-border-subtle divide-y">
      <ListRow
        title="Whole Foods"
        subtitle="Groceries · Today"
        amount={24}
        categoryColour="green"
      />
      <ListRow title="Uber" subtitle="Transport · Yesterday" amount={18.5} categoryColour="blue" />
      <ListRow
        title="Netflix"
        subtitle="Entertainment · Oct 3"
        amount={15.99}
        categoryColour="violet"
      />
      <ListRow title="Shell" subtitle="Transport · Oct 2" amount={52} categoryColour="blue" />
    </div>
  ),
};

/** All eight category tints. The glyph is the same placeholder Figma uses. */
export const AllCategoryColours: Story = {
  render: () => (
    <div>
      {(Object.keys(CATEGORY_TILE) as CategoryColour[]).map((colour) => (
        <ListRow
          key={colour}
          title="Whole Foods"
          subtitle={`${colour} · Today`}
          amount={24}
          categoryColour={colour}
        />
      ))}
    </div>
  ),
};

/** A long merchant name ellipses rather than pushing the amount off the row. */
export const LongTitle: Story = {
  args: { title: 'A very long merchant name that will not fit on a single line' },
};
