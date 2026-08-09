'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import type { Profile } from '@/lib/profile';
import { updateProfile, type UpdateProfileResult } from '@/lib/updateProfile';

import { ProfileCard } from './ProfileCard';
import {
  invalidFields,
  toSettingsFormValues,
  toUpdateProfileBody,
  type SettingsFormField,
  type SettingsFormValues,
} from './settingsForm';

// The Settings page's form: every card on 17 Settings and the single "Save changes" beneath them
// (SET-5).
//
// **This is the screen's `'use client'` boundary, and it is the smallest wrapper that can be.**
// AC3's live initials and AC4's inline messages both need state, and nothing above the `<form>`
// does - so `SettingsScreen` stays a Server Component and `PageHeader` stays off the client bundle,
// the rule `SidebarNav` and `dashboard/TrendChart.tsx` follow. It cannot go lower either: one
// page-level Save means one `<form>` wrapping every card, because a footer button cannot read state
// held inside a sibling card.
//
// **PET-47 adds its two cards here as literal siblings of `ProfileCard`** and touches five things
// in total - one key in `SettingsFormValues`, one case in `invalidFields`, one comparison in
// `toUpdateProfileBody`, one entry in `MESSAGES`, one card in the JSX. Everything else in this file
// is already general, because `UpdateProfileDto` is one DTO covering all six fields. That is the
// whole reason PET-46 builds the page-level form rather than a card-level one.

/**
 * Every string this form can show, in one place.
 *
 * The four field messages are **copied byte for byte from `app/setup/register/RegisterForm.tsx`**,
 * which collects the identical three fields under the identical three rules. Copied rather than
 * shared, which is `LoginForm`'s call about the same overlap: there is no copy module in this repo
 * and two overlapping strings are the wrong reason to invent one.
 *
 * The four failure lines and the success line are new, and A29 owes them a sign-off with every
 * other invented state in this app - SET-5 draws no success, error or unsaved-changes visual at all.
 */
const MESSAGES = {
  firstName: 'Enter your first name.',
  lastName: 'Enter your last name.',
  emailRequired: 'Enter your email address.',
  emailFormat: 'Enter a valid email address.',
  // Never "try again": a body the DTO rejects is rejected again forever.
  invalid: "We couldn't save your changes. Please check the values and try again.",
  // Names the cause, because an authenticated form cannot tell a typo from a taken address unless
  // it is told - and says nothing that could identify who holds it.
  taken: 'That email address already belongs to another account.',
  unauthenticated: 'Your session has expired. Log in again to save your changes.',
  failed: "We couldn't save your changes. Please try again.",
  saved: 'Changes saved',
} as const;

/** The inline message for one problem, which is why `emailProblem` reports a reason rather than a boolean. */
function messageFor(field: SettingsFormField, reason: 'required' | 'format'): string {
  if (field === 'firstName') return MESSAGES.firstName;
  if (field === 'lastName') return MESSAGES.lastName;
  return reason === 'required' ? MESSAGES.emailRequired : MESSAGES.emailFormat;
}

type SettingsFormProps = {
  /**
   * The stored profile, straight from `page.tsx`'s read.
   *
   * **This is the diff baseline and it is deliberately not copied into state.** After a successful
   * save `router.refresh()` re-runs `(app)/layout.tsx` *and* `settings/page.tsx`, handing this
   * component a fresh profile - so a `useState(() => profile)` baseline, which is
   * `AllocateBudgetModal`'s shape and the tempting one to copy, would freeze at the pre-save values
   * and a second press with no further edits would re-send a body the server already applied. The
   * modals read once on open because a background refresh would rewrite fields under the user's
   * hands; here `values` is already state, so that protection is had for free.
   */
  profile: Profile;
  /**
   * Injected with a default, which is `AddCategoryButton`'s rule and not a testing convenience.
   * Storybook's Vite build has no notion of `'use server'`, so it bundles the action as an ordinary
   * module and a press in a story would reach `cookies()` from `next/headers` in the browser. It
   * also lets the suite pass a `jest.fn()` with no module mock, so the `@/` alias trap never comes
   * up.
   */
  save?: (body: Parameters<typeof updateProfile>[0]) => Promise<UpdateProfileResult>;
};

