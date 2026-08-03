import { createElement } from 'react';
import { render } from '@testing-library/react';

import * as Button from './Button.stories';
import * as Input from './Input.stories';
import * as ListRow from './ListRow.stories';
import * as ProgressBar from './ProgressBar.stories';
import * as SectionHeader from './SectionHeader.stories';
import * as Select from './Select.stories';
import * as Sidebar from './Sidebar.stories';
import * as Stat from './Stat.stories';
import * as Tag from './Tag.stories';

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
// Unlike the Foundations reference stories, these are ordinary CSF3 stories
// that mostly carry `args` and no `render`. Filtering on a render function -
// which is what src/stories/foundations/foundations.stories.test.tsx does -
// would therefore find almost nothing here and still pass. The element is built
// from the meta's `component` instead whenever `render` is absent.
//
// Decorators and parameters are Storybook's concern and are not applied here;
// this test is about the story content not throwing.

type Args = Record<string, unknown>;
type Story = { render?: (args: Args, context: never) => React.ReactNode; args?: Args };
type Meta = { title?: string; component?: React.ElementType; args?: Args };
type StoryModule = Record<string, unknown> & { default: Meta };

const MODULES: [name: string, module: StoryModule][] = [
  ['Tag', Tag as StoryModule],
  ['ProgressBar', ProgressBar as StoryModule],
  ['Stat', Stat as StoryModule],
  ['SectionHeader', SectionHeader as StoryModule],
  ['ListRow', ListRow as StoryModule],
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
