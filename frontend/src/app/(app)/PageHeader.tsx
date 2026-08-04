// Page header (Figma nodes 21:56 Dashboard, 26:137 Transactions, 38:542 AI
// Insights, 40:677 Settings).
//
// The band every signed-in view opens with: an overline naming the period or the
// screen's purpose, the page title, and a right-aligned action block that differs
// on all four screens (DSH-2, TRN-1, INS-1, SET-1).
//
// This lives beside the layout rather than in components/ui/ deliberately. The
// ui/ library mirrors the nine tiles on the Figma Components page and is
// complete; the header is not a tile, it is the app shell's own. Its Storybook
// section is therefore "Shell", not "Components".
//
// It owns the overline, the title and the slot - nothing else. The month select,
// the search field and "Regenerate" are passed in by the route that needs them,
// so the tickets that eventually make those functional never have to touch this
// file.

type PageHeaderProps = {
  /** "October 2025", "Your money assistant", "Manage your account". */
  overline: string;
  title: string;
  /**
   * The screen's action block, rendered right-aligned. Omit it and nothing
   * renders there at all, which is Settings (SET-1, AC2).
   *
   * Presence is the switch rather than a separate boolean, following
   * SectionHeader's reasoning: Figma models optional content as two properties
   * because its component properties cannot be optional, and collapsing the pair
   * removes the state where they contradict each other.
   *
   * A ReactNode rather than a `{ label, onClick }` shape because the four
   * screens do not agree on what an action is: two of them draw a control beside
   * the button, and one of those controls is a select and the other a search
   * field.
   */
  action?: React.ReactNode;
};

export function PageHeader({ overline, title, action }: PageHeaderProps) {
  return (
    // pb-5 is 20px, which is what Dashboard and AI Insights draw. Transactions
    // and Settings draw 18px; the 2px difference is a Figma inconsistency rather
    // than a designed distinction, so all four share the larger value.
    <header className="flex items-center justify-between px-10 pt-7 pb-5">
      <div className="flex flex-col gap-0.75">
        <p className="text-label-m text-text-secondary">{overline}</p>
        {/* An h1, which has no Figma counterpart - Figma has no document
            outline. This is the one element on a screen that earns level 1, and
            it is what keeps SectionHeader's default h2 correct underneath.
            ui/Sidebar deliberately renders no heading at all, so this is also
            the first heading a screen reader reaches. */}
        <h1 className="text-display-m text-text-primary">{title}</h1>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
    </header>
  );
}
