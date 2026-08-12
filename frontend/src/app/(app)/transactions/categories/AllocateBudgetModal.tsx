'use client';

import { createElement, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import { FormError } from '@/components/FormError';
import { reformatAmountInput } from '@/lib/amountField';
import { currencySymbol } from '@/lib/money';
import type { Allocation, Category } from '@/lib/categories';
import type { Period } from '@/lib/periods';
import type { UpdateCategoryCapsResult } from '@/lib/updateCategoryCaps';

import { isToastedFailure } from '../../failureReporting';
import { Modal, type ModalHandle } from '../../Modal';
import { CapPeriodDialog } from './CapPeriodDialog';
import { useCurrency, useMoney } from '../../PreferencesProvider';
import { useToast } from '../../ToastProvider';
import {
  applyCap,
  invalidRows,
  isDirty,
  MAX_CAP_ROWS,
  overCents,
  toAllocateBody,
  toAllocateDraft,
  toAllocateLedger,
  toAllocateTotals,
  type AllocateDraft,
} from './allocateForm';
import { AllocationBar } from './AllocationBar';

// The Allocate budget modal, from the team's Claude Design system
// (`ui_kits/expensa-app/AllocateModal.jsx`). **There is no Figma frame for it**, so its layout, its
// copy and its states are all invented here and owe A29 sign-off with the rest - `docs/TODO.md`
// carries the list.
//
// Two deliberate departures from the source. It is rebuilt on daisyUI semantic classes rather than
// the source's inline `var(--token)` styles, per `frontend/CLAUDE.md`. And every figure comes from
// `GET /api/categories` rather than from a fixture, which is what `allocateForm.ts` exists to
// convert.
//
// **All the arithmetic is in `allocateForm.ts`**, deliberately: the snap, the ceilings and the diff
// are the parts a reviewer wants pinned, and a suite can drive them with no DOM at all. What is left
// here is state, markup and the two things that need a browser - the caret and the timer.

/** Two islands over the modal's own canvas, matching the source's card-on-canvas relationship. */
const ISLAND = 'card bg-base-200 card-body gap-4 p-5';

/**
 * Every line this modal can show, keyed by field name and by result reason so
 * `MESSAGES[result.reason]` resolves directly - the shape both category modals use.
 *
 * **`missing` promises a refresh and this modal delivers one, on close rather than immediately**,
 * which is what the copy actually says. PET-38's review found the defect it is answering in the
 * same arm next door: the copy said "close this to see the current list" and nothing re-read, so
 * the stale card stayed in the grid forever. The first version of this modal then refreshed on the
 * spot, and a review of *this* branch found two problems with that, both fixed by deferring it. The
 * route re-read can drop `unallocated` to zero, which unmounts the Allocate banner and this dialog
 * with it - taking the explanation and every unsaved cap with no trace. And refreshing the grid
 * behind a dialog that keeps listing the dead category fixes the half of the screen the user is not
 * looking at. Deferring the re-read to the close the copy asks for does both jobs and races
 * nothing.
 *
 * It also says nothing was saved, which is a promise the endpoint actually makes - the whole
 * payload is refused when any id is dead, so the user's other edits are intact.
 *
 * **`tooMany` is a 400 the modal refuses to send rather than one it reports.** See `MAX_CAP_ROWS`.
 */
/** What the toast region says when the bulk cap write lands (PET-77). */
const TOAST_SAVED = 'Category limits saved.';

const MESSAGES = {
  cap: 'Enter an amount greater than 0, or clear it for no limit.',
  invalid: 'We couldn’t save these limits. Please check the amounts and try again.',
  missing:
    'One of these categories no longer exists, so nothing was saved. Close this to see the current list, then try again.',
  unauthenticated: 'Your session has expired. Log in again to save these limits.',
  failed: 'We couldn’t save these limits. Please try again.',
  tooMany: `Only ${MAX_CAP_ROWS} limits can be saved at once. Undo some of your changes and save the rest afterwards.`,
} as const;

/** The default footer hint, exported so no test or story restates a shipped string. */
export const ALLOCATE_HINT = 'Clear a field to leave a category without a limit.';

/**
 * What the list says when there is nothing to allocate to, exported for the same reason.
 *
 * **A reachable state rather than a defensive one, and a review is what found it.** `Uncategorized`
 * is not a row and cannot be deleted, so an account that has deleted every other category has a
 * summary card reporting its whole budget unassigned - `unallocated > 0`, so the Allocate banner
 * draws - over a modal with no fields in it. Without this line that is a column header above an
 * empty box beside a Save that can never enable, and nothing on screen saying why.
 */
export const ALLOCATE_EMPTY =
  'There are no categories to give a limit to yet. Add one from the Categories tab, then set its limit here.';

type AllocateBudgetModalProps = {
  categories: Category[];
  allocation: Allocation;
  /**
   * Every period the account has, for the cap-anchor question this modal asks **once per save,
   * for the whole batch** - the PET-72 plan's user story is where that was decided, and the bulk
   * endpoint's `capsFrom` is one anchor for the payload by the same reasoning. Threaded from the
   * screen's existing `GET /api/periods` read.
   */
  periods: readonly Period[];
  onClose: () => void;
  /**
   * The write, injected rather than imported.
   *
   * **Storybook's Vite build has no notion of `'use server'`**, so it bundles the action as an
   * ordinary module and a press reaches `cookies()` from `next/headers` in the browser. Every
   * action on this screen is injectable for that reason, and two of the three shipped unreachable
   * before a review caught it - so a story that renders this must be handed one.
   */
  save: (body: ReturnType<typeof toAllocateBody>) => Promise<UpdateCategoryCapsResult>;
};

export function AllocateBudgetModal({
  categories,
  allocation,
  periods,
  onClose,
  save,
}: AllocateBudgetModalProps) {
  const router = useRouter();
  const modalRef = useRef<ModalHandle>(null);
  const money = useMoney();
  const { post } = useToast();
  // The cap inputs' prefix glyph, which was a literal `$` until PET-47's review - so a GBP account
  // read "£1,350 spent of £3,000" above a column of fields prefixed with dollars.
  const currency = useCurrency();
  const { formatCurrency, formatWhole } = money;

  // **Read once on open and deliberately not resynced.** A refresh behind the open dialog would
  // otherwise rewrite the fields under the user's hands mid-edit. The cost is that a budget or a cap
  // changed elsewhere while this sits open leaves the ceilings stale, so the saved caps can sum past
  // the current budget - which is a valid server state by A43 and is what the summary card behind
  // renders. `docs/TODO.md` records it rather than fixing it.
  const [original] = useState(() => toAllocateDraft(categories));
  const [ledger] = useState(() => toAllocateLedger(allocation, categories));

  const [draft, setDraft] = useState<AllocateDraft>(original);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * The period start the cap-anchor question is asking about, or `null` when it is closed.
   *
   * `EditCategoryModal.capAnchor`'s shape and `SettingsForm.anchorMonth`'s before it: a failed save
   * leaves the question open on the period the user picked, success closes everything, and Cancel
   * abandons only the question while the draft stays put.
   */
  const [capAnchor, setCapAnchor] = useState<string | null>(null);

  /** The current period's start: the question's default, and the value that sends no anchor. */
  const currentStart = periods.find((period) => period.current)?.start;

  /**
   * Set once the server has told us this list is out of date, which is the `missing` arm.
   *
   * **It disables Save, and that is the point rather than a nicety.** The draft is read once on open
   * and deliberately never resynced, so a payload the server refused for naming a dead category
   * would be refused again identically, forever - a review of PET-70 found the retry the copy invites
   * looping on 404 with no way out but the Close that discards every edit. There is nothing this
   * dialog can do to repair its own list, so the honest state is "this cannot be saved, close it",
   * which is exactly what the message says. Never cleared: no keystroke makes a deleted category
   * exist again.
   */
  const [stale, setStale] = useState(false);

  // **The snap's state machine is deleted with its announcement (PET-77, AC13).** It held a
  // `{ cents }` object purely so a 3.4s timer could revert the `role="status"` line; with the line
  // gone the state was permanently null, the effect returned on its first line forever, and both it
  // and `SNAP_MESSAGE_MS` survived every lint and type gate because the dead code still referenced
  // them. `cappedMessage` moved to `allocateForm.ts`, which is where this file and `docs/TODO.md`
  // both already said it lived - the clamp arithmetic and its copy stay covered by that module's
  // suite, so restoring the line is a `<p role="status">` and nothing re-derived.

  const totals = toAllocateTotals(draft, ledger);

  /**
   * One row's cap, reformatted under the caret and then clamped to what the budget has left.
   *
   * **Two things happen here that cannot happen in `allocateForm.ts`.** `reformatAmountInput` writes
   * the formatted value and the caret onto the real node, which is `lib/amountField.ts`'s job and
   * needs a DOM. And on the snapping keystroke the value React is about to commit differs from the
   * one just written, so the caret is collapsed to the end **explicitly** - the string the user was
   * editing no longer exists, so every offset within it is meaningless, and leaving the collapse to
   * React's own commit would make it browser-dependent.
   *
   * Note a test must not assert `setSelectionRange` was called once on this path: the reformat
   * already called it with the pre-snap offset, so there are two calls and the second is the one
   * that matters.
   */
  function onCapChange(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const typed = reformatAmountInput(element);
    const next = applyCap(draft, index, typed, ledger);
    const row = next.draft[index];

    // **The clamp still happens; only its announcement is gone (PET-77, AC13).** On the snapping
    // keystroke the string the user was editing no longer exists, so the caret is collapsed to the
    // end explicitly - the one place in this app that overrides `lib/amountField.ts`'s caret restore.
    if (next.snappedToCents !== null) {
      element.value = row.cap;
      element.setSelectionRange(row.cap.length, row.cap.length);
    }

    setDraft(next.draft);
    // Clears this row's message on the next keystroke in it, never on another row's - the rule every
    // form in this app follows.
    setErrors((current) => ({ ...current, [row.id]: undefined }));
    setFailure(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Mandatory: a form with no action GETs the current URL and reloads, which would close the modal
    // and discard every cap while looking like a flicker.
    event.preventDefault();

    // Every offending row at once rather than the first, `invalidFields`' rule.
    const invalid = invalidRows(draft);

    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((id) => [id, MESSAGES.cap])));
      return;
    }

    const body = toAllocateBody(original, draft);

    // **Nothing changed, so nothing is sent**, and no refresh either - there is nothing new to read.
    // The endpoint answers 400 to an empty array, which is a correct answer to a question the user
    // did not ask: they pressed Save on a form they had not edited.
    if (body.categories.length === 0) {
      modalRef.current?.close();
      return;
    }

    // Refused here rather than sent and reported, because `@ArrayMaxSize` would answer 400 and the
    // `invalid` copy asks the user to check amounts that are all valid. See `MAX_CAP_ROWS`.
    if (body.categories.length > MAX_CAP_ROWS) {
      setFailure(MESSAGES.tooMany);
      return;
    }

    // **Every save asks "from which period", once for the whole batch** - see `periods`. The
    // question defaults to the current period, so the ordinary allocation is one extra confirm; the
    // send happens in `commitCaps`. A periods list somehow lacking a current entry falls through to
    // the old behaviour, an unanchored send the backend dates at the current period.
    if (currentStart !== undefined) {
      setFailure(null);
      setCapAnchor(currentStart);
      return;
    }

    await send(body);
  }

  /**
   * The cap-anchor question's confirm: the diffed caps, anchored to the chosen period.
   *
   * The body is rebuilt from the draft rather than captured when the question opened -
   * `EditCategoryModal.commitCap`'s call, made a fact by the dialog being modal. The current period
   * sends **no** `capsFrom`, because absent-means-current is the contract's own default.
   */
  async function commitCaps(anchor: string) {
    const body = toAllocateBody(original, draft);

    await send(anchor === currentStart ? body : { ...body, capsFrom: anchor });
  }

  /** The one place the request is sent, whichever path led to it. */
  async function send(body: ReturnType<typeof toAllocateBody>) {
    setFailure(null);
    setPending(true);

    // The `catch` is mandatory rather than defensive. `save` is a Server Action called from the
    // client, so a transport that never completes **rejects** rather than resolving - and a rejection
    // escaping this handler leaves `pending` true for good, which disables Save and kills Enter with
    // it.
    let result: UpdateCategoryCapsResult;

    try {
      result = await save(body);
    } catch {
      setPending(false);
      setCapAnchor(null);
      // A rejection is `failed`, which reports in the toast region (PET-77).
      post({ kind: 'failure', message: MESSAGES.failed });
      return;
    }

    if (!result.ok) {
      setPending(false);
      // The anchor question comes down with any failure, so the message reports once, in the modal
      // holding the edits - see `CapPeriodDialog`'s note on why it carries no failure line.
      setCapAnchor(null);

      // Two of the four arms leave this form (PET-77); `failureReporting.ts` owns the rule. The two
      // that stay are the ones with something to do here: a body to correct, and a category the
      // grid behind this is still drawing.
      if (isToastedFailure(result.reason)) {
        post({ kind: 'failure', message: MESSAGES[result.reason] });
      } else {
        setFailure(MESSAGES[result.reason]);
      }

      // The one arm that marks the list stale, `EditCategoryModal`'s precedent one step further on:
      // `missing` means the grid behind this dialog is drawing a category the server no longer has,
      // which is exactly what the copy says closing will fix. The other three changed nothing on the
      // server. The modal stays open on all four, because the user has a screen of edits in front of
      // them and this line is what explains why they could not be saved - and the re-read happens on
      // the way out rather than here, for the two reasons `MESSAGES.missing` records.
      if (result.reason === 'missing') setStale(true);

      return;
    }

    // Refresh before closing, and close through the dialog so the browser hands focus back to the
    // Allocate banner. The `close` event then calls `onClose`. The anchor question, if open,
    // unmounts with the modal.
    // Posted before the close, which unmounts this component - see `(app)/AddTransactionModal.tsx`.
    // "limits" rather than "caps", which is the word the card's own control uses ("Set limit").
    post({ kind: 'success', message: TOAST_SAVED });

    setCapAnchor(null);
    router.refresh();
    modalRef.current?.close();
  }

  return (
    <>
      <Modal
        ref={modalRef}
        title="Allocate your budget"
        width="wide"
        // The stale re-read happens here rather than on the failure arm that set the flag, so it cannot
        // race the dialog it is meant to be behind. Before `onClose`, so the grid is already being
        // re-fetched by the time the owner unmounts this.
        onClose={() => {
          if (stale) router.refresh();
          onClose();
        }}
        onSubmit={onSubmit}
        footer={
          <>
            {/* Deliberately live while a save is in flight, which is the call both category modals
              make about Cancel: no fetch in this app carries a timeout, so a hung request is exactly
              when a way out matters most. */}
            <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
            {/* Disabled until something really changed, so the primary action cannot fire a request
              the endpoint would refuse for an empty array. Deliberately **not** disabled by
              `invalidRows` - the per-row messages are what tell the user which fields to fix, and a
              dead button with no explanation beside it is worse than a rejected submit. `stale` is
              the opposite case and does disable it: there the explanation is on screen and no edit
              can make the payload acceptable. */}
            <Button
              type="submit"
              label="Save caps"
              disabled={pending || stale || !isDirty(original, draft)}
            />
          </>
        }
      >
        {/* The summary island: the headline amount, the ledger, and the bar spanning both. */}
        <section className={ISLAND}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-base-content/60 text-xs font-semibold uppercase">
                Left to assign
              </span>
              {/* Never negative and never in a danger tone - `toAllocateTotals` clamps at zero, which
                is the whole of the design's rule. The same figure as the "Unassigned" row below, from
                the same place, so the headline and the column cannot disagree. */}
              <span className="font-display text-4xl font-bold">
                {formatWhole(totals.unassignedWhole)}
              </span>
            </div>

            {/* **All three figures come from `toAllocateTotals`, which rounds twice and subtracts
              once.** Formatting each independently is what let this column print figures that did not
              add up under a rule drawn to say they do; `dashboard/BudgetCard.tsx` and
              `SpendingSummaryCard.tsx` both carry the same rule for the same reason. */}
            <dl className="flex min-w-56 flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-base-content/60">Monthly budget</dt>
                <dd className="font-medium">{formatWhole(totals.budgetWhole)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-base-content/60">Assigned to categories</dt>
                <dd className="font-medium">{formatWhole(totals.assignedWhole)}</dd>
              </div>
              <div className="border-base-300 flex justify-between gap-4 border-t pt-1.5">
                <dt className="font-medium">Unassigned</dt>
                <dd className="font-semibold">{formatWhole(totals.unassignedWhole)}</dd>
              </div>
            </dl>
          </div>

          <AllocationBar draft={draft} ledger={ledger} />

          <p className="text-base-content/60 text-xs">Your monthly budget is set in Settings.</p>
        </section>

        {/* The cap island. **`max-h-93 overflow-y-auto` bounds the list rather than the box**, which
          needs nothing from any ancestor - turning `modal-box` into a bounded flex column would drag
          all six of the app's modals through a layout change to serve one. `overscroll-contain`
          stops a scroll at the end of the list chaining out to the box behind it. The negative and
          positive inline padding pair keeps a focus ring on the first or last field from being
          clipped by the scroll container's edge. */}
        <section className="card bg-base-200 card-body gap-0 p-0">
          {/* **The column header goes with the rows rather than standing over an empty box.** With no
            allocatable category there is nothing for "Category" and "Monthly cap" to head, and the
            scroll region has no height to give - so the whole island becomes the one sentence
            explaining it. See `ALLOCATE_EMPTY` for how an account reaches this. */}
          {draft.length === 0 ? (
            <p className="text-base-content/70 px-5 py-6 text-sm">{ALLOCATE_EMPTY}</p>
          ) : (
            <>
              <div className="text-base-content/60 flex justify-between px-5 py-3 text-xs font-semibold uppercase">
                <span>Category</span>
                <span>Monthly cap</span>
              </div>

              <ul className="border-base-300 -mx-1 max-h-93 list-none overflow-y-auto overscroll-contain border-t px-1">
                {draft.map((row, index) => {
                  const Icon = categoryIcon(row.icon);
                  const over = overCents(row);
                  const error = errors[row.id];
                  const fieldId = `allocate-cap-${row.id}`;

                  return (
                    <li
                      key={row.id}
                      className="border-base-300 flex items-center gap-3 px-4 py-3 not-first:border-t"
                    >
                      <span
                        className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(row.color)}`}
                      >
                        {/* `createElement` rather than `<Icon />`: `react-hooks/static-components` reads a
                      capitalised local in JSX as a component created during render, and this repo
                      permits no eslint-disable. A `.map` callback escapes the heuristic in the other
                      call sites; this one is inside one too, but the idiom stays identical so the six
                      tiles in this app can be lifted together later. */}
                        {Icon === null
                          ? null
                          : createElement(Icon, {
                              className: 'size-4.5',
                              'aria-hidden': 'true',
                            })}
                      </span>

                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold">{row.name}</span>
                        <span
                          className={`text-xs ${over === null ? 'text-base-content/60' : 'text-error'}`}
                        >
                          {/* **The overage carries cents where the spend does not, and that asymmetry is
                        the fix rather than the inconsistency it looks like.** A spend is an aggregate
                        and `formatWhole` is what this app draws aggregates with; an overage is a
                        *residual*, and rounding one to whole dollars produced "$0 over this cap" in
                        `text-error` for a cap exceeded by a penny - a red warning asserting the row is
                        not over. Same mixed-precision call `cappedMessage` makes, and for the same
                        reason: the figure that has to be exact is. */}
                          {over === null
                            ? `${formatWhole(row.spent)} spent`
                            : `${formatWhole(row.spent)} spent · ${formatCurrency(over / 100)} over this cap`}
                        </span>
                      </div>

                      {/* **The field is local markup rather than `ui/Input`, and that follows this repo's
                    own precedent rather than departing from it.** These rows need the accessible name
                    on the control and nothing drawn beside it - the column header says "Monthly cap"
                    once and the category name is already text on the row - and `ui/Input` renders its
                    label through `ui/FieldShell`, with no hidden option. Widening a shared primitive
                    for one consumer is exactly what PET-36 declined to do to `ui/Button`, which
                    offers `disabled` alone while a local `<button>` wears the same `btn` literal. So
                    this wears daisyUI's own prefix pattern, byte-identical to `ui/Input`'s currency
                    box minus `input-lg`: the box styling on the wrapping label, the `$` aria-hidden
                    inside it, the control bare. */}
                      <div className="ml-auto w-36 shrink-0">
                        <label className={error ? 'input input-error w-full' : 'input w-full'}>
                          <span aria-hidden="true" className="opacity-60">
                            {currencySymbol(currency)}
                          </span>
                          <input
                            id={fieldId}
                            className="grow text-right"
                            inputMode="decimal"
                            placeholder="No limit"
                            value={row.cap}
                            onChange={(event) => onCapChange(index, event)}
                            // **Disabled while the save is out, unlike Cancel beside it.** The body was
                            // serialised at press time and the success path closes the dialog, so a
                            // keystroke landing during the round trip was silently discarded - the user
                            // watched the modal close on a limit that was never sent. Cancel stays live
                            // deliberately, because no fetch here carries a timeout.
                            disabled={pending}
                            // The row's own name, so eight fields do not all announce as "Monthly cap".
                            aria-label={`Monthly cap for ${row.name}`}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${fieldId}-error` : undefined}
                          />
                        </label>
                        {/* `ui/FieldShell`'s treatment, one step smaller to fit the row. */}
                        {error === undefined ? null : (
                          <p id={`${fieldId}-error`} className="text-error mt-1 text-xs">
                            {error}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* **The snap's `role="status"` line is gone (PET-77, AC13).** It announced that a typed cap
          had been clamped to what the budget had left, and it was one of the four unrelated ways a
          write used to report itself - so the ticket that replaces all four deletes it.

          Read the trade honestly, because it is not the same trade the Settings badge made. That one
          confirmed a *write* and the toast now does it better. This described a *field*: the clamp
          still happens and the clamped figure is still written into the input, so a sighted user sees
          it, and a screen-reader user is no longer told. It cannot become a toast either - the snap
          fires on a keystroke, and a notification per keystroke is a stream rather than a message.
          `docs/plans/2026-08-11_PET-77_toast-notifications.md` carries the recommendation to keep it
          and the note that the product owner chose otherwise; `docs/TODO.md` records what it costs.

          `cappedMessage` survives in `allocateForm.ts` with its suite: it is the arithmetic and the
          copy, and re-deriving either is what a future ticket restoring this would have to do. */}
        {/* Suppressed with no rows, where it would be advice about fields that are not there. */}
        {draft.length > 0 ? <p className="text-base-content/60 text-xs">{ALLOCATE_HINT}</p> : null}

        <FormError message={failure ?? ''} />
      </Modal>

      {/* The cap-anchor question, over this modal - the same nested-dialog case the edit modal and
        its delete confirmation already exercise. Mounted only while being asked. */}
      {capAnchor !== null && (
        <CapPeriodDialog
          value={capAnchor}
          periods={periods}
          confirmLabel="Save caps"
          pending={pending}
          onChange={setCapAnchor}
          onConfirm={() => void commitCaps(capAnchor)}
          onClose={() => setCapAnchor(null)}
        />
      )}
    </>
  );
}
