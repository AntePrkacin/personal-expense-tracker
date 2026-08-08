import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { CategoryTemplate } from '@/lib/categoryTemplates';

import { SetupDraftProvider } from '../SetupDraftProvider';
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
//
// **The chips are stand-in data as of PET-64, not the shipped list.** They used to be
// `STARTER_CATEGORIES`, a constant this file imported; the real list is admin-managed
// data fetched by `page.tsx` now, and Storybook has no backend. So this is a sample of
// the twelve the boot seed writes - enough colours to diff the chip treatment against
// the frame, and deliberately not a second copy of the seed, which would go stale the
// first time an admin edited one and would read as a claim about what ships.

/**
 * A representative slice of the seeded templates.
 *
 * The three deliberately close colour pairs `categoryColour.ts` documents are
 * **not** all here, on purpose: this story is for diffing one chip's treatment
 * against the frame, and the pairs are a property of the seed rather than of the
 * component. `docs/explainers/category-colors-icons-description-preview.html` is
 * where the whole palette is signed off.
 */
const SAMPLE_TEMPLATES: CategoryTemplate[] = [
  {
    id: '0198f2b0-0000-7000-8000-000000000001',
    name: 'Groceries',
    color: 'success',
    icon: 'shopping-basket',
    description: 'Food, beverages, and household essentials.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000002',
    name: 'Dining out',
    color: 'secondary',
    icon: 'utensils',
    description: 'Restaurants, coffee shops, takeout, delivery.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000003',
    name: 'Transportation',
    color: 'info',
    icon: 'car',
    description: 'Gas, public transit, rideshares, parking.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000004',
    name: 'Utilities',
    color: 'accent',
    icon: 'zap',
    description: 'Electricity, water, internet, and phone plans.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000005',
    name: 'Healthcare',
    color: 'error',
    icon: 'heart-pulse',
    description: 'Doctor visits, pharmacy, dental, therapy.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000006',
    name: 'Entertainment',
    color: 'primary',
    icon: 'tv',
    description: 'Movies, concerts, gaming, streaming subscriptions.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000007',
    name: 'Education',
    color: 'primary-content',
    icon: 'graduation-cap',
    description: 'Tuition, courses, books, and school supplies.',
  },
  {
    id: '0198f2b0-0000-7000-8000-000000000008',
    name: 'Loans & debt',
    color: 'warning',
    icon: 'landmark',
    description: 'Mortgage, car loans, credit cards, student loans.',
  },
];

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
 * the chips wrapping across rows; the dots against the daisyUI semantic tokens; and
 * the active pill sitting in the middle of the three indicator dots.
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
        <SetupCategoriesScreen categories={SAMPLE_TEMPLATES} />
      </div>
    </SetupDraftProvider>
  ),
};

/**
 * What the screen draws when the templates could not be read.
 *
 * **A real state, not a hypothetical one.** `readCategoryTemplates` degrades to an
 * empty list rather than throwing, because Continue is unconditional (A4) and
 * replacing the whole onboarding flow with an error page on the one screen with no
 * session to recover from is the worse trade. So this is what an unreachable backend
 * looks like: the card, the copy, both exits, and nothing to pick.
 *
 * It is also one of the states A29 designs no copy for, and `docs/TODO.md` records
 * that it owes a designer's answer - this story is what to put in front of them.
 */
export const NoTemplates: Story = {
  render: () => (
    <SetupDraftProvider>
      <div className="bg-base-200 flex h-[1024px] flex-col">
        <SetupCategoriesScreen categories={[]} />
      </div>
    </SetupDraftProvider>
  ),
};

/**
 * Every chip in both states, which the screen can only show one of at a time.
 *
 * The row to diff against the frame's own seven-selected mock: each colour dot beside
 * its name, the tinted fill and accent border of a selected chip, and the checkmark.
 *
 * No provider needed: the chip takes its state as a prop, which is what keeps it a
 * Server Component and the picker the only client file on the screen.
 */
export const Chips: Story = {
  render: () => (
    <div className="bg-base-200 flex flex-col gap-8 p-8">
      {[false, true].map((selected) => (
        <div key={String(selected)} className="flex flex-wrap gap-2.5">
          {SAMPLE_TEMPLATES.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              colour={category.color}
              selected={selected}
              onToggle={() => {}}
            />
          ))}
        </div>
      ))}
    </div>
  ),
};
