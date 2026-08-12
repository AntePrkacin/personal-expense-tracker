import { Sparkle } from 'lucide-react';

// The summary banner (INS-2, Figma node 38:495), in both of its shapes. It was the *dark* banner
// until PET-78, which is the next paragraph's subject.
//
// **It was `bg-neutral` with `text-neutral-content` - daisyUI's always-dark slot - and in the dark
// theme that made it invisible.** PET-78: `--color-neutral` is `#101720` in both Expensa themes and
// the dark theme's `--color-base-200`, which paints the page canvas, is **also** `#101720`. So the
// card's fill was byte-identical to the ground behind it, measured at exactly **1.000:1**: not a
// weak highlight, the same colour. `ui/Sidebar.tsx` hit this in PET-74 and its comment names the
// cause outright - "the ink version dissolved into the dark theme's canvas outright, because the
// Expensa dark canvas *is* ink" - and answered it by ceasing to be ink.
//
// The sidebar's own answer (`bg-base-100` plus a hairline) is not this card's, because it would
// make the banner identical to the five ordinary cards around it: visible, and no longer the
// highlighted one. So this is **`bg-primary/20` with a `border-primary/30` hairline**, which is
// distinct from the canvas *and* from a plain card in both themes, and which says "AI" with the
// colour the assistant link and the sparkle already use. Still no `dark:` variant, which the repo
// forbids outright, and still not a raw palette class - `primary` is a semantic token, so both
// themes resolve it themselves.
//
// **Both halves carry an alpha, so both are composited and measured rather than reasoned about**,
// which is the rule `frontend/CLAUDE.md` states for exactly this and which `getComputedStyle`
// cannot satisfy on its own.
//
// **The glyph is `Sparkle`, not `Sparkles`.** `ui/Sidebar.tsx:53` records that the design's AI
// mark is the single four-pointed star, and the library ships both. Only the skeleton draws one
// now, for the reason below.
//
// **PET-78 deleted the uppercase eyebrow, and the reason is that the Dashboard said the period
// three times.** It read "✦ AUGUST 2026 SUMMARY" over the headline, while the page header's own
// overline said "August 2026" and the period select beside it said "August 2026" - so the card's
// first line restated, in a third typographic style, the one fact the screen was least short of.
// The `overline` prop is gone with it, which also took `UNLOCK_COPY`'s and `PENDING_COPY`'s
// "AI Insights" - those two never named a period, and an eyebrow that exists only to label the
// card as an AI card is what the headline and the assistant link already do.
//
// **What that gives up is worth knowing before restoring it.** The overline was the only place the
// card said *which* period the set describes, and a set can outlive its own period: the read serves
// the latest **ready** set whatever today is, so an account that writes nothing after a period rolls
// over sees last period's analysis on this period's Dashboard. `isCurrentPeriod` does not cover that
// - it asks which period the *screen* is showing, not when the set was generated. The honest fix if
// that ever matters is a "generated {date}" line rather than the period label, because the defect is
// staleness rather than a missing name; `docs/TODO.md` is where that belongs.
//
// The skeleton keeps its eyebrow, because that one is not a period label: "Analyzing your
// spending..." is the only visible text while the bars are up, and it is what the `aria-busy`
// state says in words.
//
// **The headline is a heading rather than a paragraph**, so the banner keeps a real accessible
// structure instead of two runs of undifferentiated text. In the `ready` state everything in it
// is the response's own prose: a set is a snapshot of what the generator wrote, stored rendered,
// so this component owns none of that wording.
//
// **PET-73 moved this file from `insights/` to `dashboard/` and gave it two things it did not
// have: an `action` slot, and the two copy states `dashboard/InsightTeaserCard.tsx` used to
// own.** On `/insights` the banner only ever rendered under `state === 'ready'`, because the
// screen around it drew a whole empty card for the other cases. On the Dashboard it is the
// topmost card in the wide column *and* carries the primary control, so it has to say something
// in every state - which is exactly the split the teaser existed for. That component is deleted
// and its two copy constants moved here rather than being restated.
//
// **The heading stays `text-xl`, not the teaser's `text-lg`.** It is full-width in the wide
// column now rather than sitting in the narrow one.

