'use client';

import { useState } from 'react';

import type { Allocation, Category } from '@/lib/categories';
import type { Period } from '@/lib/periods';
import { updateCategoryCaps, type UpdateCategoryCapsResult } from '@/lib/updateCategoryCaps';

import { AllocateBudgetModal } from './AllocateBudgetModal';
import { CardBanner } from './CardBanner';
import type { toAllocateBody } from './allocateForm';

// The summary card's "Allocate" banner, and the second instance of `SetLimitBanner`'s shape - which
// turns that file's smallest-wrapper argument into a pattern rather than a one-off.
//
// **A component whose job is holding a `'use client'`.** `SpendingSummaryCard` is a Server Component
// and cannot pass a function, so `CardBanner`'s `onAction` has to arrive from a client module; the
// directive lives here so the card's heading, chip, figures and progress bar all stay
// server-rendered. `CardBanner` itself takes no directive and is used from both sides.
//
// **The banner cannot be hoisted into `CategoriesScreen`, and this is why it takes the data rather
// than the screen rendering the modal.** The overlap effect needs the banner to be a *sibling* of
// `BannerCardBody` inside `SpendingSummaryCard`'s own `<section>` - the card paints over a strip
// pulled up by one card radius - so moving the banner up means moving the card body with it. A
// `banner` slot on the card was the other option and is refused by `CategoriesScreen`'s own
// doctrine: a slot with one possible occupant expresses no choice.
//
// **It owns its open state rather than reading a provider**, which is `AddCategoryButton`'s
// documented criterion applied unchanged: one trigger on one route. `EditCategoryProvider` exists
// because the edit modal has two kinds of trigger - a kebab per card and a "Set limit" per uncapped
// card - and a context with a single consumer expresses no choice either. Nothing about the modal
// being large changes that.

export function AllocateBanner({
  categories,
  allocation,
  periods,
  // Defaulted here rather than at the call site, which is `DeleteCategoryProvider`'s shape: the
  // screen and the card both thread the prop through without knowing what the real action is, and
  // only Storybook ever overrides it.
  save = updateCategoryCaps,
  children,
}: {
  categories: Category[];
  allocation: Allocation;
  /** For the modal's cap-anchor question; threaded like everything else here. */
  periods: readonly Period[];
  save?: (body: ReturnType<typeof toAllocateBody>) => Promise<UpdateCategoryCapsResult>;
  /** The banner's sentence, composed by the card that knows the unassigned figure. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* No `actionContext`: "Allocate" is unique on this screen, unlike the eight "Set limit"
          buttons that each need their category name to be distinguishable. */}
      <CardBanner action="Allocate" onAction={() => setOpen(true)}>
        {children}
      </CardBanner>

      {/* **Rendered only while open**, which is load-bearing rather than an optimisation: a closed
          `<dialog>` is `display: none` so `queryByRole` cannot see in, but `queryAllByText` and
          `queryAllByLabelText` can - so an always-mounted modal would put a labelled field per
          category into this screen's tree forever and make every label query on it ambiguous.
          `(app)/pages.test.tsx` depends on that. */}
      {open ? (
        <AllocateBudgetModal
          categories={categories}
          allocation={allocation}
          periods={periods}
          save={save}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
