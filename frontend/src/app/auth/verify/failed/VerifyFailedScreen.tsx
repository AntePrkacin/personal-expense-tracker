import { AccessCard } from '@/components/AccessCard';
import { LogInAgain } from '@/components/LogInAgain';
import { ResendLink } from '@/components/ResendLink';
import type { ResendResult } from '@/lib/resend';

import type { VerifyFailureReason } from './reason';

// What a login link that did not work says (A38, VER-5).
//
// **The one screen in this app with no Figma frame behind it.** The Screens page holds
// exactly 24 frames and none of them is this: VER-4 and A33 record that "the
// link-opening step has no frame of its own", and A38 says outright that nothing is
// designed for an expired, already-used or wrong-device link - only that they should be
// handled "with plain messages and a way to request a new link". Every string below is
// therefore ours and owes designer sign-off under A29, alongside PET-11's five and
// PET-12's five.
//
// What it is not is invented from nothing. The card is `AccessCard`, which reproduces
// frame 24 (node `134:1142`) exactly, and the control is the pair `/check-email` already
// draws - so a screen the designer never drew still looks like the two on either side of
// it.
//
// **It takes `reason` and `resend` as props rather than reading either itself**, the
// precedent screen 24 set: `page.tsx` owns every server-only import, so nothing this
// module pulls in reaches `next/headers` and Storybook can render it with no mocks and
// no request scope.

/**
 * One heading and one line per reason.
 *
 * Four rather than one generic apology, because the advice genuinely differs. A replaced
 * link means open the newest email; a throttled one means wait, and telling that user to
 * "try again" would be actively wrong; a fault means retry *this* link, which unlike the
 * other two is probably still live. Collapsing them would make three of the four
 * misleading.
 *
 * `superseded` is the copy the backend built its 409 for. `docs/TODO.md` records why it
 * is ordinary rather than exotic: Gmail collapses these emails into one thread, because
 * every message has an identical sender and subject, so the user opens a conversation
 * holding several indistinguishable links of which exactly one works.
 *
 * Straight apostrophes, following the spec and every other string in the repo rather
 * than Figma's curly ones. Hoisted into a const the way `SetupRegisterScreen` does its
 * copy, which keeps each test asserting one string and sidesteps
 * `react/no-unescaped-entities`.
 */
const COPY: Record<VerifyFailureReason, { heading: string; body: string }> = {
  invalid: {
    heading: 'This link no longer works',
    body: 'Login links can only be used once and expire after a short time. Send yourself a new one.',
  },
  superseded: {
    heading: 'A newer link was sent',
    body: 'This link was replaced when a newer one was requested. Open the most recent email to sign in.',
  },
  busy: {
    heading: 'Too many attempts',
    body: 'Please wait a few minutes and then request a new link.',
  },
  failed: {
    heading: "We couldn't sign you in",
    body: 'Something went wrong on our end. Please try again.',
  },
};

/**
 * The reason, and only if there is an address to resend to, the action that resends.
 *
 * An **exclusive union**, the same `never` technique `ui/Button` uses for `href` versus
 * `onClick` and `CheckEmailScreen` uses for its own address: there is nothing to resend
 * to without an address, so `resend` is required alongside one and rejected without one,
 * and `npm run build` is what enforces it.
 *
 * `hasAddress` rather than the address itself, because this screen never shows it. Screen
 * 24 interpolates the address into VER-1's copy and therefore needs the string; here it
 * would be a detail nobody asked about on a screen already delivering bad news, and not
 * taking it means the address cannot leak into this markup by accident.
 */
type VerifyFailedScreenProps =
  | { reason: VerifyFailureReason; hasAddress: true; resend: () => Promise<ResendResult> }
  | { reason: VerifyFailureReason; hasAddress: false; resend?: never };

export function VerifyFailedScreen({ reason, hasAddress, resend }: VerifyFailedScreenProps) {
  const { heading, body } = COPY[reason];

  return (
    <AccessCard>
      {/* gap-2 is the designed 8px from heading to copy, and there is no overline above
          the heading here for the same reason frames 23 and 24 have none. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">{heading}</h1>
        <p className="text-base-content/70">{body}</p>
      </div>

      {/* "A way to request a new link" is A38's own wording, and this is literally the
          control that does it. With no address there is nothing to resend to, so the one
          action goes forward to Log in instead - the same pair, and the same reasoning,
          that `CheckEmailScreen` already carries. */}
      {hasAddress ? <ResendLink resend={resend} /> : <LogInAgain />}
    </AccessCard>
  );
}
