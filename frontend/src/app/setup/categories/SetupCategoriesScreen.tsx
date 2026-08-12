import { Button } from '@/components/ui/Button';
import type { CategoryTemplate } from '@/lib/categoryTemplates';
import { ACCESS_ROUTES } from '@/lib/routes';

import { SetupShell } from '../SetupShell';
import { CategoryPicker } from './CategoryPicker';

// 03 Setup - Starter categories (Figma node 43:705), onboarding step 2 of 3.
//
// A separate component from page.tsx for the reason WelcomeScreen and
// SetupBudgetScreen are: Storybook renders the screen, and a route file is not
// something you can hand a decorator. **PET-64 turned that from a convention into a
// requirement**: the chips are fetched now, `page.tsx` is async, and Storybook cannot
// render an async Server Component - so the list arrives as a prop and this file stays
// synchronous.
//
// A Server Component, and so are both of its exits. Only CategoryPicker needs the
// client, because only the chips hold state.
//
// **Both exits are links, and this screen has no form**, which is deliberately the
// opposite of step 1. A4 designs no minimum selection, so Continue is unconditional,
// and an exit that always navigates is a link - WelcomeScreen's rule. Step 1 is the
// exception rather than the pattern: BudgetForm is a `form` with a submit button only
// because its navigation is conditional on validation, and an anchor cannot be
// blocked. Copying that shape here would invent a validation seam A4 says does not
// exist, so SetupCategoriesScreen.test.tsx asserts two links and one button per chip -
// the inverted mirror of step 1's one and one. It used to say "ten buttons"; the count
// is the length of the fetched list now, so the suite counts rather than restating.

/**
 * The card's supporting copy (CAT-1).
 *
 * Hoisted to a const so the test asserts one string rather than a second hand-typed
 * copy of it. Two things it promises are load-bearing: chips *toggle*, which is what
 * the pressed state has to convey, and categories are editable later, which is why
 * nothing here needs a confirmation or a minimum.
 *
 * Figma writes the middle break as an em dash. It is normalised to a spaced hyphen,
 * which is what the repo already did to the currency label (`USD - $`) and what the
 * tech spec's own CAT-1 transcription uses. The test pins the em dash's absence, so
 * a paste from the design file fails loudly rather than reading as an identical diff.
 */
const SUPPORTING_COPY =
  "Choose what you'd like to track. Tap to toggle - you can always add or edit categories later.";

type SetupCategoriesScreenProps = {
  /**
   * The chips to offer, in the order the API returned them.
   *
   * Required rather than defaulted to `[]`, for the reason `frontend/CLAUDE.md`
   * gives about the typecheck: `npm run build` never reads `*.test.tsx`, so a
   * default would let a call site quietly render a screen with no chips and
   * nothing would say so. An **empty array is still a legitimate value** - it is
   * what an unreachable backend produces - so the screen renders the card with
   * no chips in it rather than treating empty as an error.
   */
  categories: CategoryTemplate[];
};

export function SetupCategoriesScreen({ categories }: SetupCategoriesScreenProps) {
  return (
    <SetupShell step={2}>
      {/* The card's own gap is 20px (gap-5 on the shell); the overline, heading and
          copy are a nested 8px block, node 43:715 putting them at y 0, 21 and 57.
          Identical to step 1, which is the whole reason the shell exists. */}
      <div className="flex flex-col gap-2">
        {/* A <p>, not a heading, for the reason step 1 records: it labels position
            in the flow, and it is where "step 2 of 3" is actually readable - which
            is what lets the indicator above it stay aria-hidden. */}
        <p className="text-primary text-xs font-semibold tracking-widest uppercase">STEP 2 OF 3</p>

        <h1 className="font-display text-3xl font-bold">Pick your categories</h1>

        <p className="text-base-content/70">{SUPPORTING_COPY}</p>
      </div>

      <CategoryPicker categories={categories} />

      {/* pt-1.5 is the designed 6px above this row, on top of the card's own gap-5.
          Back points at the constant rather than a literal: step 1's `href="/"` is
          the exception, because ACCESS_ROUTES declares no entry for Welcome by
          design. Continue's target 404s until PET-11 builds it, which is the
          precedent PET-8 set - the href is the contract. */}
      <div className="flex items-center justify-between pt-1.5">
        <Button href={ACCESS_ROUTES.setup} label="Back" variant="text" />
        <Button href={ACCESS_ROUTES.setupRegister} label="Continue" />
      </div>
    </SetupShell>
  );
}
