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
 * Where the access screens live.
 *
 * `/setup` is built. The other two 404 today, which is as far as a frontend-only
 * ticket reaches: the href is the contract, and an inert control would fail its
 * criterion outright while hiding that it had.
 *
 * **PET-9 settled the onboarding route shape**: three nested routes under one
 * layout, not one route rendering three steps from client state. All three
 * onboarding tickets carry an explicit "Back keeps my values" criterion (PET-9
 * AC5, PET-10 AC4, PET-11 AC5), so back-navigation is a first-class path here,
 * and the one-route design makes the browser's own Back button leave onboarding
 * and discard the draft. `/setup` did not have to move either way, which is why
 * PET-8 could point at it before the question was answered.
 *
 * `lib/routes.test.ts` asserts with `fs` that every built route has a `page.tsx`
 * behind it, the way SidebarNav.test.tsx does for the four app routes. It
 * classifies rather than filters, so adding a key here forces a decision about
 * which list it belongs in instead of silently escaping the check.
 */
export const ACCESS_ROUTES = {
  /** 02 Setup - Currency & budget (PET-9, WEL-2, A1). Onboarding step 1 of 3. */
  setup: '/setup',
  /**
   * 03 Setup - Starter categories (PET-10, CAT-4). Onboarding step 2 of 3.
   *
   * Nested under step 1's route rather than a sibling `/setup-categories`, which
   * is what puts it inside `app/setup/layout.tsx` and so inside the draft
   * provider. That nesting is the mechanism behind "Back keeps my values", not a
   * cosmetic choice about the URL.
   */
  setupCategories: '/setup/categories',
  /** 23 Log in (PET-12, WEL-3, A2). The only route into the returning-user flow. */
  login: '/login',
} as const;
