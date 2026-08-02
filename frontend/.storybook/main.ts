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
};

export default config;
