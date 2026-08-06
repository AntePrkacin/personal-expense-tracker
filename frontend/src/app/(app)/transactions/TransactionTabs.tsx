// The "All transactions" / "Categories" tab bar (TRN-2, Figma node 45:767 on frame 07, 26:150
// on frame 06).
//
// **Rendered inert, and the count is the only real thing in it.** Same call `SearchPill` and
// `MonthPill` make, for a sharper reason than either: "Categories" opens frame 13, which is
// PET-36's route and does not exist, and `lib/routes.test.ts` asserts with `fs` that every
// declared route has a `page.tsx` behind it - its `PENDING` list is empty and stays that way.
// So a link here would either 404 or force a hole into the one check that catches a renamed
// route. Making "All transactions" a real tab is PET-29's AC2.
//
// Neither label is a `<button>`, `<a>` or `role="tab"`, so neither announces itself as
// operable and `(app)/pages.test.tsx`'s "no operable controls" assertions stay untouched.
// Turning this real is two `next/link`s plus `aria-current`, or a full tablist if the
// Categories view ends up client-side.
//
// **That inertness is also why daisyUI's `tabs` component is deliberately not used here**,
// though the bar it draws is exactly this one. `tabs` expects `role="tab"` elements or real
// radio inputs and links, which is the announcement this bar must not make; so the two labels
// stay plain spans wearing utilities, and the day PET-36 lands the route is the day the stock
// component becomes the right answer.
//
// The count badge is stock `badge badge-soft badge-primary badge-sm`, and the colour modifier
// is semantic rather than decorative: it marks the one selected tab, which is the same job
// `btn-primary` does for the one emphasized action on a screen.

/**
 * The tab bar, with the post-filter total on the active tab.
 *
 * `total` is `TransactionsResponseDto.total` and not `transactions.length`: the contract says
 * outright to read it, so a future page size cannot silently turn this badge into a page
 * count. A17 was amended when PET-28 landed - the number counts matches after the filter bar
 * beneath it, not the account.
 *
 * The badge is plain text rather than carrying an `aria-label`. A screen reader reads the tab
 * as "All transactions 0", which is the same two pieces of information in the same order that
 * a sighted reader gets, and any label spelling out "0 transactions" would say it twice.
 */
export function TransactionTabs({ total }: { total: number }) {
  return (
    // The rule under the whole bar runs the full content width on both frames. gap-7 is the
    // designed 28px between the two tabs.
    <div className="border-base-300 flex items-center gap-7 border-b">
      {/* The active tab is a column: label row, then the 2px `primary` underline sitting flush
          with the container's own border. pb-3 plus gap-2.5 is the designed 12 + 10. */}
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-1.75 pb-3">
          <span className="text-sm font-semibold">All transactions</span>

          <span className="badge badge-soft badge-primary badge-sm">{total}</span>
        </div>

        <div className="bg-primary h-0.5 w-full" />
      </div>

      {/* Figma draws the inactive tab's underline too and marks it hidden, so it is simply
          absent here rather than transparent. The label row keeps the same pb-3 so both
          labels sit on one baseline, and the label is dimmed rather than recoloured - the
          selected one takes plain `base-content`. */}
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex items-center pb-3">
          <span className="text-base-content/50 text-sm font-semibold">Categories</span>
        </div>
      </div>
    </div>
  );
}
