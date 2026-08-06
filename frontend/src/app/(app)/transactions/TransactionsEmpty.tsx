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

/**
 * The three-bar list mark, traced from node `45:1046`.
 *
 * `ui/Sidebar.tsx`'s `TransactionsGlyph` is the same mark and is deliberately not reused. That
 * one is a 20-box with its bars flush to the edge (20, 20 and 13 wide, 3 tall, `rx` 1.5); this
 * is a 30-box with a 2px inset (26, 26 and 18 wide, 4 tall, `rx` 2). Close enough to read as
 * the same icon, not close enough to be the same path - and the sidebar's is unexported and
 * local to its file, which is this repo's pattern rather than an oversight.
 *
 * The short third bar is the load-bearing detail, for the reason the sidebar's copy also
 * records: it is what makes this read as a list rather than as a hamburger menu.
 *
 * No `overflow-visible` needed - every rect is fill-only and sits wholly inside the box, so
 * there is no stroke half-width to be sheared flat.
 */
function TransactionsGlyph() {
  return (
    <svg viewBox="0 0 30 30" className="size-7.5" fill="currentColor" aria-hidden="true">
      <rect x="2" y="6" width="26" height="4" rx="2" />
      <rect x="2" y="14" width="26" height="4" rx="2" />
      <rect x="2" y="22" width="18" height="4" rx="2" />
    </svg>
  );
}

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
 * independent modals on one page would mean two focus traps and duplicate `ui/Field` ids.
 */
export function TransactionsEmpty({ state }: { state: 'empty' | 'noResults' }) {
  const copy = state === 'empty' ? EMPTY_COPY : NO_RESULTS_COPY;

  return (
    <EmptyState
      icon={<TransactionsGlyph />}
      heading={copy.heading}
      body={copy.body}
      action={<AddTransactionButton />}
    />
  );
}
