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
// It classifies rather than iterates, and **the structure stays even though PENDING is
// now empty.** Every access route is built as of PET-12, so a blanket sweep over
// Object.values(ACCESS_ROUTES) would pass today - and would then quietly accept the
// next declared-but-unbuilt route, which is exactly the state /login and /check-email
// were in for four tickets. Keeping both lists means adding a route still forces a
// decision about which one it belongs in.

type RouteKey = keyof typeof ACCESS_ROUTES;

/** Routes with a `page.tsx` behind them. */
const BUILT = [
  'setup',
  'setupCategories',
  'setupRegister',
  'login',
  'checkEmail',
  'verifyFailed',
] as const satisfies readonly RouteKey[];

/**
 * Routes answered by a `route.ts` instead, which PET-52 made a third case.
 *
 * A separate list rather than an exemption from `BUILT`, on the same reasoning that
 * keeps `PENDING`: the check is only worth having if a new key cannot escape it, and
 * "this one has a different filename" is exactly the sort of exception that quietly
 * becomes "this one is unchecked". `/auth/verify` is a handler because the browser
 * navigates to it from an email, and a Server Component could not write the session
 * cookie it exists to set.
 *
 * This one matters more than the others rather than less. Its path is chosen by
 * `backend/src/mail/login-link.template.ts`, so a rename here points every login email
 * in production at a 404 with no other gate failing.
 */
const HANDLERS = ['verify'] as const satisfies readonly RouteKey[];

/**
 * Routes declared for a screen nobody has built yet.
 *
 * Empty, and deliberately kept: PET-10, PET-11 and PET-12 each *moved* a key out of
 * here rather than deleting a test, and the next declared route needs somewhere to go.
 * Note nothing iterates it - `it.each([])` is an error in Jest - so it appears only in
 * the classification assertion below, which is where it does its work.
 */
const PENDING = [] as const satisfies readonly RouteKey[];

/**
 * Every onboarding step after the first, derived rather than listed.
 *
 * A hand-written list would have to be edited for a step this file has not seen,
 * which is the opposite of what the assertion using it is for. `setup` itself is
 * excluded because it is the parent rather than a child of one.
 */
const NESTED_SETUP_KEYS = (Object.keys(ACCESS_ROUTES) as RouteKey[]).filter(
  (key) => key !== 'setup' && ACCESS_ROUTES[key].startsWith(ACCESS_ROUTES.setup),
);

describe('ACCESS_ROUTES', () => {
  it('classifies every declared route as built, handled or pending', () => {
    // The assertion that keeps the lists honest. Adding a route to routes.ts
    // now fails here until somebody says which list it belongs in, so a new
    // route cannot quietly escape the file checks below by not appearing in
    // any. This is the case that made PET-10, PET-11 and PET-12 each *move* a
    // key rather than delete a test.
    expect([...BUILT, ...HANDLERS, ...PENDING].sort()).toEqual(Object.keys(ACCESS_ROUTES).sort());
  });

  it.each(BUILT)('%s has a page.tsx behind it', (key) => {
    // __dirname is src/lib, and every href starts with a slash, so this resolves
    // to the route segment under src/app.
    const page = path.join(__dirname, '..', 'app', ACCESS_ROUTES[key], 'page.tsx');

    expect(fs.existsSync(page)).toBe(true);
  });

  it.each(HANDLERS)('%s has a route.ts behind it', (key) => {
    // The same fs check with the other filename. A `page.tsx` here would compile, serve
    // a screen, and never set the session cookie the whole route exists for.
    const handler = path.join(__dirname, '..', 'app', ACCESS_ROUTES[key], 'route.ts');

    expect(fs.existsSync(handler)).toBe(true);
  });

  it('answers the path the login email actually points at', () => {
    // The one route in this file whose URL is not ours: it is built in
    // `backend/src/mail/login-link.template.ts` as `${FRONTEND_URL}/auth/verify?token=`.
    // Nothing can check the two repos agree, so this pins our half of it - a rename here
    // would otherwise 404 every login email in production with every gate green.
    expect(ACCESS_ROUTES.verify).toBe('/auth/verify');
  });

  it('gives every route an absolute path', () => {
    // A relative href resolves against whatever screen rendered it, so "/setup"
    // from a step-2 page would land on /setup/categories/setup.
    for (const href of Object.values(ACCESS_ROUTES)) {
      expect(href.startsWith('/')).toBe(true);
    }
  });
});

describe('the onboarding route shape', () => {
  it('finds the nested steps to check', () => {
    // Guards the it.each below: an empty list iterates nothing and passes.
    expect(NESTED_SETUP_KEYS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(NESTED_SETUP_KEYS)('nests %s under step 1s route', (key) => {
    // The structural claim behind PET-9's route-shape decision, and the one thing a
    // page.tsx check cannot make: every step after the first has to be a *child* of
    // /setup for the draft provider in app/setup/layout.tsx to stay mounted across
    // the move. Flatten one to /setup-categories and "Back keeps my values" breaks
    // while every route still resolves.
    //
    // The trailing slash is what makes this stricter than the filter that built the
    // list: `/setup-categories` starts with `/setup` but is a sibling, not a child.
    expect(ACCESS_ROUTES[key].startsWith(`${ACCESS_ROUTES.setup}/`)).toBe(true);
  });
});
