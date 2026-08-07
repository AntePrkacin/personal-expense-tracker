import { Sparkle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';
import type { DashboardSummary } from '@/lib/dashboard';

import { AddTransactionButton } from '../AddTransactionButton';

// AI insight teaser card (Figma node 21:4, DSH-9; node 44:706 for its empty state).
//
// A Server Component: both states are plain markup, and the one interactive control per state
// - "Open insights" a `ui/Button` with an `href`, "Add transaction" the shell's client wrapper -
// carries its own boundary, so nothing here needs the client bundle.
//
// **`insight` widened from `string | null` to `InsightSummaryDto | null` on this branch**, the
// one backend change in the stack: `DashboardResponseDto.insight` used to publish only the
// headline, and AC1 draws the body too. `backend/CLAUDE.md`'s Dashboard section and
// `docs/agents/api-contract.md` both carry the note; `npm run api:sync` is what propagated it
// here.
//
// **AC3's condition is `insight === null`, and it needs no third state.** The contract documents
// null as covering both "nothing generated yet" and "the first run is still in flight" - a
// teaser has nothing useful to say while a first run is in flight, and the unlock copy is honest
// in both cases. The card that needs `generating` is PET-44's, and it reads `GET /api/insights`
// directly rather than this one field.
//
// **The card is `bg-neutral` with `text-neutral-content`**, daisyUI's always-dark slot -
// `ui/Sidebar`'s panel uses the same mechanism, and `frontend/src/components/CLAUDE.md` records
// why. Not a `dark:` variant, which the repo forbids outright, and not a raw palette class, which
// would compile and quietly bypass the theme.
//
// **The headline is a heading, not a paragraph**, so the card keeps a real accessible structure
// in both states rather than two lines of undifferentiated text. AC1's "not hardcoded copy" means
// this component renders whatever the response carries and owns nothing about its wording.
export type InsightTeaserCardProps = Pick<DashboardSummary, 'insight'>;

export function InsightTeaserCard({ insight }: InsightTeaserCardProps) {
  return (
    <section className="card bg-neutral text-neutral-content shadow-sm">
      <div className="card-body gap-4">
        {/* Decorative eyebrow, matching PageHeader's overline: the heading below carries the
            card's accessible name, so an icon and a label both restating "insight" here would
            be noise on top of it. */}
        <div className="text-neutral-content/60 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Sparkle className="size-3.5" aria-hidden="true" />
          AI Insights
        </div>

        {insight ? (
          <>
            <h2 className="font-display text-lg font-bold">{insight.headline}</h2>
            <p className="text-neutral-content/70 text-sm">{insight.body}</p>
            <Button label="Open insights →" href={SIDEBAR_HREFS.insights} />
          </>
        ) : (
          <>
            <h2 className="font-display text-lg font-bold">
              Insights unlock after your first expense.
            </h2>
            <p className="text-neutral-content/70 text-sm">
              {"Log a few expenses and I'll surface patterns and ways to save."}
            </p>
            <AddTransactionButton label="Add transaction →" />
          </>
        )}
      </div>
    </section>
  );
}
