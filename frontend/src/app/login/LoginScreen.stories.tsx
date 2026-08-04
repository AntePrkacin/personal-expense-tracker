import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from '@/components/ui/Input';

import { LoginScreen } from './LoginScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as the four Setup stories.
//
// Filed under "Screens", beside the onboarding steps. Titled "23 Log in" rather than
// the frame's literal "23 · Log in", for the reason the others record: a middle dot
// in a sidebar label is noise.

const meta: Meta<typeof LoginScreen> = {
  title: 'Screens/23 Log in',
  component: LoginScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // Required, not optional: LoginForm calls useRouter, which throws "invariant
    // expected app router to be mounted" without it. Neither gate catches its absence
    // - build-storybook bundles a story without running it, and the Jest smoke suite
    // mocks next/navigation - so this story has to be opened by hand.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof LoginScreen>;

/**
 * The frame as drawn (node 132:1138).
 *
 * What to check against Figma: the card at 520px with **no step indicator** between
 * the lockup and it - the gap should be a single 24px, not the two the onboarding
 * frames have - the heading straight to the body copy with no overline, the copy
 * wrapping onto two lines, and the footer with "Back" flush left and "Log in" flush
 * right, 6px below the field.
 */
export const LogIn: Story = {
  render: () => (
    // The height and the canvas the root layout would supply: the card takes
    // `flex flex-1`, so it needs a flex column with a height to centre within.
    <div className="bg-surface-canvas flex h-[1024px] flex-col">
      <LoginScreen />
    </div>
  ),
};

/**
 * The two states the frame does not draw, side by side.
 *
 * The inline message is A29's pattern - red border plus one line of
 * `text-body-s text-status-danger-text`, no icon - and the second line is the
 * form-level failure, which carries `role="alert"` where the field's message
 * deliberately does not.
 *
 * Static markup rather than the real form, so both render at once: the form shows one
 * or the other, and driving it here would need a submit and a stubbed action.
 */
export const WithMessages: Story = {
  render: () => (
    // w-110 is the card's own 440px content box.
    <div className="bg-surface-canvas flex w-110 flex-col gap-5 p-8">
      <Input
        id="story-login-email"
        label="Email"
        type="email"
        defaultValue="marko@"
        error="Enter a valid email address."
      />

      <p role="alert" className="text-body-s text-status-danger-text">
        We couldn&apos;t send your login link. Please try again.
      </p>
    </div>
  ),
};
