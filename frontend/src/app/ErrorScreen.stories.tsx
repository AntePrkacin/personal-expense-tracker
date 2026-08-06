import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ErrorScreen } from './ErrorScreen';

// The second screen in this app with no Figma frame behind it, after `Verify link failed`,
// and filed here for the same reason: when the designer drew nothing, opening the story is
// the only review the copy gets.
//
// No `nextjs` parameter and no provider: `reset` is an ordinary prop and nothing here reaches
// the router.

const meta: Meta<typeof ErrorScreen> = {
  title: 'Screens/Something went wrong',
  component: ErrorScreen,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof ErrorScreen>;

/** A client-side throw, which carries no digest: heading, body and the one retry. */
export const Default: Story = {
  args: {
    reset: () => {},
  },
};

/**
 * A Server Component throw, which is the case the boundary mostly catches on this app: any
 * of the four `lib/` reads failing against an unreachable or 500-ing backend. Next redacts
 * the message and leaves the digest, so the reference line is the only thing distinguishing
 * this from the story above.
 */
export const WithDigest: Story = {
  args: {
    digest: '1a2b3c4d5e6f7890',
    reset: () => {},
  },
};
