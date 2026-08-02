import { render, screen } from '@testing-library/react';

import * as Colour from './Colour.stories';
import * as Radius from './Radius.stories';
import * as Spacing from './Spacing.stories';
import * as Typography from './Typography.stories';
import { COLOUR_GROUPS, RADIUS_SCALE, SPACING_SCALE, TYPE_STYLES } from './tokens';

// Smoke-tests the Foundations reference stories.
//
// `storybook build` bundles the stories but never executes a render function,
// so without this a runtime throw in Reference.tsx would ship through a fully
// green CI and only surface when somebody opened Storybook.
//
// The stories are rendered directly rather than through Storybook's
// composeStories: @storybook/nextjs-vite is ESM-only and will not load under
// Jest, but the story files import it for types alone, so the import is erased
// at compile time and the modules pull in nothing but React.
//
// Note that jsdom has no stylesheet, so `useTokenValue` reads back empty and
// swatches render their "not declared" fallback. That is expected here - this
// test exists to catch crashes and missing rows. Values are covered by
// src/app/globals.test.ts.

type StoryModule = Record<string, unknown>;

const MODULES: [name: string, module: StoryModule][] = [
  ['Colour', Colour],
  ['Typography', Typography],
  ['Spacing', Spacing],
  ['Radius', Radius],
];

/** Every named export that is a story with a render function. */
const stories = MODULES.flatMap(([moduleName, module]) =>
  Object.entries(module)
    .filter(([exportName]) => exportName !== 'default')
    .flatMap(([exportName, story]) => {
      const render = (story as { render?: unknown })?.render;
      return typeof render === 'function'
        ? [[`${moduleName}/${exportName}`, render as () => React.ReactNode] as const]
        : [];
    }),
);

describe('Foundations stories', () => {
  it('finds a story in every reference module', () => {
    // Guards the discovery above: a typo'd export name would otherwise reduce
    // this suite to zero cases and still pass.
    expect(stories.length).toBeGreaterThanOrEqual(MODULES.length);
    for (const [moduleName] of MODULES) {
      expect(stories.some(([id]) => id.startsWith(`${moduleName}/`))).toBe(true);
    }
  });

  it.each(stories)('%s renders without throwing', (_id, renderStory) => {
    expect(() => render(<>{renderStory()}</>)).not.toThrow();
  });
});

describe('Foundations stories render every documented entry', () => {
  it('shows all 36 colour swatches under their group headings', () => {
    render(<>{Colour.AllTokens.render!({}, {} as never)}</>);

    for (const { group, tokens } of COLOUR_GROUPS) {
      expect(screen.getByText(group)).toBeInTheDocument();
      for (const { label } of tokens) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    }
  });

  it('shows all 19 type specimens', () => {
    render(<>{Typography.AllStyles.render!({}, {} as never)}</>);

    for (const { label, utility } of TYPE_STYLES) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(utility)).toBeInTheDocument();
    }
  });

  it('shows every spacing step with its utility', () => {
    render(<>{Spacing.Scale.render!({}, {} as never)}</>);

    for (const { label, px, utility } of SPACING_SCALE) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(`${px} px`)).toBeInTheDocument();
      expect(screen.getByText(utility)).toBeInTheDocument();
    }
  });

  it('shows every radius step, including the built-in pill', () => {
    render(<>{Radius.Scale.render!({}, {} as never)}</>);

    for (const { label, value } of RADIUS_SCALE) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });
});
