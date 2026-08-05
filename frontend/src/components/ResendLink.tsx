'use client';

import { useState, useTransition } from 'react';

import { LogInAgain } from '@/components/LogInAgain';
import { Button } from '@/components/ui/Button';
import type { ResendResult } from '@/lib/resend';

// "Resend link" (VER-2), the only action screen 24 has (AC6), and the recovery A38 asks
// for on PET-52's verify failure screen.
//
// **The design draws no states for it at all** - A36 says outright that no cooldown,
// counter or success confirmation exists - so the ones below are ours, and they are the
// seventh and eighth details with no Figma counterpart. Without them a click has no
// observable effect whatsoever: the request goes out, nothing on screen changes, and a
// user with no way to tell whether it worked clicks again until the backend's
// five-per-address limiter answers 429, which would also render as nothing.
//
// **No client-side cooldown**, which A36 does mention. The backend's per-address
// throttler is the real limit and a timer here would be a second, weaker authority
// that a reload defeats. What replaces it is honesty about the outcome: a 429 gets its
// own line telling the user to wait, rather than the generic failure claiming the send
// broke.
//
// **In `components/` rather than beside a route**, for the reason `LogInAgain` records:
// PET-52 gave it a second screen, and a shared control belongs beside `AccessCard`. It
// is still the whole client boundary on both screens - everything else renders on the
// server, which is what keeps the address out of client-side JavaScript.

/** All four owing designer sign-off under A29, alongside PET-11's five and Log in's three. */
const MESSAGES = {
  sent: 'A new link is on its way.',
  failed: "We couldn't send a new link. Please try again.",
  throttled: 'Too many requests. Please wait a few minutes and try again.',
  expired: 'This page has been open too long to resend.',
} as const;

type Outcome = keyof typeof MESSAGES;

/**
 * The message's treatment per outcome.
 *
 * A `Record` of complete literal class strings, per the rule every variant map in the
 * repo follows: Tailwind's scanner reads this file as raw text, so a class assembled
 * by interpolation is found by nobody and compiles to nothing, with no build error and
 * no failing test. `components/ui/utilities.test.ts` compiles these.
 *
 * `failed` and `throttled` share a treatment on purpose - both are failures, and the
 * difference between them is what the sentence says, not how it looks. `sent` and
 * `expired` share the quieter one, because neither reports a fault: nothing broke when
 * a cookie reached its own expiry, and the control below the line is the fix. The
 * success line is `text-text-secondary` rather than a green, because `status-success`
 * means an over-or-under-budget condition in this design system, and reaching for the
 * hue because it reads as "good" would say something the interface did not intend.
 */
export const RESEND_MESSAGE: Record<Outcome, string> = {
  sent: 'text-body-s text-text-secondary text-right',
  failed: 'text-body-s text-status-danger-text text-right',
  throttled: 'text-body-s text-status-danger-text text-right',
  expired: 'text-body-s text-text-secondary text-right',
};

export function ResendLink({ resend }: { resend: () => Promise<ResendResult> }) {
  // useTransition rather than a `pending` useState pair, because the call is a Server
  // Action: the transition is what keeps React's own pending accounting and this
  // button's disabled state describing the same thing.
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);

  function onClick() {
    // Clear the previous outcome first, so a second click does not leave the last
    // result sitting under a button that is working again.
    setOutcome(undefined);

    startTransition(async () => {
      const result = await resend();

      if (result.ok) {
        setOutcome('sent');
        return;
      }

      if (result.reason === 'expired') {
        setOutcome('expired');
        return;
      }

      // 429 is the one status worth distinguishing, because it is the only failure the
      // user can act on - and it is reachable precisely because A36 designs no
      // cooldown to prevent it.
      setOutcome(result.status === 429 ? 'throttled' : 'failed');
    });
  }

  // Nothing left to resend, so the control becomes the one that does work rather than
  // a button that will fail identically forever. Reached by waiting rather than by
  // doing anything wrong: the address cookie expires after fifteen minutes and this is
  // the screen a user leaves open while watching for mail.
  //
  // One accepted consequence, recorded rather than worked around: the button the user
  // just pressed unmounts, so keyboard focus falls back to the document. The message
  // carries `role="alert"` partly for that reason - it announces what replaced the
  // control. Moving focus to the link would need focus management this repo has no
  // pattern for yet; docs/TODO.md records it.
  const expired = outcome === 'expired';

  return (
    // The message sits above the control rather than beside it: the footer row is a
    // fixed 49px on the frame with its control flush right, and a sibling line would
    // either squeeze it or push it off the designed position.
    <div className="flex flex-col gap-3">
      {/* `alert` for anything that is not a success, and `status` for the success:
          the difference between assertive and polite. A failed send interrupts because
          the user has to act on it, and so does an expiry, because the control they
          were using has just been replaced. "A new link is on its way" is exactly the
          kind of confirmation that should wait for a pause in speech. `ui/Field` omits
          both, for the reason PET-11 records - its message appears synchronously beside
          the field the user just left, where these follow a network round trip with
          nothing else on screen changing. */}
      {outcome ? (
        <p role={outcome === 'sent' ? 'status' : 'alert'} className={RESEND_MESSAGE[outcome]}>
          {MESSAGES[outcome]}
        </p>
      ) : null}

      {expired ? (
        <LogInAgain />
      ) : (
        <div className="flex items-center justify-end pt-1.5">
          <Button
            type="button"
            variant="secondary"
            label="Resend link"
            onClick={onClick}
            disabled={pending}
          />
        </div>
      )}
    </div>
  );
}
