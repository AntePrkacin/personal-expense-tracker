'use client';

import type { CategoryLabel } from '@/lib/categories';
import type { TransactionFilters } from '@/lib/transactions';

import { useFilterNavigation } from './FilterNavigation';
import { DEFAULT_SORT, filterHref, SORT_OPTIONS, type FilterOption } from './filters';
import { TransactionSearch } from './TransactionSearch';

// The filter bar (TRN-3, Figma node 26:161), and PET-30's `filterBar` slot filled.
//
// **One client file rather than a Server Component holding client pills.** Every element in this
// bar is interactive, the `justify-between` that pushes the sort pill right belongs to the bar
// itself, and nothing outside this screen draws a bar of this shape - so there is no smaller
// boundary to push into, which is the test `SidebarNav` and `AddTransactionProvider` apply.
//
// **Stock daisyUI `select select-sm` controls as of PET-57, and that deleted more than it
// changed.** The pills used to be a hand-drawn box around an `appearance-none` select with
// an SVG chevron absolutely positioned over it, which needed a rule stated in this file so it
// would not fail silently - padding on the `<select>` and never on the box, or the box's own
// band becomes a dead zone where a click opens no list. daisyUI's `select` puts the border,
// the radius, the padding and the chevron on the control itself, so there is no box, no
// overlay and no rule left to break.
//
// **Not `ui/Select`.** That component renders a `FieldShell` label above the control, and
// these are label-less by design - which is the whole of the difference now that both
// draw the same daisyUI box. An `aria-label` per control is what names them instead.
//
// **The navigation goes through `FilterNavigation` rather than through this file's own
// router.** That provider owns the one `useTransition` on the screen, which is what lets the
// table dim while a change is in flight - controls each owning their own would produce
// several `isPending` flags that nothing between them can read. It is also where the
// `replace`-not-`push` decision is recorded, since it applies to the search field equally.
//
// **PET-67 swapped the period pill out for the search field, at the product owner's direction, and
// what left with the pill is the more interesting half.** The bar drew Category, Period and Sort
// while the header drew the search; it now draws Category, Search and Sort while the header draws
// the account's real period history through `TransactionPeriodSelect`. Two things go with the pill.
// The **date-form option workaround** is gone: because `?period=` accepts a period `start` as well as
// the three named values, this file had to lead its list with a period the response named so a select
// would not render a value its own options did not contain, which is why the bar took a `periodLabel`
// prop at all. The header's select lists every period the account has, so there is no unlisted value
// left to special-case. And the two **named** periods stop being options anybody picks: `previous` is
// URL-only now and `all` is one appended entry on the new control. `filters.ts` carries what that did
// to `PERIOD_OPTIONS`, which is now a parse allowlist rather than an option list.
//
// **This bar renders in two of the screen's three states and the search field now vanishes with
// it**, which is the one behaviour change a reader should not mistake for a bug. TRN-3 removes the
// bar in the designed empty state, so an account with no transactions at all no longer draws a search
// box - nothing to search. It cannot strand a term mid-typing, and `TransactionsScreen` records why:
// no keystroke can move the screen between the two states that draw this bar and the one that does
// not.

type FilterPillProps<T extends string> = {
  /** Names the control, since the design draws no visible label. */
  label: string;
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (value: T) => void;
};

function FilterPill<T extends string>({ label, value, options, onChange }: FilterPillProps<T>) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      // `w-auto` is the one class here that is not stock, and it is not cosmetic: `select`
      // ships `width: clamp(3rem, 20rem, 100%)`, sized for a form field standing alone in a
      // column, and three of those side by side is 960px of filter bar. Sizing to content is
      // what makes these read as the pills the frame draws.
      //
      // `cursor-pointer` for the reason `ui/Select.tsx` records: daisyUI sets no cursor on a
      // resting select, so without it three obviously clickable pills hover as an arrow.
      className="select select-sm w-auto cursor-pointer"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** The "All categories" entry, whose value is the absence of a category filter. */
const ALL_CATEGORIES = { value: '', label: 'All categories' } as const;

type TransactionFilterBarProps = {
  filters: TransactionFilters;
  categories: CategoryLabel[];
};

export function TransactionFilterBar({ filters, categories }: TransactionFilterBarProps) {
  const { navigate } = useFilterNavigation();

  /**
   * Navigate to the same page with one filter changed.
   *
   * **A default is written as `undefined`, so the key leaves the URL rather than being
   * spelled out.** `filters.ts` gives the reason in full: one view must not have two URLs.
   *
   * No `scroll: false` here, unlike the search field beside them: a pill change is a deliberate
   * one-off, so whoever touches one is already at the top and landing on the new first row after a
   * sort change is what was asked for. The search field passes it for itself, which is why the two
   * controls sharing this row still navigate differently.
   */
  function apply(change: Partial<TransactionFilters>) {
    navigate(filterHref({ ...filters, ...change }));
  }

  return (
    // justify-between is what right-aligns the sort pill; the frame gives the two left controls
    // a 10px gutter of their own rather than distributing all three. `flex-wrap` and the
    // row gap are for the viewport Figma never draws: below `sm` three controls and a long
    // category name do not fit one line, and wrapping is what the drawer's `min-w-0` content
    // column expects of everything inside it.
    <div className="flex flex-wrap items-center justify-between gap-y-2.5">
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

        {/* Where the period pill was until PET-67. It is a whole client component rather than a
            `FilterPill` because its state machine is not a pill's: the value is local while the URL
            is write-mostly, on a debounce, and it recognises its own echo. `TransactionSearch`
            carries the account of why every simpler version loses either the typed characters or
            the caret. It navigates through the same provider these pills do, so a keystroke dims
            the table exactly as a category change does. */}
        <TransactionSearch filters={filters} />
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
