'use client';

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
// | Condition                 | Copy                        | Control                        |
// | ------------------------- | --------------------------- | ------------------------------ |
// | `ready`                   | the set's own prose         | "Ask about your spending"      |
// | `generating`              | `SummaryBannerSkeleton`     | none while the skeletons are up |
// | `empty` and `isEmpty`     | `UNLOCK_COPY`               | `AddTransactionButton`         |
// | `empty` and not `isEmpty` | `PENDING_COPY`              | "Ask about your spending"      |
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
  const { set, displayState, generating, isCurrentPeriod, isEmpty, regenerate } = useInsightPoll();

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
   * **Present in every state except `generating`, including `empty`, which amends INS-1.** Frame
   * 16 draws no control and `/insights` honoured that, on the premise that `empty` had come to
   * mean "this account has never logged a transaction". Two ordinary accounts reach `empty` with
   * that premise false - one whose transactions predate the write-path trigger, and one whose
   * first run failed - and in both the screen was a dead end with no control that could generate
   * anything.
   */
  const regenerateButton = (
    <Button
      label="Regenerate"
      variant="secondary"
      disabled={generating}
      onClick={() => void regenerate()}
    />
  );

  const askButton = <Button label="Ask about your spending →" href={SIDEBAR_HREFS.insights} />;

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
      // `ready` implies all three, but the contract types them nullable because the same fields
      // are null in the empty state. The fallbacks are unreachable rather than defensive, and are
      // here because narrowing on `state` is not something the type knows.
      overline={`${set.monthLabel ?? ''} summary`}
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
