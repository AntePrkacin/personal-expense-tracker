import { LogoLockup } from '@/components/LogoLockup';

// The chrome the three onboarding steps share: the centred column carrying the
// logo lockup, the step indicator and the card box. `children` is the card's
// contents, which is the only part that differs between steps.
//
// Frames 02 (node 42:701), 03 and 22 draw this identically. The only variables
// are which dot is filled and the column width, 520 / 600 / 520 - so PET-9
// settles a question PET-8 deliberately left open: the shared layout does exist.
//
// **It is a component rather than the route layout**, and that is forced rather
// than chosen. The active step differs per route, and an App Router layout cannot
// read the pathname on the server, so a layout would have to become a client
// component just to know which dot to fill. That is the same trap `ui/Sidebar`'s
// `active` prop and `(app)/SidebarNav.tsx` were built around. Taking `step` as a
// prop keeps this a Server Component and keeps the fact declarative at each call
// site.
//
// **Not in components/ui/**: that folder mirrors the nine Figma Components tiles
// and is complete. Not in components/ either, where `LogoLockup` earns its place
// by belonging to six screens - this belongs to three that all sit under one
// route segment, which is the "next to the route that uses them" case
// `(app)/PageHeader.tsx` already took.

/**
 * The three onboarding steps, as a literal union rather than a count.
 *
 * `npm run build` is what rejects a fourth step, the same call `ui/Button`'s and
 * `ui/ProgressBar`'s prop unions make. A `{ current, total }` pair would accept
 * `step={7}` and render an indicator with no filled dot at all.
 */
export const SETUP_STEPS = [1, 2, 3] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * The two dot states.
 *
 * Complete literal class strings in a `Record`, per the rule every variant map in
 * `components/ui/` follows: Tailwind's scanner reads this file as raw text, so a
 * class assembled by interpolation is found by nobody and compiles to nothing,
 * with no build error and no failing test. `components/ui/utilities.test.ts`
 * compiles both of these.
 *
 * The active pill is `bg-brand-accent`, **not** the `brand-accent-pressed` the
 * overline inside the card uses. The two are easy to conflate because they sit
 * 60px apart on the frame; Figma binds the pill to Brand/Accent.
 */
export const STEP_DOT: Record<'active' | 'inactive', string> = {
  // 28x8, the designed pill.
  active: 'bg-brand-accent h-2 w-7',
  // 8x8.
  inactive: 'bg-border-strong size-2',
};

/**
 * Three dots, the current one drawn as a pill (node 42:706).
 *
 * **Hidden from assistive technology, deliberately.** The card's own overline
 * states "STEP 1 OF 3" in text, so these three shapes carry nothing a reader is
 * missing; unhidden they announce as three empty generics. That is the same call
 * `ui/Input` makes on its `$` prefix, for the same stated reason.
 *
 * Two alternatives were considered and rejected, recorded here so nobody
 * "improves" this into one of them:
 *
 *   - `role="progressbar"` with `aria-valuenow`. It restates the overline, and
 *     `ui/ProgressBar` is the repo's one progressbar - a second implementation,
 *     announcing a wizard as a progress bar, is worse than none.
 *   - An `<ol>` with `aria-current="step"`. Genuinely the textbook wizard
 *     pattern, but it invents list semantics and three step *names* the design
 *     never draws. This is the one to reach for if a designer or QA asks.
 *
 * Note `aria-hidden` does **not** remove focusable descendants from the tab
 * order. There are none here - three bare spans - and SetupShell.test.tsx pins
 * that so a later ticket cannot add one.
 *
 * Private to this file, following `Chevron()` inside `ui/Select.tsx`: only the
 * shell renders it, and keeping it unexported means no caller can draw an
 * indicator without the shell that positions it. Promote it to its own file the
 * day something outside this one needs it.
 */
function StepIndicator({ step }: { step: SetupStep }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      {SETUP_STEPS.map((each) => (
        <span
          key={each}
          className={`shrink-0 rounded-full ${each === step ? STEP_DOT.active : STEP_DOT.inactive}`}
        />
      ))}
    </div>
  );
}

export function SetupShell({ step, children }: { step: SetupStep; children: React.ReactNode }) {
  return (
    // The canvas is not painted here: globals.css already gives `body`
    // `bg-surface-canvas`, so repeating it would be a second declaration of one
    // fact. flex-1 is what makes the column centre in the viewport, matching the
    // root layout's `min-h-full flex flex-col` - the same hook WelcomeScreen uses.
    //
    // gap-6 is the designed 24px, twice: lockup to indicator, indicator to card.
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <LogoLockup />

      <StepIndicator step={step} />

      {/* w-130 is the designed 520px of frames 02 and 22. Frame 03 is 600px
          (node 43:706), so PET-10 changes this one class - or, if a third width
          ever appears, lifts it to a prop. One legal value is not a prop yet,
          which is the call LogoLockup already made about `size`.

          rounded-xl is Radius/20. shadow-card is the Foundations token PET-9
          added for exactly this card; before it, the only two shadows in the repo
          were arbitrary literals on the Welcome panel.

          Deliberately no overflow-hidden, even though Figma reports overflow-clip
          on this frame: nothing is positioned outside it, and it would clip the
          Continue button's focus-visible outline-offset. */}
      <div className="bg-surface-card border-border-default shadow-card flex w-130 flex-col gap-5 rounded-xl border px-10 pt-9 pb-8">
        {children}
      </div>
    </div>
  );
}
