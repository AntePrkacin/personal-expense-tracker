'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';

import { isToastedFailure } from './failureReporting';
import { Modal, type ModalHandle } from './Modal';
import { useToast } from './ToastProvider';

// The confirmation behind both deletes: frame 12 (transaction) and frame 20 (category).
//
// **Lifted at the second consumer rather than the third, which is a deliberate exception to this
// repo's rule of three and a code review is why.** The rule exists so a shared thing is shaped by
// real callers rather than by a guess, and it is right about *markup*. What lives here is not
// markup: it is four behaviours that were each found by a code review, got fixed once, and were
// then duplicated by copy-paste into a second file where the next such fix would not reach them.
// Two copies of a hard-won fix is a different risk from two copies of a `<p>`.
//
// The four, all of them non-obvious and all of them previously stated twice:
//
// 1. **The `try` around the action call.** Every action here is documented as never throwing, and
//    that guarantee is about the action's own body - it cannot cover the client-to-Server-Action
//    RPC *carrying* the call, which rejects when the browser is offline, the connection drops, or a
//    deployment moves the action id out from under an open tab. Without the catch, `setPending`
//    never clears and Delete stays disabled with no message and no way out but Escape.
// 2. **A failed arm can still need a refresh.** A 404 means the row is already gone from the
//    server, so whatever is behind this dialog is showing something that no longer exists - which
//    is exactly what that arm's copy tells the user closing the dialog will fix. `staleReasons` is
//    where a caller says which of its reasons mean that.
// 3. **Refresh, then close, then `onDeleted` - in that order.** `router.refresh()` first so the
//    list behind is already re-reading; `close()` next so the browser's focus restore aims at an
//    element still attached; `onDeleted` last so a modal *behind* this one unwinds top-first.
//    Reversed, the restore targets an element the callback has just detached.
// 4. **Delete disables while the request is out and Cancel deliberately does not.** A second
//    Delete answers 404, which would replace a succeeding delete with "that is already gone"; but
//    no fetch in this app carries a timeout, so a hung request is exactly when a visible way out
//    matters most, and the centred shape has no X beside it.
// 5. **The confirmation is posted here, and PET-77 added it as a fifth for the same reason as the
//    other four.** Both callers unwind on success - the dialog closes, the row goes, sometimes the
//    route changes - so neither has a surface left to say "that worked" on. Putting it in one place
//    is what stops the next delete inventing a sixth way to report itself.
//
// **What stays with each caller is the copy and the target.** This component never learns what a
// transaction or a category is: it takes a rendered `body` string, a `title`, and a `remove` that
// the caller has already bound to its own id. That is what keeps `DeleteTransactionDialog`'s
// `DeleteTarget` and `DeleteCategoryDialog`'s `DeleteCategoryTarget` from leaking into one shape
// they do not share, and it is why the two wrappers still exist rather than every call site
// reaching for this directly.

/**
 * The reason name this component falls back to when the RPC carrying the action rejects.
 *
 * **A shared literal rather than a prop**, because it is already a shared convention: every delete
 * action in this app folds an unclassifiable failure into `failed`, and `lib/backend.ts` documents
 * an absent status as exactly that. A prop would be a knob with one possible value at both call
 * sites, and `const` is what lets the type below require the matching copy.
 */
export const FAILED = 'failed';

/**
 * The shape both delete actions answer in.
 *
 * **`'failed'` is unioned in rather than left to the caller's `R`, and that is what removes a cast
 * from this file.** The component has to be able to produce a result itself when the RPC carrying
 * the action rejects, and it can only name one reason to do it with. Writing `R` alone forced a
 * `'failed' as R` in the catch - asserting membership nothing had checked, which is exactly what
 * `categoryForm.ts` refuses to do about colour tokens. Carrying it in the type means every caller's
 * `messages` must supply that line, and the compiler is what says so.
 */
export type ConfirmDeleteResult<R extends string> =
  { ok: true } | { ok: false; reason: R | typeof FAILED };

