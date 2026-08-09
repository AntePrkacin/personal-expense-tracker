import { Sparkle } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';

import { AddTransactionButton } from '../AddTransactionButton';

// 16 AI Insights — Empty (Figma node 39:665, INS-7).
//
// `EmptyState` was built for this frame as its second consumer and names it in its own header
// comment - so this file passes a glyph and copy and owns no box of its own.
//
// **`Sparkle`, not `Sparkles`.** `ui/Sidebar.tsx:53` records that the design's AI mark is the
// single four-pointed star.
//
// **This state means the account has never logged a transaction, and as of PET-42-43-44 that is
// literally true.** Every transaction write regenerates the set, so an account with expenses
// has a set or is generating one and can never reach this card - which is what makes INS-7's
// copy honest rather than a promise the app could break. Before that trigger existed, the
// dashboard teaser had to invent a third state precisely because this one was reachable by
// accounts with two hundred expenses in them; `dashboard/InsightTeaserCard.tsx` records that.
//
// **Nothing here fires a generation, and that is the point.** PET-44's plan had this state POST
// `/api/insights/generate` on mount, which made a read-only screen write to the database on
// every visit and made React Strict Mode's dev double-mount 409 against itself. The write path
// owns the trigger now.

/**
 * INS-7's own copy, exported so no test or story restates a shipped string.
 *
 * **"analyze" is the design's US spelling** against the UK "categorised" on frame 07, which A30
 * records as a mix to settle in a copy pass rather than to normalise one screen at a time.
 * Implement the Figma text as designed.
 */
export const INSIGHTS_EMPTY_COPY = {
  heading: 'Insights unlock after your first expense',
  body: "Once you log a few transactions, I'll analyze your spending, flag anomalies and suggest ways to stay on budget.",
  action: 'Add your first transaction',
};

export function InsightsEmpty() {
  return (
    <EmptyState
      icon={<Sparkle className="size-7.5" aria-hidden="true" />}
      heading={INSIGHTS_EMPTY_COPY.heading}
      body={INSIGHTS_EMPTY_COPY.body}
      // The two lines PET-31 predicted this card would cost, and `app/CLAUDE.md`'s modal
      // paragraph was still recording as owed: the modal is mounted once on the shell, so a
      // fifth trigger is the component and nothing else - no prop threading through `<main>`.
      action={<AddTransactionButton label={INSIGHTS_EMPTY_COPY.action} />}
    />
  );
}
