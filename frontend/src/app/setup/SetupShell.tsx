import { AccessCard } from '@/components/AccessCard';

// What the three onboarding steps add to the shared access chrome: the step
// indicator, and which width the card takes. The centred column, the logo lockup
// and the card box itself are `components/AccessCard.tsx`, because screens 23 and
// 24 draw them with no indicator at all.
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
// and is complete. Not in components/ either, which is where the chrome underneath
// it went once five frames shared it: what is left here is the indicator and the
// step union, and those belong to the three screens under this route segment -
// the "next to the route that uses them" case `(app)/PageHeader.tsx` already took.

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
 * The card's width, which is the one thing about this chrome that is not shared.
 *
 * Frames 02 and 22 are 520px and frame 03 is 600px (node 43:706), so the width is
 * per step rather than per shell. PET-9 shipped a hard-coded `w-130` with a
 * comment saying PET-10 either changes it or lifts it to a prop; a second width
 * has now appeared, and this map is the cheaper of the two. It needs no prop, it
 * keeps every class a complete literal string for Tailwind's scanner, and it
 * records frame 22's width now rather than leaving PET-11 to rediscover it.
 *
 * A `Record` over the step union, so `npm run build` rejects a missing entry -
 * the same reason `SETUP_STEPS` is a union rather than a count.
 */
export const STEP_WIDTH: Record<SetupStep, string> = {
  1: 'w-130',
  2: 'w-150',
  3: 'w-130',
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
    // The width comes from STEP_WIDTH above, which is the only thing frames 02, 03
    // and 22 disagree about; the indicator goes in the slot AccessCard leaves
    // between the lockup and the card, which screens 23 and 24 leave empty.
    //
    // This renders exactly the DOM this component rendered before the chrome moved,
    // which is why SetupShell.test.tsx needed no change: same element order, same
    // class strings, and the width still on the element carrying `shadow-card`.
    <AccessCard width={STEP_WIDTH[step]} aboveCard={<StepIndicator step={step} />}>
      {children}
    </AccessCard>
  );
}
