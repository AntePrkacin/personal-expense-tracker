import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Select } from './Select';

// Type-only Storybook import; see the note in Button.stories.tsx.

const CATEGORIES = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'transport', label: 'Transport' },
  { value: 'housing', label: 'Housing' },
  { value: 'entertainment', label: 'Entertainment' },
];

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-base-100 border-base-300 rounded-box w-[520px] border p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'category',
    label: 'Category',
    options: CATEGORIES,
    defaultValue: 'groceries',
  },
};

export default meta;

type Story = StoryObj<typeof Select>;

/**
 * One field, driven by the controls. The open list is the browser's, because
 * Figma never draws one (assumptions A16, A40).
 */
export const Playground: Story = {};

/** The tile's default state (node 14:17): "Select…" with nothing chosen yet. */
export const WithPlaceholder: Story = {
  args: { defaultValue: undefined, placeholder: 'Select…' },
};

/**
 * The "Color" and "Icon" pair on 19, side by side. Both are plain text lists
 * here: a native option cannot carry a colour swatch, so the Color picker gets a
 * control of its own when that ticket lands.
 */
export const SideBySide: Story = {
  render: () => (
    // min-w-0 on each column for the reason ListRow documents: a flex item's
    // default minimum size is its content, so a long option label would otherwise
    // push the pair wider than the modal.
    <div className="flex gap-3">
      <div className="min-w-0 flex-1">
        <Select
          id="story-colour"
          label="Color"
          defaultValue="violet"
          options={[
            { value: 'violet', label: 'Violet' },
            { value: 'coral', label: 'Coral' },
            { value: 'teal', label: 'Teal' },
          ]}
        />
      </div>
      <div className="min-w-0 flex-1">
        <Select
          id="story-icon"
          label="Icon"
          defaultValue="repeat"
          options={[{ value: 'repeat', label: 'Repeat' }]}
        />
      </div>
    </div>
  ),
};

/** Undesigned, and necessary for the reason Input's Disabled story explains. */
export const Disabled: Story = { args: { disabled: true } };

/** The same inline validation pattern Input uses; see Input's WithError story. */
export const WithError: Story = {
  args: { defaultValue: undefined, placeholder: 'Select…', error: 'Pick a category.' },
};
