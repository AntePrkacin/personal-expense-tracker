'use client';

import { SendHorizontal, Square } from 'lucide-react';

import { MAX_MESSAGE_CHARS } from './assistantChat';

// The composer: a multiline field with its send inside it, and the disclosure beneath.
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
//
// **PET-76 moved this whole thing into a `card bg-base-100`, and it is a fix at the cause rather
// than a treatment.** The composer floated directly on the page canvas, which
// `app/layout.tsx` paints `bg-base-200` - and `base-200` is also exactly what daisyUI fills and
// borders a **disabled** `textarea` with. So the box the user is waiting on vanished into the page
// for the whole of a turn: fill, border and all, with every gate green. daisyUI assumes a field
// sits on a `base-100` card, which every other form in this app does, so putting this one there
// makes the enabled state a bordered field on white and the disabled state a grey plate, both for
// free. A `disabled:bg-base-100` override was the obvious alternative and is the wrong one - it
// lands at equal specificity against daisyUI's own rule and is resolved by emission order rather
// than by the attribute, which is the fight `frontend/CLAUDE.md` records losing three times.
//
// **The send moved inside the box in the same change**, the messaging-app arrangement, as a
// glyph-only circular button in the bottom-right corner. Two things about that are load-bearing.
// The textarea takes trailing padding, or a long question runs underneath the button; and it takes
// `resize-none`, because the user agent's own resize handle occupies exactly the corner the button
// now sits in. The accessible names are unchanged - `aria-label` carries what the visible label
// used to - so every existing assertion still passes, which is the point of naming them that way.

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
      // The card is the fix for the disappearing disabled field - see the header comment. `gap` is
      // deliberately absent: `card-body` ships its own `gap: .5rem`, which is the `gap-2` this
      // markup used to write out by hand.
      className="card bg-base-100 shadow-sm"
    >
      <div className="card-body">
        {/* The label is visible rather than `sr-only`: this is the screen's one input and naming it
            costs a line that also tells a first-time visitor what the field is for. It stays
            visible now the send is a glyph, which matters more rather than less - it is the only
            text on the control. */}
        <label className="label text-sm font-medium" htmlFor="assistant-message">
          Ask about your spending
        </label>

        {/* `relative`, so the button below can be positioned against the field rather than laid out
            beside it. */}
        <div className="relative">
          <textarea
            id="assistant-message"
            // `pe-14` clears the button in the corner: `btn-circle` is 2.5rem wide and sits at
            // `end-2`, so 3.5rem of trailing padding leaves half a rem of air - measured at 56px of
            // padding-inline-end in the walk. Both are logical properties (`pe`, `end`) rather than
            // `pr`/`right`, so the pair stays correct if this app is ever laid out right-to-left.
            // `resize-none`
            // because the user agent's resize handle occupies that exact corner otherwise, and a
            // grab handle under a button is a control the user cannot reach.
            className="textarea h-24 w-full resize-none pe-14"
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
              has to be intercepted. Exactly one is rendered at a time.

              **Glyph-only, so each carries its name in an `aria-label`** and the glyph inside is
              `aria-hidden`, which is `frontend/CLAUDE.md`'s rule for every lucide mark in this app.
              The names are the strings the visible labels used to be, so the accessible names did
              not change and neither did a single assertion in `AssistantChatScreen.test.tsx`.

              `SendHorizontal` rather than the `Send` this imported: the closer mark for a chat
              send, and an **outline** plane rather than the solid one a messaging app usually
              draws, because lucide is stroke-based throughout and a filled mark would mean a
              hand-traced SVG - which the same file forbids outright. */}
          {pending ? (
            <button
              type="button"
              aria-label="Stop"
              className="btn btn-circle btn-error absolute end-2 bottom-2"
              onClick={onStop}
            >
              <Square className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              className="btn btn-circle btn-primary absolute end-2 bottom-2"
              disabled={!canSend}
            >
              <SendHorizontal className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <p className="text-base-content/60 text-xs">{DISCLOSURE}</p>
      </div>
    </form>
  );
}
