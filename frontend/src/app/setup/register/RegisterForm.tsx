'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isEmailValid } from '@/lib/email';
import { ACCESS_ROUTES } from '@/lib/routes';

import { isBudgetValid, isNameValid, type SetupDraft, toRegisterBody } from '../draft';
import { useSetupDraft } from '../SetupDraftProvider';
import type { RegisterResult } from './actions';

// The interactive half of 22 Register: the three fields, the Back / Finish setup row
// and the one request onboarding makes (nodes 129:1156, 129:1170, 129:1148).

/**
 * The five validation and failure messages (REG-2, A29).
 *
 * All new copy, shaped after the one message already live in the app,
 * `Enter an amount greater than 0.` A29 records that the design file draws no error
 * state at all, so these owe a designer sign-off.
 */
const MESSAGES = {
  fullName: 'Enter a display name.',
  emailRequired: 'Enter your email address.',
  emailFormat: 'Enter a valid email address.',
  submitFailed: "We couldn't create your account. Please try again.",
} as const;

const FULL_NAME_ID = 'register-full-name';
const EMAIL_ID = 'register-email';

type FieldErrors = { fullName?: string; email?: string };

/** The two values as typed, kept on screen after the draft is cleared. */
type ShownFields = Pick<SetupDraft, 'fullName' | 'email'>;

type RegisterFormProps = {
  /**
   * The register server action.
   *
   * A prop rather than an import so the suite can pass a `jest.fn()`: mocking the
   * module would mean `jest.mock` with a relative specifier and a stubbed `fetch`
   * to assert one call shape. The screen passes the real action down, which is the
   * ordinary way a Server Component hands one to a client component.
   */
  register: (body: ReturnType<typeof toRegisterBody>) => Promise<RegisterResult>;
};

export function RegisterForm({ register }: RegisterFormProps) {
  const router = useRouter();
  const { draft, patchDraft, clearDraft } = useSetupDraft();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitFailed, setSubmitFailed] = useState(false);
  const [pending, setPending] = useState(false);
  // Set once, on the way out. clearDraft re-renders this form straight away while
  // the navigation it precedes takes a moment, so without this the card visibly
  // empties itself before the next screen arrives.
  const [shown, setShown] = useState<ShownFields | null>(null);

  const fields: ShownFields = shown ?? draft;

  function change(field: 'fullName' | 'email', value: string) {
    // Frozen means the register succeeded and we are navigating away; a keystroke
    // landing here would write a new draft over the one just cleared.
    if (shown !== null) return;

    patchDraft({ [field]: value });
    // Same rule as step 1: the message appears on submit and clears as soon as the
    // user starts fixing that field.
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitFailed(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Without this the form GETs the current URL and reloads. The draft is in
    // sessionStorage, so it would come back filled in and read as a flicker.
    event.preventDefault();

    // Every field at once rather than the first failure, so two empty fields show
    // two messages.
    const next: FieldErrors = {
      fullName: isNameValid(draft.fullName) ? undefined : MESSAGES.fullName,
      email:
        draft.email.trim() === ''
          ? MESSAGES.emailRequired
          : isEmailValid(draft.email)
            ? undefined
            : MESSAGES.emailFormat,
    };
    setErrors(next);
    if (next.fullName || next.email) return;

    // The two values this screen submits on behalf of steps 1 and 2 have to be
    // checked too, and only the budget can be missing - an empty selection is
    // legal (A4). Reachable without going through step 1 at all: the draft is per
    // tab, so opening /setup/register in a new tab starts empty, and the route is
    // not gated. Left unchecked, parseAmountInput('') is NaN, JSON.stringify turns
    // that into null, and RegisterDto's @IsNumber rejects it - a 400 rendered as
    // the generic message, on a screen with no way to fix what is actually wrong.
    //
    // Sent back to step 1 rather than given a message, because the design has no
    // copy for a budget that went missing and step 1 is where it gets set. The
    // draft survives the trip, so the two names and the email are still here on the
    // way back.
    if (!isBudgetValid(draft.budget)) {
      router.push(ACCESS_ROUTES.setup);
      return;
    }

    const body = toRegisterBody(draft);
    setSubmitFailed(false);
    setPending(true);
    const result = await register(body);

    if (!result.ok) {
      setPending(false);
      setSubmitFailed(true);
      return;
    }

    // Nothing about the address travels here: the action stashed it in an httpOnly
    // cookie, which is what keeps it out of the server's request log, and screen 24
    // reads it back with `cookies()`. So this is a bare path.
    //
    // Freeze what is on screen before clearing. clearDraft re-renders this form
    // synchronously while the push takes a moment, so the card would otherwise empty
    // itself in front of the user. `pending` deliberately stays true too: the account
    // exists now, so the button must not offer a second registration.
    setShown({ fullName: draft.fullName, email: draft.email });
    clearDraft();
    router.push(ACCESS_ROUTES.checkEmail);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {/* **One full-width field, where the frame draws two 214px ones in a grid.** PET-72
          collapsed the profile's two name columns into one, so the grid that reproduced the frame's
          (440 - 12) / 2 columns went with it - a single field in a two-column grid would sit in the
          left half with a hole beside it. Labelled "Display name", and the placeholder says a
          nickname is fine, because that is what one free-text field honestly offers. */}
      <Input
        id={FULL_NAME_ID}
        label="Display name"
        placeholder="Your name, full name or nickname."
        value={fields.fullName}
        onChange={(event) => change('fullName', event.currentTarget.value)}
        error={errors.fullName}
        required
      />

      <Input
        id={EMAIL_ID}
        label="Email"
        type="email"
        value={fields.email}
        onChange={(event) => change('email', event.currentTarget.value)}
        error={errors.email}
        required
      />

      {/* `components/FormError.tsx` owns this line's treatment, its `role="alert"` and the
          argument against daisyUI's filled `alert` box. This screen's decision is only which
          copy and when - and A29 still owes the copy a sign-off. */}
      <FormError message={submitFailed ? MESSAGES.submitFailed : null} />

      {/* pt-1.5 is the designed 6px above this row (node 129:1148). Back is a link
          and Finish setup a submit button, step 1's split: the forward exit is
          conditional on validation and an anchor cannot be blocked.

          Disabled while the request is out. A19 designs no pending state, but a
          double submit spends one of the five per-address attempts the backend's
          throttler allows, so a control that stays live is a defect rather than a
          missing nicety. */}
      <div className="flex items-center justify-between pt-1.5">
        <Button href={ACCESS_ROUTES.setupCategories} label="Back" variant="text" />
        <Button type="submit" label="Finish setup" disabled={pending} />
      </div>
    </form>
  );
}
