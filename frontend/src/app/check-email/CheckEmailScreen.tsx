import { AccessCard } from '@/components/AccessCard';
import { LogInAgain } from '@/components/LogInAgain';
import { ResendLink } from '@/components/ResendLink';
import type { ResendResult } from '@/lib/resend';

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

/**
 * The address and, only if there is one, the action that resends to it.
 *
 * An **exclusive union**, the same `never` technique `ui/Button` uses for `href` versus
 * `onClick` and for the same reason: it makes the combination that means nothing
 * unrepresentable rather than merely unused. There is nothing to resend to without an
 * address, so `resend` is required alongside one and rejected without one, and
 * `npm run build` is what enforces it. The alternative - one required prop the null
 * branch quietly ignores - type-checks a call that cannot do anything with what it was
 * handed.
 *
 * The cost is that `page.tsx` narrows before rendering rather than spreading one object.
 */
type CheckEmailScreenProps =
  | {
      /** The address submitted on 22 or 23. */
      email: string;
      /** The resend server action. A prop so the story and the suite can pass a stub. */
      resend: () => Promise<ResendResult>;
    }
  | { email: null; resend?: never };

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

      {/* Nothing to resend, so the one control is a way onwards instead of a dead one.
          `LogInAgain` records why that amends AC6's wording, and `ResendLink` renders
          the same control if the address expires while this screen is open - the two
          states are one, reached at render time or after a click. */}
      {email === null ? <LogInAgain /> : <ResendLink resend={resend} />}
    </AccessCard>
  );
}
