'use client';

import type { Category } from '@/lib/categories';

import { CardBanner } from './CardBanner';
import { useEditCategory } from './EditCategoryProvider';

// The banner under every uncapped category card, and the second of this feature's two entry points.
//
// **A component whose entire job is holding a `'use client'`**, which is the "push the boundary into
// the smallest wrapper" rule `SidebarNav`, `TrendChart` and `AddCategoryButton` all follow. A Server
// Component cannot pass a function, so `CardBanner`'s `onAction` has to arrive from a client module;
// putting the directive here rather than on `CategoryCard` is what keeps the card - its tile, its
// glyph, its figures - server-rendered. `CardBanner` itself stays directive-free, so it renders on
// whichever side its caller is on.
//
// **The sentence this replaces said `CardBanner` was "used from both sides: server-rendered and inert
// under `SpendingSummaryCard`, client-rendered and live here", and PET-70 falsified both halves.**
// That card's "Allocate" is live now, behind `AllocateBanner` - a second client wrapper of exactly
// this shape - so both of the component's callers carry a directive and there is no inert branch left
// to render: its `onAction` became an exclusive union and the `aria-disabled` treatment was deleted.
// Kept as a correction rather than edited away, because a reader auditing this screen for inert
// controls would otherwise still be told where to find one.
//
// **It reads the context rather than taking a callback**, which is the opposite of
// `EditCategoryModal`'s `onDelete` and is right for the opposite reason. That prop keeps a modal
// ignorant of a provider it should not know about; this component *is* the trigger, so a callback
// would only move the same `useEditCategory()` call up into `CategoryCard` and drag the client
// boundary with it.
//
// **It asks for focus on the budget field**, because the sentence it draws is "No limit set for this
// category" - which is a request to type a number rather than the unspecific invitation the kebab's
// "Edit" is. `EditCategoryModal`'s `focus` prop carries the rest of that argument.
//
// **It is not rendered for the fallback category at all.** `Uncategorized` cannot be renamed and has
// no kebab, so a live "Set limit" would be the one way into a modal that card is otherwise excluded
// from; `CategoryCard` decides that, one level up, where `isFallback` already decides the kebab.

export function SetLimitBanner({ category }: { category: Category }) {
  const { open } = useEditCategory();

  return (
    // The action passes the category as **context** rather than as a whole replacement label, so the
    // accessible name comes out as "Set limit for Groceries": distinct across eight cards, and still
    // containing the visible words a speech-input user can actually say (WCAG 2.5.3). `CardBanner`
    // composes that itself, which is what makes the violation unreachable rather than merely avoided
    // here.
    <CardBanner
      action="Set limit"
      actionContext={category.name}
      onAction={() => open(category, { focus: 'monthlyCap' })}
    >
      No limit set for this category
    </CardBanner>
  );
}