export function SettingsForm({ profile, save = updateProfile }: SettingsFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<SettingsFormValues>(() => toSettingsFormValues(profile));
  const [errors, setErrors] = useState<Partial<Record<SettingsFormField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  /**
   * One keystroke.
   *
   * Clears **that field's** message and never another's, which is the rule every form in this app
   * follows: a message beside a field the user has not returned to is still true.
   *
   * It also clears the form-level failure and the success line together, for one reason stated
   * twice: both describe the last save, and the moment the form changes neither describes anything.
   * Leaving "Changes saved" up over an edited form is the version that lies.
   */
  function change(field: SettingsFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads the page, which would
    // discard every edit while reading as a flicker.
    event.preventDefault();

    // **Validation before the diff, and the order is load-bearing.** Blanking First name has to
    // show its message even though the diff would be non-empty, and blanking it then restoring it
    // has to be silent. Every field at once rather than the first failure, so a blank form shows
    // three messages (AC4); `invalidFields` owns that rule so a jsdom-free test can pin it.
    const problems = invalidFields(values);

    if (problems.length > 0) {
      setErrors(
        Object.fromEntries(problems.map(({ field, reason }) => [field, messageFor(field, reason)])),
      );
      // Nothing is persisted, which is the second half of AC4: the request is not made at all.
      return;
    }

    setErrors({});

    // **An empty diff sends nothing and says nothing.** `PATCH /api/profile` answers 400 to a body
    // with no keys, so this is a correct answer to a question the user did not ask - the same call
    // `EditTransactionModal` makes, minus the dialog it has to close. There is no message, because
    // claiming "Changes saved" over a save that never happened would be the one lie this form can
    // tell; and Save stays *enabled* rather than being disabled on a clean form, because the frame
    // draws one enabled primary button and A29 designs no disabled treatment for it.
    const body = toUpdateProfileBody(profile, values);

    if (Object.keys(body).length === 0) return;

    setFailure(null);
    setSaved(false);
    setPending(true);

    // **The `catch` is not defensive, and without it a failed submit freezes the page.** `save` is
    // a Server Action called from the client, so a transport that never completes - going offline
    // mid-submit, a deploy restarting underneath, a response that is not an action result -
    // **rejects** rather than resolving to an `UpdateProfileResult`. A rejection escaping this
    // handler skips every line below, so `pending` stays true, the submit button stays disabled for
    // good (which also kills Enter), and nothing on screen says why.
    let result: UpdateProfileResult;

    try {
      result = await save(body);
    } catch {
      setPending(false);
      setFailure(MESSAGES.failed);
      return;
    }

    if (!result.ok) {
      setPending(false);
      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **`router.refresh()` is the whole of AC5.** It re-runs this route's Server Components *and*
    // the shell's layout above it, so `requireProfile()` runs again and the sidebar footer's short
    // name and initials follow what was just saved. The form keeps rendering `values`, which are
    // already what the server now holds, so there is nothing to reconcile here.
    router.refresh();
    setPending(false);
    setSaved(true);
  }

  return (
    // `max-w-205` is the frame's 820px column as a **ceiling** rather than a width, the standing
    // carve-out for frames drawn at a fixed 1440 with no narrow viewport behind them.
    <form noValidate onSubmit={onSubmit} className="flex max-w-205 flex-col gap-5">
      <ProfileCard values={values} errors={errors} disabled={pending} onChange={change} />

      {/* PET-47's `<PreferencesCard />` and `<CategoriesSummaryCard />` go here. */}

      <FormError message={failure} />

      <div className="flex items-center justify-end gap-4">
        {/* **Mounted from the first render, empty, with only its text changing** - which
            `AllocateBudgetModal.tsx` records the reason for: a polite region created in the same
            commit as its content is generally not announced at all, because assistive technology
            registers regions and then watches them. `getByRole('status')` cannot tell a working one
            from a broken one, which is why the suite asserts this region's *text*. An empty block
            element has no line box, so it takes no space while it says nothing.

            `role="status"` and not `FormError`'s `role="alert"`: this is a success after a round
            trip, so polite is right and assertive would interrupt. */}
        <p role="status" className="text-base-content/60 text-sm">
          {saved ? MESSAGES.saved : ''}
        </p>

        {/* **`type="submit"` is mandatory.** `ui/Button` defaults `type` to `button`, so without it
            this form silently never submits and Enter inside a field does nothing - with nothing on
            screen to explain it. `SettingsForm.test.tsx` pins the Enter case for exactly that.

            Disabled while the request is out, so a double press cannot send two patches. Nothing
            beside it is disabled, because there is nothing beside it: unlike the modals there is no
            Cancel to keep live. */}
        <Button type="submit" label="Save changes" disabled={pending} />
      </div>
    </form>
  );
}
