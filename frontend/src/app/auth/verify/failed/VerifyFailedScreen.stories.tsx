import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { VerifyFailedScreen } from './VerifyFailedScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook breaks
// the story smoke tests with an opaque ESM error, because @storybook/nextjs-vite will
// not load under Jest and only the erased type import keeps this module loadable there.
// Same note as the other screen stories.
//
// **The title carries no frame number**, unlike every other entry under `Screens/`.
// There is no frame: the Screens page holds 24 and A38 says outright that nothing is
// designed for opening the link. So these four stories are the only place this screen
// can be looked at, which makes opening them the review rather than a formality - there
// is no Figma node to diff against, only screen 24 beside it.

/** A stub, so clicking Resend in a story neither reaches the backend nor throws. */
const resend = async () => ({ ok: true as const });

const meta: Meta<typeof VerifyFailedScreen> = {
  title: 'Screens/Verify link failed',
  component: VerifyFailedScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // No `nextjs: { appDirectory: true }`: nothing here reaches a router hook. The "Log
    // in again" control is a next/link, which needs no app router mounted.
  },
};

export default meta;

type Story = StoryObj<typeof VerifyFailedScreen>;

/** The chrome every story shares: the canvas and height the root layout would supply. */
function Canvas({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-canvas flex h-[1024px] flex-col">{children}</div>;
}

/**
 * A used, expired or unknown link - the backend's 401, and the common case.
 *
 * What to check: the card is byte-for-byte screen 24's box at 520px, with the lockup
 * 24px above, no step indicator, no overline, and one control flush right. If this looks
 * like a different screen from `Screens/24 Check your email`, that is the bug - there is
 * no frame to appeal to, so consistency with its neighbour is the whole standard.
 *
 * The heading names both reasons a link dies, because the user cannot tell which
 * happened and the recovery is the same either way.
 */
export const Invalid: Story = {
  render: () => (
    <Canvas>
      <VerifyFailedScreen reason="invalid" hasAddress resend={resend} />
    </Canvas>
  ),
};

/**
 * A link a newer one replaced - the backend's 409, and the one actionable rejection.
 *
 * Reachable by ordinary behaviour rather than misuse: Gmail collapses these emails into
 * a single thread, because every message has an identical sender and subject, so a user
 * looking at a conversation of indistinguishable links naturally opens the wrong one.
 * The copy therefore points at the newest email rather than saying the link expired,
 * which would send them to request a third and supersede the one already waiting.
 */
export const Superseded: Story = {
  render: () => (
    <Canvas>
      <VerifyFailedScreen reason="superseded" hasAddress resend={resend} />
    </Canvas>
  ),
};

/**
 * The per-IP limiter, which this flow shares across the whole deployment.
 *
 * Its own line rather than the generic failure, because "please try again" is actively
 * wrong advice to somebody who has to wait. Worth knowing why it is reachable at all:
 * the verify POST goes out from the frontend server, so every user in the deployment
 * lands in one bucket - `docs/TODO.md` records that.
 */
export const Busy: Story = {
  render: () => (
    <Canvas>
      <VerifyFailedScreen reason="busy" hasAddress resend={resend} />
    </Canvas>
  ),
};

/**
 * A fault or an unreachable backend, **with no address left to resend to**.
 *
 * Two states in one story on purpose, because they are the pair a user most often hits
 * together: the copy that claims the least, and the control for when the fifteen-minute
 * address cookie has gone. A dead link opened the next morning arrives exactly here.
 *
 * The control is "Log in again" rather than a disabled Resend, which would leave a
 * screen with no working action at all - the same call `CheckEmailScreen` makes, and the
 * same amendment to AC6's wording.
 */
export const FailedWithNoAddress: Story = {
  render: () => (
    <Canvas>
      {/* No `resend` prop, and the props are an exclusive union, so passing one here
          would not compile: there is nothing to send to without an address. */}
      <VerifyFailedScreen reason="failed" hasAddress={false} />
    </Canvas>
  ),
};
