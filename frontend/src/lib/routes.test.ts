import fs from 'node:fs';
import path from 'node:path';

import { ACCESS_ROUTES } from './routes';

// The `fs` half of the access-route contract, which routes.ts asked for in a TODO
// until PET-9 built the first route behind it.
//
// The same gap SidebarNav.test.tsx closes for the four app routes: a route only
// exists if there is a directory with a page.tsx in it, and renaming one is
// invisible to every other assertion in the suite - the link 404s with everything
// green.
//
// What makes it writable now is that one route is built and two are not, so the
// check has to *classify* rather than iterate. A blanket sweep over
// Object.values(ACCESS_ROUTES) would fail on /login, and asserting that /login is
// absent would be a test somebody has to delete the moment PET-12 lands.

type RouteKey = keyof typeof ACCESS_ROUTES;

/** Routes with a page behind them today. */
const BUILT = ['setup', 'setupCategories'] as const satisfies readonly RouteKey[];

/** Routes declared for a screen nobody has built yet. */
const PENDING = ['setupRegister', 'login'] as const satisfies readonly RouteKey[];

describe('ACCESS_ROUTES', () => {
  it('classifies every declared route as built or pending', () => {
    // The assertion that keeps the two lists honest. Adding a route to routes.ts
    // now fails here until somebody says which list it belongs in, so a new
    // route cannot quietly escape the page.tsx check below by not appearing in
    // either. This is the case that makes PET-10 and PET-12 *move* a key rather
    // than delete a test.
    expect([...BUILT, ...PENDING].sort()).toEqual(Object.keys(ACCESS_ROUTES).sort());
  });

  it.each(BUILT)('%s has a page.tsx behind it', (key) => {
    // __dirname is src/lib, and every href starts with a slash, so this resolves
    // to the route segment under src/app.
    const page = path.join(__dirname, '..', 'app', ACCESS_ROUTES[key], 'page.tsx');

    expect(fs.existsSync(page)).toBe(true);
  });

  it.each(['setupCategories', 'setupRegister'] as const)(
    'nests onboarding %s under step 1s route',
    (key) => {
      // The structural claim behind PET-9's route-shape decision, and the one thing
      // a page.tsx check cannot make: steps 2 and 3 have to be *children* of /setup
      // for the draft provider in app/setup/layout.tsx to stay mounted across the
      // move. Flatten either to /setup-categories and "Back keeps my values" breaks
      // while every route still resolves.
      expect(ACCESS_ROUTES[key].startsWith(`${ACCESS_ROUTES.setup}/`)).toBe(true);
    },
  );

  it('gives every route an absolute path', () => {
    // A relative href resolves against whatever screen rendered it, so "/setup"
    // from a step-2 page would land on /setup/categories/setup.
    for (const href of Object.values(ACCESS_ROUTES)) {
      expect(href.startsWith('/')).toBe(true);
    }
  });
});
