import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { LogoLockup } from '@/components/LogoLockup';

import { DecorativePanel } from './DecorativePanel';
import { WelcomeScreen } from './WelcomeScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as ui/Sidebar.stories.tsx.
//
// Filed under "Screens", a third section beside "Components" and "Foundations". All
// three are named after their Figma page, and the frames live on the page called
// Screens - which also gives PET-9 onward an obvious home (Screens/02 Setup).
//
// The story is titled "01 Welcome" rather than the frame's literal "01 · Welcome":
// a middle dot in a sidebar label is noise. The real frame is named below.
//
// Note this is the screen, not the route. app/page.tsx is the session gate that
// chooses between this and the Dashboard, and Storybook cannot render it: it is an
// async Server Component that awaits a session. That split is why WelcomeScreen is
// a component of its own.

const meta: Meta<typeof WelcomeScreen> = {
  title: 'Screens/01 Welcome',
  component: WelcomeScreen,
  tags: ['autodocs'],
  // Fullscreen, because this is a whole frame rather than a control inside a card.
  // The screen takes `flex flex-1` from the root layout, so the decorator supplies
  // the height the same way ui/Sidebar.stories.tsx does.
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-[1024px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WelcomeScreen>;

/**
 * The whole frame (Figma node 41:696). This is the story to diff against the design.
 *
 * Things worth checking here rather than in a test, because next/jest gives jsdom no
 * stylesheet and none of them is visible to an assertion: the cedi glyph really
 * renders from Plus Jakarta Sans rather than a fallback, the two elevations on the
 * dark panel, the 460px heading and 430px intro line breaks, and the em dash in
 * "on plan — all in one".
 *
 * Also the responsive boundary this frame is the only one to have: below `lg` the
 * split collapses to the copy column alone, because the right half is decoration and
 * hides itself. Narrow the viewport here rather than reasoning about it.
 */
export const Welcome: Story = {};

/**
 * The decorative right panel alone (node 41:711), because its absolute placement is
 * the fiddly half: two circles bleeding off opposite edges, a card and two floating
 * chips, all positioned against the 560px panel.
 *
 * Check that the two circles read as two distinct washes - 28% and 18% of the same
 * accent - and that both are clipped rather than overflowing.
 *
 * The panel hides itself below `lg`, so this story is blank on a narrow viewport by
 * design rather than broken.
 */
export const Panel: Story = {
  render: () => <DecorativePanel />,
};

/**
 * The brand lockup alone (node 41:698), shared by all six access frames.
 *
 * This is where the U+20B5 CEDI SIGN gets eyeballed: it is a text glyph rather than
 * a traced path, so it depends on Plus Jakarta Sans carrying it, and a fallback
 * glyph would look wrong while every test stayed green.
 */
export const Lockup: Story = {
  render: () => (
    <div className="bg-base-100 p-8">
      <LogoLockup />
    </div>
  ),
};
