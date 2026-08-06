import type { Metadata, Viewport } from 'next';
import './globals.css';
import { inter, plusJakartaSans } from './fonts';

// "Spendifico", the name decided on 2026-08-02 and now carried everywhere in
// the repo. The Figma file is the one holdout and still says "Expensa"
// throughout; see "The Figma file still says Expensa" in docs/TODO.md.
export const metadata: Metadata = {
  title: 'Spendifico',
  description: 'Track what you spend, see where it goes, and stay on budget.',
};

// Light and dark both ship as of PET-57: daisyUI's built-in pair, selected
// automatically from the OS. Declaring both here keeps UA widgets (form
// controls, scrollbars) in step with whichever theme is active.
export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables have to sit on <html>: that is where :root resolves,
    // and the --font-display / --font-sans theme tokens dereference them.
    <html lang="en" className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}>
      {/* bg-base-200 is the page canvas, one elevation below the bg-base-100
          cards and panels that sit on it - the same canvas-vs-card distinction
          the old token system drew, expressed through the theme. Text needs no
          class: Tailwind's preflight reads --font-sans (Inter) as the default
          family, and daisyUI's base sets the theme's colours. */}
      <body className="bg-base-200 flex min-h-full flex-col">{children}</body>
    </html>
  );
}
