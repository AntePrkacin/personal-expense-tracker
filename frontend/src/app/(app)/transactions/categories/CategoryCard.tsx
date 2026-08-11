import { createElement } from 'react';

import { categoryIcon, categoryTileClass } from '@/components/ui/categoryColour';
import { moneyFormatters, type MoneyFormatters } from '@/lib/money';
import type { Category } from '@/lib/categories';

import { barClassFor, barPercent, chipFor, isCapped } from './categoryCardStatus';
import { CategoryCardMenu } from './CategoryCardMenu';
import { SetLimitButton } from './SetLimitButton';

// One category card on frame 13 (nodes 37:471 and its seven siblings, CTG-3, CTG-4).
//
// **A Server Component, and it stayed one when the kebab became live.** That sentence used to
// read "nothing on it is interactive yet"; PET-39 made the kebab open a real menu and the card
// still costs the client bundle nothing, because the menu is a platform popover with no open
// state to hold. `CategoryCardMenu.tsx` carries the `'use client'`, and only because its Delete
// calls into a context - the same boundary `TransactionRow` and `TransactionRowMenu` settled on
// one screen over, one level smaller than that ticket predicted.
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
//
// **That last paragraph is now true of the card and false of its controls, which PET-38 changed.**
// The fallback card still draws - the reason above is unaffected - and it draws **no kebab and no
// banner**. Both actions behind that kebab are refused for it: `DELETE` answers 409 because it is
// where every other deletion sends its transactions, and `PATCH` answers 409 for a rename because
// its name is fixed. PET-39 had already hidden Delete, which left a kebab holding one disabled
// "Edit"; adding a live Edit that could change four fields and not the first one would have been a
// third state to explain on the one category nobody asked for. So nothing on this card is drawn
// that cannot be acted on, which is the rule the whole screen has been converging on since PET-36.
//
// **The cost is stated rather than hidden**: `Uncategorized` can now be neither renamed nor capped
// from the UI, though the API accepts a cap on it. `docs/TODO.md` records it, and both 409s stay
// classified in `lib/deleteCategory.ts` and `lib/updateCategory.ts`, because a control that is not
// drawn is not an enforcement.

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
 * The two "over" readings take two colours as of PET-74's sixth addendum, and that amends the
 * frame. Node 36:423 draws `text-error` on Housing's "$0 over" as well as on Dining out's real
 * overspend - a warning chip over an error-toned figure, the frame's own pairing - and the
 * product owner's call is that a zero is not an alarm: `full`'s figure goes muted, the same
 * `text-base-content/60` as the cap caption above it, keeping `font-medium` so it still reads
 * as a figure. Red is reserved for money actually gone over, which also stops the card from
 * disagreeing with its own chip - orange band, red figure was the frame's pairing, not this
 * card's.
 */
function footerFigure(
  category: Category,
  { formatWhole }: MoneyFormatters,
): { label: string; className: string } {
  if (category.status === 'over') {
    return {
      label: `${formatWhole(category.over ?? 0)} over`,
      className: 'text-error font-medium',
    };
  }

  if (category.status === 'full') {
    return { label: `${formatWhole(0)} over`, className: 'text-base-content/60 font-medium' };
  }

  return { label: `${formatWhole(category.remaining ?? 0)} left`, className: 'font-medium' };
}

/** The tile and the name, identical in both shapes. */
function CategoryCardHeader({ category, readOnly }: { category: Category; readOnly: boolean }) {
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

      {/* **PET-39 made this live, and the whole of the change is that `aria-disabled` is gone.**
          It shipped as a real `<button aria-disabled>` because the menu was that ticket's AC1;
          `CategoryCardMenu` is that menu, and it keeps this element's class string and its
          `aria-label` byte-identical so the two suites that name the control did not have to
          change their query. The card **stays a Server Component**: the menu is a popover, so
          there is no open state to hold, and its `'use client'` is there only because both items
          call into a context - exactly the boundary `TransactionRow` and `TransactionRowMenu`
          settled on next door.

          **PET-38 made the whole menu conditional, which is where AC6 now lives.** Both of its
          items are refused for the fallback row, so the kebab is not drawn there at all rather
          than opening onto nothing operable - see this file's header. Deciding it here rather than
          inside the menu is what let `CategoryCardMenu` drop its own guard: a component that is
          only mounted for a category with both actions has nothing left to branch on.

          A historical period view draws no kebab either, and by the same rule: the Edit modal
          drafts from the live configuration and expresses a backdate through its cap-anchor
          question, and a Delete removes the category from every period at once - neither is an
          action *on* the period being viewed. See `CategoriesScreen`'s `isCurrentPeriod` note. */}
      {category.isFallback || readOnly ? null : <CategoryCardMenu category={category} />}
    </div>
  );
}

