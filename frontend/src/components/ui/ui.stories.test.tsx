import { createElement } from 'react';
import { render } from '@testing-library/react';

import * as BudgetField from '../BudgetField.stories';
import * as LogoLockup from '../LogoLockup.stories';
import * as Button from './Button.stories';
import * as Input from './Input.stories';
import * as Select from './Select.stories';
import * as Sidebar from './Sidebar.stories';

// Smoke-tests the component stories.
//
// `storybook build` bundles the stories but never executes one, so without this
// a runtime throw in a story would ship through a fully green CI and only
// surface when somebody opened Storybook.
//
// The stories are rendered directly rather than through Storybook's
// composeStories: @storybook/nextjs-vite is ESM-only and will not load under
// Jest, but the story files import it for types alone, so the import is erased
// at compile time and the modules pull in nothing but React.
//
// PET-57 shrank the module list to the four primitives that survived the
// daisyUI migration; the deleted components' stories went with them.
//
// Decorators and parameters are Storybook's concern and are not applied here;
// this test is about the story content not throwing.

type Args = Record<string, unknown>;
type Story = { render?: (args: Args, context: never) => React.ReactNode; args?: Args };
type Meta = { title?: string; component?: React.ElementType; args?: Args };
type StoryModule = Record<string, unknown> & { default: Meta };

const MODULES: [name: string, module: StoryModule][] = [
  // **`components/BudgetField` is not in `ui/`, and it is registered here anyway.** A review found
  // it in no smoke suite at all: this file covered `ui/` only, `screens.stories.test.tsx` asserts a
  // `Screens/` prefix, and `build-storybook` bundles a module without executing a story - so a
  // runtime throw in it would have shipped through green CI and surfaced only when somebody opened
  // Storybook. Its title *is* `Components/…`, which is the one thing this suite asserts, so it fits
  // here rather than wanting a fourth suite for a single file.
  ['BudgetField', BudgetField as StoryModule],
  // `components/LogoLockup` joins for the identical reason, and PET-79 is when it needed to: it
  // stopped being a propless component and became one with a `size` and a `tone`, drawn at five
  // former call sites, so a throw in one arm is now a throw a story can reach.
  ['LogoLockup', LogoLockup as StoryModule],
  ['Button', Button as StoryModule],
  ['Input', Input as StoryModule],
  ['Select', Select as StoryModule],
  ['Sidebar', Sidebar as StoryModule],
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

describe('UI component stories', () => {
  it('finds stories in every module', () => {
    // Guards the discovery above: a meta with no `component` and stories with
    // no `render` would otherwise reduce this suite to zero cases and pass.
    expect(stories.length).toBeGreaterThanOrEqual(MODULES.length * 2);
    for (const [moduleName, module] of MODULES) {
      expect(stories.some(([id]) => id.startsWith(`${moduleName}/`))).toBe(true);
      expect(module.default.component).toBeDefined();
    }
  });

  it.each(MODULES)('%s is filed under Components in the sidebar', (_name, module) => {
    // The folder is `ui/` but the Storybook section is "Components", matching
    // the name of the Figma page these are diffed against. The mismatch is
    // deliberate: `ui/` describes where the code lives, "Components" is what a
    // human browsing the design system is looking for.
    expect(module.default.title).toMatch(/^Components\//);
  });

  it.each(stories)('%s renders without throwing', (_id, build) => {
    expect(() => render(<>{build()}</>)).not.toThrow();
  });
});
