import { ChevronDown } from 'lucide-react';

// The Dashboard header's month select (Figma node 21:61).
//
// Inert on purpose, and that is the design's decision rather than a shortcut:
// only October exists in the file, so DSH-2 and assumption A8 both say it
// renders the current period and stays non-functional until month navigation is
// designed. It is a <div>, not a <select> or a <button>, because a control that
// announces itself as operable and then does nothing is worse than one that
// never claimed to be - a real select with one option would also read out
// "October, 1 of 1" and go nowhere.
//
// TODO: the ticket that designs month navigation turns this into a real Select
// and gives it the surrounding period state. Nothing else has to move.

export function MonthPill({ label }: { label: string }) {
  // Styled like a field without being one: `rounded-field` and `border-base-300`
  // are what daisyUI's own select wears, minus the operable semantics the
  // comment above rules out.
  return (
    <div className="bg-base-100 border-base-300 rounded-field flex items-center gap-2 border px-3 py-2 text-sm font-medium">
      {label}
      {/* Sized in a spacing step rather than the frame's literal 9x4.5. That measurement came
          with a hand-traced box; lucide's grid is square, and matching the old width exactly
          would squash the mark. */}
      <ChevronDown className="text-base-content/50 size-4 shrink-0" aria-hidden="true" />
    </div>
  );
}
