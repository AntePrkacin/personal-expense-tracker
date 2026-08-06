'use client';

import { useCallback, useRef, useState } from 'react';

import type { CategoryOption } from '@/lib/categories';

// The categories a transaction form's picker needs, read when the form opens.
//
// **Lifted out of `AddTransactionProvider` by PET-32 rather than duplicated into
// `EditTransactionProvider`, which is a deliberate exception to the rule of three.** That rule -
// duplicate until a third consumer appears, then lift - is `frontend/src/components/CLAUDE.md`'s,
// and what it is about is markup wrappers, where a premature abstraction costs more than a second
// copy. Two things here are not that. The generation guard below is correctness logic whose
// failure mode is a stale write into a reopened modal, and a second hand-maintained copy of a
// subtle guard is how one of them quietly stops matching. And `CATEGORIES_PATH` is one half of a
// contract with `app/api/categories/route.ts` that nothing else checks, because `lib/routes.ts`
// deliberately does not declare it - so a third place to write that string is a third place to
// forget it.
//
// **Why the read is not an effect, which is the one thing to know before changing this.** The
// version this was lifted from ran in a `useEffect` keyed on the modal's open state, and reset its
// own state in the *click handler* that opened it. That split existed because
// `react-hooks/set-state-in-effect` rejects a synchronous `setState` in an effect body and this
// repo carries no eslint-disable comments - so the reset could not move into the effect, and the
// hook would have needed two seams (an `active` flag *and* a `reset`) to express one event. With
// the fetch in `read()` the whole thing is one seam called from the one place that knows an open
// happened, and there is no effect left to key on anything.
//
// **It has no suite of its own, and that is the repo's shape rather than an omission.** There is
// no `renderHook` anywhere in `frontend/src`: hooks are asserted through the components that use
// them, which is the same "assert behaviour" rule the components follow. Both
// `AddTransactionProvider.test.tsx` and `EditTransactionProvider.test.tsx` pin the exact path, the
// nothing-before-open case, the failure line and the late-read guard through a real modal.

/** Where the fetch goes. `app/api/categories/route.ts` is the other half of this string. */
const CATEGORIES_PATH = '/api/categories';

export type CategoryOptions = {
  /**
   * The account's categories, or `null` while the read is still out.
   *
   * `null` rather than an empty array, because the two mean different things to a picker: an
   * empty list is an account with no categories, and `null` is "we do not know yet".
   */
  categories: CategoryOption[] | null;
  /** Whether the read failed outright. The form shows one line for every way it can. */
  failed: boolean;
  /**
   * Starts a fresh read, discarding whatever the last one produced.
   *
   * Called from the event handler that opens a form, never from an effect - see above. Safe to
   * call while an earlier read is still in flight: that one's result is dropped rather than
   * raced, so the options a form shows always belong to the open it belongs to.
   */
  read: () => void;
};

export function useCategoryOptions(): CategoryOptions {
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Which read the in-flight request belongs to.
   *
   * Bumped on every call and compared when the response lands, so a read that resolves after the
   * form was closed - or after it was closed and opened again - cannot write stale options into
   * the current one. An `AbortController` would cancel the request instead; this is simpler and
   * covers the case that actually matters, which is the late *write* rather than the wasted bytes.
   */
  const generation = useRef(0);

  return {
    categories,
    failed,
    read: useCallback(() => {
      generation.current += 1;
      const mine = generation.current;

      // Reset first, so a second open never shows the first one's options or its failure line
      // while the new read is out. This is the state the effect version could not touch.
      setCategories(null);
      setFailed(false);

      void (async () => {
        try {
          // `no-store` on the browser hop as well as the server one, so a second open in the
          // same session cannot render a list the account no longer has. A fresh request on
          // **every** open for the same reason: a category created in another tab has to show up.
          const response = await fetch(CATEGORIES_PATH, { cache: 'no-store' });

          if (!response.ok) throw new Error(`Categories read failed: ${response.status}`);

          const body = (await response.json()) as { categories: CategoryOption[] };

          if (mine !== generation.current) return;
          setCategories(body.categories);
        } catch {
          // A 401, a 503, an unreachable server or a body that will not parse. The form shows
          // one line for all of them, because the user's next move is the same either way: close
          // this and try again. The 401 case is the session dying with the form open, which the
          // write action reports separately if they get as far as submitting.
          if (mine !== generation.current) return;
          setFailed(true);
        }
      })();
    }, []),
  };
}
