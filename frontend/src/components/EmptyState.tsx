// The centred empty-state card, drawn identically on two frames and specified for a third:
// 07 Transactions — Empty (node 45:1044) and 16 AI Insights — Empty (node 39:665) differ only
// in glyph and copy, and DSH-7 describes the same shape inside the dashboard's recent-list
// card.
//
// **Why this is in components/ rather than beside the transactions route.** The rule
// `frontend/CLAUDE.md` sets for this folder is "belongs to more screens than one route segment
// holds", and `AccessCard` records how that usually plays out: it lived in
// `app/setup/SetupShell.tsx` until a second screen turned out to draw the identical box, then
// moved. The second consumer here is already visible in the design file rather than only
// guessed at - PET-44's frame 16 is the same box, measured - so this skips the move commit
// instead of waiting to be told what is already known.
//
// Everything about the box came off node 45:1044. Figma binds a raw 16px radius here and no
// shadow at all - the first card in the app without one - but PET-57 handed radius and shadow
// to the theme, so this now draws the stock daisyUI surface (`bg-base-100`, `rounded-box`)
// rather than either of the frame's measured values. The design deliberately no longer
// matches Figma's pixels on this point, the same call `frontend/CLAUDE.md` records for the
// design system generally.

type EmptyStateProps = {
  /**
   * The glyph inside the accent circle, at 30px.
   *
   * A node rather than a name, because there is no icon module in this repo to name into: each
   * glyph is a local inline SVG in the file that needs it, and `ui/Sidebar.tsx` documents why.
   * The circle and its colour belong to this component; the mark inside it belongs to the
   * screen, which is exactly the seam between frames 07 and 16.
   *
   * **The caller does not have to hide it**, and that is deliberate rather than lax. The
   * heading carries the meaning, so an announced icon here is noise - but a prop whose contract
   * is "remember to set `aria-hidden` yourself" is one every future caller can forget, and no
   * test of this component could catch it. The circle below is hidden instead, which takes the
   * whole subtree out of the accessible tree and makes the guarantee this component's own.
   * Every glyph in the repo still sets the attribute itself, which is belt and braces.
   */
  icon: React.ReactNode;
  heading: string;
  body: string;
  /**
   * The primary button, or nothing.
   *
   * Both designed states carry one, but presence is the switch rather than a `showAction`
   * pair: an omitted node renders nothing and cannot contradict a flag.
   */
  action?: React.ReactNode;
  /**
   * Absent from Figma, which has no notion of document outline.
   *
   * Defaults to 2 because `PageHeader` owns the `h1` on every `(app)` screen.
   */
  headingLevel?: 2 | 3 | 4;
};

export function EmptyState({ icon, heading, body, action, headingLevel = 2 }: EmptyStateProps) {
  // Types as 'h2' | 'h3' | 'h4' from the prop union, so no cast is needed.
  const Heading = `h${headingLevel}` as const;

  return (
    // flex-1 is what makes this fill the space below the tabs and centre in it. Frame 07 draws
    // the card 823px tall against a 926px content area, i.e. everything left after the tabs
    // and the 40px bottom inset - so the height is the remainder rather than a measurement,
    // and `justify-center` puts the column in the middle of whatever that turns out to be.
    //
    // gap-4 is the designed 16px between all four children. px-10 is Space/40.
    <div className="bg-base-100 border-base-300 rounded-box flex flex-1 flex-col items-center justify-center gap-4 border px-10">
      {/* size-18 is 72px. bg-primary/10 is the opacity modifier on a semantic colour the
          design tokens rules allow, standing in for the old accent-soft tint; text-primary
          sets the colour the glyph inherits through currentColor, which is how every glyph in
          the repo takes its colour.

          aria-hidden covers the circle *and* whatever glyph is passed in, so the guarantee
          belongs to this component rather than to each caller's memory. It is also correct on
          its own terms: unhidden, the circle is an unlabelled generic announcing nothing. Note
          this does not remove focusable descendants from the tab order - the trap
          app/DecorativePanel.tsx records - but nothing focusable belongs in an icon. */}
      <div
        aria-hidden="true"
        className="bg-primary/10 text-primary flex size-18 shrink-0 items-center justify-center rounded-full"
      >
        {icon}
      </div>

      <Heading className="font-display text-2xl font-bold text-center">{heading}</Heading>

      {/* max-w-110 rather than the frame's fixed 440px w-110: at the designed 1440 width the
          two render identically, and a narrower window wraps instead of overflowing the
          px-10. The same call AccessCard's py-10 makes about a viewport Figma never draws. */}
      <p className="text-base-content/70 max-w-110 text-center">{body}</p>

      {/* mt-5 is not arbitrary. Figma puts a 4px spacer frame between the copy and the button
          inside this 16px-gap column, so the designed distance is 16 + 4 + 16 = 36px, and
          gap-4 already supplies 16 of it. Reproducing the empty spacer as a real element
          would be the literal transcription; this is the same 36px with nothing to explain
          to the next reader. */}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
