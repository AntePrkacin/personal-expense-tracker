import { AlignLeft } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';

import { AddTransactionButton } from '../AddTransactionButton';

// The transactions page's two empty states: frame 07's designed one (TRN-9) and the no-results
// one nobody drew (A15). Both are `EmptyState` with this file's glyph; only the two strings
// differ.
//
// **The no-results copy is ours, and it amends A15 and PET-30's AC5.** Both said to reuse
// frame 07's message verbatim until a variant is designed. That message reads "Log your first
// expense and it'll show up here" - which, shown to somebody with a hundred transactions whose
// search matched nothing, is not thin copy but wrong copy: it reports the account as empty when
// the account is full. A15 was a placeholder for an undesigned state rather than a considered
// decision about this one, so the placeholder is replaced and the amendment recorded.
// `docs/TODO.md` carries it, along with these two strings joining what A29 owes a designer.
//
// The UK "categorised" in the designed copy is deliberate and stays: A30 records that the file
// mixes UK and US spelling and asks for a copy pass rather than a fix here.

/** Exported for the suites and the stories, so no assertion restates a designed string. */
export const EMPTY_COPY = {
  heading: 'No transactions yet',
  body: "Log your first expense and it'll show up here, sorted and categorised automatically.",
} as const;

export const NO_RESULTS_COPY = {
  heading: 'No matching transactions',
  body: 'Try a different search term, category or period.',
} as const;

// **`TransactionsGlyph` was a hand-traced 30-box of three bars and is now lucide's
// `AlignLeft`** - the same mark `ui/Sidebar.tsx` gives the Transactions item, so the two stop
// being near-identical paths maintained apart, which is what the comment here used to spend a
// paragraph explaining. The ragged short line survives the swap and is the load-bearing
// detail: it is what makes this read as a list rather than as a hamburger.

/**
 * Frame 07, or the no-results variant of it.
 *
 * One component with a flag rather than two exports, because the card, the glyph and the button
 * are identical and only the copy moves - so two components would be one component and a
 * duplicated box. The caller's `view.state` is already the discriminated value, which is why
 * this takes the state name rather than a boolean called something like `filtered`.
 *
 * **The button opens modal 09 as of PET-31**, which closes PET-30's AC4 - exactly as that
 * ticket predicted, with an `onClick` and nothing else here changing. It is the same trigger
 * component the header above uses, and both reach the single modal on the shell's layout: two
 * independent modals on one page would mean two focus traps and duplicate field ids (`ui/FieldShell` requires them as literal props).
 */
export function TransactionsEmpty({ state }: { state: 'empty' | 'noResults' }) {
  const copy = state === 'empty' ? EMPTY_COPY : NO_RESULTS_COPY;

  return (
    <EmptyState
      icon={<AlignLeft className="size-7.5" aria-hidden="true" />}
      heading={copy.heading}
      body={copy.body}
      action={<AddTransactionButton />}
    />
  );
}
