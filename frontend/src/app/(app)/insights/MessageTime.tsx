'use client';

import { useSyncExternalStore } from 'react';

import { formatMessageTimestamp } from '@/lib/format';

// One chat row's timestamp, rendered after hydration and never during it (PET-76).
//
// **This exists because a locale-formatted time cannot be server-rendered correctly, and the first
// version of it shipped the bug.** `AssistantMessageList` is rendered from inside
// `AssistantChatScreen`, a client component, so a resumed conversation is server-rendered first -
// on the server's zone, which on Vercel is UTC - and then hydrated in the reader's browser, which is
// not. `formatMessageTimestamp` therefore produces two different strings for one instant.
//
// **`suppressHydrationWarning` looked like the fix and is the wrong tool, which a walk measured
// rather than a docs page settled.** With the frontend under `TZ=UTC` and the browser overridden to
// `Europe/Zagreb`, an instant of `18:36:47Z` server-rendered as "Today, 6:36 PM" and **stayed** that
// way: React silences the warning and keeps the server's text rather than correcting it to the
// client's. So the attribute bought silence about a real defect - every timestamp in the app off by
// the reader's own UTC offset, on the one screen where the times are the point, with no warning in
// any console and nothing a gate could see. That is strictly worse than the noisy version.
//
// **So the text is client-only, through `useSyncExternalStore`.** The server snapshot is `false` and
// the client snapshot is `true`, which is the hydration-correct way to ask "am I past hydration" -
// the same reason `app/setup/SetupDraftProvider.tsx` reaches for this hook rather than a mount
// effect. Both renders that have to agree produce the empty string, so there is nothing to mismatch;
// React re-reads the snapshot once hydration finishes and the time appears. A mount effect would do
// the same job and `react-hooks/set-state-in-effect` rejects it, and this repo carries no
// eslint-disable comments.
//
// **The `<time dateTime>` wrapper renders in both passes, empty then filled**, so the instant is in
// the markup from the first byte even while the human-readable half is not: a machine reading this
// page, and anything a future feature wants to sort or group on, has the value immediately. That is
// also what keeps the pop-in to text inside a box that is already laid out.
//
// The cost, stated plainly: **the timestamps are absent for one frame** on a server-rendered
// conversation. Accepted, because the alternative is being confidently wrong about them, and because
// every message the user sends in this session is client-rendered from the start and never blank.

/** Never notifies: whether hydration has happened changes exactly once, and React re-reads it. */
const subscribe = () => () => {};

const onClient = () => true;
const onServer = () => false;

export function MessageTime({ instant }: { instant: string }) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);

  return <time dateTime={instant}>{hydrated ? formatMessageTimestamp(instant) : ''}</time>;
}
