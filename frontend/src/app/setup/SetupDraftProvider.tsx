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

type SetupDraftValue = {
  draft: SetupDraft;
  /** Merges a partial change. Never replaces the whole draft. */
  patchDraft: (patch: Partial<SetupDraft>) => void;
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
  // The cache is only invalidated by patchDraft, so it goes stale if anything else
  // clears the key mid-session. Nothing does - this provider is the sole writer,
  // and sessionStorage fires no event for same-tab writes anyway, which is why
  // subscribe has no storage listener to attach.
  const getSnapshot = useCallback(() => {
    cache.current ??= { raw: readStoredDraft() };
    return cache.current.raw;
  }, []);

  // No storage on the server, so the first paint is the empty draft - which is
  // exactly what the server HTML contains.
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const draft = useMemo(() => parseDraft(raw), [raw]);

  const patchDraft = useCallback(
    (patch: Partial<SetupDraft>) => {
      const next = { ...parseDraft(getSnapshot()), ...patch };
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

      // Nullable because the Set is created by the first subscribe. In practice
      // useSyncExternalStore has always subscribed by the time a user event can
      // fire, so this coalesce is for the type rather than for a real path.
      for (const listener of listeners.current ?? []) listener();
    },
    [getSnapshot],
  );

  const value = useMemo(() => ({ draft, patchDraft }), [draft, patchDraft]);

  return <SetupDraftContext.Provider value={value}>{children}</SetupDraftContext.Provider>;
}
