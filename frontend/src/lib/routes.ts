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
 * The three onboarding steps are built. The other two 404 today, which is as far as
 * a frontend-only ticket reaches: the href is the contract, and an inert control
 * would fail its criterion outright while hiding that it had.
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
  /**
   * 22 Register (PET-11, REG-4). Onboarding step 3 of 3, and where the account is
   * finally created.
   *
   * Nested for the same reason as step 2: step 3's own "Back" has to return to the
   * categories with the selection intact (PET-11 AC5), which only holds while all
   * three steps share the one layout that holds the draft.
   */
  setupRegister: '/setup/register',
  /**
   * 23 Log in (PET-12, WEL-3, A2). The only route into the returning-user flow.
   *
   * LOG-5 designs exactly one way in, Welcome's "I already have an account", and
   * screen 24 links here when it has no address left to resend to. Deliberately not
   * gated on a session: a third call into `lib/session.ts`'s stubs would be a claim
   * nothing can test, which is the same call `/setup` makes.
   */
  login: '/login',
  /**
   * 24 Check your email (PET-12, REG-4, LOG-3). Where both entry points end.
   *
   * **Not** nested under `/setup`, unlike the three steps: LOG-3 reaches it from Log
   * in too, so it does not belong to onboarding and must not sit inside the draft
   * provider - by the time it renders, PET-11 has cleared the draft anyway.
   *
   * **Nothing about the address travels in this path**, and that is the point rather
   * than an omission. PET-11 pushed `?email=<encoded>` here, which put a user's email
   * address into Next's own request log and any proxy log upstream on every
   * registration; PET-12 replaced it with a short-lived httpOnly cookie
   * (`lib/pendingEmail.ts`) that this route reads with `cookies()`. So this key is the
   * whole URL, and a caller appending anything to it is reintroducing that leak.
   */
  checkEmail: '/check-email',
} as const;
