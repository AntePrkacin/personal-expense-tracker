import { Sparkle } from 'lucide-react';

// The dark summary banner (INS-2, Figma node 38:495), in both of its shapes.
//
// **`bg-neutral` with `text-neutral-content`**, daisyUI's always-dark slot - the same
// mechanism `ui/Sidebar`'s panel and `dashboard/InsightTeaserCard` use. Not a `dark:` variant,
// which the repo forbids outright, and not a raw palette class, which would compile and
// quietly bypass the theme.
//
// **The glyph is `Sparkle`, not `Sparkles`.** `ui/Sidebar.tsx:53` records that the design's AI
// mark is the single four-pointed star, and the library ships both.
//
// **The headline is a heading rather than a paragraph**, so the banner keeps a real accessible
// structure instead of two runs of undifferentiated text. Everything in it is the response's
// own prose: a set is a snapshot of what the generator wrote, stored rendered, so this
// component owns none of its wording.

type SummaryBannerProps = {
  /**
   * The period the set covers, as the response renders it: `October 2025`.
   *
   * INS-2 draws the overline as "✦ OCTOBER SUMMARY" with no year. The year is kept because the
   * set can outlive its own month - the read serves the latest *ready* set whatever today is,
   * so an account that has not written anything since the period rolled over is looking at last
   * month's analysis, and an overline reading "OCTOBER SUMMARY" in November is the card lying
   * about which month it describes. Slicing the year off a field the contract documents as
   * rendered prose would also be a second authority on how that string is built.
   */
  monthLabel: string;
  headline: string;
  body: string;
};

export function SummaryBanner({ monthLabel, headline, body }: SummaryBannerProps) {
  return (
    <section className="card bg-neutral text-neutral-content shadow-sm">
      <div className="card-body gap-4">
        <div className="text-neutral-content/60 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Sparkle className="size-3.5" aria-hidden="true" />
          {monthLabel} summary
        </div>

        <h2 className="font-display text-xl font-bold">{headline}</h2>
        <p className="text-neutral-content/70">{body}</p>
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
