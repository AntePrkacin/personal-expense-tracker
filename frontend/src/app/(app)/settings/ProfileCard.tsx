import { Input } from '@/components/ui/Input';
import { initials } from '@/lib/format';

import { FIELD_ID, type SettingsFormField, type SettingsFormValues } from './settingsForm';

// The "Profile" card on 17 Settings (frame `40:682`): the avatar tile over the three fields
// registration collected (SET-2, REG-2).
//
// **No `'use client'` of its own, deliberately.** Its only importer is `SettingsForm`, which is a
// client component, so this module is already client by import - and the directive would advertise
// a boundary that is not here, which `frontend/src/components/CLAUDE.md` names as the thing to
// avoid rather than a harmless extra.
//
// **It is a separate file for PET-47 rather than for reuse.** One consumer is normally the argument
// against a file; what earns it one is that `PreferencesCard` is a structurally identical sibling
// one ticket away, taking the same four props over its own three fields, and keeping the two
// symmetrical is what stops `SettingsForm.tsx` becoming the file that holds both. Not a slot, for
// `CategoriesScreen`'s reason: a slot with one possible occupant expresses no choice.

type ProfileCardProps = {
  values: SettingsFormValues;
  /** One message per field, keyed by the field it belongs under. Absent means valid. */
  errors: Partial<Record<SettingsFormField, string>>;
  /** True while a save is in flight, which freezes every field on the page at once. */
  disabled: boolean;
  onChange: (field: SettingsFormField, value: string) => void;
};

export function ProfileCard({ values, errors, disabled, onChange }: ProfileCardProps) {
  return (
    // `card bg-base-100 shadow-sm` is `AccessCard`'s own box, which
    // `frontend/src/app/CLAUDE.md` names as what a second card should match, and which
    // `dashboard/BudgetCard.tsx` already matched.
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        {/* `h2`, because `PageHeader` owns the page's `h1`. */}
        <h2 className="text-base font-semibold">Profile</h2>

        {/* The frame's inset rule. A `div` rather than an `<hr>`: it separates nothing a reader
            needs announced, and `<hr>` publishes `role="separator"`. */}
        <div className="border-base-300 border-t" />

        <div className="flex items-center gap-4">
          {/* **Announced, where `ui/Sidebar`'s identical tile is `aria-hidden` - and the difference
              is deliberate rather than an oversight.** That one hides its initials because the full
              name is read out immediately after them, so they are a repeat. Here there is no name
              text on the card at all: the names live in inputs, whose values a reader hears only on
              focus, so "MK" is genuinely new information and hiding it would leave the avatar
              announcing nothing to a screen reader while AC2 puts it on screen for everyone else.

              The daisyUI idiom is the sidebar's, recoloured. `bg-base-100/10 text-neutral-content`
              is scoped to that dark panel and paints nothing legible on a `base-100` card, so this
              is the semantic pair the frame draws: a tinted primary disc with primary initials. */}
          <div className="avatar avatar-placeholder">
            <div className="bg-primary/10 text-primary w-14 rounded-full">
              <span className="text-lg font-semibold">
                {/* `initials()` from `lib/format.ts`, never re-derived. That function's own docblock
                    names SET-6 and this card as the reason it is shared: the sidebar footer and this
                    avatar have to agree, which is exactly AC5. It reads `values` rather than the
                    stored profile, which is AC3 - the initials follow what is being typed. */}
                {initials(values.fullName)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Your avatar</p>
            {/* **"Spendifico", not the frame's "Expensa".** The product was renamed on 2026-08-02
                (PET-51) and the design file is the one holdout; `ui/Sidebar.tsx` and
                `components/LogoLockup.tsx` both carry this same amendment. Do not "correct" this
                back to the design. */}
            <p className="text-base-content/60 text-sm">
              Your initials are used across Spendifico.
            </p>
          </div>
          {/* SET-2 and AC2: no upload control of any kind. The initials are derived and never
              stored, so there is nothing here to replace them with. */}
        </div>

        {/* **One full-width field, where the frame draws two in a `grid grid-cols-2`.** PET-72
            collapsed the profile's two name columns into one: the app only ever used them together,
            deriving initials and a short name, so the second was data collected to be thrown away.
            The grid went with it - a single field in a two-column grid would sit in the left half
            with a hole beside it. Labelled "Display name" rather than "Name", and the placeholder
            says a nickname is fine, because that is what one free-text field honestly offers. */}
        <Input
          id={FIELD_ID.fullName}
          label="Display name"
          placeholder="Your name, full name or nickname."
          value={values.fullName}
          onChange={(event) => onChange('fullName', event.target.value)}
          required
          disabled={disabled}
          error={errors.fullName}
        />

        {/* A sibling of the grid rather than a third cell, which is what makes it full width -
            frame `40:700` draws it spanning both columns. */}
        <Input
          id={FIELD_ID.email}
          label="Email"
          type="email"
          value={values.email}
          onChange={(event) => onChange('email', event.target.value)}
          required
          disabled={disabled}
          // **The one line of invented copy on this card, and it is the whole mitigation for A39.**
          // Editing this field moves where every future login link goes, applied with no
          // re-verification step and no warning drawn anywhere in the file. A caption stating it
          // where it happens is the smallest honest answer; a confirmation dialog would contradict
          // the design outright. It is a `hint` rather than a `<p>` beside the field so the control
          // actually describes it - see `ui/FieldShell`.
          hint="Login links will be sent here."
          error={errors.email}
        />
      </div>
    </section>
  );
}
