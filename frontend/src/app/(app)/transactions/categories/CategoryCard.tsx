import { EllipsisVertical } from 'lucide-react';
import { createElement } from 'react';

import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import { formatWhole } from '@/lib/format';
import type { Category } from '@/lib/categories';

import { BannerCardBody, CardBanner } from './CardBanner';
import { barClassFor, barPercent, chipFor, isCapped } from './categoryCardStatus';

// One category card on frame 13 (nodes 37:471 and its seven siblings, CTG-3, CTG-4).
//
// A Server Component: nothing on it is interactive yet, so it costs the client bundle nothing.
// The kebab is a `<button>` and still needs no `'use client'`, because it opens nothing - see
// below.
//
// **Two shapes, and the second one has no Figma frame behind it.** Frame 13 draws eight capped
// categories and stops there, but a cap is optional throughout the contract and the preselected
// `Uncategorized` fallback ships without one, so `status: "uncapped"` is the *common* case
// rather than the edge. `CategoryResponseDto` documents it in as many words. A card that
// assumed a cap would print "of null" on the one category every account has. So the uncapped
// shape follows the team's Claude Design system instead: the same footprint, the same header,
// and spend plus a count where the bar and chip would be. It owes A29 a designer's sign-off
// along with the rest of this app's undesigned states, and `docs/TODO.md` records it.
//
// **`Uncategorized` gets no special case here.** It is uncapped by default, which the shape
// above already covers, and it is a category the user really has - so hiding it would leave the
// grid unable to account for spend the donut on the dashboard does show.

/**
 * The transaction count line, pluralized.
 *
 * Frame 13's Housing card reads "1 transactions", which CTG-6 records as a typo rather than a
 * design decision, so this is one of the few places the implementation deliberately does not
 * match the frame. It is the app's second pluralized string after `BudgetCard`'s "days left",
 * and still a local ternary rather than a helper for the same reason: two call sites with two
 * different nouns is not a pluralization library.
 */
function transactionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

/**
 * The left-hand footer figure, and the one place AC3's boundary is decided.
 *
 * Three cases rather than two, because "$0 over" at exactly the cap is drawn by the frame
 * (Housing) and pinned by CTG-6 and A28. It cannot be derived from `remaining`, which is a
 * perfectly ordinary `0` at that point and would print "$0 left" - a true sentence that the
 * design deliberately does not use, because sitting exactly on a cap is worth saying more
 * loudly than having a penny left.
 *
 * `over` is null unless the status is `over`, so the `full` case supplies the zero as a literal
 * rather than formatting a field that is not there.
 *
 * Both "over" readings take `text-error`, which is what the frame draws on Housing as well as
 * on Dining out. The chip disagrees on Housing - `full` is a warning chip over an error-toned
 * figure - and that is the frame's own pairing rather than an accident here: the chip reports
 * the band, the figure reports that the cap has been reached.
 */
function footerFigure(category: Category): { label: string; className: string } {
  if (category.status === 'over') {
    return {
      label: `${formatWhole(category.over ?? 0)} over`,
      className: 'text-error font-medium',
    };
  }

  if (category.status === 'full') {
    return { label: `${formatWhole(0)} over`, className: 'text-error font-medium' };
  }

  return { label: `${formatWhole(category.remaining ?? 0)} left`, className: 'font-medium' };
}

/**
 * The kebab, present and announcing that it does nothing.
 *
 * **This is PET-36's half of a control PET-39 owns.** That ticket's AC1 describes the menu this
 * opens - "Edit" and a danger-coloured "Delete", light-dismissed - and building it here would
 * take the substance out of it. The alternatives were both worse: an enabled button that does
 * nothing is the exact failure every inert control on the transactions screen was built to
 * avoid, and omitting the kebab makes the card a different design from the frame.
 *
 * So it follows PET-33's precedent for its own disabled "Edit" item - a real control that says
 * `aria-disabled` - rather than the month pill's, which is an inert `div` announcing nothing.
 * The difference matters: a reader who reaches this hears a button that is not available yet,
 * instead of silently finding nothing where the design draws a control.
 *
 * `disabled` is deliberately **not** used in place of `aria-disabled`. A `disabled` button is
 * removed from the tab order entirely, so the one affordance on the card would be unreachable
 * by keyboard and unannounceable; `aria-disabled` keeps it focusable and states its condition,
 * which is what the ARIA practices recommend for a control that will become live.
 */
function CategoryCardMenuButton({ categoryName }: { categoryName: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      className="btn btn-ghost btn-square btn-sm shrink-0"
      // A named control rather than a bare glyph: the icon is aria-hidden, so without this the
      // button announces as "button" on eight identical cards.
      aria-label={`Actions for ${categoryName}`}
    >
      <EllipsisVertical className="size-4" aria-hidden="true" />
    </button>
  );
}

