import type { InsightCard as InsightCardData } from '@/lib/insights';

import { toneStyle } from './insightTone';

// One insight card (INS-3, Figma node 38:495): a toned glyph, a bold title and a body.
//
// The tone's whole appearance comes from `insightTone.ts`, including the daisyUI inversion and
// the fallback for a tone stored before PET-42-43-44 narrowed the enum. Nothing here decides a
// colour.

export function InsightCard({ tone, title, body }: InsightCardData) {
  const { circle, icon: Icon, label } = toneStyle(tone);

  return (
    <section className="card bg-base-100 border-base-300 border shadow-sm">
      <div className="card-body gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${circle}`}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </div>

          <h3 className="font-display font-bold">
            {/* The tone is carried by the glyph's hue and by nothing else on screen, which is
                colour alone - so it is named here in text. The order puts it first because it
                qualifies the title that follows: "Warning: Dining out is over budget". */}
            <span className="sr-only">{label}: </span>
            {title}
          </h3>
        </div>

        <p className="text-base-content/70 text-sm">{body}</p>
      </div>
    </section>
  );
}

/**
 * The same card as a skeleton: a circle and two bars (INS-5).
 *
 * Rendered `aria-hidden`, unlike the banner skeleton beside it, because the banner's own
 * `sr-only` line already says that new insights are being generated. Repeating "loading" once
 * per placeholder card would announce the same fact two or three times over.
 */
export function InsightCardSkeleton() {
  return (
    <div aria-hidden="true" className="card bg-base-100 border-base-300 border shadow-sm">
      <div className="card-body gap-3">
        <div className="flex items-center gap-3">
          <div className="skeleton size-9 shrink-0 rounded-full" />
          <div className="skeleton h-5 w-1/2" />
        </div>
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
      </div>
    </div>
  );
}
