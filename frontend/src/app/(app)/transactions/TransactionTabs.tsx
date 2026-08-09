import Link from 'next/link';

import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';

// The "All transactions" / "Categories" tab bar (TRN-2, Figma node 45:767 on frame 07, 26:150
// on frame 06, and 36:477 on frame 13).
//
// **Both labels are real links as of PET-36**, and the paragraph this file used to open with -
// why they were rendered inert, why daisyUI's `tabs` was deliberately not used, and why
// "Categories" specifically must not become a link - is history now. It said the day PET-36
// landed the route was the day the stock component became the right answer, and this is that
// change. `lib/routes.test.ts`'s `PENDING` list is still empty and still stays.
//
// **No `role="tab"` anywhere, and that is the correction the old comment did not anticipate.**
// It assumed making these real meant "a full tablist". It does not: the ARIA tab pattern
// describes one container swapping panels in place, with `aria-controls` pointing at a
// `role="tabpanel"` that exists in the same document. These two labels navigate to two different
// routes and the whole page is replaced, which is navigation - so this is a `<nav>` of `<a>`s,
// and announcing it as a tablist would promise a panel relationship that is not there.
//
// **daisyUI's `tabs` component is deliberately not used either, and this time the reason is a
// measurement rather than an assumption.** An earlier version of this file did use stock
// `tabs tabs-border` and recorded its two departures from the design as acceptable. They are
// not, because they are the whole of what the bar looks like: `tabs-border` draws a **3px**
// underline in **`currentColor`**, **inset by the tab's own inline padding**, where the team's
// Claude Design system (`ui_kits/expensa-app/Shell.jsx`'s `Tabs`) draws a **2px** rule in the
// **accent** colour spanning the **full tab**, sitting on the container's bottom border.
//
// Neither difference can be closed from the outside. `.tabs-border > .tab:is([aria-current=page])`
// sets `--tab-border-color: currentColor`, and `.tab:is(.tabs > .tab)` sets `--tab-p`, both at a
// specificity of (0,3,0) - a utility class is (0,1,0) and loses, and this repo carries no `!`
// utilities for anything short of an unavoidable conflict and no eslint-disable comments. So the
// bar is built from plain utilities, which is what it was before PET-36 and what the design does.
//
// Two things that came free with the component now have to be paid for explicitly, and both are
// covered by the browser walk rather than assumed:
//
//   - **The inactive label's dimming.** `.tab` did this through its own `:not(...)` rule
//     resolving to `base-content/50`; it is a written-out utility again.
//   - **The focus ring.** `.tab` shipped a `:focus-visible` outline. A plain `<a>` needs one, and
//     it carries `focus-visible:outline-solid` alongside the width - `frontend/CLAUDE.md` records
//     that a daisyUI `:focus` rule elsewhere zeroes `--tw-outline-style`, so a restored ring that
//     names only a width computes to `2px none` and paints nothing with every gate green.
//
// The count badge's colour modifier stays semantic rather than decorative: it marks the one
// selected tab, which is the same job `btn-primary` does for the one emphasized action on a
// screen. The selected tab is never marked by colour alone - it carries `aria-current`, the
// underline and full-opacity text as well.

export const TRANSACTION_TABS = ['transactions', 'categories'] as const;

export type TransactionTab = (typeof TRANSACTION_TABS)[number];

/**
 * Where each tab goes. The single declaration of the Categories route.
 *
 * **This is the app's first route that is neither a sidebar destination nor an access screen**,
 * so neither existing home fits: `SIDEBAR_HREFS` declares the four the sidebar renders and
 * `ACCESS_ROUTES` declares the six outside the shell, and `lib/routes.ts` says outright that
 * the two sets must not restate each other. A third set here, owned by the one component that
 * links to both, keeps that rule intact.
 *
 * The transactions half is **read from `SIDEBAR_HREFS` rather than written out**, and the
 * categories half is built from it, so the nesting cannot drift from the route it nests under.
 * That nesting is load-bearing rather than cosmetic: `SidebarNav.matchItem()` matches by prefix
 * with a trailing-slash boundary, so `/transactions/categories` keeps Transactions lit in the
 * sidebar for free. A sibling `/categories` would match none of the four hrefs and fall through
 * to `FALLBACK_ITEM`, lighting **Dashboard** while this bar said Transactions.
 *
 * `TransactionTabs.test.tsx` asserts with `fs` that both have a `page.tsx` behind them, the way
 * `SidebarNav.test.tsx` does for the sidebar's four and `lib/routes.test.ts` for the access
 * screens. Renaming a folder is otherwise invisible to the whole suite while the link 404s.
 */
