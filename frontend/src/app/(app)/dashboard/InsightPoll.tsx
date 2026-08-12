'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { generateInsights } from '@/lib/generateInsights';
import type { InsightSet } from '@/lib/insights';

// The insight set's client owner: one read, one timer, two visual consumers.
//
// **PET-73 moved this state machine off `/insights` and it relocated intact** - the poll, the
// backoff, the ceiling, the `stalled` fallback and the render-phase prop adoption are all
// `insights/InsightsScreen.tsx`'s, unchanged in behaviour. What changed is where its output is
// drawn: the summary banner is the top of the Dashboard's wide column and the two insight cards
// sit under the donut in the narrow one, with a Server Component between them.
//
// **One poll, one mount, which is why this is a provider rather than state inside a card.** Two
// timers on one screen double the requests and can disagree about which set is current. That is
// `transactions/FilterNavigation.tsx`'s shape and it exists for exactly this problem: a value
// shared by two client pieces on opposite sides of a server-rendered boundary. `DashboardScreen`
// gains two `React.ReactNode` slots and stays a Server Component.
//
// **`useInsightPoll` throws outside the provider rather than returning a no-op**, the call both
// `FilterNavigationProvider` and `AddTransactionProvider` make: a card that silently stops
// updating is a bug that looks like a slow network.
//
// **Nothing fires on mount, in any state.** The trigger lives on the write path - every
// transaction and category write regenerates the set backend-side - so this is a pure read plus
// one button. A mount trigger is what PET-44's plan had, and it made a read-only screen write to
// the database on every visit while React Strict Mode's dev double-mount 409'd against itself.
// `InsightPoll.test.tsx` pins that nothing POSTs on mount in either state.

/** The frontend's own route handler. One half of a contract; the suite pins the other. */
const POLL_PATH = '/api/insights';

/**
 * The poll's backoff, in milliseconds.
 *
 * Rule-based generation settles in well under a second, so the first tick is deliberately short
 * and most runs resolve on it. The rest is headroom for a future slow generator rather than an
 * expectation.
 */
const POLL_DELAYS = [500, 1000, 2000, 4000];
const POLL_MAX_DELAY = 5000;

/**
 * The one hard stop, and it is a timer-leak guard rather than a cap on the wait.
 *
 * **There is deliberately no two-minute cap.** The backend treats a `generating` row as live
 * until its own staleness cutoff of five minutes, so a cap before that re-enables a button whose
 * click can only 409 - and this design treats a 409 as success and re-enters polling, so the cap
 * would have added a click to the same wait rather than shortening it. The read self-heals on its
 * own at the cutoff: `hasRunInFlight` is bounded by `gt(createdAt, staleBefore())`, so five
 * minutes after an abandoned run the state stops reporting `generating` with no POST needed. This
 * ceiling sits just past that, so a wedged timer cannot outlive the guarantee.
 *
 * **Reaching it puts the screen into `stalled` rather than merely stopping the timer.** The
 * self-healing above is the *backend read's*, and the client stops asking at the same moment - so
 * a session that died, or a backend unreachable for the whole 5.5 minutes, would otherwise leave
 * `state` on `generating` with the effect's only dependency unable to change again: skeletons and
 * a disabled button for the lifetime of the mount, recoverable only by a reload.
 */
const POLL_CEILING_MS = 5.5 * 60 * 1000;

const delayFor = (attempt: number) => POLL_DELAYS[attempt] ?? POLL_MAX_DELAY;

type InsightPoll = {
  /** The newest set this mount knows about: the server's, or the poll's. */
  set: InsightSet;
  /**
   * What the two consumers should draw, which is the read's own state except once the poll has
   * given up.
   *
   * Stalled, the state is genuinely unknown, so the screen falls back to what it can still stand
   * behind: the last-good content the read carries independently of `state`, or the empty copy
   * when it carries none. Holding skeletons instead would keep asserting a run is in flight long
   * after this mount stopped having any way to find out.
   */
  displayState: InsightSet['state'];
  /** True while a run is in flight and this mount is still watching for it. */
  generating: boolean;
  /**
   * Whether this mount gave up on a run that never settled.
   *
   * **Exposed for PET-78, which made the Regenerate control conditional.** It used to be enough
   * for `displayState` to fold a stall into `ready` or `empty`, because the button rendered in
   * both anyway. Now the button appears only where it can do something, and a stall is one of
   * those places precisely *because* `displayState` hides it: the screen is showing last-good
   * content or the empty copy, and nothing left on this mount will ever ask about that run again.
   * Without this flag the fold would make a stalled `ready` indistinguishable from an ordinary
   * one and leave the user no way to retry.
   */
  stalled: boolean;
  /**
   * Whether the period on screen is the one insights describe.
   *
   * **Resolved once in `page.tsx` and threaded, never re-derived here.** That is PET-26's rule
   * for `isEmpty` and the reason this screen has two conditions rather than five. Reading a clock
   * to answer it would be wrong twice over: the frontend host's zone is not the backend's, which
   * `BudgetCard` and `TrendCard` each have a paragraph about.
   */
  isCurrentPeriod: boolean;
  /** The account's own empty condition, PET-26's, for the banner's unlock copy. */
  isEmpty: boolean;
  /** Starts a run, or adopts one already in flight. */
  regenerate: () => Promise<void>;
};

const InsightPollContext = createContext<InsightPoll | null>(null);

export type InsightPollProviderProps = {
  /**
   * The server's read, and the source of truth this mount starts from.
   *
   * It changes under us on every `router.refresh()` - which every write modal calls on save - so
   * it is adopted on change rather than only on mount. See the adjustment below.
   */
  set: InsightSet;
  isCurrentPeriod: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
};

