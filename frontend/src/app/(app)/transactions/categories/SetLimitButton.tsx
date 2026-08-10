'use client';

import { ArrowRight } from 'lucide-react';

import type { Category } from '@/lib/categories';

import { useEditCategory } from './EditCategoryProvider';

// The uncapped card's "Set limit" pill, on the spend row where Claude Design draws it.
//
// **This replaced `SetLimitBanner.tsx`, and the product owner decided it (PET-74's third
// addendum).** The strip under every uncapped card - "No limit set for this category" over a
// footer action - was this app's reading of the design; the design system's own
// `CategoriesTab.jsx` draws no footer banner on an uncapped card at all, saying in its own
// comment that "the call to action rides as a chip on the spend row", and reserves the
// `CardBanner` strip for the summary card's "Allocate". So the sentence is gone, the card is one
// plain box like its capped sibling, and the action is this accent pill beside the spend figure.
//
// **Still a component whose entire job is holding a `'use client'`** - the smallest-wrapper rule
// `SidebarNav`, `TrendChart` and `AllocateBanner` follow. A Server Component cannot pass a
// function, and the handler is a `useEditCategory()` call, so the directive lives here and
// `CategoryCard` stays server-rendered.
//
// **It asks for focus on the budget field**, unchanged from the strip it replaces: "Set limit"
// is a request to type a number, not the kebab's unspecific "Edit". And the accessible name is
// composed so the visible label stays a prefix - "Set limit for Groceries" - which is the WCAG
// 2.5.3 lesson `CardBanner` records: a name that does not contain the words on screen is one a
// speech-input user cannot activate. Here the composition is a plain `aria-label`, because this
// control has exactly one caller and the label has exactly one shape.
//
// **It is not rendered for the fallback category.** `Uncategorized` cannot be renamed and has no
// kebab, so a live "Set limit" would be the one way into a modal that card is otherwise excluded
// from; `CategoryCard` decides that, one level up, where `isFallback` already decides the kebab.

export function SetLimitButton({ category }: { category: Category }) {
  const { open } = useEditCategory();

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm shrink-0"
      aria-label={`Set limit for ${category.name}`}
      onClick={() => open(category, { focus: 'monthlyCap' })}
    >
      Set limit
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </button>
  );
}
