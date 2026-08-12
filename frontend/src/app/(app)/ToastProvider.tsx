'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ToastRegion, type Toast, type ToastKind } from './ToastRegion';

// The one place a screen posts a notification from, mounted once on `(app)/layout.tsx`.
//
// **This exists because every write in this app used to report itself differently.**
// `docs/TODO.md` carried the account and this ticket deletes it: a modal that just closed for every
// transaction and category write, a `role="status"` badge in Settings, a `role="status"` line in the
// Allocate modal, and nothing whatsoever for anything without a form. A save whose row landed
// outside the current period or filter was confirmed by nothing at all.
//
// **It is a provider for the reason `AddTransactionProvider` is one, plus a stronger one.** That
// modal is mounted once because five triggers across three routes would otherwise mount five
// dialogs; this is mounted once because a notification region is a property of the *shell* rather
// than of whichever component happened to perform the write - which is the whole point of the
// ticket. Twelve call sites post to it and none of them owns a region.
//
// **It is outermost of the five providers on the layout**, and that ordering is load-bearing in the
// same way `EditTransactionProvider`'s is. It consumes nothing, and everything that can post is
// inside it - including the three dialogs the transaction providers mount, which are React
// descendants of them rather than of the pages. `(app)/layout.test.tsx` pins it with a child that
// posts, because every other assertion in that file would fail for the same reason and none of them
// would say why.
//
// **The state is here and the DOM is next door.** `ToastRegion.tsx` is synchronous, takes a list and
// two strings, and owns the popover mechanics; this owns the queue, the ids and the timers. The
// split is `WelcomeScreen`'s and `ErrorScreen`'s: Storybook and the suite get a component they can
// render from a literal, with no provider and no timers running.

/** What a poster hands over. No id and no timestamp - both are this file's to invent. */
export type ToastRequest = {
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  /**
   * Puts a notification on screen.
   *
   * Stable across renders, so a caller may hold it in a dependency array without re-running
   * anything, and returns nothing: a toast is fire-and-forget, and a caller that wanted to dismiss
   * its own toast would be describing a different feature.
   */
  post: (request: ToastRequest) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The poster, for any component inside the shell.
 *
 * **Throws outside the provider rather than returning a no-op**, which is `useAddTransaction`'s
 * call and `useFilterNavigation`'s: a write whose confirmation silently stops appearing is a bug
 * that looks like a fast network, and it would ship.
 */
export function useToast(): ToastApi {
  const value = useContext(ToastContext);

  if (value === null) {
    throw new Error('useToast must be used inside ToastProvider.');
  }

  return value;
}

/**
 * How long each kind stays up.
 *
 * **Per kind rather than one number, and the failure is the longer of the two.** A success is a
 * confirmation of something the user just did and already expected; a failure is news, and one the
 * user blinked past is the worse of the two failures. Exported so the suite and the stories state
 * the same numbers this file does rather than their own.
 */
export const TOAST_DURATION_MS: Record<ToastKind, number> = {
  success: 5_000,
  failure: 8_000,
};

/**
 * How long an announcement stays in its live region before it is cleared.
 *
 * The announcers are `sr-only` elements holding the same sentence the visible toast does - see
 * `ToastRegion.tsx` for why the announcement cannot ride on the visible stack at all - so leaving
 * the text in place would have a screen-reader user meet every message twice in browse mode. One
 * second is past the point where the region has been read and far short of the toast's own life.
 */
export const ANNOUNCEMENT_CLEAR_MS = 1_000;

/**
 * How many toasts are on screen at once.
 *
 * A burst is real rather than hypothetical: `ConfirmDeleteDialog` is reachable in a loop, and a
 * Settings save posts for two writes. An unbounded column climbs off the top of the viewport, so
 * the oldest drops. Its removal timer is left to fire against an id that is no longer there, which
 * is a no-op - see `post`.
 */
export const MAX_VISIBLE_TOASTS = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [politeAnnouncement, setPoliteAnnouncement] = useState('');
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState('');

  /**
   * The id source.
   *
   * A ref rather than state, because nothing renders from it and bumping it must not schedule a
   * render of its own. Monotonic from 1, which is what makes an assertion about "the second toast"
   * writable at all.
   */
  const nextId = useRef(1);

  /** Every pending timer, so unmounting cannot leave one to fire against a dead setter. */
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  /** The announcer's own timer, replaced rather than stacked - only one message is current. */
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const post = useCallback(({ kind, message }: ToastRequest) => {
    const id = nextId.current;
    nextId.current += 1;

    setToasts((current) => {
      // Capped in the updater rather than by clearing the dropped toast's timer out here, so this
      // stays a pure function of its argument - React invokes it twice under StrictMode, and a
      // `clearTimeout` in an updater is exactly the side effect that makes a dev-only difference.
      // The dropped toast's timer still fires and finds nothing to remove, which costs one filter.
      const next = [...current, { id, kind, message }];
      return next.slice(-MAX_VISIBLE_TOASTS);
    });

    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_DURATION_MS[kind]),
    );

    // **Only one of the pair is ever non-empty**, so a message never lands in both regions and is
    // never announced twice. Writing the empty string to the other is what retires the previous
    // announcement when two toasts of different kinds land in a row.
    setPoliteAnnouncement(kind === 'success' ? message : '');
    setAssertiveAnnouncement(kind === 'failure' ? message : '');

    if (announcementTimer.current !== null) clearTimeout(announcementTimer.current);
    announcementTimer.current = setTimeout(() => {
      announcementTimer.current = null;
      setPoliteAnnouncement('');
      setAssertiveAnnouncement('');
    }, ANNOUNCEMENT_CLEAR_MS);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    const announcement = announcementTimer;

    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();

      if (announcement.current !== null) clearTimeout(announcement.current);
    };
  }, []);

  const api = useMemo(() => ({ post }), [post]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Mounted unconditionally, unlike every modal in this shell, and the reason is the opposite
          of theirs. A closed `<dialog>` must not be in the tree because `queryAllByText` reads
          straight through `display: none` and would make every screen's text queries ambiguous;
          this region has to be in the tree from the first render, because the two announcers inside
          it are live regions and a live region created in the same commit as its content is not
          announced. It contributes no text while empty, which is what keeps `pages.test.tsx`
          honest. */}
      <ToastRegion
        toasts={toasts}
        politeAnnouncement={politeAnnouncement}
        assertiveAnnouncement={assertiveAnnouncement}
        onDismiss={dismiss}
      />
    </ToastContext.Provider>
  );
}
