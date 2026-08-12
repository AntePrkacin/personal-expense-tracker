'use client';

import { createContext, useContext, useMemo, useState } from 'react';

// Which slice the pointer is on, shared by the ring and the legend (PET-78 item 2).
//
// **This exists because the hover has two ends on opposite sides of a server-rendered boundary.**
// `CategoryRing` is a Client Component and the legend below it is ordinary server-rendered HTML,
// which `CategoryDonut.tsx` calls out as deliberate - so neither can hold the state the other
// needs. `transactions/FilterNavigation.tsx` is the same shape for the same reason: one owner
// wrapping both, rather than lifting the legend into the client bundle to reach it.
//
// **A provider renders no DOM node**, which is what keeps this free. `card-body`'s `gap-4` still
// applies to the heading, the ring's wrapper and the `<ul>` exactly as it did, because those three
// are still its DOM children.
//
// It replaced the ring's hover tooltip rather than joining it. That tooltip rendered at the cursor
// inside a 192px box whose middle is the centre readout, so on most slices it printed the category
// and its amount directly over the period total and left both illegible - and the legend was
// already a strict superset of everything it said, which is the same fact that lets the ring be
// `aria-hidden`. What the tooltip alone could do is say which row owns the arc under the pointer;
// that is this file's whole job, in both directions.

type CategoryHoverValue = {
  /** The hovered category's id, or `null` when the pointer is on neither the ring nor the legend. */
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

const CategoryHoverContext = createContext<CategoryHoverValue | null>(null);

export function CategoryHoverProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const value = useMemo(() => ({ activeId, setActiveId }), [activeId]);

  return <CategoryHoverContext.Provider value={value}>{children}</CategoryHoverContext.Provider>;
}

/**
 * Throws outside the provider rather than degrading to a no-op.
 *
 * The call `useFilterNavigation` and `useAddTransaction` both make, and for their reason: a
 * highlight that quietly stops working reads as a slow render rather than as a bug, so it would
 * survive every review and every gate.
 */
export function useCategoryHover(): CategoryHoverValue {
  const value = useContext(CategoryHoverContext);
  if (value === null) {
    throw new Error('useCategoryHover must be used inside a CategoryHoverProvider');
  }
  return value;
}

/**
 * One legend row, and the only client-owned thing about it is its own class and its two pointer
 * handlers.
 *
 * **The row's content arrives as server-rendered `children`** - the colour dot, the name, the
 * amount and the percentage are all still rendered by `CategoryDonut`, so the legend is still real
 * text in the first HTML response. Making the whole legend a Client Component was the obvious
 * shape and concedes something for nothing: this card's legend is the ring's accessible
 * equivalent, so rendering it as a bare ring until hydration is the one thing it must not do.
 *
 * **No `tabindex`, no role and no ARIA.** The highlight is a pointer-only convenience that states
 * nothing a row does not already carry in text, so a focusable row would promise a keyboard
 * contract nothing here implements - the refusal this app has now made six times.
 * `CategoryDonut.test.tsx` pins the tab-stop count at zero on this card.
 */
export function LegendRow({
  categoryId,
  children,
}: {
  categoryId: string;
  children: React.ReactNode;
}) {
  const { activeId, setActiveId } = useCategoryHover();
  const active = activeId === categoryId;

  return (
    <li
      // `-my-0.5` against `py-0.5` is not decoration: the padding is what gives the highlight a
      // band rather than a tight outline around the text, and thirteen rows of it would make the
      // card taller. The negative margin absorbs it, so the painted background is 4px taller than
      // the text box while the laid-out row is exactly the size it was before this ticket. Flex
      // does no margin collapsing, so the two cancel exactly.
      className={`rounded-field -mx-2 -my-0.5 flex items-center gap-2 px-2 py-0.5 text-sm transition-colors ${
        active ? 'bg-base-200' : ''
      }`}
      onMouseEnter={() => setActiveId(categoryId)}
      onMouseLeave={() => setActiveId(null)}
    >
      {children}
    </li>
  );
}
