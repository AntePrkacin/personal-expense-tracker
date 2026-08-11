'use client';

import { CalendarRange } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { Period } from '@/lib/periods';

import { Modal } from '../../Modal';

// The one question a cap change cannot be saved without: **from which period**.
//
// `settings/PaycheckMonthDialog.tsx`'s shape applied to the cap writes, and the PET-72 plan's user
// story (the "Category cap change" subsection) is where the behaviour was decided: a cap change asks
// the same kind of question the budget change asks, a follow-up confirmation listing periods with the
// current one preselected, and the chosen period dates the appended history row. Picking a past
// period is a deliberate, visible re-judging of the periods from it onward - never a silent rewrite,
// because a period a newer cap row already covers keeps its own.
//
// **The options are the account's real periods, not month arithmetic.** They arrive as the same
// `GET /api/periods` list the header's period select draws, so every option is one the backend will
// accept - `capFrom`/`capsFrom` are validated with `startingAt`, which refuses a date that starts no
// period - and every label is the backend's own, because a stretched transition period spans two
// month names no client can derive. That is also why this is **not** `PaycheckMonthDialog` reused:
// that one offers a symmetric month window including *future* months and assembles a paycheck date
// from a day the form holds, while the cap writes take a period `start` verbatim and refuse the
// future outright.
//
// **Not designed.** No frame draws it, so the copy and the glyph are invented and owe A29's sign-off
// with the rest of what `docs/TODO.md` tracks.

/** The copy, in one place, so nothing here interpolates a string inline. */
const TITLE = 'From which period?';

const BODY =
  'The limit applies from the period you pick, onward. Earlier periods keep the limits they were ' +
  'budgeted under.';

const SELECT_ID = 'cap-period-start';

type CapPeriodDialogProps = {
  /**
   * The period start currently selected, `YYYY-MM-DD`.
   *
   * Owned by the modal that opened this, `PaycheckMonthDialog`'s shape: the owner knows what the
   * decision is about, and a failed save leaves this dialog open on the period the user picked so
   * the retry re-sends what they actually chose.
   */
  value: string;
  /** Every period the account has, newest first, from `GET /api/periods`. */
  periods: readonly Period[];
  /** What the affirmative says - "Save changes" or "Save caps", matching the button that led here. */
  confirmLabel: string;
  /** True while the write is out; disables every control including the dismissals, via `locked`. */
  pending: boolean;
  onChange: (start: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

// There is deliberately no `failure` prop, unlike `PaycheckMonthDialog`. A failed save closes this
// question and reports in the modal behind it, where the user's edits are - keeping it open would
// put two identically-named buttons and two copies of one alert on screen at once, and the retry
// costs one extra confirm. The paycheck dialog keeps its failure inline because the form behind it
// holds no edits worth returning to mid-error.

export function CapPeriodDialog({
  value,
  periods,
  confirmLabel,
  pending,
  onChange,
  onConfirm,
  onClose,
}: CapPeriodDialogProps) {
  return (
    <Modal
      title={TITLE}
      align="center"
      locked={pending}
      // A range over a clock: the question is which span of time the limit governs, where the
      // paycheck dialog's `CalendarClock` asks when a schedule starts.
      icon={<CalendarRange aria-hidden="true" className="text-primary size-6" />}
      // The select rather than the affirmative, `PaycheckMonthDialog`'s reason: the user's first act
      // is to read the options, and focusing the affirmative would invite a press before the
      // question has been read.
      initialFocusId={SELECT_ID}
      onClose={onClose}
      footer={
        <>
          {/* Closes only the question, not the modal that asked it: the edits are still there and
              pressing Save asks again. Disabled while pending, with the dismissals - the affirmative
              is the only thing that writes, so a dismissal mid-write could only unmount the surface
              that reports the outcome. */}
          <Button label="Cancel" variant="secondary" onClick={onClose} disabled={pending} />
          <Button label={confirmLabel} onClick={onConfirm} disabled={pending} />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base-content/60 text-sm">{BODY}</p>

        <label className="flex flex-col gap-1.5 text-left" htmlFor={SELECT_ID}>
          <span className="text-sm font-medium">Applies from</span>
          {/* A native `<select>`, `PaycheckMonthDialog`'s call: the list is short, it is inside a
              dialog that already traps focus, and a custom listbox would be new keyboard code for no
              gain. Each option's text is the backend's own label - a stretched period spans two
              month names no arithmetic here could produce. */}
          <select
            id={SELECT_ID}
            className="select select-bordered w-full"
            value={value}
            disabled={pending}
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            {periods.map((period) => (
              <option key={period.start} value={period.start}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