type ConfirmDeleteDialogProps<R extends string> = {
  /** The centred heading, e.g. "Delete this category?". */
  title: string;
  /** The rendered body sentence. Built by the caller, so no interpolation happens here. */
  body: string;
  /**
   * What the toast region says once the row is really gone (PET-77).
   *
   * **Required rather than defaulted**, which is `messages`' own argument applied to the fifth
   * behaviour this component now carries: a shared default would have both confirmations say the
   * same sentence, and they must not - deleting a category also moves every transaction it held,
   * which is the half a user has to be told about. Required means a third caller cannot quietly
   * inherit the wrong one.
   */
  confirmation: string;
  /**
   * One line per reason the caller's action can answer with (A29).
   *
   * A `Record` rather than a lookup function, so the type system requires a line for every arm the
   * caller's union declares - adding a reason without its copy is a build error rather than an
   * `undefined` rendered into the alert.
   */
  messages: Record<R | typeof FAILED, string>;
  /**
   * The delete, already bound to whatever it is deleting.
   *
   * Taking a thunk rather than an id is what keeps this component free of any notion of a target.
   * A prop rather than an import for the reason every modal here takes one: the suite passes a
   * `jest.fn()` and needs no module mock, so the `@/` alias trap never comes up.
   */
  remove: () => Promise<ConfirmDeleteResult<R>>;
  /**
   * Reasons that mean the server no longer has the row, so the surface behind this is stale.
   *
   * The one failure arm that still refreshes. Defaults to none, so a caller has to say which of
   * its reasons this is true of rather than inheriting a guess.
   */
  staleReasons?: readonly (R | typeof FAILED)[];
  /** Called once the dialog has closed, however it closed. The owner stops rendering this. */
  onClose: () => void;
  /** Called after a delete that really removed the row, and only then - never on a failure arm. */
  onDeleted?: () => void;
  /**
   * Whether `onDeleted` leaves this route, in which case the success path must **not** refresh.
   *
   * A refresh re-runs the route the user is currently on, which on a detail page about to be left
   * means re-reading the very row just deleted, getting a 404 and racing the navigation.
   */
  navigates?: boolean;
  /** The glyph in the tinted circle. Defaults to the trash both confirmations draw. */
  icon?: React.ReactNode;
};

export function ConfirmDeleteDialog<R extends string>({
  title,
  body,
  confirmation,
  messages,
  remove,
  staleReasons = [],
  onClose,
  onDeleted,
  navigates = false,
  icon = <Trash2 className="size-6" aria-hidden="true" />,
}: ConfirmDeleteDialogProps<R>) {
  const router = useRouter();
  const { post } = useToast();
  const modalRef = useRef<ModalHandle>(null);

  /** The post-network failure line, already resolved to its copy. `null` means none showing. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setFailure(null);
    setPending(true);

    // Behaviour 1 above. The action's own "never throws" does not cover the RPC carrying it.
    let result: ConfirmDeleteResult<R>;

    try {
      result = await remove();
    } catch {
      // No cast: `ConfirmDeleteResult` unions `FAILED` in for exactly this line, so the reason is
      // one the caller's `messages` is required to carry a line for.
      result = { ok: false, reason: FAILED };
    }

    if (!result.ok) {
      setPending(false);

      // **Behaviour 5 (PET-77): where the failure is reported is a property of the reason.** Both
      // callers' `missing` and `fallback` arms ask the user to close this and look at the current
      // list, which is an instruction and belongs where they are about to act; `failed` names
      // nothing they can do here. `(app)/failureReporting.ts` owns the rule for all twelve sites.
      if (isToastedFailure(result.reason)) {
        post({ kind: 'failure', message: messages[result.reason] });
      } else {
        setFailure(messages[result.reason]);
      }

      // Behaviour 2 above.
      if (staleReasons.includes(result.reason)) router.refresh();

      return;
    }

    // **Posted before the unwind, and this dialog is the sharpest case for it.** A delete removes
    // the row *and* whatever opened this - a kebab that died with its row, an edit modal coming
    // down behind it, sometimes the whole route (`navigates`). There is no surface left to report
    // on, which is precisely why this was the write that reported itself with nothing at all.
    post({ kind: 'success', message: confirmation });

    // Behaviour 3 above.
    if (!navigates) router.refresh();
    modalRef.current?.close();
    onDeleted?.();
  }

  return (
    <Modal
      ref={modalRef}
      title={title}
      align="center"
      icon={icon}
      onClose={onClose}
      // No `onSubmit`, deliberately: there is nothing to type, so Enter has nothing to submit and
      // a `<form>` around two buttons would only invite one of them to become a submit by accident.
      footer={
        <>
          {/* Behaviour 4 above: Cancel is deliberately not disabled while pending. It closes and
              does nothing *before* Delete is pressed, which is the whole of what it promises; it
              does not abort a delete already in flight and does not pretend to, because aborting
              the RPC would not un-delete anything the server may already have done. */}
          <Button label="Cancel" variant="secondary" onClick={() => modalRef.current?.close()} />
          {/* `danger` is `btn btn-error`, already in ui/Button for both confirmations. */}
          <Button label="Delete" variant="danger" onClick={onDelete} disabled={pending} />
        </>
      }
    >
      {/* Centred to match the header; `Modal` deliberately has no opinion about children. */}
      <p className="text-base-content/70 text-center text-sm">{body}</p>

      {/* `role="alert"` where ui/FieldShell's inline message has none: this appears after a network
          round trip with nothing else on screen changing, so nothing else would tell a screen
          reader the delete failed. */}
      {failure !== null ? (
        <p role="alert" className="text-error text-center text-sm">
          {failure}
        </p>
      ) : null}
    </Modal>
  );
}