export function InsightPollProvider({
  set: fromServer,
  isCurrentPeriod,
  isEmpty,
  children,
}: InsightPollProviderProps) {
  const router = useRouter();
  const [set, setSet] = useState(fromServer);

  /**
   * Whether the poll gave up on a `generating` state that never settled.
   *
   * Deliberately client-only and never read from the server: it is a fact about *this mount's*
   * polling rather than about the account, so a fresh read clears it below.
   */
  const [stalled, setStalled] = useState(false);

  // **The prop wins when it changes, and this is what starts the poll from a save.** The Add
  // transaction modal calls `router.refresh()`, which re-runs the Server Component and hands this
  // provider a set whose `state` has moved from `empty` to `generating` - with no click anywhere
  // and no action result to hang a timer off. Without adopting it, saving an expense and landing
  // back on the Dashboard leaves the user looking at a card that never updates until a manual
  // reload.
  //
  // A render-phase adjustment rather than an effect, which is this repo's shape for exactly this:
  // `react-hooks/set-state-in-effect` rejects the effect version and the repo carries no
  // eslint-disable comments. `TransactionSearch` records the same call.
  //
  // Compared on `state` and `generatedAt` rather than on identity, because the server hands back
  // a fresh object on every refresh: identity would discard a newer polled set in favour of an
  // identical older render.
  const [seen, setSeen] = useState({
    state: fromServer.state,
    generatedAt: fromServer.generatedAt,
  });
  if (fromServer.state !== seen.state || fromServer.generatedAt !== seen.generatedAt) {
    setSeen({ state: fromServer.state, generatedAt: fromServer.generatedAt });
    setSet(fromServer);
    // A fresh server read is a newer answer than the one this mount gave up on, so the giving up
    // is discarded with it - otherwise a `router.refresh()` landing after the ceiling would render
    // a set the server has just confirmed as generating through the stalled treatment.
    setStalled(false);
  }

  // **No poll on a period navigated back to.** Both consumers render nothing there, so a timer
  // would be requests nothing displays - and the set it fetched describes the current period,
  // which is the whole reason those consumers are absent.
  const generating = isCurrentPeriod && set.state === 'generating' && !stalled;

  const displayState =
    set.state === 'generating' && stalled ? (set.summary ? 'ready' : 'empty') : set.state;

  // The poll. Keyed on the state alone, so a poll that returns another `generating` set does not
  // restart the loop and lose its own backoff.
  useEffect(() => {
    if (!generating) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const response = await fetch(POLL_PATH, { cache: 'no-store' });

        if (response.ok) {
          const next = (await response.json()) as InsightSet;
          if (cancelled) {
            return;
          }
          setSet(next);
          if (next.state !== 'generating') {
            return;
          }
        }
      } catch {
        // An unreachable frontend or a dropped connection. Deliberately swallowed and retried:
        // A26 records that a failed run is invisible by contract, so there is no error state to
        // render, and the last-good content is already on screen underneath the skeletons.
      }

      if (cancelled) {
        return;
      }

      if (Date.now() - startedAt > POLL_CEILING_MS) {
        // Stop asking *and* say so, or the cards keep the skeletons forever: `generating` is this
        // effect's only dependency, and nothing left would move it. See the constant above.
        setStalled(true);
        return;
      }

      attempt += 1;
      timer = setTimeout(tick, delayFor(attempt));
    };

    timer = setTimeout(tick, delayFor(0));

    // Navigating away must not leave a timer running, and `cancelled` covers the response that
    // lands after unmount - a `setSet` on an unmounted component is what the flag is for.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generating]);

  const value = useMemo<InsightPoll>(
    () => ({
      set,
      displayState,
      generating,
      stalled,
      isCurrentPeriod,
      isEmpty,
      regenerate: async () => {
        const result = await generateInsights();

        // A 409 is `ok` too - a run started in another tab or by a transaction the user just
        // saved is the thing this button asks for, already happening. Either way the backend has
        // committed the `generating` row before answering, so this is reporting what is already
        // true rather than optimistically guessing.
        if (result.ok) {
          // Before the state, so a click after the poll gave up really re-enters polling rather
          // than setting a state the `stalled` flag immediately renders through.
          setStalled(false);
          setSet((previous) => ({ ...previous, state: 'generating' }));
          return;
        }

        // **A dead session is not the undesigned failure A26 is about.** That one is a *run* that
        // failed, which is invisible by contract - and for it the previous set stays on screen and
        // the button re-enables on its own, because both are derived from `state` and `state`
        // never moved. A 401 is different in kind: nothing on this page will ever work again, and
        // without this branch the click did nothing observable at all, forever.
        //
        // `router.refresh()` rather than a message, because the redirect already exists and
        // belongs to the server: re-running the Server Component puts `requireInsights()` in front
        // of the same dead cookie, and it redirects to the login screen the way every other read
        // in this app does. `lib/generateInsights.ts` records why the action itself must not
        // redirect.
        if (result.reason === 'unauthenticated') {
          router.refresh();
        }
      },
    }),
    [set, displayState, generating, stalled, isCurrentPeriod, isEmpty, router],
  );

  return <InsightPollContext.Provider value={value}>{children}</InsightPollContext.Provider>;
}

export function useInsightPoll(): InsightPoll {
  const value = useContext(InsightPollContext);

  if (value === null) {
    throw new Error('useInsightPoll must be used inside an InsightPollProvider.');
  }

  return value;
}
