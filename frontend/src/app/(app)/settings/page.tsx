import { cookies } from 'next/headers';

import { readCategoriesView } from '@/lib/categories';
import { readPalette } from '@/lib/palette';
import { readPeriods } from '@/lib/periods';
import { requireProfile } from '@/lib/profile';
import { parseThemePref, THEME_COOKIE } from '@/lib/theme';

import { toCategoriesSummary } from './categoriesSummary';
import { SettingsScreen } from './SettingsScreen';

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
  // for a *fast* third, which is why `readPalette` carries its own timeout and the two beside it
  // deliberately do not.
  const [categories, palette, periods] = await Promise.all([
    readCategoriesView(),
    readPalette(),
    // **Degraded to `[]` rather than allowed to throw, which departs from `lib/periods.ts`'s own
    // policy on purpose.** There, periods back a header select that *is* the screen's content, so a
    // failure that rendered a period-less header over period-scoped figures would be a screen that
    // lies. Here they back one question inside a modal nobody has opened, and this route's rule -
    // set by the summary card - is that `requireProfile()` is the only read with an opinion about
    // whether the session is alive. It is safe rather than merely convenient: `EditCategoryModal`
    // already guards an absent current period and falls back to sending the cap with no anchor,
    // which its own comment calls "the honest fallback".
    readPeriods()
      .then((view) => view.periods)
      .catch(() => []),
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
  const summary = categories.ok
    ? toCategoriesSummary(categories.data.categories, categories.data.allocation)
    : null;

  return (
    <SettingsScreen
      profile={profile}
      summary={summary}
      themePref={themePref}
      // **The modal's rows come from the same response the summary above was reduced from**, so the
      // card's sentence and the list behind its button cannot disagree about one account. An empty
      // list is what a degraded read leaves, and the modal draws its empty state from it - a
      // different fact from `summary: null`, which is the read having failed.
      categories={categories.ok ? categories.data.categories : []}
      allocation={
        categories.ok
          ? categories.data.allocation
          : { monthlyBudget: 0, allocated: 0, unallocated: 0 }
      }
      palette={palette.ok ? palette.data : null}
      periods={periods}
    />
  );
}
