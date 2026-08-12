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
    // <body> `flex min-h-full flex-col`, so this fills what is left. No h-screen.
    //
    // A column below `lg` and Figma's two-column split above it. The right half is
    // decoration and hides itself at that breakpoint - see DecorativePanel - so the
    // stacked case is the copy alone rather than art reflowed under it.
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* px-20 / pt-16 / pb-14 is the designed 80 / 64 / 56, kept from `lg` up and
          scaled down below it so the copy is not pinned to the viewport edge.

          justify-between over exactly three children is what Figma's auto-layout
          does, so the middle block sits in the leftover space rather than being
          truly centred in the column - the two coincide only when the header and
          footer are the same height, and here they are not. That is the design;
          do not swap it for justify-center plus margins. */}
      <main className="bg-base-100 flex flex-1 flex-col justify-between gap-12 px-6 py-10 sm:px-10 lg:px-20 lg:pt-16 lg:pb-14">
        <header>
          <LogoLockup />
        </header>

        <div className="flex flex-col gap-5">
          {/* The overline is utilities rather than a component: daisyUI draws no
              eyebrow, and `primary` is the one accent the theme publishes - the
              Figma file's Brand/Accent and Brand/Accent Pressed both land on it,
              so the distinction the token layer carried here is gone by design. */}
          <p className="text-primary text-xs font-semibold tracking-widest uppercase">
            PERSONAL FINANCE, SIMPLIFIED
          </p>

          {/* The screen's h1. There is no PageHeader out here, so the pitch is the
              one element that earns level 1 - the overline above is a <p> and the
              wordmark is too, matching PageHeader and ui/Sidebar respectively.

              max-w-115 is the designed 460px as a ceiling rather than a width, so
              the line breaks where Figma breaks it on a wide screen and wraps
              rather than overflowing on a narrow one. font-display is the heading
              face; the size steps down twice below `lg`.

              **This is the app's only three-breakpoint heading, so PET-79's x1.300
              pass takes three edits here rather than one - and the top of the ramp
              is the one place the scale runs out.** Crimson Pro's caps are 76.9%
              of Plus Jakarta Sans's, so every size moves up to keep its optical
              height: 36 -> 48 (target 46.8), 48 -> 60 (target 62.4), and 60 ->
              **72** against a target of 78.0, which is 6px short where the other
              two land within 2.4. `text-8xl` is 96px and overshoots by 18, so 72
              is the nearer of the two and the hero reads a touch smaller than
              exact parity at the widest breakpoint. Deliberate rather than
              overlooked: an arbitrary `text-[4.875rem]` would match the arithmetic
              and put a one-off off-scale value on the app's most prominent
              heading. */}
          <h1 className="font-display max-w-115 text-5xl font-bold sm:text-6xl lg:text-7xl">
            Take control of your money.
          </h1>

          {/* max-w-107.5 is the designed 430px, narrower than the heading so the
              copy breaks across three lines as drawn. */}
          <p className="text-base-content/70 max-w-107.5 text-lg">{INTRO}</p>

          {/* gap-4 with wrapping, so the two exits stack rather than shrink when the
              column is narrow. pt-8 is the 8px the row is offset by. */}
          <div className="flex flex-wrap items-center gap-4 pt-8">
            {/* Both exits are links, not buttons: they change the page location, so
                a <button> firing router.push() would force 'use client' onto this
                whole screen and break middle-click, copy-link and prefetch. That is
                why ui/Button takes an href.

                Both 404 until PET-9 and PET-12 build the screens behind them. The
                href is the contract WEL-2 and WEL-3 describe, and an inert control
                would fail both outright while hiding it. */}
            <Button label="Get started" href={ACCESS_ROUTES.setup} />

            {/* `link-hover` rather than `link`: no underline is drawn anywhere in
                the file, so the resting state stays the colour-only one Figma draws
                and daisyUI adds the underline on hover for free. A colour-only link
                is a WCAG 1.4.1 concern when it sits inline inside a paragraph; this
                one sits alone in a row beside a button, so 1.4.1 does not bite.

                The focus-visible outline is kept explicit, like every other
                interactive element here: no focus state is drawn, and a keyboard
                user needs one.

                **`outline-solid` is what makes that outline exist**, and it is the
                same daisyUI cascade trap `ui/Sidebar.tsx` records for its menu
                links. daisyUI's `.link:focus` sets `--tw-outline-style: none`, and
                Tailwind's `outline-2` emits `outline-style: var(--tw-outline-style)`
                - so `outline-2` alone computes to a 2px outline of style `none`,
                which paints nothing at all. `outline-solid` sets the variable back.
                Nothing in a build, a lint or a Jest run can see this; the class is
                present, the colour is right, and the ring is simply absent. */}
            <Link
              href={ACCESS_ROUTES.login}
              className="link link-hover link-primary font-semibold focus-visible:outline-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              I already have an account
            </Link>
          </div>
        </div>

        <footer>
          <p className="text-base-content/60 text-sm">Made for mindful spending.</p>
        </footer>
      </main>

      <DecorativePanel />
    </div>
  );
}
