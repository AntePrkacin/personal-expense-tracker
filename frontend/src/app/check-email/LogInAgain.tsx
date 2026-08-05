import { Button } from '@/components/ui/Button';
import { ACCESS_ROUTES } from '@/lib/routes';

// Screen 24's recovery control, for the two states where there is no address to resend
// to: the screen rendered without one, and the cookie expiring while it was open.
//
// One component rather than the same three lines in `CheckEmailScreen.tsx` and
// `ResendLink.tsx`, which is the rule `ui/Button` states about its own base classes -
// a second copy of a control's markup is one that can drift from the first. It is a
// Server Component with no state, so the client boundary in `ResendLink` can render it
// as happily as the screen can.
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
    <div className="flex items-center justify-end pt-1.5">
      <Button href={ACCESS_ROUTES.login} variant="secondary" label="Log in again" />
    </div>
  );
}
