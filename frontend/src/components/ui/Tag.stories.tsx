import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TAG_TONES, Tag, type TagTone } from './Tag';

// The import above is type-only on purpose. Importing any *value* from
// Storybook (`fn` from storybook/test, say) breaks components.stories.test.tsx
// with an opaque ESM error, because @storybook/nextjs-vite will not load under
// Jest and only the erased type import keeps these modules loadable there.

const meta: Meta<typeof Tag> = {
  title: 'Components/Tag',
  component: Tag,
  tags: ['autodocs'],
  // preview.ts sets layout: 'fullscreen' globally with no decorators, so
  // without these a pill renders flush in the corner and the neutral tone
  // (surface-muted #edeff2) all but disappears against the canvas (#f5f7f8).
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-surface-card border-border-default rounded-xl border p-8">
        <Story />
      </div>
    ),
  ],
  args: { label: 'On track', tone: 'green', dot: true },
};

export default meta;

type Story = StoryObj<typeof Tag>;

/** One tone, driven by the controls. */
export const Playground: Story = {};

/**
 * All five tones with the labels they carry in the design. Every chip spells
 * out its state, so status is never communicated by colour alone.
 */
export const AllTones: Story = {
  render: () => {
    const examples: [TagTone, string][] = [
      ['neutral', 'Draft'],
      ['green', 'On track'],
      ['amber', 'Near'],
      ['red', 'Over'],
      ['indigo', '79% used'],
    ];

    return (
      <div className="flex flex-col items-start gap-3">
        {(Object.keys(TAG_TONES) as TagTone[]).map((tone) => {
          const [, label] = examples.find(([t]) => t === tone)!;
          return <Tag key={tone} tone={tone} label={label} />;
        })}
      </div>
    );
  },
};

/** The dot is optional; the label never is. */
export const WithoutDot: Story = {
  args: { dot: false, label: 'Full', tone: 'amber' },
};
