import type { MetadataRoute } from 'next';

import { THEME_COLOUR } from '@/lib/theme';

// The installable shell, and deliberately only half of PWA (PET-79). Next 16's own
// `MetadataRoute.Manifest` convention, so this file *is* `/manifest.webmanifest` and no `<link>`
// tag is written anywhere.
//
// **The manifest, the icon set and the chrome colour are in; the service worker, offline support
// and the install prompt are not.** The product owner's split, and the line is drawn where the work
// overlaps: the icons come from artwork this ticket already trimmed, `app/icon.svg` is already
// being replaced here, and `layout.tsx` already exported a `viewport` - so doing this later means
// touching the same three files twice.
//
// **Why the rest is deferred rather than squeezed in**, recorded so the next person does not read
// it as an oversight. **Every route in this app is dynamic** and not one carries
// `export const dynamic`, because the cookie read opts each one out - so there is no prerendered
// shell to serve offline, and an offline experience would have to be authored from nothing.
// Caching per-user financial data in the Cache API is a security decision (a shared machine, a
// cache outliving a logout) rather than a build step. And **the passwordless flow collides with an
// installed app**: the emailed login link opens the default browser rather than the installed PWA,
// so the session cookie lands in the browser's jar and the installed app stays signed out. That
// needs a decision of its own, and it is not a theming one.
//
// **Installability is not claimed here.** Chrome has historically required a registered service
// worker with a fetch handler before offering an install prompt, and that criterion has moved
// between versions - so this ships `display: standalone` and a correct icon set, and the browser
// walk *reports* whether a prompt appears rather than this file asserting it will.
//
// **`theme_color` is one static value and cannot follow the picker**, which is a fact about the
// platform rather than a gap: a manifest carries one colour and `<meta name="theme-color">` varies
// only by media query, never by a cookie-driven `data-theme`. So this stays the brand constant -
// the light Expensa card, which is the app's `:root` default - while `layout.tsx` renders a
// `prefers-color-scheme` pair and `settings/ThemeField.tsx` overwrites the tag on an explicit pick.
// Read the three together; none of them is sufficient alone.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Spendifico',
    // Eleven characters, so it survives a launcher label without being truncated. The design file
    // still says "Expensa" and `docs/TODO.md` records the divergence; nothing here reverts to it.
    short_name: 'Spendifico',
    description: 'Track what you spend, see where it goes, and stay on budget.',
    // `/` rather than `/dashboard`: that route is behind the session gate, and `app/page.tsx` is
    // the one place that decides which door a visitor gets - so launching the installed app runs
    // the same branch a cold visit does instead of bouncing off a gate.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOUR['expensa-light'],
    theme_color: THEME_COLOUR['expensa-light'],
    icons: [
      // `any` and `maskable` are declared as separate entries rather than one `purpose: 'any
      // maskable'`, because a single file cannot satisfy both: the safe zone forces the maskable
      // variant to inset its tile on a filled ground, and using that padded artwork as the
      // ordinary icon would ship a permanently undersized mark.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
