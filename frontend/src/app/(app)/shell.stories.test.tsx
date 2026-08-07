import { createElement } from 'react';
import { render } from '@testing-library/react';

import * as BudgetCard from './dashboard/BudgetCard.stories';
import * as Modal from './Modal.stories';
import * as PageHeader from './PageHeader.stories';

// Smoke-tests the shell's stories, the same job src/components/ui/ui.stories.test.tsx
// does for the Components section and src/app/screens.stories.test.tsx does for
// Screens. `storybook build` bundles a story but never runs one, so
// without this a runtime throw ships through a green CI and surfaces only when
// somebody opens Storybook.
//
// Its own file rather than an entry in ui.stories.test.tsx because that suite
// asserts every module's title matches /^Components\//, and these are filed
// under "Shell". The duplication is two dozen lines; merging them would mean
// parameterising that assertion, which is the one thing it exists to make
// unambiguous.
//
// SidebarNav has no story and must not get one here: it calls usePathname(), and
// there is no router in context under Jest.

type Args = Record<string, unknown>;
type Story = { render?: (args: Args, context: never) => React.ReactNode; args?: Args };
type Meta = { title?: string; component?: React.ElementType; args?: Args };
type StoryModule = Record<string, unknown> & { default: Meta };

const MODULES: [name: string, module: StoryModule][] = [
  ['PageHeader', PageHeader as StoryModule],
  ['Modal', Modal as StoryModule],
  // The dashboard's own card (node 22:55), not a tile on the Figma Components page and not a
  // whole frame - `Screens/04 Dashboard` is where the frame is diffed.
  ['BudgetCard', BudgetCard as StoryModule],
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

describe('shell stories', () => {
  it('finds stories in every module', () => {
    // Guards the discovery above: a meta with no `component` and stories with no
    // `render` would reduce this suite to zero cases and pass.
    expect(stories.length).toBeGreaterThanOrEqual(MODULES.length * 2);
    for (const [moduleName, module] of MODULES) {
      expect(stories.some(([id]) => id.startsWith(`${moduleName}/`))).toBe(true);
      expect(module.default.component).toBeDefined();
    }
  });

  it.each(MODULES)('%s is filed under Shell in the sidebar', (_name, module) => {
    // Not "Components": that section mirrors the nine tiles on the Figma
    // Components page, and the header is not one of them.
    expect(module.default.title).toMatch(/^Shell\//);
  });

  it.each(stories)('%s renders without throwing', (_id, build) => {
    expect(() => render(<>{build()}</>)).not.toThrow();
  });
});
