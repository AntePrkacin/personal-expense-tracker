'use client';

import { CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { Modal } from '../Modal';
import { paycheckMonths } from './settingsForm';

// The one question a budget or pay-day change cannot be saved without: **from which paycheck**.
//
// **It is a confirmation with a control in it, which is a shape this app has not drawn before.** The
// two existing centred dialogs (frame 12 and the category delete) ask a yes-or-no; this one asks a
// yes-or-no *and* a which-one, because the answer is what the write is anchored to. `Modal`'s
// `'center'` shape is still the right frame for it - a tinted circle, a centred title, and a split
// footer whose wider button is the affirmative - and the select sits in `children`, which that
// component has never had an opinion about.
//
// **Not designed.** SET-5 draws one "Save changes" and no dialog at all, so every string and the
// glyph here are invented and owe A29's sign-off with the rest of what that entry tracks. The shape
// was chosen to be the least surprising thing available rather than the most expressive: a
// confirmation the user can dismiss, defaulting to the answer that needs no thought.
//
// **Why a dialog rather than a field on the card.** A pay-day question sitting permanently in the
// Preferences card would be asking every visitor to that screen about a change they are not making -
// and it would have to hold a value even when nothing had moved, which is a control whose state means
// nothing most of the time. Asking at the moment of saving puts the question where the answer is
// knowable.

/** The copy, in one place, so nothing here interpolates a string inline. */
const TITLE = 'From which paycheck?';

const BODY =
  'Your budget and pay day apply from the paycheck you pick, onward. Earlier periods keep the ' +
  'budget they were spent against.';

const SELECT_ID = 'settings-paycheck-month';

type PaycheckMonthDialogProps = {
  /**
   * The month currently selected, as `YYYY-MM`.
   *
   * **Owned by `SettingsForm` rather than held here**, which is the shape every other dialog in this
   * app has: the screen owns what the decision is about and this renders it. It is also what makes
   * reopening after a failed save reopen on the month the user picked, rather than silently resetting
   * to the default and changing what a second press would write.
   */
  value: string;
  /** Today, as `YYYY-MM-DD`. Only the nine-month window is derived from it. */
  today: string;
  /** True while a write is out, which disables every control including the dismissals. */
  pending: boolean;
  onChange: (month: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function PaycheckMonthDialog({
  value,
  today,
  pending,
  onChange,
  onConfirm,
  onClose,
}: PaycheckMonthDialogProps) {
  const months = paycheckMonths(today);

  return (
    <Modal
      title={TITLE}
      align="center"
      // A clock over a calendar: the question is *when a change starts*, not which date something
      // happened on - `(app)/DateField.tsx` owns the second meaning and draws a plain calendar for it.
      icon={<CalendarClock aria-hidden="true" className="text-primary size-6" />}
      // The select rather than the confirming button, because the user's first act here is to read
      // nine options and possibly change one. Focusing the affirmative would invite a press before
      // the question has been read.
      initialFocusId={SELECT_ID}
      onClose={onClose}
      footer={
        <>
          {/* Cancel first in the DOM, which is what puts it on the left of the split footer.
              `secondary`, matching `ConfirmDeleteDialog`'s own Cancel. It closes without writing
              anything - the whole save is abandoned, not merely the dialog, because there is no half
              of this the user has confirmed.

              **Disabled while pending, unlike that dialog's Cancel**, and the difference is what the
              two promise. There, Cancel stays live because it does not claim to abort a delete
              already in flight. Here the affirmative is the *only* way anything is written, so a
              press during the round trip could only unmount a dialog whose write is still landing -
              leaving the form with no way to report the outcome. */}
          <Button label="Cancel" variant="secondary" onClick={onClose} disabled={pending} />
          {/* Named identically to the button that opened it, deliberately: the press the user made is
              the press this completes, and calling it something else here would read as a second,
              different action. */}
          <Button label="Save changes" onClick={onConfirm} disabled={pending} />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base-content/60 text-sm">{BODY}</p>

        <label className="flex flex-col gap-1.5 text-left" htmlFor={SELECT_ID}>
          <span className="text-sm font-medium">First paycheck</span>
          {/* A native `<select>`, unlike the five custom pickers this app draws. Those exist because
              a designed popup could not be reproduced with one - `MonthStartField`'s own header
              records that a native select's popup height cannot be capped in Firefox or Safari. This
              list is **nine** rows, which no browser scrolls, and it is inside a dialog that already
              traps focus; a custom listbox here would be new keyboard code for no gain. */}
          <select
            id={SELECT_ID}
            className="select select-bordered w-full"
            value={value}
            disabled={pending}
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
