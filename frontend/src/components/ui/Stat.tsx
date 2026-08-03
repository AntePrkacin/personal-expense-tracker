// Stat (Figma "Components", node 15:5).
//
// The three readouts under the monthly budget card: "38 Transactions",
// "$54 Avg / day", "Groceries Top category".

/**
 * U+2014 EM DASH, the placeholder for a missing value (05 Dashboard - Empty,
 * node 51:813, where Top category has nothing to show).
 *
 * Written as an escape so it survives copy-paste and is greppable; a bare glyph
 * is indistinguishable from an en dash or a hyphen in most editors.
 */
const EM_DASH = '—';

type StatProps = {
  /** Pre-formatted for display. Absent or empty renders the dash placeholder. */
  value?: string | number | null;
  label: string;
};

export function Stat({ value, label }: StatProps) {
  // Nullish-or-empty, never `!value`. Frame 05 renders "0 Transactions" and
  // "$0 Avg / day" as real figures on the same row as the dash, so treating a
  // zero as missing would blank two correct readouts.
  const hasValue = value !== undefined && value !== null && value !== '';

  return (
    <div className="flex flex-col gap-1.25">
      <p className="text-display-s text-text-primary">
        {hasValue ? (
          value
        ) : (
          // A lone em dash is announced inconsistently: sometimes "em dash",
          // sometimes nothing at all, so the reading is either noise or a label
          // with no indication that its value is absent. Hide the glyph and say
          // it in words instead.
          <>
            <span aria-hidden="true">{EM_DASH}</span>
            <span className="sr-only">No value</span>
          </>
        )}
      </p>
      <p className="text-label-s text-text-tertiary">{label}</p>
    </div>
  );
}