export const TAB_HREFS: Record<TransactionTab, string> = {
  transactions: SIDEBAR_HREFS.transactions,
  categories: `${SIDEBAR_HREFS.transactions}/categories`,
};

const TAB_LABELS: Record<TransactionTab, string> = {
  transactions: 'All transactions',
  categories: 'Categories',
};

/**
 * Whole class strings per state, never interpolated.
 *
 * Tailwind's scanner reads source as raw text, so a `badge-${tone}` compiles to nothing with no
 * build error. `ui/categoryColour.ts` is the pattern this follows.
 */
const BADGE_CLASS: Record<'active' | 'inactive', string> = {
  // **Solid rather than `badge-soft badge-primary`, and the browser picked it.** The source
  // fills the active count with `bg-accent-soft`, so the soft variant looks like the faithful
  // translation - but measured in dark it puts primary-coloured text on a primary-tinted fill at
  // **3.16:1**, under AA's 4.5 for text this size. Solid `badge-primary` pairs `primary` with
  // `primary-content` and measures **4.13:1**, which is the same pair every `btn-primary` in the
  // app already paints (`docs/TODO.md` carries that it is still under the line). Better, and it
  // also matches what the design's own screenshot shows: a filled violet pill, not a tint.
  active: 'badge badge-primary badge-sm',
  // **`badge-ghost` was tried here and is disqualified by measurement.** It reads as the obvious
  // match for the source's `bg-muted` fill, and it is `background-color: var(--color-base-200)` -
  // which is exactly the surface this tab bar sits on, so the pill measured **1.000:1** against
  // its own background in both themes. Not "subtle": invisible. `badge-soft` with no colour
  // modifier tints `base-content` 8% over `base-100` and is the most visible neutral option
  // daisyUI offers here, at 1.13:1 light and 1.28:1 dark. The pill is decoration; what has to be
  // legible is the number on it, and that measures 14.7:1 light and 12.2:1 dark.
  inactive: 'badge badge-soft badge-sm',
};

/** The label's own colour per state, since this bar no longer inherits `.tab`'s dimming. */
const LABEL_CLASS: Record<'active' | 'inactive', string> = {
  active: 'text-base-content',
  inactive: 'text-base-content/50',
};

type TransactionTabsProps = {
  /** Which route is being rendered. Drives `aria-current` and therefore the underline. */
  active: TransactionTab;
  /** `TransactionsResponseDto.total` - matches after the filter bar, not the account (A17). */
  transactionCount: number;
  /** How many live categories the account has. Never 0: the Uncategorized fallback cannot be deleted. */
  categoryCount: number;
  /**
   * Where the "All transactions" tab points, when the caller has filters worth keeping.
   *
   * **Defaulting this to the bare route was a real regression, and the inert `<span>` this
   * component replaced could not have had it.** `/transactions` holds its search, period,
   * category and sort in the query string, and the active tab is the ordinary way a user says
   * "back to the list" - so a self-link to `/transactions` emptied the search box and reset the
   * table to the current period, newest-first, with no way back but retyping all four.
   *
   * So the list passes `filterHref(filters)` and keeps them. The Categories route passes
   * nothing and gets the bare path, which is correct rather than a shortcut: that screen has no
   * filter bar, so there is nothing to preserve, and carrying a stale query across would restore
   * a filter the user left two navigations ago.
   */
  transactionsHref?: string;
};