/** The tile and the name, identical in both shapes. */
function CategoryCardHeader({ category }: { category: Category }) {
  // The category's own glyph as of PET-64, where three sites drew a shared `ShoppingBag`
  // placeholder. `null` when the stored icon resolves to nothing, which leaves the tile empty
  // rather than drawing a mark that says something else.
  const Icon = categoryIcon(category.icon);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`rounded-field flex size-9 shrink-0 items-center justify-center ${categoryTileClass(category.color)}`}
        >
          {/* **`createElement` rather than `<Icon />`, and it is the lint rule rather than a
              preference.** `react-hooks/static-components` reads a capitalised local used in
              JSX as a component *created* during render - which this is not: `categoryIcon` is
              a lookup into `CATEGORY_ICON`, a static map of components the module already
              holds. The two existing call sites (`CategoryContextCard`,
              `RecentTransactionsCard`) escape the rule only because both render their glyph
              inside a `.map` callback, where the heuristic does not reach; this card draws one
              icon directly in its body and so meets it head-on. This repo carries no
              eslint-disable comments, so the same element is built without JSX instead. */}
          {Icon === null
            ? null
            : createElement(Icon, { className: 'size-4.5', 'aria-hidden': 'true' })}
        </span>

        {/* h2 because PageHeader owns the page's h1. truncate rather than wrap: the card is a
            fixed height in the frame and a long category name must not push the bar out of it. */}
        <h2 className="truncate text-sm font-semibold">{category.name}</h2>
      </div>

      <CategoryCardMenuButton categoryName={category.name} />
    </div>
  );
}

export function CategoryCard({ category }: { category: Category }) {
  // `card bg-base-100 shadow-sm` is `AccessCard`'s box, which `frontend/src/app/CLAUDE.md`
  // names as what a second card should match, and which `BudgetCard` already matched.
  //
  // **No fixed height, unlike the frame's 540x165.** Both are a `max-w` question rather than a
  // `w`/`h` one: the frames are drawn at a fixed 1440 and draw no narrow viewport, so a
  // designed fixed size becomes a ceiling here. A hard height would also clip a wrapped chip on
  // a card whose category name and status labels are longer than the mock's.
  if (!isCapped(category)) {
    return (
      // The same `CardBanner` idiom the summary card above uses, and the same one the source
      // design system uses for both: the body keeps its four rounded corners and overlaps a
      // strip pulled up by one radius. It sits exactly where the bar and the footer sit on a
      // capped card, so a grid mixing the two shapes stays on one rhythm.
      <section className="flex flex-col">
        <BannerCardBody>
          <div className="card-body gap-4">
            <CategoryCardHeader category={category} />

            <p className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-base font-semibold">{formatWhole(category.spent)}</span>
              <span className="text-base-content/60 text-sm">
                in {transactionCountLabel(category.transactionCount)}
              </span>
            </p>
          </div>
        </BannerCardBody>

        {/* The action is the one the summary card's banner offers, and inert for the same
            reason - PET-38's Edit category modal is what sets a cap. It passes the category as
            *context* rather than a whole replacement label, so the accessible name comes out as
            "Set limit for Groceries": distinct across eight cards, and still containing the
            visible words a speech-input user can actually say. */}
        <CardBanner action="Set limit" actionContext={category.name}>
          No limit set for this category
        </CardBanner>
      </section>
    );
  }

  const chip = chipFor(category.status);
  const figure = footerFigure(category);

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <CategoryCardHeader category={category} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-base font-semibold">{formatWhole(category.spent)}</span>
            <span className="text-base-content/60 text-sm">
              of {formatWhole(category.monthlyCap)}
            </span>
          </p>

          <span className={chip.badge}>
            {/* aria-hidden: the badge's own text carries the state, so the dot would announce a
                second time saying nothing new. The same call `BudgetCard` makes. */}
            <span className={chip.dot} aria-hidden="true" />
            {chip.label}
          </span>
        </div>

        {/* Clamped to the max: an over-budget category has `spent > monthlyCap`, and a
            <progress> handed a value above its max renders full but reports the raw number to
            assistive technology. Driven by `barPercent` rather than by the raw pair so that the
            floor-not-round rule holds here too - see `categoryCardStatus.ts` for why a rounded
            99.6% would contradict the chip beside it.

            Not aria-hidden: this reports the reader's own budget, so it needs a real accessible
            name rather than none at all. */}
        <progress
          className={barClassFor(category.status)}
          value={barPercent(category.percentUsed)}
          max={100}
          aria-label={`${category.name} budget used`}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className={figure.className}>{figure.label}</p>
          <p className="text-base-content/60">{transactionCountLabel(category.transactionCount)}</p>
        </div>
      </div>
    </section>
  );
}
