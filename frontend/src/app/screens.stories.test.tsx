import { createElement } from 'react';
import { render } from '@testing-library/react';

import * as CheckEmailScreen from './check-email/CheckEmailScreen.stories';
import * as LoginScreen from './login/LoginScreen.stories';
import * as SetupCategoriesScreen from './setup/categories/SetupCategoriesScreen.stories';
import * as SetupRegisterScreen from './setup/register/SetupRegisterScreen.stories';
import * as SetupBudgetScreen from './setup/SetupBudgetScreen.stories';
import * as WelcomeScreen from './WelcomeScreen.stories';

// 02 Setup reaches useRouter through BudgetForm, and jsdom has no App Router, so
// rendering its stories here needs the mock below.
//
// Note this is the **opposite** call from (app)/shell.stories.test.tsx, which
// records that SidebarNav must not get a story at all because there is no router
// in context under Jest. The difference is what the story is for: SidebarNav is a
// wrapper whose only job is reading the pathname, while 02 Setup is a whole frame
// to diff against Figma. So here the router is mocked rather than the story
// skipped. The two notes are halves of one decision.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Smoke-tests the Screens section's stories, the same job
// src/components/ui/ui.stories.test.tsx does for Components,
// src/app/(app)/shell.stories.test.tsx for Shell and
// src/stories/foundations/foundations.stories.test.tsx for Foundations.
// `storybook build` bundles a story but never runs one, so without this a runtime
// throw ships through a green CI and surfaces only when somebody opens Storybook.
//
// A fourth file rather than an entry in one of the others because each of those
// asserts its own title prefix - /^Components\//, /^Shell\//, /^Foundations\// - and
// that assertion is the one thing each exists to make unambiguous.
//
// **This is now the fourth copy of the ~30 lines below**, which is past the point
// utilities.test.ts sets for itself ("if a third consumer appears, lift it into a
// helper then"). Lifting three existing suites was out of scope for the ticket that
// added this one; see "The story smoke harness is duplicated four times" in
// docs/TODO.md for the helper's shape.

type Args = Record<string, unknown>;
type Story = { render?: (args: Args, context: never) => React.ReactNode; args?: Args };
type Meta = { title?: string; component?: React.ElementType; args?: Args };
type StoryModule = Record<string, unknown> & { default: Meta };

const MODULES: [name: string, module: StoryModule][] = [
  ['WelcomeScreen', WelcomeScreen as StoryModule],
  ['SetupBudgetScreen', SetupBudgetScreen as StoryModule],
  ['SetupCategoriesScreen', SetupCategoriesScreen as StoryModule],
  ['SetupRegisterScreen', SetupRegisterScreen as StoryModule],
  ['LoginScreen', LoginScreen as StoryModule],
  ['CheckEmailScreen', CheckEmailScreen as StoryModule],
];

const stories = MODULES.flatMap(([moduleName, module]) => {
  const meta = module.default;

  return Object.entries(module)
    .filter(([exportName]) => exportName !== 'default')
    .map(([exportName, value]) => {
      const story = value as Story;
      const args = { ...meta.args, ...story.args };

      const build = () =>
        story.render
          ? story.render(args, {} as never)
          : createElement(meta.component as React.ElementType, args);

      return [`${moduleName}/${exportName}`, build] as const;
    });
});

describe('screen stories', () => {
  it('finds stories in every module', () => {
    // Guards the discovery above: a meta with no `component` and stories with no
    // `render` would reduce this suite to zero cases and pass.
    expect(stories.length).toBeGreaterThanOrEqual(MODULES.length * 2);
    for (const [moduleName, module] of MODULES) {
      expect(stories.some(([id]) => id.startsWith(`${moduleName}/`))).toBe(true);
      expect(module.default.component).toBeDefined();
    }
  });

  it.each(MODULES)('%s is filed under Screens in the sidebar', (_name, module) => {
    // Not "Components", which mirrors the nine tiles on the Figma Components page,
    // and not "Shell", which is the signed-in chrome. These are whole frames.
    expect(module.default.title).toMatch(/^Screens\//);
  });

  it.each(stories)('%s renders without throwing', (_id, build) => {
    expect(() => render(<>{build()}</>)).not.toThrow();
  });
});
