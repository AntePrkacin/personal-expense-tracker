import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

// The two Foundations typefaces. Both are variable fonts, so a single request
// covers every weight the type scale needs (Plus Jakarta Sans 600-800, Inter
// 400-600) without enumerating them.
//
// These expose CSS variables rather than classNames because globals.css maps
// them onto the --font-display / --font-sans theme tokens, which the 19 type
// utilities then reference.
//
// This lives in its own module rather than in layout.tsx so the Storybook
// preview can import the same loaders and apply the identical variable classes.
// The variables must land on <html>, since that is where :root resolves.

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
