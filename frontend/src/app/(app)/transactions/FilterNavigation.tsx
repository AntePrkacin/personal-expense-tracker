'use client';

import { createContext, useContext, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// The one place a filter change is started, and the only thing on this screen that knows one
// is in flight.
//
// **It exists because the pending state had nowhere to live.** The search field and the three
// selects are separate client components in different parts of the tree - one in the header,
// one under the tabs - and the thing that should dim is the table, which is a Server Component
// between them. Each control owning its own `useTransition` gives three `isPending` flags that
// nothing can read, which is exactly the shape this replaced: the table took a `pending` prop
// that no caller could ever pass, so the affordance was documented, tested and dead.
//
// So the transition is hoisted to a provider wrapping the whole screen, the controls navigate
// through it, and `PendingRegion` reads it. The table stays a Server Component and is handed
// through `children`, which is the ordinary way a client component wraps server-rendered
// content.
//
// **`useFilterNavigation` throws outside the provider rather than returning a no-op**, the
// call `AddTransactionProvider` already makes: a control that silently stops navigating is a
// bug that looks like a slow network.

type FilterNavigation = {
  /** True while a filter change is in flight, so something can say so. */
  isPending: boolean;
  /**
   * Replace the current URL with one carrying different filters.
   *
   * Always `replace`, never `push`. These are views of one page rather than places, so Back
   * should leave the screen rather than walk every category the user tried - and the search
   * field, which navigates on a debounce, would otherwise push an entry per typing pause.
   * The cost is stated rather than hidden: Back no longer undoes a filter change either.
   */
  navigate: (href: string, options?: { scroll?: boolean }) => void;
};

const FilterNavigationContext = createContext<FilterNavigation | null>(null);

export function FilterNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = useMemo<FilterNavigation>(
    () => ({
      isPending,
      navigate: (href, options) => {
        startTransition(() => {
          // The second argument is omitted rather than passed as `undefined` when a caller
          // gave none, so "this navigation opted out of scrolling" stays distinguishable from
          // "this one said nothing" at the call site and in a test's recorded arguments.
          if (options === undefined) {
            router.replace(href);
            return;
          }

          router.replace(href, options);
        });
      },
    }),
    [isPending, router],
  );

  return (
    <FilterNavigationContext.Provider value={value}>{children}</FilterNavigationContext.Provider>
  );
}

export function useFilterNavigation(): FilterNavigation {
  const value = useContext(FilterNavigationContext);

  if (value === null) {
    throw new Error('useFilterNavigation must be used inside a FilterNavigationProvider');
  }

  return value;
}

/**
 * Wraps the table so it can say a filter change is in flight.
 *
 * **The affordance has no Figma counterpart** and joins the others `frontend/CLAUDE.md` lists
 * (A29). Without it the gap between the last keystroke and the new rows is a screen where
 * nothing at all changes, which reads as a search that does not work.
 *
 * `aria-busy` is set only while pending rather than written `false` at rest, so an idle table
 * carries no attribute at all. The dimming is on this wrapper rather than on `<tbody>` because
 * the table is server-rendered and arrives here as `children` - and dimming the card including
 * its header is arguably the clearer signal anyway, since the columns are as stale as the rows.
 */
export function PendingRegion({ children }: { children: React.ReactNode }) {
  const { isPending } = useFilterNavigation();

  return (
    <div
      aria-busy={isPending ? true : undefined}
      className={`transition-opacity ${isPending ? 'opacity-60' : ''}`}
    >
      {children}
    </div>
  );
}
