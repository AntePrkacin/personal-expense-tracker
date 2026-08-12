'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { generateInsights } from '@/lib/generateInsights';
import type { InsightSet } from '@/lib/insights';

import { useToast } from '../ToastProvider';

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
 * What the toast region says for the two runs the user can see the result of (PET-77).
 *
 * There is deliberately no message for a run that fires behind a write, and none for one that
 * stalls - see the poll and the ceiling for why each is silent rather than unfinished.
 */
const TOAST_UPDATED = 'Insights updated.';
const TOAST_FAILED = "We couldn't update your insights. Please try again.";

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
   * Whether a run this mount watched settled without producing a newer set.
   *
   * **The fourth dead end, and a review of PR #92 found it missing.** `InsightSummarySlot`'s own
   * docblock enumerates three states that reach the card with no run coming, and this is the one it
   * left out: a run that **fails after a previously successful set**. `insights.service.ts` skips a
   * `failed` row and serves the newest `ready` one, so `state` comes back `ready`, the card looks
   * perfectly healthy, and the account sits on insights that predate its own last write with no
   * control on screen that could start another. Invisible precisely because nothing about it looks
   * broken - which is what distinguishes it from the enumerated "first run failed", where there is no
   * set at all and the empty copy shows.
   *
   * **It is derived rather than published, because the contract publishes nothing to read.**
   * `InsightSetResponseDto` carries `state` and `generatedAt` and no notion of a failure -
   * deliberately, since A26 makes a failed run invisible - so what this mount can see is that a run
   * it was watching ended with the **same `generatedAt`** it started from. `generatedAt` is written
   * at exactly one place backend-side, inside the transition to `ready`, so it advances if and only
   * if a run really completed. Two runs reach this flag: one that failed, and one whose generator
   * produced nothing to store. Both are the same fact for this card's purposes - the set on screen is
   * the one that was already there, and nothing further is coming.
   *
   * **What it deliberately does not cover is a run that failed before this mount existed.** Loading
   * the Dashboard fresh onto a stale set answers `ready` with no signal anywhere, and no arithmetic
   * over this response can recover one. Closing that needs a field on the DTO;
   * `docs/TODO.md` carries it rather than this file pretending to more than it can see.
   *
   * Client-only and cleared by a fresh server read, exactly like {@link stalled}: it is a fact about
   * what this mount observed rather than about the account.
   */
  runFailed: boolean;
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
  const { post } = useToast();
  const [set, setSet] = useState(fromServer);

  /**
   * Whether the poll gave up on a `generating` state that never settled.
   *
   * Deliberately client-only and never read from the server: it is a fact about *this mount's*
   * polling rather than about the account, so a fresh read clears it below.
   */
  const [stalled, setStalled] = useState(false);

  /**
   * Whether a run this mount watched settled on the set it started from - see the field's docblock.
   *
   * Client-only and cleared by a fresh read for `stalled`'s reason, and cleared by a click for the
   * reason that one is: a new run is a new question, and rendering the previous run's dead end
   * through it would leave the button describing an answer nobody is waiting on any more.
   */
  const [runFailed, setRunFailed] = useState(false);

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
    // Same argument for the same reason: this flag says a run ended on the set it started from, and
    // a read that moved `state` or `generatedAt` is a newer answer than that. Note the guard above
    // is what makes this safe to clear unconditionally - a refresh that changed neither field does
    // not reach here, so a stale set being re-served cannot silently retract the dead end.
    setRunFailed(false);
  }

  // **No poll on a period navigated back to.** Both consumers render nothing there, so a timer
  // would be requests nothing displays - and the set it fetched describes the current period,
  // which is the whole reason those consumers are absent.
  const generating = isCurrentPeriod && set.state === 'generating' && !stalled;

  const displayState =
    set.state === 'generating' && stalled ? (set.summary ? 'ready' : 'empty') : set.state;

  // The poll. Keyed on the state alone, so a poll that returns another `generating` set does not
  /**
   * Whether the run currently in flight is one the user pressed the button for.
   *
   * **State rather than a ref, and a lint rule chose that.** A ref reads more naturally - nothing
   * renders from this - but `regenerate` below is reachable from the `useMemo` that builds the
   * context value, so `react-hooks/immutability` sees a ref write on a render-phase path and
   * refuses it. This repo carries no eslint-disable comments. Setting state from that same closure
   * is what `setStalled` and `setSet` already do two lines away, so the shape is the file's own.
   *
   * **It is mirrored into a ref and read from there inside the poll, which a review forced.** The
   * flag used to be a dependency of the poll effect and was cleared only on the settle and the
   * ceiling - so every *other* way `generating` can go false left it stuck true: the render-phase
   * adoption of a `ready` set from any `router.refresh()`, and a period navigation making
   * `isCurrentPeriod` false. A press followed by a period switch therefore announced nothing at the
   * time and then put a spurious "Insights updated." on top of the next save's own toast, which is
   * the double-toast-per-save this flag exists to prevent.
   *
   * Reading the ref keeps it out of the effect's dependencies, which is what lets the **cleanup**
   * clear it: the cleanup runs on every teardown, so it covers the abandoned cases as well as the
   * two the poll can see. As a dependency it could not, because clearing it would re-run the very
   * effect that had just been armed.
   */
  const [manualRun, setManualRun] = useState(false);
  const manualRunRef = useRef(manualRun);

  useEffect(() => {
    manualRunRef.current = manualRun;
  }, [manualRun]);

  /**
   * The `generatedAt` the poll compares a settle against, mirrored so it is not a dependency.
   *
   * **A ref for the reason the paragraph above gives, arrived at from the other direction.** The
   * effect below is keyed on `generating` alone, deliberately, so that a poll returning another
   * `generating` set does not restart the loop and lose its own backoff - which means it cannot
   * name `set.generatedAt` in its dependencies without giving that up. Read **once, at arm time**
   * into a local rather than at the settle, so the comparison cannot be confused by the mirror
   * having moved underneath it; declared above the poll so React runs this mirror first on any
   * commit they share.
   */
  const generatedAtRef = useRef(set.generatedAt);

  useEffect(() => {
    generatedAtRef.current = set.generatedAt;
  }, [set.generatedAt]);

  // restart the loop and lose its own backoff.
  useEffect(() => {
    if (!generating) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    // The set this run starts from. A settle carrying this same value is a run that produced
    // nothing - see `runFailed` on the context type for why that is the only signal available.
    const startedFrom = generatedAtRef.current;

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
            // Whether this run produced anything at all. See `runFailed` on the context type: the
            // contract publishes no failure, so an unmoved `generatedAt` across a settle is the
            // whole of what a run that failed - or that had nothing to store - looks like here.
            const produced = next.generatedAt !== startedFrom;

            if (!produced) {
              setRunFailed(true);
            }

            // **Only a run the user asked for is announced (PET-77).** Every transaction and
            // category write regenerates the set backend-side, so a poll settling is usually the
            // tail of a save that already confirmed itself - a second toast there would double
            // every save, which is exactly what the ticket decided against. The flag is set by
            // `regenerate` and is the only thing that distinguishes the two.
            if (manualRunRef.current) {
              manualRunRef.current = false;
              setManualRun(false);
              // **Which of the two messages is the same question `runFailed` answers**, and posting
              // the success one regardless is what this said until a review of PR #92 made the
              // distinction computable: a run that settled on the set it started from changed
              // nothing, so "Insights updated." was a confirmation of an update that did not
              // happen - on the one press where the user is watching for exactly that. The failure
              // string is the one already used for a request that never landed, and it is right
              // here for the same reason: what the user asked for did not happen, and pressing
              // again is the thing to do about it. A stalled run still says nothing, because it
              // did not finish - see the ceiling below.
              post(
                produced
                  ? { kind: 'success', message: TOAST_UPDATED }
                  : { kind: 'failure', message: TOAST_FAILED },
              );
            }

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
        // **A stalled run posts nothing, deliberately.** The button re-enables and the last-good
        // content comes back on its own, and "insights updated" would be false while "insights
        // failed" is more than the contract knows - A26 makes a failed run invisible. What the user
        // asked for simply did not finish, and the screen says so by returning to itself.
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

      // **Every way out of a run clears the flag, not just the two the poll can see.** The settle
      // above consumes it; the ceiling, a period navigation and a refreshed `ready` set all land
      // here instead, and leaving it set is what let a later background regeneration announce
      // itself as the user's.
      manualRunRef.current = false;
      setManualRun(false);
    };
  }, [generating, post]);

  const value = useMemo<InsightPoll>(
    () => ({
      set,
      displayState,
      generating,
      stalled,
      runFailed,
      isCurrentPeriod,
      isEmpty,
      regenerate: async () => {
        const result = await generateInsights();

        // A 409 is `ok` too - a run started in another tab or by a transaction the user just
        // saved is the thing this button asks for, already happening. Either way the backend has
        // committed the `generating` row before answering, so this is reporting what is already
        // true rather than optimistically guessing.
        if (result.ok) {
          // **Marks this run as the user's**, so the poll announces it when it settles and stays
          // silent for the runs that fire behind every write. Set before the state for the same
          // reason `setStalled` is: the poll can begin as soon as the state moves.
          setManualRun(true);

          // Before the state, so a click after the poll gave up really re-enters polling rather
          // than setting a state the `stalled` flag immediately renders through.
          setStalled(false);
          // And the same for the dead end a previous run left: this click is a new run, so the
          // previous one's outcome stops being what the card reports.
          setRunFailed(false);
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
          return;
        }

        // `failed`, which used to be silent: the click did nothing observable and the button
        // re-enabled, so a user could press it repeatedly with no way of knowing. It is the one arm
        // here with nowhere on the screen to report, which is `failureReporting.ts`'s whole rule.
        post({ kind: 'failure', message: TOAST_FAILED });
      },
    }),
    [set, displayState, generating, stalled, runFailed, isCurrentPeriod, isEmpty, router, post],
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
