import { cookies } from 'next/headers';

import { readCategoriesView } from '@/lib/categories';
import { readPalette } from '@/lib/palette';
import { readPeriods } from '@/lib/periods';
import { requireProfile } from '@/lib/profile';
import { parseThemePref, THEME_COOKIE } from '@/lib/theme';

import { SettingsScreen } from './SettingsScreen';

/**
 * How long this page will wait for the period list before rendering without it.
 *
 * A bound rather than a policy change: `lib/periods.ts` still rejects on failure, and this page
 * still degrades, but a read that never settles is not a failure the `.catch` below can see.
 * `lib/palette.ts` carries its own for the same reason and names the same hazard.
 */
const PERIODS_TIMEOUT_MS = 3_000;

/** Resolves to `fallback` if the promise rejects, or if it has not settled in `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// 17 Settings (Figma node 40:630).
//
// **The fourth and last `<main>` to be filled**, as of PET-46, so no routed view in this shell
// renders an empty one any more.
//
// It reads through `requireProfile()`, which is the same call `(app)/layout.tsx` makes for the
// sidebar footer - deliberately, rather than threading the layout's copy down. A layout cannot pass
// props to the page it wraps in the App Router, and the alternatives are a context (a provider on
// all four routes to serve one screen) or a second read. The second read is the smaller of the two,
// and it is what makes the form's own diff baseline the *current* profile after a
// `router.refresh()` rather than whatever the shell happened to hold.
//
// **The cost that `docs/TODO.md` recorded is gone as of PET-47, and the reasoning above is not.**
// `requireProfile()` is wrapped in React's `cache()` now, so this call and the layout's are one
// `GET /api/profile` per render pass rather than two - the memo arrived because the pages needed
// the profile's currency to format money with, and this page is the caller that was already paying
// for it. Two things worth being precise about, because "cached profile" is the wrong summary.
// `cache()` memoizes within a single render pass only, so `router.refresh()` still re-reads and the
// diff baseline is still the current profile. And the layout and this page now provably agree,
// where before they were two reads that could straddle a concurrent write - which is a correctness
// gain on AC5's shared-initials rule rather than only a saved request.
//
// Its failure policy comes with the helper and is not restated here: a 401 redirects to Log in, and
// an unreachable backend throws to `app/error.tsx` rather than bouncing - the distinction that
// closed the `/dashboard` to `/login` loop.
//
// PET-46 ships the Profile card and the page-level "Save changes". The Preferences card is PET-47's
// and the Categories summary is **PET-48's** - which is worth correcting in place rather than
// leaving dated, because four other files in this repo made the same misattribution and a reader
// following it would go looking in the wrong ticket. Both drop into the same `<form>` in
// `SettingsForm`.
//
// **PET-48 makes this the second route in the app to read two guarded endpoints**, after
// `/transactions/categories`, and it copies that page's division of labour exactly: one read
// decides whether the session is alive and the other never does. See the failure policy below.

export default async function SettingsPage() {
  // Awaited before the categories read rather than beside it, matching
  // `transactions/categories/page.tsx`. It costs nothing: `requireProfile()` is wrapped in React's
  // `cache()`, so the shell's call and this one are one `GET /api/profile` per render pass - which
  // is also what makes the sequencing free rather than a `Promise.all` worth writing.
  const profile = await requireProfile();
  // The same cookie the root layout stamps `<html data-theme>` from, read again here so the
  // Theme control's checked state agrees with the server HTML at hydration. A layout cannot
  // pass props to the page it wraps - the identical constraint that makes this page re-read
  // the profile above - and `cookies()` is memoized within a render pass, so the second read
  // costs nothing.
  const themePref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);

  // **Three reads in parallel as of PET-48's Manage modal, and `transactions/categories/page.tsx`
  // is the shape being copied** - including its warning that "a third adds no latency" holds only
  // for a *fast* third. Both of the new ones are bounded for that reason: `readPalette` carries its
  // own timeout, and `readPeriods` is wrapped in one here, because a `Promise.all` renders at the
  // speed of its slowest entry and an endpoint that *hangs* rather than refusing would otherwise
  // hold the whole Settings page - the profile form included - for the lifetime of the socket, for
  // a dialog nobody opened. A review of this PR found that edge; the bound is the answer to it.
  const [categories, palette, periods] = await Promise.all([
    readCategoriesView(),
    readPalette(),
    // **Degraded rather than allowed to throw, which departs from `lib/periods.ts`'s own policy on
    // purpose** - but the consequence of the degrade is now *visible*, which is the half that was
    // missing. On `/transactions/categories` periods back a header select that is the screen's
    // content, so a failure there must throw. Here they back the cap-anchor question inside a
    // modal, and this route's rule is that `requireProfile()` is the only read with an opinion
    // about whether the session is alive.
    //
    // **An empty list no longer means "carry on without the question".** A review of this PR found
    // that `EditCategoryModal` falls through to an unanchored `send()` when it can find no current
    // period - so a cap raised from Settings during a periods outage silently re-priced the period
    // already in progress, which is the exact rewriting PET-72 exists to prevent. The list is still
    // degraded, and `SettingsScreen` now refuses to open the modal without it.
    withTimeout(
      readPeriods().then((view) => view.periods),
      PERIODS_TIMEOUT_MS,
      [],
    ),
  ]);

  // **Every failure degrades to `null`, a 401 included, and that last part is the load-bearing
  // half.** `requireProfile()` above is the read that decides whether the session is alive; two
  // opinions about that on one page is the shape the `/dashboard` to `/login` loop PET-52 had to
  // unpick came out of, and `transactions/categories/page.tsx` records the same rule for its own
  // palette read.
  //
  // **Degrading rather than throwing is the other half, and it is the opposite call that page
  // makes for its category list.** There, the response *is* the screen, so there is no reduced
  // version worth drawing. Here it is one sentence on the third of three cards: throwing would
  // replace a working, saveable profile form with an error page. `lib/palette.ts` is the precedent
  // - a failed secondary read is `null` and a degraded control, never an error boundary.
  return (
    <SettingsScreen
      profile={profile}
      themePref={themePref}
      // **One prop carrying the whole read, rather than three derived from it**, which a review of
      // this PR is the reason for. The card's figures and the modal's rows come from one response,
      // and passing them as `summary` / `categories` / `allocation` let a call site hand the two
      // halves data about different accounts - which the suite and the stories on this branch were
      // both doing, showing a card and a modal that disagreed with no gate objecting. Derived
      // inside `SettingsScreen` now, so they cannot diverge by construction instead of by prose.
      //
      // **`null` is the read having failed, and it is deliberately not an empty account.** The
      // first version passed `[]` and a zeroed allocation on failure, so pressing "Manage" during
      // an outage drew "Monthly budget $0" over "You have no categories to manage yet" - an outage
      // stated as a fact about the account, on an account with twelve categories. That is the
      // empty-state-that-lies failure this repo has already paid for three times.
      categories={categories.ok ? categories.data : null}
      palette={palette.ok ? palette.data : null}
      periods={periods}
    />
  );
}
