'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { generateInsights } from '@/lib/generateInsights';
import type { InsightSet } from '@/lib/insights';

import { PageHeader } from '../PageHeader';
import { InsightCard, InsightCardSkeleton } from './InsightCard';
import { InsightsEmpty } from './InsightsEmpty';
import { SummaryBanner, SummaryBannerSkeleton } from './SummaryBanner';

// 14 AI Insights (Figma node 38:495), with 15 and 16 as its other two states.
//
// **The screen is a client component and takes the server's read as a prop**, which is a
// narrower version of the split `/transactions` set: `page.tsx` is async and fetches, this is
// synchronous and takes the resolved response, so Storybook can render all three states with
// no request scope. The difference is that this one also holds state, because the generating
// state has to resolve itself without a navigation - which is the whole of what the poll below
// does.
//
// **It wraps the header as well as `<main>`**, the same requirement `FilterNavigationProvider`
// records on the transactions screen: the Regenerate button's label and disabled state are
// derived from the same value the cards are, so a boundary between them would need a context to
// put back what one component already holds.
//
// **Nothing fires on mount, in any state.** The trigger lives on the write path now - every
// transaction create, edit and delete regenerates the set backend-side - so this screen is a
// pure read plus one button. A mount trigger is what PET-44's plan had, and it made a read-only
// screen write to the database on every visit while React Strict Mode's dev double-mount 409'd
// against itself.
//
// **The Regenerate button is in the header in every state, including `empty`, which amends
// INS-1.** The frame draws no control on frame 16 and this screen honoured that, on the premise
// that `empty` had come to mean "this account has never logged a transaction" and so had nothing
// to regenerate. The review of PET-42-43-44 found two ordinary ways to reach `empty` with that
// premise false, and in both the screen was a dead end with no control on it that could generate
// anything. An account that logged its transactions **before** this branch shipped has no `ready`
// set, so the read answers `empty` for a user with two hundred expenses - the very account
// `dashboard/InsightTeaserCard.tsx` keeps its `transactionCount` split for. And a **failed first
// run** falls back to `empty` too, so the failure state and the never-used state render
// identically. The only escape either had was creating or editing another transaction.
//
// The cost of the amendment is that a genuinely new account carries a button that briefly draws
// skeletons and settles back to the same card, because the generator answers `null` for an
// account with no transactions and the placeholder run is removed. That is honest, and it is
// cheaper than the two dead ends. `InsightsEmpty.tsx` no longer claims the premise either.

/** The frontend's own route handler. One half of a contract; its suite pins the other. */
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
 * **There is deliberately no two-minute cap**, which the stacked PET-43 plan had. The backend
 * treats a `generating` row as live until its own staleness cutoff of five minutes, so a cap
 * before that re-enables a button whose click can only 409 - and this design treats a 409 as
 * success and re-enters polling, so the cap would have added a click to the same wait rather
 * than shortening it. The read self-heals on its own at the cutoff: `hasRunInFlight` is bounded
 * by `gt(createdAt, staleBefore())`, so five minutes after an abandoned run the state stops
 * reporting `generating` with no POST needed. This ceiling sits just past that, so a wedged
 * timer cannot outlive the guarantee.
 *
 * **Reaching it puts the screen into `stalled` rather than merely stopping the timer**, which
 * is the review finding this constant produced. The self-healing above is the *backend read's*,
 * and the client stops asking at the same moment - so a session that died, or a backend
 * unreachable for the whole 5.5 minutes, left `state` on `generating` with the effect's only
 * dependency unable to change again. The page held skeletons and a disabled "Generating..."
 * for the lifetime of the mount, recoverable only by a reload.
 */
const POLL_CEILING_MS = 5.5 * 60 * 1000;

const delayFor = (attempt: number) => POLL_DELAYS[attempt] ?? POLL_MAX_DELAY;

export type InsightsScreenProps = {
  /**
   * The server's read, and the source of truth this screen starts from.
   *
   * It changes under us on every `router.refresh()` - which the Add transaction modal calls on
   * save - so it is adopted on change rather than only on mount. See the adjustment below.
   */
  set: InsightSet;
  /**
   * The page's overline, already formatted.
   *
   * A string rather than a `Date` this component formats, so a story and a suite can pin the
   * month without faking a timer, and so the one `new Date()` on this screen stays in
   * `page.tsx` where the note about whose clock it is belongs.
   */
  overline: string;
};

