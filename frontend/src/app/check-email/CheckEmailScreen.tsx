import { AccessCard } from '@/components/AccessCard';
import { Button } from '@/components/ui/Button';
import { ACCESS_ROUTES } from '@/lib/routes';

import type { ResendResult } from './actions';
import { ResendLink } from './ResendLink';

// 24 Check your email (node 134:1142), where both entry points end: "Finish setup" on
// 22 Register (REG-4) and "Log in" on 23 (LOG-3).
//
// **No step indicator, no overline and no "Back" control at all.** The first two are
// VER-1, like screen 23. The third is PET-11's amendment to VER-3, A37 and PET-12's
// own AC6: by the time this renders the account exists and the link is sent, so there
// is nowhere backwards to go - and a Back to Register would land on an empty card,
// since the draft is cleared on a successful register, inviting somebody who already
// has an account to re-type everything.
//
// **It takes `email` and `resend` as props rather than reading either itself**, and
// that is deliberate. `page.tsx` owns both, so nothing this component imports reaches
// `next/headers`, which means Storybook can render it and its test can mount it with
// no mocks and no request scope. That diverges from PET-11's precedent of a screen
// importing its own action, for a concrete reason: a story that pulls in a module
// touching `next/headers` throws in the browser with every CI gate green.

/** VER-1's copy, split at the address it interpolates. */
const SENT_PREFIX = "We've sent a secure login link to ";
const SENT_SUFFIX = '. Open the link on this device to access your account.';

/**
 * What the screen says when it cannot name the address (AC7).
 *
 * New copy, owing designer sign-off under A29 with the rest: A29 designs no fallback
 * at all, and the alternatives are worse. Leaving the slot empty produces "We've sent
 * a secure login link to . Open the link…", and rendering the placeholder literally is
 * the classic {email} bug. The address slot is dropped rather than filled with a
 * generic phrase, so the sentence is shorter but never wrong.
 *
 * This is reached when the cookie has expired, when the screen is opened in a second
 * browser, or when its value is not something the field could have produced. All three
 * are ordinary rather than exceptional, which is why it is real copy and not an error.
 */
const FALLBACK_COPY =
  "We've sent you a secure login link. Open the link on this device to access your account.";

type CheckEmailScreenProps = {
  /** The address submitted on 22 or 23, or `null` when there is none to name. */
  email: string | null;
  /** The resend server action. A prop so the story and the suite can pass a stub. */
  resend: () => Promise<ResendResult>;
};

export function CheckEmailScreen({ email, resend }: CheckEmailScreenProps) {
  return (
    <AccessCard>
      {/* gap-2 is the designed 8px from heading to copy (node 134:1149), and there is
          no overline above the heading on this frame either. */}
      <div className="flex flex-col gap-2">
        <h1 className="text-display-s text-text-primary">Check your email</h1>
        <p className="text-body-m text-text-secondary">
          {email === null ? (
            FALLBACK_COPY
          ) : (
            <>
              {SENT_PREFIX}
              {email}
              {SENT_SUFFIX}
            </>
          )}
        </p>
      </div>

      {email === null ? (
        // Nothing to resend, so the one control is a way onwards instead of a dead one.
        //
        // **This amends AC6's wording**, which asks for "Resend link" to be the only
        // action. A disabled Resend would satisfy that literally and leave a screen
        // with no Back, no working control and no exit - reachable by nothing worse
        // than a reload twenty minutes later - and a permanently disabled button
        // announces as "Resend link, dimmed" with no reason given. What AC6 defends is
        // that there is no way backwards into a form the user has already completed,
        // and that still holds: this goes forward to Log in, which is where somebody
        // whose link has gone stale belongs.
        <div className="flex items-center justify-end pt-1.5">
          <Button href={ACCESS_ROUTES.login} variant="secondary" label="Log in again" />
        </div>
      ) : (
        <ResendLink resend={resend} />
      )}
    </AccessCard>
  );
}
