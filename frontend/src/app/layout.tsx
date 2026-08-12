import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { parseThemePref, THEME_COLOUR, THEME_COOKIE, themeAttribute } from '@/lib/theme';
import { crimsonPro, inter } from './fonts';

// "Spendifico", the name decided on 2026-08-02 and now carried everywhere in
// the repo. The Figma file is the one holdout and still says "Expensa"
// throughout; see "The Figma file still says Expensa" in docs/TODO.md.
export const metadata: Metadata = {
  title: 'Spendifico',
  description: 'Track what you spend, see where it goes, and stay on budget.',
};

// Light and dark both ship: the Expensa pair as of PET-74, selected
// automatically from the OS unless the Settings Theme control has pinned one -
// and four more themes as of PET-79. Declaring both here keeps UA widgets (form
// controls, scrollbars) in step in the automatic case; a pinned theme's own
// `color-scheme` declaration wins on the element, so this stays the pair
// whichever way the choice goes.
//
// `themeColor` is the browser chrome, and it takes **two mechanisms rather than
// one**, because a tag can vary by media query and a theme is chosen by cookie.
// This is the load half: read the same cookie the layout reads, and emit one
// colour for an explicit pick or the `prefers-color-scheme` pair for Automatic.
// `settings/ThemeField.tsx` is the change half, overwriting both tags on a pick
// and restoring the pair for Automatic by reading each tag's own `media` -
// necessary because a client-side change re-renders no Server Component.
//
// **An earlier version of this file was a static pair and claimed the tag
// "cannot follow a cookie-driven `data-theme`", which a code review of PET-79
// disproved.** It can, on the server, which is what this function is. What the
// static version shipped was the failure its own comment warned about, arrived
// at from the other end: correct on a theme *change* and stale on every load
// after it, plus wrong on every route where the control is not even mounted - a
// cookie of `abyss` rendering `data-theme="abyss"` over a tag still saying
// `#ffffff`. `generateViewport` replaces the `viewport` export rather than
// joining it; Next permits only one of the two.
//
// The values are each theme's own `base-100`, read from `lib/theme.ts` so
// nothing here restates a hex. `colorScheme` stays the pair in both arms: a
// pinned theme's own `color-scheme` declaration wins on the element, so
// narrowing it here would state the same fact twice and less reliably.
export async function generateViewport(): Promise<Viewport> {
  const pref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
  const pinned = themeAttribute(pref);

  return {
    colorScheme: 'light dark',
    themeColor: pinned
      ? THEME_COLOUR[pinned]
      : [
          { media: '(prefers-color-scheme: light)', color: THEME_COLOUR['expensa-light'] },
          { media: '(prefers-color-scheme: dark)', color: THEME_COLOUR['expensa-dark'] },
        ],
  };
}

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
      className={`${crimsonPro.variable} ${inter.variable} h-full antialiased`}
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
