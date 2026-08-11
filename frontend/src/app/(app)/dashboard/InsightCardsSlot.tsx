'use client';

import { InsightCard, InsightCardSkeleton } from './InsightCard';
import { useInsightPoll } from './InsightPoll';

// The two rule-based insight cards, under the donut in the Dashboard's narrow column.
//
// **The second consumer of the one poll**, which is why `InsightPoll` is a provider rather than
// state inside a card: this sits in a different grid column from the summary banner with a Server
// Component between them, and two timers on one screen double the requests and can disagree about
// which set is current.
//
// **A zero-card `ready` set is the steady state rather than an edge case**, so this renders no
// element whatsoever rather than an empty container: over-cap needs a category that has a cap and
// is past it, and month-over-month needs a previous period, so a first-period account that set no
// caps sees the banner standing alone indefinitely. An empty container would leave a `gap-5` of
// dead space under the donut with nothing in it.
//
// **It renders nothing on a period navigated back to**, for the reason `InsightSummarySlot`
// records at length: insights describe the current period only, and there is nothing honest to
// put in their place.
//
// **One column, not INS-3's 2x2.** These cards sat side by side on a full-width screen; here they
// are in the narrow column of a `2fr_1fr` grid, stacked under the donut, so they follow the
// column's own `flex flex-col gap-5` rather than declaring a grid of their own.

export function InsightCardsSlot() {
  const { set, displayState, isCurrentPeriod } = useInsightPoll();

  if (!isCurrentPeriod) {
    return null;
  }

  if (displayState === 'generating') {
    // **As many skeleton cards as the last-good set had, not four.** INS-5 says "the four cards
    // become skeleton cards", which stopped describing anything reachable when PET-42-43-44 took
    // the maximum card count to two. Drawing the count the content is about to have keeps the
    // column from reflowing when the run lands - and a set that had none draws none, rather than
    // promising cards that are not coming.
    if (set.insights.length === 0) {
      return null;
    }

    return (
      <>
        {set.insights.map((_card, index) => (
          <InsightCardSkeleton key={index} />
        ))}
      </>
    );
  }

  if (displayState === 'empty') {
    return null;
  }

  return (
    <>
      {set.insights.map((card, index) => (
        <InsightCard key={index} {...card} />
      ))}
    </>
  );
}
