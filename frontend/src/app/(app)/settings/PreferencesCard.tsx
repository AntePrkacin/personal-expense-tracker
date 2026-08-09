import { BudgetField } from '@/components/BudgetField';

import { MonthStartField } from './MonthStartField';
import { FIELD_ID, type SettingsFormField, type SettingsFormValues } from './settingsForm';

// The "Preferences" card on 17 Settings (SET-3): the monthly budget with its currency, and the day
// the user's budgeting period opens on.
//
// **`ProfileCard`'s structurally identical sibling**, which is what that file says it was split out
// for: same box, same heading-over-rule, same four props. Keeping the two symmetrical is what stops
// `SettingsForm.tsx` becoming the file that holds both.
//
// **No `'use client'` of its own**, for `ProfileCard`'s reason: its only importer is `SettingsForm`,
// which is a client component, so this module is already client by import and the directive would
// advertise a boundary that is not here.
//
// **The card is "Preferences" and carries no status chip**, which is where two authorities
// disagreed. The team's Claude Design system draws this as a "Budget" card with a green "On track"
// chip in the header; the ticket calls it Preferences and puts three controls in it. The chip is
// dropped rather than reproduced because Settings fetches no dashboard data - there is nothing
// behind that status, and a card that had to make a second read to decorate its own heading is a
// worse trade than a heading with no decoration.
//
// **Two controls where SET-3 draws three.** Currency is not a row of its own: it is the left
// segment of `components/BudgetField`, which is the design system's version of that field and the
// one the product owner chose over Figma's. AC1 still holds - currency, budget and month start all
// show their stored values - and AC2 is amended, since three currencies are offered where it said
// one. `components/BudgetField.tsx` carries the whole account.

type PreferencesCardProps = {
  values: SettingsFormValues;
  /** One message per field, keyed by the field it belongs under. Absent means valid. */
  errors: Partial<Record<SettingsFormField, string>>;
  /** True while a save is in flight, which freezes every field on the page at once. */
  disabled: boolean;
  /**
   * Reports a change to one field.
   *
   * Deliberately wider than `ProfileCard`'s `(field, value: string)`: two of the three fields here
   * are not text. `monthStartDay` is a number because `MonthStartField` never round-trips it
   * through the DOM, and `currency` is an ISO code from a closed list rather than typed input - so
   * a string-only signature would force a cast at exactly the point the controls exist to avoid one.
   */
  onChange: <Field extends SettingsFormField>(
    field: Field,
    value: SettingsFormValues[Field],
  ) => void;
};

export function PreferencesCard({ values, errors, disabled, onChange }: PreferencesCardProps) {
  return (
    // `card bg-base-100 shadow-sm`, `AccessCard`'s own box and `ProfileCard`'s. The two cards on
    // this page must not drift apart.
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        {/* `h2`, because `PageHeader` owns the page's `h1`. */}
        <h2 className="text-base font-semibold">Preferences</h2>

        {/* The frame's inset rule. A `div` rather than an `<hr>`: it separates nothing a reader
            needs announced, and `<hr>` publishes `role="separator"`. */}
        <div className="border-base-300 border-t" />

        {/* `max-w-105` rather than the design system's fixed `maxWidth: 420`, which is the standing
            carve-out `frontend/CLAUDE.md` names: identical at the designed 1440 width, and a
            narrower window shrinks instead of overflowing the card's padding. */}
        <div className="flex max-w-105 flex-col gap-4">
          <BudgetField
            id={FIELD_ID.monthlyBudget}
            label="Monthly budget"
            currency={values.currency}
            onCurrencyChange={(currency) => onChange('currency', currency)}
            value={values.monthlyBudget}
            onValueChange={(event) => onChange('monthlyBudget', event.currentTarget.value)}
            error={errors.monthlyBudget}
            disabled={disabled}
            required
          />

          {/* **The hint is ours and owes A29 a sign-off**, like every other invented state on this
              page. Nothing in either design draws a warning here, and changing this value is the
              one setting on the card whose effect is retroactive: the backend derives month
              attribution from the transaction date at read time, so every figure in the app
              re-buckets the moment it saves. Saying so where it happens is cheaper than letting a
              user discover it on the dashboard.

              Deliberately **not** the design system's "Changing your budget applies from the next
              month onward." That line was dropped rather than reworded - it sits under the budget
              field, and it is false here: the budget is one column and every read compares the
              current period against it immediately, which is what AC4 requires. */}
          <MonthStartField
            id={FIELD_ID.monthStartDay}
            label="Month starts on"
            value={values.monthStartDay}
            onChange={(day) => onChange('monthStartDay', day)}
            hint="Every budget figure in the app is measured from this day."
            disabled={disabled}
          />
        </div>
      </div>
    </section>
  );
}