type SummaryBannerProps = {
  headline: string;
  body: string;
  /**
   * The card's one control, or nothing.
   *
   * **A slot rather than a variant prop**, the call `Modal`'s `footerStart` records: the control
   * differs per state - a link into the chat, or the shell's Add transaction trigger - and both
   * come from a caller that can hand over a node, so a prop naming which one would be this
   * component deciding something it has no information about.
   *
   * **It renders inside `card-actions`, never directly in `card-body`.** That component declares
   * no `align-items`, so daisyUI's default `stretch` applies and a `btn` that is its direct child
   * spans the whole card - the trap `InsightTeaserCard` recorded against
   * `frontend/node_modules/daisyui/components/card.css` and the reason its footer moved here
   * intact.
   */
  action?: React.ReactNode;
};

/**
 * Frame 44:706's own copy: no expense has ever been logged, so there is one thing to do.
 *
 * Exported so no test or story restates a shipped string, which is the rule `TransactionsEmpty`
 * already keeps for its two copy objects.
 */
export const UNLOCK_COPY = {
  headline: 'Insights unlock after your first expense.',
  body: "Log a few expenses and I'll surface patterns and ways to save.",
};

/**
 * Ours: expenses exist and no set has been generated over them.
 *
 * Reachable in two windows rather than commonly - between a first save and the first run
 * settling, and for an account whose transactions predate the write-path trigger - since every
 * transaction and category write regenerates the set backend-side.
 */
export const PENDING_COPY = {
  headline: 'No insights yet.',
  body: 'Your expenses are logged. Insights land here once an analysis has run.',
};

export function SummaryBanner({ headline, body, action }: SummaryBannerProps) {
  return (
    <section className="card border-primary/30 bg-primary/20 border shadow-sm">
      <div className="card-body gap-4">
        <h2 className="font-display text-2xl font-bold">{headline}</h2>
        <p className="text-base-content/70">{body}</p>

        {action ? <div className="card-actions">{action}</div> : null}
      </div>
    </section>
  );
}

/**
 * The same banner with its content replaced by skeleton bars (INS-5).
 *
 * A separate export rather than a `loading` prop on the one above, because the two share only
 * the box: this one has no month to name, no heading to carry an accessible name, and three
 * bars where the other has two blocks of prose. A prop would mean every line of the ready
 * banner reading "unless we are loading".
 *
 * **`aria-busy` and an `sr-only` line, because the bars announce nothing.** A skeleton is
 * decoration - three empty generics to a screen reader - so the state has to be said in words
 * somewhere, the same call PET-22's trend chart made about naming its accent in text rather
 * than in colour. The overline is real text and already says "analyzing your spending"; the
 * `sr-only` line is what tells a reader the *cards* below are placeholders too.
 */
export function SummaryBannerSkeleton() {
  return (
    <section aria-busy="true" className="card border-primary/30 bg-primary/20 border shadow-sm">
      <div className="card-body gap-4">
        <div className="text-base-content/60 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Sparkle className="size-3.5" aria-hidden="true" />
          Analyzing your spending...
        </div>

        <span className="sr-only">Generating new insights. This usually takes a moment.</span>

        {/* Three bars, per INS-5. `skeleton` is daisyUI's own shimmer; the widths are the
            frame's own descending run rather than three equal blocks, so the shape reads as
            a headline over two lines of body. */}
        <div aria-hidden="true" className="flex flex-col gap-3">
          <div className="skeleton bg-base-content/20 h-5 w-3/4" />
          <div className="skeleton bg-base-content/20 h-4 w-full" />
          <div className="skeleton bg-base-content/20 h-4 w-2/3" />
        </div>
      </div>
    </section>
  );
}
