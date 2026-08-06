'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/FormError';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isEmailValid } from '@/lib/email';
import { ACCESS_ROUTES } from '@/lib/routes';

import type { LoginLinkResult } from './actions';

// The interactive half of 23 Log in: the email field and the Back / Log in row
// (nodes 132:1151, 132:1152).
//
// Step 1's form conventions apply unchanged - a real `<form noValidate onSubmit>`,
// `preventDefault()`, `required` with no asterisk, validation on submit only - and
// `app/setup/BudgetForm.tsx` records why each of the three fails silently if missed.
// What differs from step 3 is where the value lives; see below.

/**
 * The three messages, all owing designer sign-off under A29 alongside PET-11's five.
 *
 * The two field messages are the strings `RegisterForm` already uses for the same
 * field, which is deliberate: two screens collecting one address should not describe
 * one mistake two ways. They are copied rather than shared because there is no copy
 * module in this repo and both forms keep their own consts - two overlapping strings
 * are the wrong reason to invent one.
 *
 * The submit failure is this screen's own, and is shaped like PET-11's:
 * `We couldn't create your account. Please try again.`
 */
const MESSAGES = {
  emailRequired: 'Enter your email address.',
  emailFormat: 'Enter a valid email address.',
  submitFailed: "We couldn't send your login link. Please try again.",
} as const;

/** The field id, which `ui/Input` requires rather than generating; see its note on useId. */
const EMAIL_ID = 'login-email';

type LoginFormProps = {
  /** The send-link server action. (A prop rather than an import so the suite can pass a jest.fn().) */
  sendLink: (email: string) => Promise<LoginLinkResult>;
};

export function LoginForm({ sendLink }: LoginFormProps) {
  const router = useRouter();
  // Component state, **not** the onboarding draft. `/login` sits outside
  // `app/setup/layout.tsx`, so there is no provider to reach and `useSetupDraft` would
  // throw - and a returning user's address has nothing to do with a half-finished
  // onboarding payload. Nothing here has to survive a round trip either: LOG-4's Back
  // goes to Welcome, which is a way out rather than a step to come back from.
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [pending, setPending] = useState(false);

  function change(value: string) {
    setEmail(value);
    // Both clear as soon as the user starts fixing it, rather than surviving until a
    // second submit. Messages appear on submit only - see onSubmit.
    setError(undefined);
    setSubmitFailed(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no `action` submits a GET to the current URL and reloads.
    event.preventDefault();

    // Empty and malformed get different messages, because "enter your email" is wrong
    // advice for somebody who did. Same split RegisterForm makes.
    const next =
      email.trim() === ''
        ? MESSAGES.emailRequired
        : isEmailValid(email)
          ? undefined
          : MESSAGES.emailFormat;

    setError(next);
    // AC2: no link is requested at all, which is what makes this an early return
    // rather than a message rendered beside a fired request.
    if (next) return;

    setSubmitFailed(false);
    setPending(true);
    const result = await sendLink(email.trim());

    if (!result.ok) {
      setPending(false);
      setSubmitFailed(true);
      return;
    }

    // A bare path. The action stashed the address in an httpOnly cookie, which is what
    // keeps it out of the server's request log; screen 24 reads it back with
    // `cookies()`.
    //
    // `pending` deliberately stays true, the same call `RegisterForm` makes: the link is
    // sent now, and the push takes a moment, so re-enabling would offer a second request
    // that supersedes the link just emailed. Nothing needs freezing here the way step 3
    // freezes its fields - this value lives in component state and nothing clears it.
    router.push(ACCESS_ROUTES.checkEmail);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <Input
        id={EMAIL_ID}
        label="Email"
        type="email"
        value={email}
        onChange={(event) => change(event.currentTarget.value)}
        error={error}
        required
      />

      {/* One line for a failed request. `components/FormError.tsx` owns the treatment and the
          `role="alert"` reasoning for all four of the app's form-level messages; this file's
          only decision is which copy and when. */}
      <FormError message={submitFailed ? MESSAGES.submitFailed : null} />

      {/* pt-1.5 is the designed 6px above this row: the footer frame is 49px tall
          with its button inset 6px from the top (node 132:1152). */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
        {/* LOG-4: Back returns to Welcome. A literal '/' rather than an ACCESS_ROUTES
            entry, because Welcome is served at the root and lib/routes.ts declares no
            path for it - the same call BudgetForm records.

            Back is a link and Log in is a button, for step 1's reason: this submit's
            navigation is conditional on validation and on a round trip, and an anchor
            cannot be blocked. */}
        <Button href="/" label="Back" variant="text" />

        {/* Disabled while the request is out. A19 designs no pending state, so this is
            ours: a double submit spends one of the five per-address attempts the
            backend's throttler allows and the second comes back a 429. */}
        <Button type="submit" label="Log in" disabled={pending} />
      </div>
    </form>
  );
}
