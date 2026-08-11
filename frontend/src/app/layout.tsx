import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { parseThemePref, THEME_COOKIE, themeAttribute } from '@/lib/theme';
import { inter, plusJakartaSans } from './fonts';

// "Spendifico", the name decided on 2026-08-02 and now carried everywhere in
// the repo. The Figma file is the one holdout and still says "Expensa"
// throughout; see "The Figma file still says Expensa" in docs/TODO.md.
export const metadata: Metadata = {
  title: 'Spendifico',
  description: 'Track what you spend, see where it goes, and stay on budget.',
};

// Light and dark both ship: the Expensa pair as of PET-74, selected
// automatically from the OS unless the Settings Theme control has pinned one.
// Declaring both here keeps UA widgets (form controls, scrollbars) in step in
// the automatic case; a pinned theme's own `color-scheme` declaration wins on
// the element, so this stays the pair whichever way the choice goes.
export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The Settings Theme control's cookie (PET-74's addendum). `system` maps to
  // `undefined`, which renders **no attribute at all** - the state daisyUI's
  // prefers-dark selector (`:root:not([data-theme])`) requires, so the OS
  // selection applies exactly as before the control existed. Reading a cookie
  // here makes nothing newly dynamic: every route already is, per
  // `frontend/src/app/CLAUDE.md`.
  const theme = themeAttribute(parseThemePref((await cookies()).get(THEME_COOKIE)?.value));

  return (
    // The font variables have to sit on <html>: that is where :root resolves,
    // and the --font-display / --font-sans theme tokens dereference them.
    <html
      lang="en"
      data-theme={theme}
      className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}
    >
      {/* bg-base-200 is the page canvas, one elevation below the bg-base-100
          cards and panels that sit on it - the same canvas-vs-card distinction
          the old token system drew, expressed through the theme. Text needs no
          class: Tailwind's preflight reads --font-sans (Inter) as the default
          family, and daisyUI's base sets the theme's colours. */}
      <body className="bg-base-200 flex min-h-full flex-col">{children}</body>
    </html>
  );
}
