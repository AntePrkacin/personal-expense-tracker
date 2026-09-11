import { AccessCard } from '@/components/AccessCard';
import { Button } from '@/components/ui/Button';
import { ACCESS_ROUTES } from '@/lib/routes';

import type { DemoFailureReason } from '../reason';

// What a demo link that did not hand out an account says (PET-86).
//
// **The second screen in this app with no Figma frame behind it**, after
// `VerifyFailedScreen`, and for a broader reason: no frame draws a demo entry point at
// all, so the whole flow is invented. Every string below is ours and owes designer
// sign-off under A29, alongside the five from PET-11, the five from PET-12 and the four
// next door.
//
// It is not invented from nothing, though. The card is `AccessCard`, which reproduces
// frame 24 exactly, and the control is the pair the access screens already draw - so a
// screen the designer never drew still looks like the ones on either side of it.
//
// **It takes `reason` as a prop rather than reading the query itself**, the precedent
// screens 24 and the verify failure both set: `page.tsx` owns every server-only import,
// so nothing this module pulls in reaches `next/headers` and Storybook renders it with
// no mocks.

/**
 * One heading and one line per reason.
 *
 * Three rather than one apology, because only one of these is really an apology.
 *
 * `busy` is the ordinary case and the whole reason the pool is bounded: every account is
 * with somebody else right now and waiting genuinely works, so its copy promises that
 * rather than suggesting anything is broken. `disabled` is a deployment that never had a
 * demo, where waiting will never help and saying "try again" would be a lie. `failed`
 * claims the least of the three, because it covers a backend that did not answer at all.
 *
 * Straight apostrophes, following the spec and every other string in the repo rather
 * than Figma's curly ones. Hoisted into a const the way the neighbouring screens do,
 * which keeps each test asserting one string and sidesteps
 * `react/no-unescaped-entities`.
 */
const COPY: Record<DemoFailureReason, { heading: string; body: string }> = {
  busy: {
    heading: 'The demo is busy right now',
    body: 'Every demo account is in use. They free up a few minutes after someone stops, so please try again shortly.',
  },
  disabled: {
    heading: 'The demo is not available here',
    body: 'This deployment has no demo accounts set up. You can still create your own account in a moment.',
  },
  failed: {
    heading: "We couldn't start the demo",
    body: 'Something went wrong on our end. Please try again.',
  },
};

export function DemoUnavailableScreen({ reason }: { reason: DemoFailureReason }) {
  const { heading, body } = COPY[reason];

  return (
    <AccessCard>
      {/* gap-2 is the designed 8px from heading to copy, and there is no overline above
          the heading for the same reason frames 23 and 24 have none. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{heading}</h1>
        <p className="text-base-content/70">{body}</p>
      </div>

      {/* **Deliberately not a "try again" button**, even for `busy` where retrying is
          exactly the advice. A control here would point back at `/demo`, and that is a
          GET with side effects - so a visitor tapping it repeatedly would lease and
          rewrite accounts as fast as the throttler allowed, which is the behaviour this
          screen exists downstream of. The copy says to try again and the browser's own
          reload is how, which costs the visitor nothing and hands them no trigger.

          Forward to setup instead, because somebody who wanted to see the app and could
          not is a visitor worth offering the real thing to. */}
      <Button label="Create an account" href={ACCESS_ROUTES.setup} />
    </AccessCard>
  );
}
