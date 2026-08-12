import type { Preview } from '@storybook/nextjs-vite';

import { crimsonPro, inter } from '../src/app/fonts';
import '../src/app/globals.css';

// Importing the loaders is what injects the @font-face rules into <head>; the
// returned `.variable` is the class that declares --font-crimson-pro and
// --font-inter.
//
// The classes go on <html>, exactly where layout.tsx puts them, because the
// --font-display / --font-sans theme tokens are declared on :root and
// dereference these variables there. Putting them on a wrapper element instead
// would leave both font utilities resolving to nothing.
for (const variableClass of [crimsonPro.variable, inter.variable]) {
  // Guard rather than assume: Storybook's next/font handling has a history of
  // returning an empty or undefined `.variable`, and classList.add('') throws.
  if (variableClass && variableClass !== 'undefined') {
    document.documentElement.classList.add(variableClass);
  } else {
    console.warn(
      // "the Foundations type styles" until PET-79: that token layer died with PET-57 and the
      // fallback is now visible rather than merely wrong, because the display face is a serif
      // falling back to `ui-serif` and the body face a sans falling back to `ui-sans-serif`.
      '[storybook] next/font did not expose a variable class, so every heading and every ' +
        'body string will fall back to a system face. See .storybook/preview.ts.',
    );
  }
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
