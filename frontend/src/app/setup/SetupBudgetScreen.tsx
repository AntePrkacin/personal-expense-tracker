import { BudgetForm } from './BudgetForm';
import { SetupShell } from './SetupShell';

// 02 Setup - Currency & budget (Figma node 42:700), onboarding step 1 of 3.
//
// A separate component from page.tsx for the reason WelcomeScreen is: Storybook
// renders the screen, and a route file is not something you can hand a decorator.
//
// A Server Component. Only BudgetForm needs the client, because only it holds
// state and calls router.push - the copy above it is static.

/**
 * The card's supporting copy (BUD-1).
 *
 * Hoisted to a const so the test can assert the exact string without a second
 * hand-typed copy of it, the same call WelcomeScreen makes for its intro line.
 * Note what it promises: the value is editable later in Settings, which is why
 * onboarding needs no "are you sure" and no way back to it once past.
 */
const SUPPORTING_COPY =
  'How much do you plan to spend each month? You can change this anytime in Settings.';

export function SetupBudgetScreen() {
  return (
    <SetupShell step={1}>
      {/* The card's own gap is 20px (gap-5 on the shell), but the overline,
          heading and copy are a nested 8px block on the frame - node 42:710 puts
          them at y 0, 21 and 57. Reading the card as a flat 20px stack would
          space the heading off its overline. */}
      <div className="flex flex-col gap-2">
        {/* A <p>, not a heading: it labels the card's position in the flow rather
            than titling the content, and a second heading here would compete with
            the h1 below it. It is also the reason the step indicator above can be
            aria-hidden - this line is where "step 1 of 3" is actually readable. */}
        <p className="text-overline text-brand-accent-pressed">STEP 1 OF 3</p>

        {/* The screen's one h1. There is no PageHeader outside the (app) shell,
            so each access screen owns its own, exactly as WelcomeScreen does. */}
        <h1 className="text-display-s text-text-primary">Set your monthly budget</h1>

        <p className="text-body-m text-text-secondary">{SUPPORTING_COPY}</p>
      </div>

      <BudgetForm />
    </SetupShell>
  );
}
