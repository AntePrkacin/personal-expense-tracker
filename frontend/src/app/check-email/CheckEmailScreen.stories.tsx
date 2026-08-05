import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CheckEmailScreen } from './CheckEmailScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as the other screen stories.
//
// **The screen takes both of its props here**, which is the payoff of `page.tsx`
// owning the cookie read and the action: this module imports nothing server-only, so
// there is no `next/headers` in the browser bundle and no request scope to fake. The
// two branches are then just two values of one prop.

/** A stub, so clicking Resend in the story neither reaches the backend nor throws. */
const resend = async () => ({ ok: true as const });

/** The expiry the first story cannot reach on its own: fifteen minutes of waiting. */
const expiredResend = async () => ({ ok: false as const, reason: 'expired' as const });

const meta: Meta<typeof CheckEmailScreen> = {
  title: 'Screens/24 Check your email',
  component: CheckEmailScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // No `nextjs: { appDirectory: true }` here, unlike the Log in story: nothing on
    // this screen reaches a router hook. The "Log in again" button in the second story
    // is a next/link, which needs no app router mounted.
  },
};

export default meta;

type Story = StoryObj<typeof CheckEmailScreen>;

/**
 * The frame as drawn (node 134:1142), with the address interpolated.
 *
 * What to check against Figma: the card at 520px with no step indicator and no
 * overline, the address sitting mid-sentence in body copy that wraps onto two lines,
 * and **one control, flush right** - this is the only access footer with a single
 * button, so it is `justify-end` rather than `justify-between`. There is deliberately
 * **no "Back"**, which the frame still draws; PET-11 removed it, amending VER-3, A37
 * and PET-12's AC6.
 *
 * Click "Resend link" to see the confirmation line, which A36 designs none of - it and
 * the two failure lines are this ticket's additions.
 */
export const CheckYourEmail: Story = {
  render: () => (
    // The height and the canvas the root layout would supply: the card takes
    // `flex flex-1`, so it needs a flex column with a height to centre within.
    <div className="bg-surface-canvas flex h-[1024px] flex-col">
      <CheckEmailScreen email="marko@email.com" resend={resend} />
    </div>
  ),
};

/**
 * The arrival with no address to name (AC7).
 *
 * Reached when the cookie has expired, when the screen is opened in a second browser,
 * or when its value is not something the field could have produced. The copy drops the
 * address clause rather than leaving a gap or a literal placeholder, and the control
 * becomes a way onwards to Log in - because there is nothing to resend, and a disabled
 * button would leave the screen with no working control at all.
 *
 * Both strings here are new copy owing designer sign-off under A29.
 */
export const NoAddress: Story = {
  render: () => (
    <div className="bg-surface-canvas flex h-[1024px] flex-col">
      {/* No `resend` prop, and the props are an exclusive union so passing one here
          would not compile: there is nothing to send to without an address. */}
      <CheckEmailScreen email={null} />
    </div>
  ),
};

/**
 * The same recovery, reached by waiting instead of by arriving without an address.
 *
 * Click "Resend link": the stub reports that the address cookie has expired, which is
 * what happens fifteen minutes after arriving here with the tab still open. The control
 * is replaced rather than left to fail identically forever - screen 24 has no Back by
 * design, so a retry prompt here would be the one dead end on the screen.
 *
 * Worth opening because it is the one state neither Figma nor a quick click-through
 * shows, and it is reached by doing nothing at all.
 */
export const ResendAfterExpiry: Story = {
  render: () => (
    <div className="bg-surface-canvas flex h-[1024px] flex-col">
      <CheckEmailScreen email="marko@email.com" resend={expiredResend} />
    </div>
  ),
};