export function CategoryCard({
  category,
  currency,
  readOnly = false,
}: {
  category: Category;
  currency: string;
  /**
   * True on a historical period view, which draws the card with no kebab and no "Set limit" -
   * every write those controls reach lands on the current period, not the one on screen. The
   * figures themselves stay: they are that period's own record. See `CategoriesScreen`.
   */
  readOnly?: boolean;
}) {
  const money = moneyFormatters(currency);
  const { formatWhole } = money;

  // `card bg-base-100 shadow-sm` is `AccessCard`'s box, which `frontend/src/app/CLAUDE.md`
  // names as what a second card should match, and which `BudgetCard` already matched.
  //
  // **No fixed height, unlike the frame's 540x165.** Both are a `max-w` question rather than a
  // `w`/`h` one: the frames are drawn at a fixed 1440 and draw no narrow viewport, so a
  // designed fixed size becomes a ceiling here. A hard height would also clip a wrapped chip on
  // a card whose category name and status labels are longer than the mock's.
  if (!isCapped(category)) {
    return (
      // One plain card box, the same `card bg-base-100 shadow-sm` as the capped shape below.
      // **The `CardBanner` strip this card used to end in is gone (PET-74's third addendum,
      // the product owner's decision):** Claude Design's own `CategoriesTab.jsx` draws no
      // footer banner on an uncapped card - "the call to action rides as a chip on the spend
      // row", its comment says - and reserves the strip for the summary card's "Allocate". So
      // "No limit set for this category" is retired copy, and the action is the accent pill
      // beside the spend figure.
      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <CategoryCardHeader category={category} readOnly={readOnly} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* daisyUI's `.card-body p { flex-grow: 1 }` makes this paragraph absorb the free
                space, which here is what pushes the pill flush right - the same rule the capped
                footer below has to fight is load-bearing on this row. */}
            <p className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-base font-semibold">{formatWhole(category.spent)}</span>
              <span className="text-base-content/60 text-sm">
                in {transactionCountLabel(category.transactionCount)}
              </span>
            </p>

            {/* **The fallback card gets no pill, because it has nowhere for one to lead.** The
                control that sets a cap is the Edit modal, which that card has no trigger for -
                so a pill there would be either a dead control or a second explanation of a rule
                nobody asked about. The same `isFallback` decision that hides its kebab, made in
                the same file. A historical period gets no pill either, PET-72's readOnly rule
                carried onto PET-74's control: "Set limit" edits the live configuration, so on a
                closed period it would act on something other than what is on screen - not drawn
                rather than disabled, the fallback card's own doctrine. */}
            {category.isFallback || readOnly ? null : <SetLimitButton category={category} />}
          </div>
        </div>
      </section>
    );
  }

  const chip = chipFor(category.status);
  const figure = footerFigure(category, money);

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <CategoryCardHeader category={category} readOnly={readOnly} />

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

        {/* **`text-right` on the count, and `justify-between` alone was not enough - which only a
            browser could say.** daisyUI ships `.card-body p { flex-grow: 1 }`, so both of these
            paragraphs stretch, there is no free space left for `justify-between` to distribute, and
            the count's text rendered at the left edge of its own over-wide box - visibly adrift in
            the middle of the row while the design has it flush right. The row above it looks correct
            only by accident: its right-hand child is a `<span>`, which that rule does not match.
            Fixed by right-aligning the text rather than by fighting the grow - `grow-0` is (0,1,0)
            against the plugin's (0,1,1) and loses, measured rather than assumed. `justify-between`
            stays because it is what positions the boxes the moment either child stops growing. */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className={figure.className}>{figure.label}</p>
          <p className="text-base-content/60 text-right">
            {transactionCountLabel(category.transactionCount)}
          </p>
        </div>
      </div>
    </section>
  );
}
