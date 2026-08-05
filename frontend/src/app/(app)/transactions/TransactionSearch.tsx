'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import type { TransactionFilters } from '@/lib/transactions';

import { filterHref } from './filters';
import { SearchPill } from './SearchPill';

// The header's search field, made real (TRN-1, AC3).
//
// **The smallest boundary this could be.** It holds the value, the debounce, the router and
// nothing else; every pixel of markup is `SearchPill`'s, which stays a Server Component for
// a reason that file records - `PageHeader.stories.tsx` imports it, and the Shell story
// suite renders with no router in context.
//
// **The value is local state and the URL is write-mostly, and that is the whole design of
// this file.** The obvious version - `value={filters.search}` with an `onChange` that
// navigates - does not work, and it fails in two stages worth spelling out because the
// second looks like a fix for the first:
//
//   1. Without a debounce, React re-renders immediately with the *old* prop, since the
//      server has not answered yet. The DOM value snaps back and typed characters visibly
//      disappear under the caret.
//   2. With a debounce, the characters survive and the caret does not. The URL lands ~300ms
//      later, the prop changes while the caret has moved on, and React's controlled-input
//      commit reassigns `value` and collapses the selection to the end of the field. This is
//      the same symptom `app/setup/BudgetForm.tsx` documents for the budget field's caret,
//      arrived at from the opposite direction.
//
// So `useState` owns the value while typing, and the prop is read back only when it
// disagrees with what this component last wrote - which is the difference between an echo of
// our own navigation and a real one, such as the Back button.

/**
 * How long after the last keystroke the URL is rewritten.
 *
 * Not a tuning knob. Every search that matches nothing costs **two** backend requests, since
 * `readTransactionsView` probes to tell an empty account from an empty filter - so a
 * navigation per keystroke is two round trips per keystroke.
 */
const DEBOUNCE_MS = 300;

type TransactionSearchProps = {
  /** The whole filter set, so a search change preserves the category, period and sort. */
  filters: TransactionFilters;
};

export function TransactionSearch({ filters }: TransactionSearchProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const urlValue = filters.search ?? '';
  const [value, setValue] = useState(urlValue);

  /**
   * The last value this component put into the URL, so it can recognise its own echo.
   *
   * **State rather than a ref, and that is `react-hooks/refs` rather than a preference.** The
   * rule rejects reading or writing `.current` during render, which the adjustment below has
   * to do, and this repo carries no eslint-disable comments. The behaviour is identical:
   * `navigate` sets it synchronously before the transition starts, so React has applied it by
   * the render that follows.
   */
  const [written, setWritten] = useState(urlValue);

  /** The previous render's URL value, so a *change* can be told from a re-render. */
  const [seen, setSeen] = useState(urlValue);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjusting state during render, which is React's own documented pattern for "a prop
  // changed and some state derives from it" - and here it is the *only* form available.
  // `frontend/src/app/CLAUDE.md` records that `react-hooks/set-state-in-effect` rejects the
  // effect version and that this repo carries no eslint-disable comments.
  //
  // **Two conditions, and the outer one is load-bearing.** Comparing the URL against
  // `written` alone looks sufficient and is not: `navigate` sets `written` before the server
  // has answered, so the very next render - `startTransition` causes one immediately - sees a
  // URL that still holds the *old* term and reads this component's own pending navigation as
  // somebody else's change. It then resets the field to that old term, which empties the box
  // a beat after the user stops typing. So the outer check asks "did the prop actually
  // change", and only then does the inner one ask "was it us".
  //
  // The rejected alternatives both fail visibly: `key={urlValue}` remounts the input and
  // destroys focus on every keystroke, and never resyncing leaves Back showing new rows under
  // old text.
  if (urlValue !== seen) {
    setSeen(urlValue);

    // Our own echo arriving late. The user has kept typing since, so their value wins - this
    // is the branch that stops the caret being collapsed to the end of the field.
    if (urlValue !== written) {
      setWritten(urlValue);
      setValue(urlValue);
    }
  }

  function navigate(next: string) {
    setWritten(next);

    startTransition(() => {
      // `replace`, not `push`: a debounced search that pushes puts one history entry behind
      // every typing pause, so Back walks "Wh", "Whol", "Whole" instead of leaving the page.
      //
      // `scroll: false` because Next scrolls to the top on navigation, and a keystroke
      // yanking a scrolled list back to the first row is not what typing asked for. The
      // filter bar deliberately does not pass it - the selects sit above the table, so
      // whoever touches one is already at the top, and landing on the new first row after a
      // sort change is right.
      router.replace(filterHref({ ...filters, search: next === '' ? undefined : next }), {
        scroll: false,
      });
    });
  }

  function schedule(next: string) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  function change(next: string) {
    setValue(next);
    schedule(next);
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    // A search box that ignores Enter reads as broken, so it flushes the pending debounce
    // rather than waiting it out. `preventDefault` because this input has no form today and
    // must not acquire an implicit submit if it ever sits inside one.
    event.preventDefault();

    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    navigate(value);
  }

  // No cleanup effect cancelling the timer on unmount. A fired callback on an unmounted
  // component would only call `router.replace`, which React 18 onwards treats as a no-op
  // rather than a warning - and the field only unmounts by navigating away, at which point
  // the pending navigation is already moot.
  return (
    <SearchPill
      placeholder="Search transactions"
      value={value}
      onChange={change}
      onKeyDown={keyDown}
    />
  );
}