export function InsightsScreen({ set: fromServer, overline }: InsightsScreenProps) {
  const router = useRouter();
  const [set, setSet] = useState(fromServer);

  /**
   * Whether the poll gave up on a `generating` state that never settled.
   *
   * Deliberately client-only and never read from the server: it is a fact about *this mount's*
   * polling rather than about the account, so a refresh or a fresh read clears it below.
   */
  const [stalled, setStalled] = useState(false);

  // **The prop wins when it changes, and this is what starts the poll from a save.** The Add
  // transaction modal calls `router.refresh()`, which re-runs the Server Component and hands
  // this screen a set whose `state` has moved from `empty` to `generating` - with no click
  // anywhere and no action result to hang a timer off. Without adopting it, the empty state's
  // own "Add your first transaction" button leaves the user looking at a page that never
  // updates until a manual reload.
  //
  // A render-phase adjustment rather than an effect, which is this repo's shape for exactly
  // this: `react-hooks/set-state-in-effect` rejects the effect version and the repo carries no
  // eslint-disable comments. `TransactionSearch` records the same call.
  //
  // Compared on `state` and `generatedAt` rather than on identity, because the server hands
  // back a fresh object on every refresh: identity would discard a newer polled set in favour
  // of an identical older render.
  const [seen, setSeen] = useState({
    state: fromServer.state,
    generatedAt: fromServer.generatedAt,
  });
  if (fromServer.state !== seen.state || fromServer.generatedAt !== seen.generatedAt) {
    setSeen({ state: fromServer.state, generatedAt: fromServer.generatedAt });
    setSet(fromServer);
    // A fresh server read is a newer answer than the one this mount gave up on, so the giving
    // up is discarded with it - otherwise a `router.refresh()` landing after the ceiling would
    // render a set the server has just confirmed as generating through the stalled treatment.
    setStalled(false);
  }

  const generating = set.state === 'generating' && !stalled;

  /**
   * What the body draws, which is the read's own state except once the poll has given up.
   *
   * Stalled, the state is genuinely unknown, so the screen falls back to what it can still
   * stand behind: the last-good content the read carries independently of `state`, or the empty
   * card when it carries none. Holding skeletons instead would keep asserting a run is in
   * flight long after this screen stopped having any way to find out.
   */
  const displayState =
    set.state === 'generating' && stalled ? (set.summary ? 'ready' : 'empty') : set.state;

  // The poll. Keyed on the state alone, so a poll that returns another `generating` set does
  // not restart the loop and lose its own backoff.
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
        // Stop asking *and* say so, or the page keeps the skeletons and the disabled button
        // forever: `generating` is this effect's only dependency, and nothing left would move
        // it. See the constant above.
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

  const regenerate = async () => {
    const result = await generateInsights();

    // A 409 is `ok` too - a run started in another tab or by a transaction the user just saved
    // is the thing this button asks for, already happening. Either way the backend has
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
    // the button re-enables on its own, because both are derived from `state` and `state` never
    // moved. A 401 is different in kind: nothing on this page will ever work again, and without
    // this branch the click did nothing observable at all, forever, on every subsequent press.
    //
    // `router.refresh()` rather than a message, because the redirect already exists and belongs
    // to the server: re-running the Server Component puts `requireInsights()` in front of the
    // same dead cookie, and it redirects to the login screen the way every other read in this
    // app does. `lib/generateInsights.ts` records why the action itself must not redirect.
    if (result.reason === 'unauthenticated') {
      router.refresh();
    }
  };

  return (
    <>
      <PageHeader
        overline={overline}
        title="AI Insights"
        action={
          // Present in every state, including `empty`, which amends INS-1 - see the header
          // comment for the two reachable dead ends that bought.
          <Button
            label={generating ? 'Generating...' : 'Regenerate'}
            variant="secondary"
            disabled={generating}
            onClick={() => void regenerate()}
          />
        }
      />

      <main className="flex flex-1 flex-col gap-6 pb-10">
        <InsightsBody set={set} state={displayState} />
      </main>
    </>
  );
}

/**
 * The three states, chosen off `state` and nothing else.
 *
 * Split out so the screen above reads as "header, poll, body" rather than as one function with
 * three returns inside a `<main>`.
 *
 * **`state` is a parameter rather than `set.state`**, because the screen resolves one case the
 * read cannot: a poll that gave up renders the set's *content* under a state the response no
 * longer justifies. Passing it keeps that single decision at the one call site instead of
 * teaching this function about polling.
 */
function InsightsBody({ set, state }: { set: InsightSet; state: InsightSet['state'] }) {
  if (state === 'empty') {
    return <InsightsEmpty />;
  }

  if (state === 'generating') {
    return (
      <>
        <SummaryBannerSkeleton />
        {/* **As many skeleton cards as the last-good set had, not four.** INS-5 says "the four
            cards become skeleton cards", which stopped describing anything reachable when
            PET-42-43-44 took the maximum card count to two. Drawing the count the content is
            about to have keeps the page from reflowing when the run lands - and a set that had
            none draws none, rather than promising cards that are not coming. */}
        <InsightsGrid>
          {set.insights.map((_card, index) => (
            <InsightCardSkeleton key={index} />
          ))}
        </InsightsGrid>
      </>
    );
  }

  return (
    <>
      <SummaryBanner
        // `ready` implies all three, but the contract types them nullable because the same
        // fields are null in the empty state. The fallbacks are unreachable rather than
        // defensive, and are here because narrowing on `state` is not something the type knows.
        monthLabel={set.monthLabel ?? ''}
        headline={set.summary?.headline ?? ''}
        body={set.summary?.body ?? ''}
      />
      <InsightsGrid>
        {set.insights.map((card, index) => (
          <InsightCard key={index} {...card} />
        ))}
      </InsightsGrid>
    </>
  );
}

/**
 * The card grid, or nothing at all.
 *
 * **A zero-card `ready` set is the steady state rather than an edge case**, so this renders no
 * element whatsoever rather than an empty container: over-cap needs a category that has a cap
 * and is past it, and month-over-month needs a previous month, so a first-month user who set no
 * caps sees the banner standing alone indefinitely. An empty grid would leave a `gap-6` of dead
 * space under the banner with nothing in it.
 *
 * Two columns at `md`, which is INS-3's 2x2 read against a maximum of two cards: one card fills
 * the row it is on rather than sitting in a half-width box beside a hole.
 */
function InsightsGrid({ children }: { children: React.ReactNode[] }) {
  if (children.length === 0) {
    return null;
  }

  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}
