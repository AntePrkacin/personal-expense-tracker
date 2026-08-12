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

/**
 * The two headers this app draws, as an exclusive union rather than four optional props.
 *
 * The four routed views open with an overline over the title. Frame 08, the transaction
 * detail, opens with a **breadcrumb** in that position and adds a caption row under the title
 * - a date and the category chip - and it has no overline at all. Those are two shapes, not
 * one shape with three optional slots: a header carrying both an overline and a breadcrumb is
 * a state nobody wants and the `never` arms make it unrepresentable.
 *
 * Same technique, and the same argument, as `Modal`'s `align` and `ui/Button`'s `href` xor
 * `onClick`. PET-33 chose it over a second component for `Modal` because the duplicate would
 * copy the parts nobody should own twice; here that part is the `h1`, which is the one element
 * on a screen that earns level 1 and which `(app)/pages.test.tsx` pins one of per screen.
 *
 * `breadcrumb` and `caption` are nodes rather than strings for `action`'s reason: the
 * breadcrumb is a link and the caption holds a chip, and neither is expressible as text.
 */
type PageHeaderShape =
  | {
      /** "October 2025", "Your money assistant", "Manage your account". */
      overline: string;
      breadcrumb?: never;
      caption?: never;
    }
  | {
      overline?: never;
      /** Frame 08's "All transactions" link back to the list (DET-1). */
      breadcrumb: React.ReactNode;
      /** The row under the title: frame 08's date and category chip (DET-2). */
      caption?: React.ReactNode;
    };

type PageHeaderProps = PageHeaderShape & {
  title: string;
  /**
   * The screen's action block, rendered right-aligned. Omit it and nothing
   * renders there at all, which is Settings (SET-1, AC2).
   *
   * Presence is the switch rather than a separate boolean: Figma models
   * optional content as two properties because its component properties cannot
   * be optional, and collapsing the pair removes the state where they
   * contradict each other.
   *
   * A ReactNode rather than a `{ label, onClick }` shape because the four
   * screens do not agree on what an action is: two of them draw a control beside
   * the button, and one of those controls is a select and the other a search
   * field.
   */
  action?: React.ReactNode;
};

export function PageHeader({ overline, breadcrumb, caption, title, action }: PageHeaderProps) {
  return (
    // flex-wrap plus the gap is the small-screen behaviour: the action block
    // drops below the title instead of clipping, on frames that were only ever
    // drawn at 1440px.
    //
    // No horizontal padding, deliberately: the (app) layout owns the shared
    // gutter, once, for this header and the <main> below it together.
    <header className="flex flex-wrap items-center justify-between gap-3 pt-6 pb-5">
      <div className="flex flex-col gap-1">
        {/* Whichever arm the caller passed. The breadcrumb is rendered bare
            rather than inside the overline's <p>, because it is a link and a
            paragraph wrapping one adds a node that names nothing. */}
        {overline === undefined ? (
          breadcrumb
        ) : (
          <p className="text-base-content/60 text-sm">{overline}</p>
        )}
        {/* An h1, which has no Figma counterpart - Figma has no document
            outline. This is the one element on a screen that earns level 1.
            ui/Sidebar deliberately renders no heading at all, so this is also
            the first heading a screen reader reaches. */}
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        {caption ? <div className="flex flex-wrap items-center gap-2 pt-1">{caption}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
    </header>
  );
}
