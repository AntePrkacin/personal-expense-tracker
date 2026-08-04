'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import { parseDraft, SETUP_DRAFT_KEY, serializeDraft, type SetupDraft } from './draft';

// The onboarding draft's state, and the repo's first stateful form boundary.
//
// This carries `'use client'` so that `setup/layout.tsx` does not have to. React
// preserves this element across navigation between the layout's own children
// either way, so the state guarantee is identical, and keeping the directive here
// keeps the layout and the three step pages off the client bundle. Same rule as
// `(app)/SidebarNav.tsx`: push the boundary into the smallest wrapper that needs it.
//
// Context rather than props, because the three steps are sibling routes. A
// layout's `children` is an opaque server-rendered element tree, so there is
// nothing to clone props onto.
//
// **sessionStorage is an external store, so it is read through
// useSyncExternalStore rather than into state from a mount effect.** Three reasons,
// in ascending order of importance:
//
//   1. It is the pattern `stories/foundations/Reference.tsx` already established
//      here for reading the stylesheet, and for the same stated reason: an effect
//      that calls setState costs a second render pass on every mount.
//   2. `react-hooks/set-state-in-effect` rejects the effect version outright, and
//      this repo carries no eslint-disable comments anywhere.
//   3. It is the only one of the two that is *hydration-correct by construction*.
//      A lazy useState initialiser behind a `typeof window` guard would make the
//      client's first render disagree with the server HTML about a controlled
//      input's value; this hook exists precisely for a store whose value differs
//      between the two, and renders `getServerSnapshot()` during hydration before
//      re-reading.
//
// The snapshot is the raw JSON **string**, not the parsed draft. That is what keeps
// `getSnapshot` referentially stable between reads: an uncached snapshot that
// parsed JSON would return a fresh object every call and loop forever.

/**
 * A patch, or a function handed the draft as it is *right now*.
 *
 * The updater form exists because a value computed during render is stale by the
 * time two changes land in one tick: both read the same pre-change draft, and the
 * second overwrites rather than extends. `patchDraft({ budget })` cannot hit that -
 * it replaces one field with a keystroke's own value - but step 2's chips compute
 * `categories` *from* the current selection, so a stale read there silently drops a
 * toggle. Same reason React's own setState takes an updater.
 */
type DraftPatch = Partial<SetupDraft> | ((current: SetupDraft) => Partial<SetupDraft>);

type SetupDraftValue = {
  draft: SetupDraft;
  /** Merges a partial change, or the result of an updater. Never replaces the whole draft. */
  patchDraft: (patch: DraftPatch) => void;
  /**
   * Discards the whole draft. Step 3 calls it once, after a successful register.
   *
   * It has to live here rather than as a `sessionStorage.removeItem` at the call
   * site, for the reason `getSnapshot` records: the cache is only invalidated by a
   * write through this provider, so clearing the key from outside would empty
   * storage while every field kept rendering the old values.
   */
  clearDraft: () => void;
};

const SetupDraftContext = createContext<SetupDraftValue | null>(null);

/**
 * The draft, plus the one way to change it.
 *
 * Throws outside a provider rather than falling back to an empty draft. A silent
 * default would let a step render perfectly while quietly failing AC5, and the
 * point of `layout.test.tsx` is that deleting the provider fails loudly rather
 * than becoming a runtime error nobody's test noticed. Same reasoning as
 * `matchItem()` returning `undefined` and letting its caller supply the fallback.
 */
export function useSetupDraft(): SetupDraftValue {
  const value = useContext(SetupDraftContext);
  if (value === null) {
    throw new Error(
      'useSetupDraft must be used inside a SetupDraftProvider (app/setup/layout.tsx)',
    );
  }
  return value;
}

/** Reads the slot, treating an unavailable store as an empty one. */
function readStoredDraft(): string | null {
  try {
    return sessionStorage.getItem(SETUP_DRAFT_KEY);
  } catch {
    // Storage disabled entirely. The form still works; only AC5 degrades.
    return null;
  }
}

export function SetupDraftProvider({ children }: { children: React.ReactNode }) {
  // The store is per provider instance rather than module-level, which matters for
  // two different readers: each test gets a fresh one after sessionStorage.clear(),
  // and nothing leaks between two providers if a future screen ever mounts a second.
  const cache = useRef<{ raw: string | null } | null>(null);
  // Lazily initialised rather than `useRef(new Set())`, which would allocate a
  // fresh Set on every render and discard all but the first.
  const listeners = useRef<Set<() => void> | null>(null);

  const subscribe = useCallback((listener: () => void) => {
    const set = (listeners.current ??= new Set());
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, []);

  // Cached, so repeated calls in one render return the identical string. React
  // compares snapshots by identity and would otherwise re-render without end.
  //
  // The cache is only invalidated by patchDraft and clearDraft, so it goes stale if
  // anything else touches the key mid-session. Nothing does - this provider is the
  // sole writer, and sessionStorage fires no event for same-tab writes anyway,
  // which is why subscribe has no storage listener to attach.
  const getSnapshot = useCallback(() => {
    cache.current ??= { raw: readStoredDraft() };
    return cache.current.raw;
  }, []);

  // No storage on the server, so the first paint is the empty draft - which is
  // exactly what the server HTML contains.
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const draft = useMemo(() => parseDraft(raw), [raw]);

  // Nullable because the Set is created by the first subscribe. In practice
  // useSyncExternalStore has always subscribed by the time a user event can fire,
  // so this coalesce is for the type rather than for a real path.
  const notify = useCallback(() => {
    for (const listener of listeners.current ?? []) listener();
  }, []);

  const patchDraft = useCallback(
    (patch: DraftPatch) => {
      // Read first, then apply. Both forms merge over what is *in storage* rather
      // than over the draft this render closed on, which is what keeps two changes
      // landing in one tick from clobbering each other - one field or ten.
      const current = parseDraft(getSnapshot());
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      const serialized = serializeDraft(next);

      // The cache is updated *before* the write, and deliberately not from it: if
      // sessionStorage throws (quota, or Safari's historical private-mode throw)
      // the field must still show what was typed. Persisting is what degrades,
      // not the form.
      cache.current = { raw: serialized };
      try {
        sessionStorage.setItem(SETUP_DRAFT_KEY, serialized);
      } catch {
        // Best effort. AC5 is what suffers, and only for this tab.
      }

      notify();
    },
    [getSnapshot, notify],
  );

  // Same cache-before-write order as patchDraft, and for the same reason.
  const clearDraft = useCallback(() => {
    cache.current = { raw: null };
    try {
      sessionStorage.removeItem(SETUP_DRAFT_KEY);
    } catch {
      // Best effort, exactly as the write is.
    }
    notify();
  }, [notify]);

  const value = useMemo(() => ({ draft, patchDraft, clearDraft }), [draft, patchDraft, clearDraft]);

  return <SetupDraftContext.Provider value={value}>{children}</SetupDraftContext.Provider>;
}
