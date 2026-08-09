'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import type { Profile } from '@/lib/profile';
import { ACCESS_ROUTES } from '@/lib/routes';
import { updateProfile, type UpdateProfileResult } from '@/lib/updateProfile';

import { ProfileCard } from './ProfileCard';
import {
  FIELD_ID,
  invalidFields,
  sameSettingsValues,
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
  // **Names a control that is actually on screen, which the first version did not.** It said "Log
  // in again to save your changes" on a shell that publishes no log-in control anywhere - so the
  // only way to follow it was a sidebar link, whose server read 401s and redirects, discarding the
  // edits the sentence had just promised were still savable. A code review caught it; it is the
  // same defect `app/check-email`'s `expired` arm already paid for, and the same answer: give the
  // reader a real control rather than advice that cannot be taken.
  unauthenticated: 'Your session has expired. Log in again in a new tab, then save.',
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
   * and a second press with no further edits would re-send a body the server already applied.
   *
   * **A code review found that half of this argument shipped without its other half.** Reading the
   * baseline live is right, and it is only safe if `values` follows the same profile - otherwise
   * the two disagree, which is a *mirror* of the bug the paragraph above avoids and produced three
   * of its own: the address kept the casing the user typed rather than the one the server stored,
   * the avatar kept deriving initials from whitespace the save trimmed away (drifting from the
   * sidebar footer, which is AC5), and a field another tab had changed was quietly reverted by the
   * next save. The resync in the component body is the missing half; it is on the *save*'s refresh
   * only, so a background one still cannot rewrite fields under the user's hands - which is the
   * protection the modals get by reading once on open.
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
  // The 401 arm alone, because it is the one failure whose message needs a control beside it and
  // therefore cannot be a bare string in `FormError`. See the alert it renders, below.
  const [expired, setExpired] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // **The server's values `values` was last seeded from, and the flag that says a save is waiting
  // for its refresh.** Together these are the resync below; both exist because `router.refresh()`
  // resolves asynchronously, so the new `profile` is not readable at the moment the save succeeds.
  const [synced, setSynced] = useState<SettingsFormValues>(() => toSettingsFormValues(profile));
  const [awaitingSaved, setAwaitingSaved] = useState(false);

  /**
   * **Adopt what the server actually stored, once the save's refresh lands.**
   *
   * A render-phase state adjustment rather than an effect, which is the shape `TransactionSearch`
   * and `InsightsScreen` already use here: `react-hooks/set-state-in-effect` rejects the effect
   * version and this repo carries no eslint-disable comments.
   *
   * **It fires only after this form's own save**, which is what makes adopting *every* field safe.
   * A background refresh from anywhere else leaves the form alone, because a user mid-sentence must
   * not have their typing replaced; but by the time a save resolves, every field has been disabled
   * for the whole round trip, so there is nothing in flight to destroy and the server is
   * authoritative about all three values.
   *
   * That matters because the server does not store what was typed. It lowercases the address
   * through `normalizeEmail` and it stores the trimmed name, so without this the Email field goes
   * on showing a casing the account no longer has, and the avatar goes on deriving initials from
   * whitespace the save removed - drifting from the sidebar footer, which is exactly what AC5 says
   * must not happen. It also picks up any field another tab changed in the meantime, so the next
   * diff cannot silently revert it.
   *
   * The comparison is by **value**, never by object identity: `page.tsx` builds a fresh profile
   * object on every server render, so an identity test would be true after every refresh in the app.
   */
  const fromServer = toSettingsFormValues(profile);

  if (awaitingSaved && !sameSettingsValues(fromServer, synced)) {
    setSynced(fromServer);
    setValues(fromServer);
    setAwaitingSaved(false);
  }

  /**
   * Focus, put back where the save took it from.
   *
   * Every control on the form is `disabled` while the request is out, and the browser blurs a
   * control the moment it becomes disabled - so a keyboard user who pressed Enter in Last name had
   * focus dropped to `<body>` and their next Tab restarted at the top of the page. The platform
   * does not restore it, because nothing was unmounted.
   *
   * An effect with no `setState` in it, so the `set-state-in-effect` rule above does not apply, and
   * keyed on `pending` falling rather than on the result: every exit from the request restores,
   * including the two failure arms and the rejected RPC. The captured element is still connected -
   * it was disabled, not removed - which is what makes this simpler than `(app)/Modal.tsx`'s
   * version of the same fix.
   */
  const focusOnSubmit = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (pending) return;

    const target = focusOnSubmit.current;
    focusOnSubmit.current = null;
    target?.focus();
  }, [pending]);

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
    setExpired(false);
    setSaved(false);

    // **A keystroke abandons a pending resync, and that window is real rather than theoretical.**
    // `router.refresh()` resolves asynchronously while `setPending(false)` re-enables the fields
    // immediately, so there is a moment after a save where the user can type and the refresh has
    // not landed. Adopting the server's values then would delete what they just typed. Giving up
    // costs the normalisation this save would have picked up - the field keeps the casing on
    // screen - and their next save resyncs it. Losing keystrokes is the worse of the two, and it
    // is the one this repo has paid for before, in `AddTransactionModal`'s scan merge.
    setAwaitingSaved(false);
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

      // **Focus the first invalid field, or a refused submit is silent to a screen reader.** The
      // inline messages are ordinary `<p>`s reached through `aria-describedby`, which announces
      // them on focus and at no other time - and unlike the four form-level failures they do not
      // go through `FormError`'s `role="alert"`. So a reader who pressed Save heard nothing, got
      // no request, and had no way to learn why. Moving focus is the fix rather than a second live
      // region, because it announces the field, its label and its message together *and* leaves
      // the caret where the work is.
      //
      // The first in `invalidFields`' order, which is draw order, so focus lands at the top of the
      // problems rather than the bottom.
      document.getElementById(FIELD_ID[problems[0]!.field])?.focus();

      // Nothing is persisted, which is the second half of AC4: the request is not made at all.
      return;
    }

    setErrors({});

    // **An untouched form sends nothing, and this guard is what actually makes that true.**
    //
    // The diff below cannot answer it on its own, which a code review caught. `toUpdateProfileBody`
    // trims on the way out and compares against the *untrimmed* stored value - deliberately, so a
    // stored name carrying stray whitespace tidies itself on the first save that touches anything -
    // and the cost is that a profile stored as `"  Marko  "` differs from itself. Opening Settings
    // on one of those, touching nothing and pressing Save fired a PATCH and announced "Changes
    // saved" for an edit nobody made, which is exactly the claim this form must never make.
    //
    // Asking "did the user type anything" rather than "would the body be empty" separates the two
    // questions that were being conflated. `synced` is the server's values as this form last
    // adopted them, so this is literally "is the form as it arrived" - and it reuses the state the
    // resync above already maintains rather than inventing a second notion of clean.
    if (sameSettingsValues(values, synced)) return;

    // **An empty diff sends nothing and says nothing** either. `PATCH /api/profile` answers 400 to
    // a body with no keys, so this is a correct answer to a question the user did not ask - the
    // same call `EditTransactionModal` makes, minus the dialog it has to close. Still reachable
    // with the guard above in place: retyping the address in a different case is a real edit that
    // diffs to nothing, because the comparison is case-insensitive.
    //
    // Save stays *enabled* rather than being disabled on a clean form, because the frame draws one
    // enabled primary button and A29 designs no disabled treatment for it.
    const body = toUpdateProfileBody(profile, values);

    if (Object.keys(body).length === 0) return;

    setFailure(null);
    setExpired(false);
    setSaved(false);

    // Captured *before* `setPending(true)`, because that commit is what disables the control the
    // user is standing on and blurs it. The effect above puts them back.
    focusOnSubmit.current = document.activeElement as HTMLElement | null;

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

      // The 401 renders its own alert with a way out of it; the other three are bare strings.
      if (result.reason === 'unauthenticated') {
        setExpired(true);
        return;
      }

      setFailure(MESSAGES[result.reason]);
      return;
    }

    // **`router.refresh()` is the whole of AC5.** It re-runs this route's Server Components *and*
    // the shell's layout above it, so `requireProfile()` runs again and the sidebar footer's short
    // name and initials follow what was just saved.
    //
    // **`setAwaitingSaved(true)` is the other half of it, and the first draft of this file left it
    // out.** The comment here used to claim `values` was "already what the server now holds", which
    // is false in three ordinary ways: the address is stored lowercased, the names are stored
    // trimmed, and another tab may have changed a field this form did not send. The refresh is
    // asynchronous, so the corrected profile cannot be read on this line - the flag is what makes
    // the resync at the top of this component adopt it when it arrives.
    router.refresh();
    setAwaitingSaved(true);
    setPending(false);
    setSaved(true);
  }

  return (
    // `max-w-205` is the frame's 820px column as a **ceiling** rather than a width, the standing
    // carve-out for frames drawn at a fixed 1440 with no narrow viewport behind them.
    <form noValidate onSubmit={onSubmit} className="flex max-w-205 flex-col gap-5">
      <ProfileCard values={values} errors={errors} disabled={pending} onChange={change} />

      {/* PET-47's `<PreferencesCard />` and `<CategoriesSummaryCard />` go here. */}

      {/* **The 401 is the one failure that carries a control, so it does not go through
          `FormError`.** That component renders a bare string by design, and this arm needs a link
          inside the same `role="alert"` - announced together, because a control announced
          separately from the sentence explaining it is the dead end this replaces. Not a reason to
          give `FormError` a slot: `components/ResendLink.tsx` already declines to use it for the
          same shape of reason, and one arm of one form is not three consumers.

          **It opens in a new tab deliberately, and that is what makes the copy true.** The action
          does not `redirect()` precisely so a dead session does not discard a half-edited form; a
          same-tab link would throw that away at the last step. Signing in elsewhere sets the
          session cookie for this origin, so coming back and pressing Save works - the edits were
          never lost. `rel` is mandatory with `target="_blank"`, and a `link` rather than `ui/Button`
          because this is a phrase inside a sentence, not a footer control.

          **Bare `link`, with no colour modifier, and that is a measurement rather than a taste.**
          `link-primary` was the obvious choice and paints `oklch(0.58 0.233 277)`, which composites
          to **3.40:1** against the dark card - under WCAG AA's 4.5:1 for body text, on the one line
          a reader in trouble has to follow. Without the modifier the anchor inherits the
          paragraph's own `text-error`, and daisyUI's `.link` supplies the underline on its own - so
          the link is distinguished by decoration rather than by a hue that fails the check.
          Measured by compositing and reading the pixel, which is the only way to check a token in
          this theme: `getComputedStyle` reports oklch and cannot answer it.

          Inheriting also means this link is **exactly as legible as the sentence around it** in
          both themes, which is the point: it measures 5.53:1 in dark and 2.86:1 in light, and that
          second figure is `text-error`'s own, a failure `docs/TODO.md` already tracks for every
          error line in this app rather than one this link introduces. `link-primary` would have
          added a *second*, separately-failing colour on top of it. */}
      {expired ? (
        <p role="alert" className="text-error text-sm">
          {MESSAGES.unauthenticated}{' '}
          <Link
            className="link"
            href={ACCESS_ROUTES.login}
            target="_blank"
            rel="noopener noreferrer"
          >
            Log in again
          </Link>
        </p>
      ) : (
        <FormError message={failure} />
      )}

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
