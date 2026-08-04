import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SetupBudgetScreen } from './SetupBudgetScreen';
import { SetupDraftProvider } from './SetupDraftProvider';
import { SetupShell } from './SetupShell';

// The import above is type-only on purpose. Importing any *value* from Storybook
// breaks the story smoke tests with an opaque ESM error, because
// @storybook/nextjs-vite will not load under Jest and only the erased type import
// keeps this module loadable there. Same note as WelcomeScreen.stories.tsx.
//
// Filed under "Screens", beside "01 Welcome". Titled "02 Setup" rather than the
// frame's literal "02 · Setup — Currency & budget": a middle dot and an em dash in
// a sidebar label are noise, and the real frame is named below.
//
// This is the screen, not the route. app/setup/page.tsx only answers the URL.
//
// **Each story provides its own SetupDraftProvider inside `render`, rather than the
// meta taking one decorator for both.** The form reads the draft through context and
// throws without a provider - deliberately, which layout.test.tsx exercises - and
// `screens.stories.test.tsx` builds each story from `render` or `meta.component`
// **without applying decorators**. A provider in a decorator therefore works in
// Storybook and throws in Jest, which is how this file first failed. Keeping the
// provider inside `render` means the smoke test renders what Storybook renders.

const meta: Meta<typeof SetupBudgetScreen> = {
  title: 'Screens/02 Setup',
  component: SetupBudgetScreen,
  tags: ['autodocs'],
  parameters: {
    // Fullscreen, because this is a whole frame rather than a control inside a card.
    layout: 'fullscreen',
    // **Mandatory, and nothing in CI catches its absence.** BudgetForm calls
    // useRouter, and `next/navigation` throws "invariant expected app router to be
    // mounted" outside one. This is what makes @storybook/nextjs-vite mount its
    // mock App Router.
    //
    // Worth knowing why it has to be eyeballed: `build-storybook` only bundles a
    // story, it never runs one, and `screens.stories.test.tsx` renders this module
    // under Jest with `next/navigation` mocked - so the suite is green either way.
    // This story threw in the browser with both gates passing.
    nextjs: { appDirectory: true },
  },
};

export default meta;

type Story = StoryObj<typeof SetupBudgetScreen>;

/**
 * The whole frame (Figma node 42:700). This is the story to diff against the design.
 *
 * Things worth checking here rather than in a test, because next/jest gives jsdom no
 * stylesheet and none of them is visible to an assertion: the 520px card and its
 * `shadow-card` elevation, the 8px gaps inside the copy block against the 20px gaps
 * between the card's rows, the 28x8 active pill beside its two 8px dots, and the
 * budget field's 1.5px accent border with `2,000` set at 22px Display/S behind the
 * `$`.
 *
 * The one interaction worth doing by hand here: click into the middle of the number
 * and type. Storybook is a real browser, so it is the only place the caret restore is
 * actually observable - jsdom cannot see it, which
 * SetupBudgetScreen.test.tsx explains at length.
 */
export const Setup: Story = {
  render: () => (
    <SetupDraftProvider>
      {/* The height and the canvas the root layout would supply: the shell takes
          `flex flex-1`, so it needs a flex column with a height to centre within. */}
      <div className="bg-surface-canvas flex h-[1024px] flex-col">
        <SetupBudgetScreen />
      </div>
    </SetupDraftProvider>
  ),
};

/**
 * The three indicator states side by side, which no single screen can show.
 *
 * Here to make the one thing that varies between frames 02, 03 and 22 diffable in
 * one glance: the pill moves and nothing else does. The card bodies are stand-ins,
 * not the real steps - PET-10 and PET-11 own those.
 */
export const StepIndicatorStates: Story = {
  render: () => (
    // No provider needed: SetupShell holds no state and reads no draft, which is
    // what keeps it a Server Component.
    <div className="bg-surface-canvas flex flex-col gap-8 py-10">
      {([1, 2, 3] as const).map((step) => (
        <SetupShell key={step} step={step}>
          <p className="text-body-m text-text-secondary">Step {step} of 3</p>
        </SetupShell>
      ))}
    </div>
  ),
};