/**
 * The tab bar, with a real count on both tabs.
 *
 * **Both counts render on both routes**, which is what frame 13 draws and what makes this take
 * two numbers rather than one. It cost each route a read the other already had: `/transactions`
 * gets `categoryCount` free from the categories it fetches for the table's join, and
 * `/transactions/categories` pays one extra request through `readTransactionCount()`.
 *
 * `transactionCount` is `TransactionsResponseDto.total` and not `transactions.length`: the
 * contract says outright to read it, so a future page size cannot silently turn this badge into
 * a page count.
 *
 * Neither badge carries an `aria-label`. A screen reader reads the tab as "All transactions 128",
 * which is the same two pieces of information in the same order that a sighted reader gets, and
 * any label spelling out "128 transactions" would say it twice.
 *
 * **Switching *to* Categories drops the list's filters, and going back to the list keeps them.**
 * Those are two different journeys and the first version treated them as one. Forwarding a
 * search term to the Categories tab would put it in the URL of a screen that cannot show it, so
 * that link stays bare; but the "All transactions" tab is also the control a filtering user
 * clicks to return to their own view, and pointing it at the bare route silently emptied every
 * filter they had set. `transactionsHref` is what the list passes to keep them.
 */
export function TransactionTabs({
  active,
  transactionCount,
  categoryCount,
  transactionsHref,
}: TransactionTabsProps) {
  const counts: Record<TransactionTab, number> = {
    transactions: transactionCount,
    categories: categoryCount,
  };

  const hrefs: Record<TransactionTab, string> = {
    transactions: transactionsHref ?? TAB_HREFS.transactions,
    categories: TAB_HREFS.categories,
  };

  return (
    // The rule under the whole bar runs the full content width on every frame that draws it, and
    // it is the container's own border - the active tab's underline sits *on* it rather than
    // replacing it. `items-end` so both labels share a baseline whatever their badge does, and
    // `gap-7` is the designed 28px between tabs.
    <nav aria-label="Transaction views" className="border-base-300 flex items-end gap-7 border-b">
      {TRANSACTION_TABS.map((tab) => {
        const state = tab === active ? 'active' : 'inactive';

        return (
          <Link
            key={tab}
            href={hrefs[tab]}
            aria-current={tab === active ? 'page' : undefined}
            // `relative` is what the underline below is positioned against. The focus ring names
            // `outline-solid` as well as its width, which is not redundant: a daisyUI `:focus`
            // rule sets `--tw-outline-style: none` and Tailwind's `outline-2` reads that
            // variable, so a ring declared by width alone computes to `2px none` and paints
            // nothing - a WCAG 2.4.7 failure invisible to every gate. `rounded-sm` keeps the
            // ring from drawing hard square corners around the text.
            className={`focus-visible:outline-primary relative flex items-center gap-1.75 rounded-sm pb-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid ${LABEL_CLASS[state]}`}
          >
            {/* The label is its own element rather than a bare text node, so a test can find it
                without matching the count concatenated onto it - `getByText('All transactions')`
                is an exact match and the link's own text content is "All transactions128". */}
            <span>{TAB_LABELS[tab]}</span>

            {/* No colour utility on top of the badge: both variants set `color` themselves, so
                the link's `base-content/50` never reaches the count - the inactive number stays
                fully legible under a muted label, which is what the source draws. Overriding it
                to `text-base-content` was tried and is wrong on the active pill, where it would
                replace `primary-content` and put dark text on a solid primary fill. */}
            <span className={BADGE_CLASS[state]}>{counts[tab]}</span>

            {/* The active rule, and it is `aria-hidden` because `aria-current` already says
                which tab is current - an unlabelled 2px box would announce as an empty generic.
                `-bottom-px` puts it *on* the container's 1px border rather than above it, which
                is what stops the label lifting by a pixel when it becomes active. */}
            {tab === active ? (
              <span aria-hidden="true" className="bg-primary absolute inset-x-0 -bottom-px h-0.5" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
