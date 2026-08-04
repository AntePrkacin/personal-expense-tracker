// Where the access screens live: the six frames outside the (app) shell (01, 02,
// 03, 22, 23, 24).
//
// These paths have no Figma counterpart - the file draws screens, not URLs - so
// they are a contract between the screen that links out, the route folder that
// answers, and the tests for both. Declaring them once here is the same call
// SIDEBAR_HREFS makes in components/ui/Sidebar.tsx, and for the same reason: those
// four hrefs existed as four hand-written copies, each asserting itself against
// itself, so nothing could notice a divergence.
//
// **The four app routes are NOT here.** They stay in SIDEBAR_HREFS, where the
// sidebar that renders them is. Restating either set in the other file recreates
// exactly the problem both exist to prevent.
//
// Welcome itself is deliberately absent: it is served at `/`, so there is no path
// to declare. app/page.tsx is the one place that fact lives.

/**
 * The two destinations 01 Welcome links out to.
 *
 * Both 404 today - PET-9 and PET-12 own the screens behind them - which is as far
 * as a frontend-only ticket reaches: the href is the contract, and an inert
 * control would fail WEL-2 and WEL-3 outright while hiding it.
 *
 * `/setup` is chosen so it is correct however PET-9 shapes onboarding. If the
 * three steps share one route it is that route; if each gets its own it is step
 * one's. Either way this string does not move. See "The onboarding route shape"
 * in docs/TODO.md for the trade-off, which is PET-9's to settle.
 *
 * TODO(PET-9, PET-12): once those `page.tsx` files exist, assert with `fs` that
 * every value here has a route folder behind it, the way SidebarNav.test.tsx does.
 * That check cannot be written yet, and asserting the absence would be a test
 * somebody has to delete.
 */
export const ACCESS_ROUTES = {
  /** 02 Setup - Currency & budget (PET-9, WEL-2, A1). */
  setup: '/setup',
  /** 23 Log in (PET-12, WEL-3, A2). The only route into the returning-user flow. */
  login: '/login',
} as const;
