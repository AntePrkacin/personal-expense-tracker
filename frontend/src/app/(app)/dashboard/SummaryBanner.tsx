import { Sparkle } from 'lucide-react';

// The dark summary banner (INS-2, Figma node 38:495), in both of its shapes.
//
// **`bg-neutral` with `text-neutral-content`**, daisyUI's always-dark slot - the same
// mechanism `ui/Sidebar`'s panel uses. Not a `dark:` variant, which the repo forbids outright,
// and not a raw palette class, which would compile and quietly bypass the theme.
//
// **The glyph is `Sparkle`, not `Sparkles`.** `ui/Sidebar.tsx:53` records that the design's AI
// mark is the single four-pointed star, and the library ships both.
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
  /**
   * The uppercase eyebrow above the heading.
   *
   * In the ready state this is the period the set covers as the response renders it, plus
   * "summary": `October 2025 summary`. INS-2 draws it as "✦ OCTOBER SUMMARY" with no year, and
   * the year is kept because the set can outlive its own period - the read serves the latest
   * *ready* set whatever today is, so an account that has not written anything since the period
   * rolled over is looking at last month's analysis, and an overline reading "OCTOBER SUMMARY"
   * in November is the card lying about which month it describes. Slicing the year off a field
   * the contract documents as rendered prose would also be a second authority on how that
   * string is built.
   *
   * A whole string rather than a `monthLabel` this component decorates, because the two copy
   * states below have no period to name and would otherwise render " summary".
   */
  overline: string;
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
  overline: 'AI Insights',
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
  overline: 'AI Insights',
  headline: 'No insights yet.',
  body: 'Your expenses are logged. Insights land here once an analysis has run.',
};

export function SummaryBanner({ overline, headline, body, action }: SummaryBannerProps) {
  return (
    <section className="card bg-neutral text-neutral-content shadow-sm">
      <div className="card-body gap-4">
        {/* Decorative eyebrow, matching PageHeader's overline: the heading below carries the
            card's accessible name, so an icon and a label both restating "insight" here would
            be noise on top of it. */}
        <div className="text-neutral-content/60 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Sparkle className="size-3.5" aria-hidden="true" />
          {overline}
        </div>

        <h2 className="font-display text-xl font-bold">{headline}</h2>
        <p className="text-neutral-content/70">{body}</p>

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
    <section aria-busy="true" className="card bg-neutral text-neutral-content shadow-sm">
      <div className="card-body gap-4">
        <div className="text-neutral-content/60 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Sparkle className="size-3.5" aria-hidden="true" />
          Analyzing your spending...
        </div>

        <span className="sr-only">Generating new insights. This usually takes a moment.</span>

        {/* Three bars, per INS-5. `skeleton` is daisyUI's own shimmer; the widths are the
            frame's own descending run rather than three equal blocks, so the shape reads as
            a headline over two lines of body. */}
        <div aria-hidden="true" className="flex flex-col gap-3">
          <div className="skeleton bg-neutral-content/20 h-5 w-3/4" />
          <div className="skeleton bg-neutral-content/20 h-4 w-full" />
          <div className="skeleton bg-neutral-content/20 h-4 w-2/3" />
        </div>
      </div>
    </section>
  );
}
