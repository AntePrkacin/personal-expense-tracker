import { LogoLockup } from '@/components/LogoLockup';

// The chrome five of the six access frames share: the centred column carrying the
// logo lockup, and the card box under it.
//
// Frames 02, 03 and 22 (the onboarding steps) draw it with a step indicator
// between the two; frames 23 Log in (node 132:1139) and 24 Check your email
// (134:1143) draw it with nothing there, at 520px, which is the only thing that
// made this extraction necessary. Everything else about all five is identical -
// the 24px from lockup to card, the 40px inset, the 20px between card children.
// Welcome is the one frame that shares none of it, being a two-column split with
// a left-aligned logo.
//
// **Why this is in components/ rather than beside a route.** `app/setup/SetupShell.tsx`
// used to hold all of this, and argued against living here on the grounds that it
// "belongs to three screens that all sit under one route segment". That argument
// was right and is now false: PET-12 made it five, across three route segments,
// which is exactly the case `LogoLockup` is here for. `SetupShell` still exists
// and still owns the step indicator - the part that really is onboarding's.

/**
 * The card's own chrome, with the width left to the caller.
 *
 * `width` is a complete literal class string rather than a number or a step, for
 * two reasons. Tailwind's scanner reads these files as raw text, so a class
 * assembled from a prop is found by nobody and compiles to nothing; and taking
 * `SetupStep` instead would drag `SETUP_STEPS` into `components/`, which is the
 * coupling this extraction exists to remove. Callers pass either the default or a
 * value from a `Record` in their own file, both of which the scanner sees.
 *
 * **The default is a maximum rather than a fixed width.** PET-57 replaced Figma's
 * `w-130` (520px) with `w-full max-w-lg`: a fixed 520px card is wider than a phone
 * viewport, so the frame's one width was also the app's one broken layout. The
 * column's `px-4` is what keeps the card off the edges below that maximum.
 *
 * **`aboveCard` is named for its position, not its contents.** It is the slot
 * between the lockup and the card, which onboarding fills with its three dots and
 * screens 23 and 24 leave empty. An omitted `React.ReactNode` renders nothing at
 * all, so the column's two `gap-6` gaps collapse to one with no conditional here
 * and no second copy of the column anywhere - which is what makes the two shapes
 * one component rather than two.
 *
 * **The width has to stay on the element carrying `card`.** That is not a style
 * preference: `app/setup/SetupShell.test.tsx` finds the card by class and then
 * asserts the step's width is in that element's `className`, so moving the width
 * onto a wrapper is the one change here that would break a suite this component is
 * meant to leave untouched.
 */
export function AccessCard({
  width = 'w-full max-w-lg',
  aboveCard,
  children,
}: {
  width?: string;
  aboveCard?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // The canvas is not painted here: the theme paints the page, so repeating it
    // would be a second declaration of one fact. flex-1 is what makes the column
    // centre in the viewport, matching the root layout's `min-h-full flex flex-col`
    // - the same hook WelcomeScreen uses.
    //
    // gap-6 is the designed 24px: lockup to indicator and indicator to card on the
    // three onboarding frames, lockup straight to card on the two this ticket adds.
    //
    // py-10 has **no Figma counterpart** and is the one addition on these screens.
    // The frames are a fixed 1024px tall, so the centred column always fits; a real
    // browser window shorter than the card would clip it against the viewport
    // instead, because `justify-center` overflows in both directions. The padding
    // is what turns that into a scroll. Same class of deliberate deviation as the
    // form details `frontend/CLAUDE.md` lists.
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <LogoLockup />

      {aboveCard}

      {/* Stock `card`: its radius and its shadow are the theme's rather than the
          frame's measured 20px and PET-9's own shadow token, which is PET-57's
          fidelity boundary. `text-base-content` is paired with the surface
          explicitly, because the card is the one element here that repaints it.

          The caller's width is appended whole rather than assembled - no daisyUI
          class name is built by interpolation, which is what the rule protects, and
          `card` has to stay in this attribute for the pair with `card-body` below
          to be readable as one structure.

          Deliberately no overflow-hidden, even though Figma reports overflow-clip
          on these frames: nothing is positioned outside the box, and it would clip
          the submit button's focus-visible ring - and step 2's ten chips each carry
          the same one.

          gap-5 on the body is the designed 20px between card children; daisyUI's
          own `card-body` gap is 8px. */}
      <div className={`card bg-base-100 text-base-content shadow-sm ${width}`}>
        <div className="card-body gap-5">{children}</div>
      </div>
    </div>
  );
}
