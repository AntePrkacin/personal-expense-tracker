import Link from 'next/link';

import { LogoLockup } from '@/components/LogoLockup';
import { Button } from '@/components/ui/Button';
import { ACCESS_ROUTES } from '@/lib/routes';

import { DecorativePanel } from './DecorativePanel';

// 01 Welcome (Figma node 41:696), the app's front door.
//
// The entry screen: pitch the product, then route a new visitor into setup and a
// returning one into log in (WEL-1 to WEL-4). It is the first of the six frames
// that sit outside the (app) shell and inherit none of it - no sidebar, no page
// header.
//
// It renders at `/`. app/page.tsx is the gate that decides between this and the
// Dashboard; this component is deliberately unaware of sessions, which is what
// lets Storybook render it and the test exercise it without mocking anything.
//
// Default state only. There are no inputs, so no validation and no error state,
// and the design draws no loading or filled variant.

/**
 * The intro copy, held here so the em dash is impossible to miss in a diff.
 *
 * **U+2014 EM DASH, exactly as Figma draws it.** Note that
 * docs/project-management/02-tech-spec-personal-expense-tracker.md quotes WEL-1
 * with a plain hyphen instead, because DECODE writing rules replace long dashes in
 * prose. So the shipped string and the spec's quoted string differ by one
 * character *by policy*, not by accident - do not "fix" either to match the other.
 * WelcomeScreen.test.tsx asserts this with a — escape so a substitution fails
 * loudly rather than reading as an identical-looking diff.
 */
const INTRO =
  'Track every expense, set budgets by category, and get AI insights that keep you ' +
  'on plan — all in one calm, focused space.';

export function WelcomeScreen() {
  return (
    // `flex flex-1` rather than a height of its own, the same call
    // app/(app)/layout.tsx makes: the root layout already gives <html> h-full and
    // <body> `flex min-h-full flex-col`, so this fills what is left and lays the
    // two columns out side by side. No h-screen.
    <div className="flex flex-1">
      {/* px-20 / pt-16 / pb-14 is the designed 80 / 64 / 56.

          justify-between over exactly three children is what Figma's auto-layout
          does, so the middle block sits in the leftover space rather than being
          truly centred in the column - the two coincide only when the header and
          footer are the same height, and here they are not. That is the design;
          do not swap it for justify-center plus margins. */}
      <main className="bg-surface-card flex flex-1 flex-col justify-between px-20 pt-16 pb-14">
        <header>
          <LogoLockup />
        </header>

        <div className="flex flex-col gap-5">
          {/* `brand-accent-pressed`, not `brand-accent`. That reads like a
              copy-paste slip and is not: it is which Figma variable the overline is
              bound to, and the two could diverge. ui/Tag carries the same note for
              its indigo tone. */}
          <p className="text-overline text-brand-accent-pressed">PERSONAL FINANCE, SIMPLIFIED</p>

          {/* The screen's h1. There is no PageHeader out here, so the pitch is the
              one element that earns level 1 - the overline above is a <p> and the
              wordmark is too, matching PageHeader and ui/Sidebar respectively.

              w-115 is the designed 460px. A spacing step rather than a `w-[460px]`
              literal because 460 is expressible on the scale, which is the same
              call `w-65` (260px) makes in ui/Sidebar; MonthPill's `h-[4.5px]`
              literal exists only because 4.5px is not. */}
          <h1 className="text-display-xl text-text-primary w-115">Take control of your money.</h1>

          {/* w-107.5 is the designed 430px, narrower than the heading so the copy
              breaks across three lines as drawn. */}
          <p className="text-body-l text-text-secondary w-107.5">{INTRO}</p>

          {/* gap-4.5 is the designed 18px, and pt-8 the 8px the row is offset by. */}
          <div className="flex items-center gap-4.5 pt-8">
            {/* Both exits are links, not buttons: they change the page location, so
                a <button> firing router.push() would force 'use client' onto this
                whole screen and break middle-click, copy-link and prefetch. That is
                why ui/Button takes an href.

                Both 404 until PET-9 and PET-12 build the screens behind them. The
                href is the contract WEL-2 and WEL-3 describe, and an inert control
                would fail both outright while hiding it. */}
            <Button label="Get started" href={ACCESS_ROUTES.setup} />

            {/* No hover:underline. No hover state is drawn anywhere in the file, and
                the repo only adds what accessibility demands. A colour-only link is
                a WCAG 1.4.1 concern when it sits inline inside a paragraph; this one
                sits alone in a row beside a button, so 1.4.1 does not bite. If the
                designer wants an underline that is their call.

                The focus-visible outline is ours, like every other interactive
                element here: no focus state is drawn, and a keyboard user needs one. */}
            <Link
              href={ACCESS_ROUTES.login}
              className="text-strong-m text-brand-accent focus-visible:outline-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              I already have an account
            </Link>
          </div>
        </div>

        <footer>
          <p className="text-caption text-text-tertiary">Made for mindful spending.</p>
        </footer>
      </main>

      <DecorativePanel />
    </div>
  );
}
