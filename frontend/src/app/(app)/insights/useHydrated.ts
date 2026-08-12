'use client';

import { useSyncExternalStore } from 'react';

// Whether this render is past hydration: `false` on the server pass, `true` in the browser.
//
// **The seam behind every viewer-dependent value on these two screens**, and it is one module rather
// than two copies for the reason `lib/pickerScroll.ts` and `lib/format.ts`'s `calendarDateOfInstant`
// each record: two copies of *markup* are cheap, and two copies of a *fix* are a divergence waiting
// for the next reviewer who corrects only one of them. It was private to `insights/MessageTime.tsx`
// until a review of PR #92 found the History caption needing the identical thing, which is its
// second consumer and one short of what this repo's rule of three would otherwise ask for.
//
// **`MessageTime.tsx` is the authority for why this exists at all** - the short version is that a
// locale- or zone-formatted value rendered on the server is the *server's* answer, that
// `suppressHydrationWarning` keeps that answer rather than correcting it, and that a walk measured
// exactly that: an instant of `18:36:47Z` reading "6:36 PM" and staying there in a browser where it
// was 8:36 PM. Read that file before reaching for either the attribute or this hook.
//
// The mechanics, because they are subtle in one place. Both renders that have to agree - the server
// pass and hydration - produce the *same* markup, because the caller renders nothing while this is
// `false`; React then re-reads the snapshot once hydration finishes and the value appears. A mount
// effect would do the same job and `react-hooks/set-state-in-effect` rejects it, and this repo
// carries no eslint-disable comments. `app/setup/SetupDraftProvider.tsx` reaches for the same hook
// for the same hydration-correctness reason.

/** Never notifies: whether hydration has happened changes exactly once, and React re-reads it. */
const subscribe = () => () => {};

const onClient = () => true;
const onServer = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
