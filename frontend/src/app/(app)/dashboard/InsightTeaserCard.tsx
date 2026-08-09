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
// headline, and AC1 draws the body too. `backend/CLAUDE.md`'s Dashboard section carries the
// note; `npm run api:sync` is what propagated it here.
//
// **A null `insight` is two different accounts, and only one of them is AC3's.** The review of
// this branch found that the unlock copy is the only state a real account can reach: nothing in
// either app calls `POST /api/insights/generate`, `/insights` is still PET-44's empty `<main>`,
// and no backend path generates on a write - so an account with two hundred logged expenses was
// being told "Insights unlock after your first expense". `transactionCount` tells the two apart.
// At zero the card draws frame 44:706's designed copy with its "Add transaction"; above it the
// copy says the truthful thing instead, that nothing has been analysed yet, and offers the same
// link to Insights the ready state does.
//
// **PET-42-43-44 removed the cause, and the split above is now a fallback rather than the
// common path.** Every transaction write regenerates the set backend-side, so an account with
// expenses has a set or is generating one - which means the pending copy is reachable only in
// the window between the first save and the first run settling, or for an account that logged
// its transactions before that trigger shipped. It stays because both windows are real; read
// the paragraph above as history rather than as a description of the running app.
//
// **Neither of those is a `generating` state, and the card still needs no third shape.** The
// contract folds "the first run is still in flight" into the same null, and a teaser has nothing
// useful to say while one is - so the pending copy covers it as honestly as it covers a run that
// was never started. The card that needs a skeleton is PET-42's, reading `GET /api/insights`
// directly rather than this one field, and it exists now.
//
// **The prop is `isEmpty` as of PET-26, not `transactionCount`.** This card had already computed
// the screen's shared empty condition, under its own name, before that ticket's branch started -
// its review is what found the third state above - so aligning it onto `page.tsx`'s
// `isEmpty = transactionCount === 0` is a rename rather than a behaviour change: a genuinely new
// account still has `isEmpty: true` and still draws frame 44:706's unlock copy. Every other card
// on the screen keeps this same boolean; `CategoryDonut` is the one deliberate exception, guarded
// on its own input instead, and `frontend/src/app/CLAUDE.md` records why.
//
// **`isEmpty` is still the period's own flag, not the account's**, because it is `transactionCount
// === 0` underneath: an account whose expenses all predate this period reads as empty here. That
// is the window every other card on this screen is scoped to, and of the two wrong answers for it
// the designed copy is the better one: it offers a way forward rather than claiming an analysis is
// pending over spend this period cannot see.
//
// **The pending copy is ours, so it joins what A29 owes a designer**, alongside the states no
// frame draws. It points at `/insights` rather than offering to trigger a run, because nothing
// in either app can trigger one; `docs/TODO.md` records that gap.
//
// **The card is `bg-neutral` with `text-neutral-content`**, daisyUI's always-dark slot -
// `ui/Sidebar`'s panel uses the same mechanism, and `frontend/src/components/CLAUDE.md` records
// why. Not a `dark:` variant, which the repo forbids outright, and not a raw palette class, which
// would compile and quietly bypass the theme.
//
// **The headline is a heading, not a paragraph**, so the card keeps a real accessible structure
// in both states rather than two lines of undifferentiated text. AC1's "not hardcoded copy" means
// this component renders whatever the response carries and owns nothing about its wording.
export type InsightTeaserCardProps = Pick<DashboardSummary, 'insight'> & {
  /** The screen's shared PET-26 condition, replacing this card's own `transactionCount`. */
  isEmpty: boolean;
};

/** Frame 44:706's own copy: no expense has ever been logged, so there is one thing to do. */
const UNLOCK_COPY = {
  headline: 'Insights unlock after your first expense.',
  body: "Log a few expenses and I'll surface patterns and ways to save.",
};

/** Ours: expenses exist and no set has been generated over them. */
const PENDING_COPY = {
  headline: 'No insights yet.',
  body: 'Your expenses are logged. Insights land here once an analysis has run.',
};

export function InsightTeaserCard({ insight, isEmpty }: InsightTeaserCardProps) {
  // Three accounts, two shapes. The headline and the body come from whichever of the three
  // copy sources applies, and the one control follows the same condition rather than a second
  // one - so a state cannot end up drawing the wrong button for its own words.
  const unlock = insight === null && isEmpty;
  const copy = insight ?? (unlock ? UNLOCK_COPY : PENDING_COPY);

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

        <h2 className="font-display text-lg font-bold">{copy.headline}</h2>
        <p className="text-neutral-content/70 text-sm">{copy.body}</p>

        {/* `card-actions` rather than the button directly, because `card-body` declares no
            `align-items` at all - so daisyUI's default `stretch` applies and a `btn` that is
            its direct child spans the whole card. `card-actions` sets `align-items: flex-start`,
            which is the same thing `RecentTransactionsCard`'s own flex row buys and
            `components/EmptyState` gets from `items-center`. Verified in
            `frontend/node_modules/daisyui/components/card.css`, which is where the cascade
            traps in `frontend/CLAUDE.md` say to look. */}
        <div className="card-actions">
          {unlock ? (
            <AddTransactionButton label="Add transaction →" />
          ) : (
            <Button label="Open insights →" href={SIDEBAR_HREFS.insights} />
          )}
        </div>
      </div>
    </section>
  );
}
