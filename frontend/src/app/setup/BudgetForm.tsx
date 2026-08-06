'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { amountCaret, formatAmountInput } from '@/lib/format';
import { ACCESS_ROUTES } from '@/lib/routes';

import { DEFAULT_CURRENCY, isBudgetValid } from './draft';
import { useSetupDraft } from './SetupDraftProvider';

// The interactive half of 02 Setup: the currency select, the monthly budget field
// and the Back / Continue row (nodes 42:714, 42:719, 42:724).
//
// This is the repo's first stateful form, so a few of the decisions below are
// conventions rather than local choices. They are written out for that reason.

/**
 * The only currency the design ever shows (A6, BUD-2).
 *
 * One option rather than a disabled control: Figma draws an ordinary enabled
 * select with its chevron, and no frame draws a disabled field at all. The label
 * carries the symbol because the frame does.
 *
 * A hyphen, not the em dash Figma types. The repo normalised that in
 * `Input.stories.tsx` and PET-9's own ticket text, and the two glyphs are
 * indistinguishable in a diff - which is why the test asserts against an em-dash
 * escape rather than eyeballing the string.
 */
const CURRENCY_OPTIONS = [{ value: DEFAULT_CURRENCY, label: 'USD - $' }];

/**
 * The one validation message (A5, BUD-6).
 *
 * Not invented copy: `Input.stories.tsx`'s `WithError` story already draws this
 * exact string on a currency field. One message covers the empty field and the
 * zero, because A29
 * designs no error state at all and two shades of wording would invent more than
 * the design has.
 */
const BUDGET_REQUIRED = 'Enter an amount greater than 0.';

/** Field ids, which `ui/Input` and `ui/Select` require rather than generating. */
const CURRENCY_ID = 'setup-currency';
const BUDGET_ID = 'setup-budget';

export function BudgetForm() {
  const router = useRouter();
  const { draft, patchDraft } = useSetupDraft();
  const [error, setError] = useState<string | undefined>(undefined);

  function onBudgetChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const raw = element.value;
    const caret = element.selectionStart ?? raw.length;
    const formatted = formatAmountInput(raw);

    // Write the DOM before React does, which is the whole trick and the reason
    // `ui/Input` needed no `ref` prop: `event.currentTarget` is already the node.
    // It works only because formatAmountInput is idempotent - format.test.ts pins
    // that property for exactly this reason.
    //
    // React does restore a selection around its own controlled-input commit, so
    // this is not the difference between "caret preserved" and "caret at the end".
    // React restores the raw *offset*, which is wrong precisely when the reformat
    // inserts a separator to the left of the caret: typing the last 0 of 2000
    // would leave '2,00|0' rather than '2,000|'. amountCaret computes the semantic
    // position, and setting it here is what wins, because React's own save happens
    // before this handler's write lands.
    element.value = formatted;
    const at = amountCaret(raw, caret, formatted);
    element.setSelectionRange(at, at);

    patchDraft({ budget: formatted });

    // Clears as soon as the user starts fixing it, rather than surviving until a
    // second submit. The message appears on submit only - see onSubmit.
    if (error !== undefined) setError(undefined);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory. A form with no `action` submits a GET to the current URL and
    // reloads the page, and because the draft is in sessionStorage it would come
    // back filled in - so the defect would read as a flicker rather than as a bug.
    event.preventDefault();

    if (!isBudgetValid(draft.budget)) {
      setError(BUDGET_REQUIRED);
      return;
    }

    // 404s until PET-10 builds step 2. That is as far as a frontend-only ticket
    // reaches: the href is the contract, and an inert button would fail AC4
    // outright while hiding that it had. Same call lib/routes.ts records for
    // Welcome's two links.
    router.push(ACCESS_ROUTES.setupCategories);
  }

  return (
    // noValidate is the pair to `required` on the fields below, and both are
    // deliberate. Without it the browser's own validation bubble fires first and
    // the designed inline message never renders, which reads as broken validation
    // rather than as a missing attribute. With it, `required` still contributes
    // aria-required for assistive technology - and no asterisk, because A12 marks
    // required fields only by not saying "(optional)".
    //
    // gap-5 matches the card's own 20px rhythm, so the three rows below sit on the
    // same grid as the copy block above them.
    <form noValidate onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <Select
        id={CURRENCY_ID}
        label="Currency"
        options={CURRENCY_OPTIONS}
        value={draft.currency}
        onChange={(event) => patchDraft({ currency: event.currentTarget.value })}
        required
      />

      {/* The currency variant is what draws the `$` prefix and the larger value;
          `ui/Input` documents it against this very node (42:721). The box, its
          border and its focus ring are daisyUI's `input`, so nothing here
          restates them. */}
      <Input
        id={BUDGET_ID}
        label="Monthly budget"
        variant="currency"
        value={draft.budget}
        onChange={onBudgetChange}
        error={error}
        required
      />

      {/* pt-1.5 is the designed 6px the frame puts above this row (node 42:724). */}
      <div className="flex items-center justify-between pt-1.5">
        {/* Back is a link and Continue is a button, which is deliberately the
            opposite of WelcomeScreen's rule that both exits are links. Continue
            cannot be one: its navigation is conditional on validation, and an
            anchor cannot be blocked. That single fact is why this file is a client
            component at all.

            A literal '/' rather than an ACCESS_ROUTES entry, because Welcome is
            served at the root and lib/routes.ts deliberately declares no path for
            it - app/page.tsx is the one place that fact lives. */}
        <Button href="/" label="Back" variant="text" />

        <Button type="submit" label="Continue" />
      </div>
    </form>
  );
}
