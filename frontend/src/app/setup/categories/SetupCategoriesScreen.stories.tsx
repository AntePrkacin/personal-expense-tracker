import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SetupDraftProvider } from '../SetupDraftProvider';
import { STARTER_CATEGORIES } from '../starterCategories';
import { CategoryChip } from './CategoryChip';
import { SetupCategoriesScreen } from './SetupCategoriesScreen';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as SetupBudgetScreen.stories.tsx.
//
// Filed under "Screens", beside "02 Setup". Titled "03 Setup" rather than the frame's
// literal "03 · Setup — Starter categories", for the reason step 1's story records: a
// middle dot and an em dash in a sidebar label are noise.
//
// This is the screen, not the route. app/setup/categories/page.tsx only answers the URL.
//
// **Each story provides its own SetupDraftProvider inside `render`**, because
// screens.stories.test.tsx builds each story from `render` or `meta.component` and
// never applies the meta's decorators - so a provider in a decorator works in
// Storybook and throws under Jest, which is how step 1's file first failed.

const meta: Meta<typeof SetupCategoriesScreen> = {
  title: 'Screens/03 Setup',
  component: SetupCategoriesScreen,
  tags: ['autodocs'],
  parameters: {
    // Fullscreen, because this is a whole frame rather than a control inside a card.
    layout: 'fullscreen',
    // Kept even though this screen calls no router hook: both exits are `next/link`,
    // and Link reads the router from context too. Nothing in CI would catch its
    // absence - `build-storybook` bundles a story without running it, and the Jest
    // smoke suite mocks `next/navigation` - so the story has to be opened either way.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof SetupCategoriesScreen>;

/**
 * The whole frame (Figma node 43:705). This is the story to diff against the design.
 *
 * Things worth checking here rather than in a test, because next/jest gives jsdom no
 * stylesheet and none of them is visible to an assertion: the **600px** card, wider
 * than step 1's 520 and the only geometry the three onboarding frames disagree about;
 * the chips wrapping three, three then four; the 11px dots against the eight category
 * colours, with blue and orange each appearing twice; and the active pill sitting in
 * the middle of the three indicator dots.
 *
 * The interactions worth doing by hand: click a chip and watch that the row does not
 * shift, which is what carrying `border-[1.5px]` in both states buys; tab to a chip
 * and confirm the focus ring is not clipped by the card, which is why the shell has no
 * `overflow-hidden`; and check that the checkmark's round caps are not shorn flat.
 *
 * The frame draws seven chips selected. This story starts with none, deliberately, and
 * `Chips` below is where the selected treatment is visible without clicking.
 */
export const Setup: Story = {
  render: () => (
    <SetupDraftProvider>
      {/* The height and the canvas the root layout would supply: the shell takes
          `flex flex-1`, so it needs a flex column with a height to centre within. */}
      <div className="bg-base-200 flex h-[1024px] flex-col">
        <SetupCategoriesScreen />
      </div>
    </SetupDraftProvider>
  ),
};

/**
 * Every chip in both states, which the screen can only show one of at a time.
 *
 * The row to diff against the frame's own seven-selected mock: each colour dot beside
 * its name, the tinted fill and accent border of a selected chip, and the checkmark.
 * Two colours repeat by design, Subscriptions taking Transport's blue and Other taking
 * Bills' orange, so this is also where that is easiest to confirm.
 *
 * No provider needed: the chip takes its state as a prop, which is what keeps it a
 * Server Component and the picker the only client file on the screen.
 */
export const Chips: Story = {
  render: () => (
    <div className="bg-base-200 flex flex-col gap-8 p-8">
      {[false, true].map((selected) => (
        <div key={String(selected)} className="flex flex-wrap gap-2.5">
          {STARTER_CATEGORIES.map(({ name, colour }) => (
            <CategoryChip
              key={name}
              label={name}
              colour={colour}
              selected={selected}
              onToggle={() => {}}
            />
          ))}
        </div>
      ))}
    </div>
  ),
};
