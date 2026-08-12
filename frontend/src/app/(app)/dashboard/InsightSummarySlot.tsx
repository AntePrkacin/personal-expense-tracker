'use client';

import { Sparkle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';

import { AddTransactionButton } from '../AddTransactionButton';
import { useInsightPoll } from './InsightPoll';
import { PENDING_COPY, SummaryBanner, SummaryBannerSkeleton, UNLOCK_COPY } from './SummaryBanner';

// The top of the Dashboard's wide column: the summary banner in whichever of its four states
// applies, with the screen's one insight control in it.
//
// **This is what `dashboard/InsightTeaserCard.tsx` used to be, plus the real set.** That card
// rendered the same headline and body from a *different endpoint* - `DashboardResponseDto.insight`
// - and linked to a page that repeated them: one fact, two DTOs, two components, three
// overlapping "nothing here yet" copies. PET-73 deleted the field, the DTO and the component; what
// survives is its three-state copy split, which is the part that was doing real work.
//
// **The four states and their controls**, which is the table the plan settled:
//
// | Condition                 | Copy                    | Control                              |
// | ------------------------- | ----------------------- | ------------------------------------ |
// | `ready`                   | the set's own prose     | the assistant link                   |
// | `generating`              | `SummaryBannerSkeleton` | none while the skeletons are up      |
// | `empty` and `isEmpty`     | `UNLOCK_COPY`           | `AddTransactionButton`               |
// | `empty` and not `isEmpty` | `PENDING_COPY`          | the assistant link, plus Regenerate  |
//
// plus **Regenerate wherever a run has dead-ended and the account is not empty**, whichever of those
// rows the fold lands on - a stall, or a run that settled on the set it started from. PET-78 made
// that control conditional; the paragraph on `canRegenerate` below is the authority for why, and the
// table above is only true read together with it. (That line named `stalled` alone and put the
// control on the `empty` and `isEmpty` row as well, which a review of PR #92 corrected on both
// counts.)
//
// `isEmpty` is `page.tsx`'s existing shared `transactionCount === 0` condition from PET-26, so
// this adds **no new condition** to the screen - which is the whole point of that ticket resolving
// it once.
//
// **The label changed from "Open insights" because the destination is a conversation now** rather
// than a page of cards. That is new copy and joins what A29 owes a designer.
//
// **It renders nothing on a period navigated back to.** Insights are generated for the current
// period only - `GET /api/insights` publishes no period at all - so on a past period this banner
// would put October's analysis above September's figures with nothing on screen saying which is
// which. That is the failure this repo has already paid for three times: the no-results copy
// claiming an account was empty, the teaser claiming insights unlock after a first expense, and
// the donut caption saying "once you start spending" over real money. Nothing stands in for it,
// because there is nothing honest to say.
//
// **The component decides, rather than the slot being optional.** `DashboardScreen` says outright
// that every slot is required, because "there is no state in which one is absent, so an optional
// prop would let a call site quietly test a dashboard with a card missing". `CategoryDonut` guards
// on its own input for the same reason; this guards on a flag `page.tsx` resolved once.

export function InsightSummarySlot() {
  const {
    set,
    displayState,
    generating,
    stalled,
    runFailed,
    isCurrentPeriod,
    isEmpty,
    regenerate,
  } = useInsightPoll();

  if (!isCurrentPeriod) {
    return null;
  }

  if (displayState === 'generating') {
    return <SummaryBannerSkeleton />;
  }

  /**
   * Regenerate follows the cards onto this screen rather than being deleted with the page it
   * used to sit on: `POST /api/insights/generate` still exists, and this is now the only place
   * the set is drawn.
   *
   * **It renders only where it can do something, as of PET-78, and the product owner asked the
   * right question to get there: is this button needed at all, given the set regenerates itself?**
   * The premise is correct - `insight-triggers.listener.ts` handles `TRANSACTION_CHANGED` **and**
   * `CATEGORY_CHANGED`, so every transaction and category write starts a run - and on the ordinary
   * path the button is a second control beside the primary one that restates what the app already
   * did by itself. So it is gone from the `ready` state, which is every healthy account.
   *
   * **Deleting it outright was the other option and it re-creates a dead end**, which is the whole
   * of why it exists. Four states reach this card with no run coming:
   *
   * - an account whose transactions predate the write-path trigger, so no set was ever generated
   * - an account whose first run **failed**: `runGeneration` marks the row `failed` and the read
   *   falls back, so a failure and a fresh account render identically
   * - a run this mount **gave up** on at the 5.5-minute ceiling
   * - a run that **failed after a previously successful set**, which this list said "three" about
   *   until a review of PR #92 counted a fourth
   *
   * In the first two the only other way to start a run is to go and edit a transaction, which is
   * advice no copy on this card could reasonably give. The third needs `stalled` off the poll rather
   * than `displayState`, which deliberately folds a stall into `ready` or `empty` - see that field's
   * own note.
   *
   * **The fourth is the one that hid, and it hid because the card looks healthy in it.** The read
   * skips a `failed` row and serves the newest `ready` set, so `displayState` is `'ready'`, the
   * banner draws real prose, no Regenerate renders - and the prose predates the write that triggered
   * the run that failed, with nothing on screen able to start another. The enumerated "first run
   * failed" case is the *no set at all* variant of it, which shows because the empty copy shows;
   * this one is invisible. `runFailed` off the poll is what says so, and that field's docblock
   * carries both why the signal has to be derived and the one variant it cannot see.
   *
   * **`isEmpty` excludes every arm, which is the correction of the second half of the same
   * review.** An account with nothing logged has nothing to analyse, so a run would produce the
   * same empty set it already has - and that reasoning is about the *account*, so it cannot be an
   * exclusion on one term. Written as `stalled || (displayState === 'empty' && !isEmpty)` it bound
   * only to the third state, so an account that created and then deleted its one transaction, whose
   * triggered run then stalled, drew the unlock copy with **both** "Add transaction →" and
   * "Regenerate" on it - the exact pair the suite has a case asserting must not happen, reached
   * through the other term. The gate leads on the account now, so there is no term left to slip
   * past it.
   */
  const canRegenerate = !isEmpty && (stalled || runFailed || displayState === 'empty');

  const regenerateButton = canRegenerate ? (
    <Button
      label="Regenerate"
      variant="secondary"
      disabled={generating}
      onClick={() => void regenerate()}
    />
  ) : null;

  // **The label names the destination, and drops the arrow.** "Ask about your spending" did not say
  // where it went, and the arrow was standing in for that - while the same words are the visible
  // label of the composer it lands on (`insights/AssistantComposer.tsx`), so the button and the
  // field it leads to read identically. Naming the assistant is what distinguishes them, and the
  // arrow stops carrying meaning once the sentence does.
  // The glyph is `aria-hidden` and trailing, so the accessible name is the sentence alone - the
  // rule `frontend/CLAUDE.md` states for every lucide mark, since the library renders a bare
  // `<svg>` with no ARIA of its own. `Sparkle` rather than `Sparkles`, which is the app's AI mark
  // (`ui/Sidebar.tsx` records that) and the one this card drew in its own eyebrow until item 5.2.
  const askButton = (
    <Button
      label="Ask AI Assistant about your spending!"
      href={SIDEBAR_HREFS.insights}
      iconEnd={<Sparkle className="size-4 shrink-0" aria-hidden="true" />}
    />
  );

  if (displayState === 'empty') {
    const copy = isEmpty ? UNLOCK_COPY : PENDING_COPY;

    return (
      <SummaryBanner
        {...copy}
        action={
          <>
            {/* An account with nothing logged has one thing to do, and it is not asking a
                question about spending it has not done. */}
            {isEmpty ? <AddTransactionButton label="Add transaction →" /> : askButton}
            {regenerateButton}
          </>
        }
      />
    );
  }

  return (
    <SummaryBanner
      // `ready` implies both, but the contract types them nullable because the same fields are
      // null in the empty state. The fallbacks are unreachable rather than defensive, and are
      // here because narrowing on `state` is not something the type knows.
      //
      // `set.monthLabel` is no longer read by this card - PET-78 deleted the eyebrow it fed, and
      // `SummaryBanner`'s header records what that gives up.
      headline={set.summary?.headline ?? ''}
      body={set.summary?.body ?? ''}
      action={
        <>
          {askButton}
          {regenerateButton}
        </>
      }
    />
  );
}
