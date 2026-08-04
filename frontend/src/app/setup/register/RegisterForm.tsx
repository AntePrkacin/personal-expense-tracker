'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ACCESS_ROUTES } from '@/lib/routes';

import { isEmailValid, isNameValid, toRegisterBody } from '../draft';
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
  firstName: 'Enter your first name.',
  lastName: 'Enter your last name.',
  emailRequired: 'Enter your email address.',
  emailFormat: 'Enter a valid email address.',
  submitFailed: "We couldn't create your account. Please try again.",
} as const;

const FIRST_NAME_ID = 'register-first-name';
const LAST_NAME_ID = 'register-last-name';
const EMAIL_ID = 'register-email';

type FieldErrors = { firstName?: string; lastName?: string; email?: string };

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

  function change(field: 'firstName' | 'lastName' | 'email', value: string) {
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
      firstName: isNameValid(draft.firstName) ? undefined : MESSAGES.firstName,
      lastName: isNameValid(draft.lastName) ? undefined : MESSAGES.lastName,
      email:
        draft.email.trim() === ''
          ? MESSAGES.emailRequired
          : isEmailValid(draft.email)
            ? undefined
            : MESSAGES.emailFormat,
    };
    setErrors(next);
    if (next.firstName || next.lastName || next.email) return;

    const body = toRegisterBody(draft);
    setSubmitFailed(false);
    setPending(true);
    const result = await register(body);

    if (!result.ok) {
      setPending(false);
      setSubmitFailed(true);
      return;
    }

    // Read the address off the body before clearing, not after. Ordering matters:
    // clearDraft empties the store this component renders from.
    clearDraft();
    router.push(`${ACCESS_ROUTES.checkEmail}?email=${encodeURIComponent(body.email)}`);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {/* A grid, not a flex row: the frame draws two 214px fields with a 12px gap
          inside the card's 440px content box, and (440 - 12) / 2 is exactly 214, so
          two equal columns reproduce it without measuring anything (node 129:1156).
          Field is w-full, which spans a grid cell but would overflow a flex row. */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={FIRST_NAME_ID}
          label="First name"
          value={draft.firstName}
          onChange={(event) => change('firstName', event.currentTarget.value)}
          error={errors.firstName}
          required
        />
        <Input
          id={LAST_NAME_ID}
          label="Last name"
          value={draft.lastName}
          onChange={(event) => change('lastName', event.currentTarget.value)}
          error={errors.lastName}
          required
        />
      </div>

      <Input
        id={EMAIL_ID}
        label="Email"
        type="email"
        value={draft.email}
        onChange={(event) => change('email', event.currentTarget.value)}
        error={errors.email}
        required
      />

      {/* role="alert" here, where ui/Field deliberately has none. Field's message
          appears synchronously beside the field the user just left; this one appears
          after a network round trip with nothing else on screen changing, so nothing
          would otherwise tell a screen reader the submit failed. */}
      {submitFailed ? (
        <p role="alert" className="text-body-s text-status-danger-text">
          {MESSAGES.submitFailed}
        </p>
      ) : null}

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
