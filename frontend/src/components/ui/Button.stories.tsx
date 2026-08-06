import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Trash2 } from 'lucide-react';

import { Button, type ButtonVariant } from './Button';

// The import above is type-only on purpose. Importing any *value* from Storybook
// (`fn` from storybook/test, say) breaks ui.stories.test.tsx with an opaque ESM
// error, because @storybook/nextjs-vite will not load under Jest and only the
// erased type import keeps these modules loadable there.

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  // preview.ts sets layout: 'fullscreen' globally with no decorators, so without
  // these the button renders flush in the corner and the secondary variant's
  // fill disappears against the canvas.
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-base-100 border-base-300 rounded-box border p-8">
        <Story />
      </div>
    ),
  ],
  args: { label: 'Add transaction', variant: 'primary' },
};

export default meta;

type Story = StoryObj<typeof Button>;

/** One variant, driven by the controls. */
export const Playground: Story = {};

/**
 * Every variant with the label it carries in the design. The first three come
 * from the Components tile (node 12:14); `text` and `textDanger` are traced from
 * the frames that use them, since the tile does not draw them.
 */
export const AllVariants: Story = {
  render: () => {
    const labels: Record<ButtonVariant, string> = {
      primary: 'Add transaction',
      secondary: 'Regenerate',
      danger: 'Delete',
      text: 'Back',
      textDanger: 'Delete transaction',
    };

    return (
      <div className="flex flex-col items-start gap-5">
        {(Object.keys(labels) as ButtonVariant[]).map((variant) => (
          <Button
            key={variant}
            variant={variant}
            label={labels[variant]}
            icon={
              variant === 'textDanger' ? (
                <Trash2 className="size-4 shrink-0" aria-hidden="true" />
              ) : undefined
            }
          />
        ))}
      </div>
    );
  },
};

/**
 * The dialog footer on 12 and 20: a secondary "Cancel" beside the danger action.
 */
export const ConfirmationPair: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="secondary" label="Cancel" />
      <Button variant="danger" label="Delete" />
    </div>
  ),
};

/**
 * "Regenerate" while insights run (15, assumption A26). Only the label is
 * designed for this state - the frame draws the button exactly like a resting
 * secondary one - so the dimming is ours, not the design's.
 */
export const Disabled: Story = {
  args: { variant: 'secondary', label: 'Generating…', disabled: true },
};
