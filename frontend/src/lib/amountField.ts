import { amountCaret, formatAmountInput } from './format';

// The currency field as it is being typed into: one function, four consumers.
//
// **Lifted at the fourth, which is one past this repo's rule of three.** `app/setup/BudgetForm.tsx`
// wrote it, `(app)/AddTransactionModal.tsx` copied it, `(app)/EditTransactionModal.tsx` copied that,
// and `(app)/transactions/categories/AddCategoryModal.tsx` copied that - four byte-identical bodies,
// each carrying its own account of why the call order is what it is. A fix to the sequence would
// have had to land in all four, and three of them could have silently kept the old behaviour with
// every gate green. `frontend/src/components/CLAUDE.md` states the rule; `lib/session.ts`'s
// `authorizedGet` is the worked example of following it.
//
// **A `lib/` module rather than a fifth part of `lib/format.ts`, because this one touches the DOM.**
// That file is pure display formatting - strings in, strings out, no element anywhere - which is
// what lets its suite pin `formatAmountInput`'s idempotence without a document. This is the DOM
// dance built on top of those primitives, so it gets its own file rather than blurring that line.
//
// **It takes the element, not the React event**, which keeps the module React-free and is why it can
// serve `app/setup/` and `(app)/` alike. Every caller already holds `event.currentTarget`.

/**
 * Reformats a currency input in place, restores the caret, and answers what to store.
 *
 * **Writing the DOM before React does is the whole trick, and it is what let `ui/Input` stay
 * prop-free.** `event.currentTarget` is already the node, so no `ref` had to be threaded through the
 * field layer to reach it.
 *
 * It works only because `formatAmountInput` is **idempotent** - `lib/format.test.ts` pins that
 * property for exactly this reason, since React will hand the formatted value straight back through
 * `value` on the next render and a second pass must not move anything.
 *
 * **This is not the difference between "caret preserved" and "caret at the end".** React does restore
 * a selection around its own controlled-input commit; what it restores is the *raw offset*, which is
 * wrong precisely when the reformat inserts a separator to the left of the caret - typing the last
 * `0` of `2000` leaves `2,00|0` rather than `2,000|`. `amountCaret` computes the semantic position
 * instead, and setting it here is what wins, because React's own save happens before this write
 * lands.
 *
 * **jsdom cannot observe the outcome either way.** React's restore plus user-event's own cursor
 * bookkeeping make a `selectionStart` assertion pass with this deleted, which an earlier version of
 * `BudgetForm`'s test did. So the suites assert that `setSelectionRange` was called with the computed
 * offset, `amountField.test.ts` pins the arithmetic and the in-place write directly, and the visible
 * behaviour is a Storybook or browser check - `docs/TODO.md` records that gap.
 *
 * @param element the currency input, mid-keystroke
 * @returns the formatted value, for the caller to lift into its own state
 */
export function reformatAmountInput(element: HTMLInputElement): string {
  const raw = element.value;
  const caret = element.selectionStart ?? raw.length;
  const formatted = formatAmountInput(raw);

  element.value = formatted;
  const at = amountCaret(raw, caret, formatted);
  element.setSelectionRange(at, at);

  return formatted;
}
