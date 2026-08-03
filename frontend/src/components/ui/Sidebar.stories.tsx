import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SIDEBAR_ITEMS, Sidebar, type SidebarItem } from './Sidebar';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks ui.stories.test.tsx with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there.
//
// The sample values below are Figma's own, and this is the one file they belong
// in. Sidebar.test.tsx asserts none of them appears in the component itself.

const meta: Meta<typeof Sidebar> = {
  title: 'Components/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  // Fullscreen, unlike the other components: this is a full-height panel rather
  // than a control that sits inside a card.
  parameters: { layout: 'fullscreen' },
  decorators: [
    // The height is the decorator's job because the component takes h-full: the
    // shell that mounts it owns the height, and justify-between needs a
    // constrained one to pin the footer to the bottom. 1024px is the Figma frame,
    // so this frames the component exactly as the design draws it.
    (Story) => (
      <div className="bg-surface-canvas flex h-[1024px]">
        <Story />
      </div>
    ),
  ],
  args: {
    active: 'dashboard',
    firstName: 'Marko',
    lastName: 'Kovač',
    email: 'marko@email.com',
  },
  argTypes: {
    active: { options: SIDEBAR_ITEMS, control: { type: 'radio' } },
  },
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

/**
 * Switch `active` to watch the highlight move. The footer is derived: "MK" and
 * "Marko K." come from the two name fields, so editing either changes both.
 */
export const Playground: Story = {};

/**
 * All four variants side by side, which is how the Figma component set draws them
 * (node 18:252). This is the story to diff against the design.
 */
export const AllVariants: Story = {
  render: (args) => (
    <div className="flex gap-4">
      {SIDEBAR_ITEMS.map((item) => (
        <Sidebar key={item} {...args} active={item as SidebarItem} />
      ))}
    </div>
  ),
};

/**
 * A long name and address truncate rather than widening the 260px panel. Figma
 * clips instead, because it only ever draws the short sample address.
 */
export const LongProfile: Story = {
  args: {
    active: 'settings',
    firstName: 'Maximiliana',
    lastName: 'Wolfeschlegelsteinhausenbergerdorff',
    email: 'maximiliana.wolfeschlegelsteinhausenbergerdorff@a-very-long-domain.example',
  },
};
