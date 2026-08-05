'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { CategoryLabel } from '@/lib/categories';
import type { TransactionFilters } from '@/lib/transactions';

import {
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  filterHref,
  PERIOD_OPTIONS,
  SORT_OPTIONS,
  type FilterOption,
} from './filters';

// The filter bar (TRN-3, Figma node 26:161), and PET-30's `filterBar` slot filled.
//
// **One client file rather than a Server Component holding three client pills.** Every
// element in this bar is interactive, the `justify-between` that pushes the sort pill right
// belongs to the bar itself, and nothing outside this screen draws a pill of this shape - so
// there is no smaller boundary to push into, which is the test `SidebarNav` and
// `AddTransactionProvider` apply.
//
// **Not `ui/Select`.** That component is built on `ui/Field`, which always renders a label
// above the control, and these three pills are label-less by design. Its `SELECT_CONTROL`
// also bakes in the form field's own padding and a 34px right inset for a 10px chevron,
// where this pill is 9x4.5 with 12px of it. What *is* borrowed is the rule underneath both,
// and it is the one that fails silently if missed: **padding sits on the `<select>`, never on
// the bordered box** - a padded box turns its own 9-14px band into a dead zone where a click
// opens no list.
//
// **A filter change is a `replace`, not a `push`.** These are three views of one page rather
// than three places, so walking Back through every category a user tried is not history, it
// is noise - and the search field beside them, which writes on a debounce, would push an
// entry per typing pause. The cost is real and stated rather than hidden: Back no longer
// undoes a filter change either.
//
// The pending state is `TransactionsTable`'s to render; this bar starts the transition and
// hands `isPending` up through nothing - the page re-renders on the server, so the table
// reads it from its own render rather than from a shared store.

/**
 * The pill's box, and the control inside it.
 *
 * Two strings for the reason `ui/Field` splits its own: the box owns the border and the fill,
 * the control owns every pixel of padding, and merging them would put the padding on the box.
 *
 * `pr-7.25` is 29px - the designed 12px of right padding, the 9px chevron, and the 8px gap
 * the frame draws between the value and the mark. `appearance-none` removes the platform
 * arrow so only the designed one shows, and `cursor-pointer` is the call `SELECT_CONTROL`
 * records: a user agent draws an arrow over a `<select>`, so the control reads as unclickable
 * without it.
 */
export const FILTER_PILL_BOX =
  'bg-surface-card border-border-strong relative flex items-center rounded-[10px] border';

export const FILTER_PILL_CONTROL =
  'text-label-l text-text-primary w-full cursor-pointer appearance-none bg-transparent py-2.25 pr-7.25 pl-3.5 outline-none focus-visible:outline-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * The trailing chevron, traced from the Figma export (node 26:165).
 *
 * **The third copy of this 9x4.5 leaf**, which is exactly the trigger
 * `dashboard/MonthPill.tsx` names: "if a third chevron ever appears, lift them then". It is
 * not lifted here on purpose - unifying it means editing a Dashboard file from a Transactions
 * ticket, and the shared component needs a size prop and a positioning prop before it can
 * serve all three. `docs/TODO.md` records it.
 *
 * `ui/Select`'s `ChevronLeaf` is not a drop-in either: its 10x5 viewBox rendered into 9x4.5
 * scales the 1.5 stroke down to 1.35, so the arrow would be visibly lighter than the two
 * beside it in the same bar.
 *
 * `pointer-events-none` is what keeps the whole pill clickable - the mark is layered over the
 * select, and without it a click on the arrow, the most obvious place to click, lands on
 * decoration. `overflow-visible` because the round-capped stroke falls half outside the box
 * at both tips and the elbow.
 */
function Chevron() {
  return (
    <svg
      viewBox="0 0 9 4.5"
      className="text-text-tertiary pointer-events-none absolute top-1/2 right-3 h-[4.5px] w-[9px] -translate-y-1/2 overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 0L4.5 4.5L9 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type FilterPillProps<T extends string> = {
  /** Names the control, since the design draws no visible label. */
  label: string;
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
};

function FilterPill<T extends string>({ label, value, options, onChange }: FilterPillProps<T>) {
  return (
    <div className={FILTER_PILL_BOX}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={FILTER_PILL_CONTROL}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

/** The "All categories" entry, whose value is the absence of a category filter. */
const ALL_CATEGORIES = { value: '', label: 'All categories' } as const;

type TransactionFilterBarProps = {
  filters: TransactionFilters;
  categories: CategoryLabel[];
};

export function TransactionFilterBar({ filters, categories }: TransactionFilterBarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /**
   * Navigate to the same page with one filter changed.
   *
   * **A default is written as `undefined`, so the key leaves the URL rather than being
   * spelled out.** `filters.ts` gives the reason in full: one view must not have two URLs.
   */
  function apply(change: Partial<TransactionFilters>) {
    startTransition(() => {
      router.replace(filterHref({ ...filters, ...change }));
    });
  }

  return (
    // justify-between is what right-aligns the sort pill; the frame gives the two left pills
    // a 10px gutter of their own rather than distributing all three.
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <FilterPill
          label="Category"
          value={filters.categoryId ?? ALL_CATEGORIES.value}
          options={[
            ALL_CATEGORIES,
            ...categories.map((category) => ({ value: category.id, label: category.name })),
          ]}
          // The empty string is "no filter", which `toQuery` drops, so clearing the category
          // and never setting it produce the same URL.
          onChange={(categoryId) =>
            apply({ categoryId: categoryId === '' ? undefined : categoryId })
          }
        />

        {/* The value falls back to the default rather than reading `filters.period` raw: a
            bare /transactions parses to `{}`, and a select with an unmatched value renders
            its first option in some browsers and blank in others. */}
        <FilterPill
          label="Period"
          value={filters.period ?? DEFAULT_PERIOD}
          options={PERIOD_OPTIONS}
          onChange={(period) => apply({ period: period === DEFAULT_PERIOD ? undefined : period })}
        />
      </div>

      <FilterPill
        label="Sort"
        value={filters.sort ?? DEFAULT_SORT}
        options={SORT_OPTIONS}
        onChange={(sort) => apply({ sort: sort === DEFAULT_SORT ? undefined : sort })}
      />
    </div>
  );
}
