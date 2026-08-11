'use client';

import { Send, Square } from 'lucide-react';

import { MAX_MESSAGE_CHARS } from './assistantChat';

// The composer: a multiline field, a submit that becomes "Stop", and the disclosure beside it.
//
// **A real `<form noValidate onSubmit>` with `preventDefault()` and a `type="submit"` button**,
// per the three silent failures `app/setup/BudgetForm.tsx` records: a form with no `action` GETs
// the current URL and reloads, the browser's own validation bubble replaces any designed message,
// and an `onClick`-only button leaves Enter dead.
//
// **A `<textarea>`, so Enter submits and Shift+Enter inserts a newline - which needs an explicit
// keydown handler.** That is the mirror image of `IconSelect`, where `Modal` wraps its body in a
// real form so Enter submitting is the *default* and had to be stopped. Here it is wanted, and its
// absence is silent: a textarea's Enter inserts a newline and nothing would submit but the mouse.
//
// **While a turn is in flight the submit button becomes "Stop" and calls `abort()`** rather than
// being merely disabled. That is the visible half of the abort chain, and it is why the whole
// feature is a route handler rather than a Server Action - see
// `docs/explainers/cancelling-an-ai-request.md`.
//
// **Escape does not cancel.** This screen is not in a dialog, so there is no `<dialog>` default
// action to intercept, and a key with no affordance naming it is not discoverable. The Stop button
// is the affordance.
//
// **The character cap is restated here as a literal.** `maxLength` reaches no generated type, so
// there is nothing to read it out of - the `MAX_CAP_ROWS` precedent - and the 400 it would
// otherwise produce is advice the user cannot act on. `assistantChat.ts` names the DTO it mirrors.

/**
 * **The disclosure, and it is categorically larger than receipt scanning's.**
 *
 * That one sends a receipt image, category names and up to fifty merchant names, and its own
 * review found the copy naming two of the three. This sends **every amount and every date** as
 * well, and stores the conversation - so the line names four things: that your transactions go,
 * naming merchant, amount, date and category; that this conversation goes with them; that it may
 * be used to improve Google's models; and that the conversation is saved to your account, where a
 * receipt scan stores nothing.
 *
 * **Static rather than dismissible**, and visible before the first message: there is no
 * preferences store to remember a dismissal, and a real training opt-in is still deferred (see
 * `docs/TODO.md`). The string lives here and `backend/src/assistant/CLAUDE.md` cites it by file
 * name rather than copying it - the receipt-scanning preview already mirrors a string with nothing
 * checking that the two agree, and a second unchecked mirror would double that liability.
 */
export const DISCLOSURE =
  'Your transactions - merchant, amount, date and category - and this conversation are sent to Google Gemini to answer you, and may be used to improve their models. Conversations are saved to your account.';

export type AssistantComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Submits the current value. The screen owns what that means. */
  onSubmit: () => void;
  /** Cancels the turn in flight. Only called while `pending`. */
  onStop: () => void;
  pending: boolean;
};

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  pending,
}: AssistantComposerProps) {
  const canSend = value.trim().length > 0;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        // A form with no `action` GETs the current URL and reloads. See the header comment.
        event.preventDefault();
        if (!pending && canSend) {
          onSubmit();
        }
      }}
      className="flex flex-col gap-2"
    >
      {/* The label is visible rather than `sr-only`: this is the screen's one input and naming it
          costs a line that also tells a first-time visitor what the field is for. */}
      <label className="label text-sm font-medium" htmlFor="assistant-message">
        Ask about your spending
      </label>

      <div className="flex items-end gap-2">
        <textarea
          id="assistant-message"
          className="textarea h-24 w-full"
          placeholder="How much did I spend on groceries last month?"
          maxLength={MAX_MESSAGE_CHARS}
          value={value}
          disabled={pending}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter submits, Shift+Enter inserts a newline. A textarea does the opposite by
            // default, and the difference is invisible until somebody tries the keyboard.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!pending && canSend) {
                onSubmit();
              }
            }
          }}
        />

        {/* Two buttons rather than one whose label changes, so the submit stays a real
            `type="submit"` - the thing that makes Enter work - and Stop is never a submit that
            has to be intercepted. Exactly one is rendered at a time. */}
        {pending ? (
          <button type="button" className="btn btn-error" onClick={onStop}>
            <Square className="size-4" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            <Send className="size-4" aria-hidden="true" />
            Send
          </button>
        )}
      </div>

      <p className="text-base-content/60 text-xs">{DISCLOSURE}</p>
    </form>
  );
}
