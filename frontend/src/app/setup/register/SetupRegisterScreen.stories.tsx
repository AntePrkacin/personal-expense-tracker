import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from '@/components/ui/Input';

import { SetupDraftProvider } from '../SetupDraftProvider';
import { SetupRegisterScreen } from './SetupRegisterScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as the other two Setup stories.
//
// Filed under "Screens", beside "02 Setup" and "03 Setup". Titled "22 Register"
// rather than the frame's literal "22 · Register user", for the reason the other two
// record: a middle dot in a sidebar label is noise.
//
// **Each story provides its own SetupDraftProvider inside `render`**, because
// screens.stories.test.tsx builds each story from `render` or `meta.component` and
// never applies the meta's decorators.

const meta: Meta<typeof SetupRegisterScreen> = {
  title: 'Screens/22 Register',
  component: SetupRegisterScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // Required, not optional: RegisterForm calls useRouter, which throws
    // "invariant expected app router to be mounted" without it. Neither gate catches
    // its absence - build-storybook bundles a story without running it, and the Jest
    // smoke suite mocks next/navigation - so this story has to be opened by hand.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof SetupRegisterScreen>;

/**
 * The whole frame (Figma node 129:1128). This is the story to diff against the design.
 *
 * Things worth checking here rather than in a test, because next/jest gives jsdom no
 * stylesheet and none of them is visible to an assertion: the two name fields sitting
 * on one row at **equal** width with a 12px gutter and the email spanning both, the
 * **520px** card rather than step 2's 600, the third indicator dot as the filled pill,
 * and the 6px the footer row sits below the email field.
 *
 * Clicking "Finish setup" here reaches the real server action, which has no backend
 * behind it in Storybook - so it fails and renders the form-level message. That is the
 * quickest way to see the failure state; `WithMessages` below shows every message at
 * once without waiting for a request.
 */
export const Register: Story = {
  render: () => (
    <SetupDraftProvider>
      {/* The height and the canvas the root layout would supply: the shell takes
          `flex flex-1`, so it needs a flex column with a height to centre within. */}
      <div className="bg-surface-canvas flex h-[1024px] flex-col">
        <SetupRegisterScreen />
      </div>
    </SetupDraftProvider>
  ),
};

/**
 * Every validation message and the submit failure, all visible at once.
 *
 * This is the story the designer sign-off A29 owes is easiest to give against: the
 * file draws no error state anywhere, so the red border plus one line of
 * `status-danger-text` is ours, and this screen is the first place five of those
 * strings appear. Worth checking that the two side-by-side messages do not push the
 * email field out of alignment, and that the alert line above the buttons reads as
 * belonging to the form rather than to the email field above it.
 *
 * Built from `ui/Input` rather than from the form, because the real messages only
 * appear after a submit and a story cannot click its own button. `defaultValue`
 * rather than `value`, so the fields are still typeable here and React is not handed
 * a controlled input with no `onChange`.
 */
export const WithMessages: Story = {
  render: () => (
    // w-110 is the card's own 440px content box. On this column rather than on the
    // grid, so the email field is the same width as the row above it - which is the
    // alignment this story exists to show.
    <div className="bg-surface-canvas flex w-110 flex-col gap-5 p-8">
      <div className="grid grid-cols-2 gap-3">
        <Input id="story-first-name" label="First name" error="Enter your first name." />
        <Input id="story-last-name" label="Last name" error="Enter your last name." />
      </div>

      <Input
        id="story-email"
        label="Email"
        type="email"
        defaultValue="marko@"
        error="Enter a valid email address."
      />

      <p role="alert" className="text-body-s text-status-danger-text">
        We couldn&apos;t create your account. Please try again.
      </p>
    </div>
  ),
};
