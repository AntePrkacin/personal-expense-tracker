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
 * **`aboveCard` is named for its position, not its contents.** It is the slot
 * between the lockup and the card, which onboarding fills with its three dots and
 * screens 23 and 24 leave empty. An omitted `React.ReactNode` renders nothing at
 * all, so the column's two `gap-6` gaps collapse to one with no conditional here
 * and no second copy of the column anywhere - which is what makes the two shapes
 * one component rather than two.
 *
 * **The width has to stay on the element carrying `shadow-card`.** That is not a
 * style preference: `app/setup/SetupShell.test.tsx` finds the card with
 * `querySelector('.shadow-card')` and then asserts the step's width is in that
 * element's `className`, so moving the width onto a wrapper is the one change here
 * that would break a suite this component is meant to leave untouched.
 */
export function AccessCard({
  width = 'w-130',
  aboveCard,
  children,
}: {
  width?: string;
  aboveCard?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // The canvas is not painted here: globals.css already gives `body`
    // `bg-surface-canvas`, so repeating it would be a second declaration of one
    // fact. flex-1 is what makes the column centre in the viewport, matching the
    // root layout's `min-h-full flex flex-col` - the same hook WelcomeScreen uses.
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <LogoLockup />

      {aboveCard}

      {/* rounded-xl is Radius/20. shadow-card is the Foundations token PET-9 added
          for exactly this card; before it, the only two shadows in the repo were
          arbitrary literals on the Welcome panel.

          Deliberately no overflow-hidden, even though Figma reports overflow-clip
          on these frames: nothing is positioned outside the box, and it would clip
          the submit button's focus-visible outline-offset - and step 2's ten chips
          each carry the same ring. */}
      <div
        className={`bg-surface-card border-border-default shadow-card flex ${width} flex-col gap-5 rounded-xl border px-10 pt-9 pb-8`}
      >
        {children}
      </div>
    </div>
  );
}
