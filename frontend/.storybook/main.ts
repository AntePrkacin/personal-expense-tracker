import type { StorybookConfig } from '@storybook/nextjs-vite';

// The Vite framework rather than the Webpack one: it is what Storybook
// recommends for Next.js, and this app is Turbopack-only so there is no webpack
// config for the other builder to reuse.
//
// No PostCSS wiring is needed - the Vite builder picks up postcss.config.mjs
// from the project root, so importing globals.css in preview.ts is enough to
// get Tailwind. Do not add @tailwindcss/vite alongside @tailwindcss/postcss;
// that would process the stylesheet twice.
const config: StorybookConfig = {
  framework: '@storybook/nextjs-vite',
  // No '*.mdx' entry: there are no MDX pages yet and the glob would warn on
  // every start. Add it back alongside the first hand-written docs page.
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],

  // `next/headers` is server-only and throws in a browser bundle, and a story can
  // reach it without naming it: `Screens/22 Register` imports the screen, which
  // imports its Server Action, which reads a cookie since PET-12. The framework
  // ships a browser-safe stand-in but does not alias it for you - it aliases only
  // `styled-jsx` - so this is the one line that keeps such a story loadable.
  //
  // Neither gate catches its absence, which is why it is worth the comment:
  // `build-storybook` bundles a story without ever running one, and the Jest smoke
  // suites render with `next/headers` never reached. Opening the story is the check.
  //
  // The mock's cookie store is empty, so a story rendering a screen that reads a
  // cookie sees no value - which for screen 24 is its no-address branch. Pass the
  // address as a prop in the story rather than trying to seed a cookie.
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...viteConfig.resolve?.alias,
        'next/headers': '@storybook/nextjs-vite/headers.mock',
      },
    },
  }),
};

export default config;
