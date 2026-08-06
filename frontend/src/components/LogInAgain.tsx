import { Button } from '@/components/ui/Button';
import { ACCESS_ROUTES } from '@/lib/routes';

// The access flow's recovery control, for every state where there is no live address to
// resend to: screen 24 rendered without one, the cookie expiring while it was open, and
// PET-52's verify failure screen when the same cookie has gone.
//
// One component rather than the same three lines in three files, which is the rule
// `ui/Button` states about its own base classes - a second copy of a control's markup is
// one that can drift from the first. It is a Server Component with no state, so the
// client boundary in `ResendLink` can render it as happily as a screen can.
//
// **In `components/` rather than beside a route**, beside `LogoLockup` and `AccessCard`
// and for the reason those two record: it belongs to more screens than one route segment
// holds. It lived in `app/check-email/` while that was the only screen drawing it; PET-52
// made it two, across two route segments, which is exactly the move PET-12 made when Log
// in and Check your email turned out to draw the card `SetupShell` owned.
//
// **This amends AC6's wording**, which asks for "Resend link" to be screen 24's only
// action. A disabled Resend would satisfy that literally and leave a screen with no
// Back, no working control and no way out. What AC6 defends is that there is no way
// *backwards* into a form the user has already completed, and this goes forward.

/** The footer row the frame draws, minus the Back it no longer carries (node 134:1153). */
export function LogInAgain() {
  return (
    // justify-end, not justify-between: this is the one access footer with a single
    // control, and the frame puts it flush to the content box's right edge.
    // Plain flex rather than daisyUI's `card-actions`: the `card` root is in
    // `AccessCard`, and a part class in a file without its root is what the
    // component rules reject.
    <div className="flex flex-wrap items-center justify-end gap-2 pt-1.5">
      <Button href={ACCESS_ROUTES.login} variant="secondary" label="Log in again" />
    </div>
  );
}
