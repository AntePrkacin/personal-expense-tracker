'use client';

import { AccessCard } from '@/components/AccessCard';
import { Button } from '@/components/ui/Button';

// What every route in this app renders when a read throws (PET-21).
//
// **The failure policy in `lib/profile.ts`, `lib/transactions.ts`, `lib/categories.ts` and
// `lib/dashboard.ts` all named a boundary that did not exist.** Each of those four separates
// "not signed in" from "could not ask": only a 401 or a missing cookie redirects, and
// everything else throws, deliberately, so a reload retries rather than bouncing into the
// `/dashboard`-to-`/login` loop `frontend/src/app/CLAUDE.md` records. The sentence every one
// of them ends on is "so Next's error boundary renders something a reload retries" - and
// there was no `error.tsx` anywhere under `src/app`, so what a 500 actually rendered was
// Next's built-in "Application error: a server-side exception has occurred": no chrome, no
// wording of ours, and nothing to click. PET-21 is what forced the issue rather than what
// introduced it, because `/dashboard` is the route `/auth/verify` lands on after a login, so
// it is the first read whose failure a user meets before seeing the app at all.
//
// **One boundary at the root, not one per segment.** `app/error.tsx` wraps everything below
// the root layout, which includes `(app)/layout.tsx` itself - so a `requireProfile()` that
// throws lands here too, and that is the case a boundary inside the shell could not catch.
// The cost is that the sidebar goes with it: an error in a page replaces the shell instead of
// sitting inside it. Accepted, because the two-boundary alternative buys nicer chrome for one
// of the two failures and a second copy of this copy for the other. A `(app)/error.tsx` is a
// reasonable later addition once a screen has a failure worth staying in the shell for.
//
// **A screen with no Figma frame behind it, the second in the app.** A38's verify-failure
// screen is the first, and this borrows its answer rather than inventing one: the card is
// `AccessCard`, which reproduces frame 24 exactly, so a screen the designer never drew still
// looks like the flow it interrupts. Its two strings join what A29 owes a designer sign-off
// for; `docs/TODO.md` records them.
//
// Separate from `error.tsx` for the reason `WelcomeScreen` and `CheckEmailScreen` are separate
// from their pages: a Next boundary is a file with a fixed contract, and this is a component
// Storybook can render and a suite can mount with no boundary around it. Since a frameless
// screen's stories are the only review it gets, that split is what makes the copy reviewable
// at all.

/**
 * Hoisted the way `VerifyFailedScreen` hoists its four, so a test asserts one string rather
 * than a copy of it, and `react/no-unescaped-entities` never comes up.
 *
 * The body claims the least it can. The boundary catches every throw in the app - an
 * unreachable backend, a 500, a 400 from a hand-edited query string, a render fault - and
 * cannot tell them apart, so anything more specific would be wrong for most of them. What it
 * can honestly say is that retrying is worth doing, which is true of all four.
 */
const COPY = {
  heading: 'Something went wrong',
  body: 'We could not load this page. Try again, and if it keeps happening, come back in a few minutes.',
};

/**
 * `digest` is Next's own, and showing it is the whole reason it exists.
 *
 * A Server Component error is redacted before it reaches the browser - the message becomes a
 * generic string and only this hash survives, which is what ties the screen in front of a
 * user to the one line in the server log that says what actually broke. It is not personal
 * data and it identifies nothing on its own, the same call `/auth/verify/failed` makes about
 * its `?reason=`. Absent for an error thrown in a Client Component, so the line is omitted
 * rather than rendered empty.
 */
export function ErrorScreen({ digest, reset }: { digest?: string; reset: () => void }) {
  return (
    <AccessCard>
      {/* gap-2 is the designed 8px from heading to copy, and no overline above the heading,
          matching `VerifyFailedScreen` and frames 23 and 24 it takes that from. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold">{COPY.heading}</h1>
        <p className="text-base-content/70">{COPY.body}</p>
        {digest !== undefined && (
          <p className="text-base-content/50 text-xs">Reference: {digest}</p>
        )}
      </div>

      {/* justify-end, the one-control footer `LogInAgain` records the reasoning for:
          `justify-between` puts a lone child at the start.

          `reset()` re-renders the segment rather than reloading the document, so a retry
          costs one request instead of the whole bundle. It is the only control here on
          purpose - a link to /dashboard would be a second thing to try that fails the same
          way whenever the failure is the dashboard's own read. */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1.5">
        <Button label="Try again" onClick={reset} />
      </div>
    </AccessCard>
  );
}

export { COPY as ERROR_COPY };
