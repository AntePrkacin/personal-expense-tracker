# PET-36 — Build the Categories tab with allocation summary and cards

/ <https://decode.atlassian.net/browse/PET-36>

/ Figma: [13 Categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=36-423)

## Why

`/transactions` has been a complete screen since PET-34 with one exception: its second tab.
`TransactionTabs.tsx` rendered "Categories" as an inert `<span>`, and its own comment said why -
the tab opens frame 13, that frame had no route, and `lib/routes.test.ts` asserts with `fs` that
every declared route has a `page.tsx` behind it. So the tab could not become a link without
either 404ing or forcing a hole into the one check that catches a renamed route. That file also
predicted the fix: "the day PET-36 lands the route is the day the stock component becomes the
right answer."

The backend half (PET-35) is Done and serves the whole screen from one call. `GET /api/categories`
returns every live category with its cap, month spend, percent, remaining-or-over, transaction
count and a computed `status`, plus an `allocation` block carrying `monthlyBudget`, `allocated`
and `unallocated`.

## The two design sources, and where they disagree

This screen had two authorities rather than one: Figma frame 13, and the team's Claude Design
project `Expensa Design System` (`ui_kits/expensa-app/CategoriesTab.jsx`), which was built from
the same `.fig` file and then edited. They agree on geometry - 540×165 cards, a 20px gutter, two
columns at 1440, a 36px colour tile with a glyph, a kebab, "spent of cap", chip, bar, and a footer
pairing a remaining figure with a transaction count - and disagree on two things that matter.
Both disagreements were settled as product decisions and both amend the ticket.

**The summary card answers a different question.** Frame 13 draws "Budget allocation" over
"$1,800 allocated of $2,000 monthly budget" with an unallocated chip. The Claude Design version
reports spending instead, and demotes the unassigned figure to a banner. The spending version
ships; AC4 was rewritten on 2026-08-08. Both readings come out of the same `allocation` block, so
the read did not change.

**The Claude Design version has an uncapped card and frame 13 has none.** This is the more
important of the two, because the contract makes uncapped the *common* case rather than the edge:
a cap is optional and the preselected `Uncategorized` fallback ships without one. A card that
assumed a cap would print "of null" on the one category every account has.

## Decisions

**Route: `/transactions/categories`.** A static segment beside `[id]`, which Next resolves first.
The alternative, a top-level `/categories`, was tried and rejected on a concrete failure:
`SidebarNav.matchItem()` maps a pathname to a sidebar item by prefix and returns `undefined` for a
miss, which the caller turns into `FALLBACK_ITEM` - so a sibling path would have lit **Dashboard**
in the sidebar while the tab bar on the same page said Transactions. Nested, `SidebarNav` needs no
change at all, exactly as `/transactions/[id]` needed none.

**Both tab counts render on both tabs**, which is what frame 13 draws and what made
`TransactionTabs` take two numbers instead of one. `/transactions` gets the category count free
from the read it already makes; the new route pays one extra request through
`readTransactionCount()`. `docs/TODO.md` carries the cost.

**No `role="tab"` anywhere.** The old comment assumed making these real meant a full tablist. It
does not: the ARIA tab pattern describes one container swapping panels in place, and these two
navigate to different routes. So the bar is a `<nav>` of links. The daisyUI classes come along
anyway, because `.tab` lists `[aria-current=page]` beside `.tab-active` in its own active-state
selector - so the attribute that correctly marks a link to the current page is also what draws the
underline, and nothing sets `tab-active` by hand.

**Status is read from the API and never re-derived.** PET-35 bands on integer cents
(`spentCents >= capCents * 0.75`) so nothing falls between a rounded 99% and 100%. Both design
sources carry their own thresholds - Figma implies them from four examples, the Claude Design
version bands at 80% - and neither is copied.

**The bar follows its chip, including green when on track**, which departs from frame 13's violet
bar beside a green chip. A product decision, recorded in `categoryCardStatus.ts` where a reviewer
diffing against the frame will find it.

**The summary heading keeps its month name.** "October spending" is built from the host's calendar
month while the figures below it are scoped to the profile's `monthStartDay`, so at
`monthStartDay: 15` the heading names October over Oct 15 – Nov 15 figures. This is the mismatch
that made `BudgetCard`'s caption drop "in October" and `TrendCard`'s read only "Weekly". Kept by
product decision because it is correct at the default start day of 1; the file says so out loud
and `docs/TODO.md` already carries the backend field that would make it correct at every start
day.

**Two controls ship inert and announce it.** PET-36's AC6 and PET-39's AC1 describe the same
kebab, so the kebab renders as a real `<button aria-disabled>` and PET-39 makes it open. The
header's "Add category" ships the same way, wired by PET-37. `aria-disabled` rather than
`disabled` throughout: the latter removes a control from the tab order, so the screen's most
prominent action would be unreachable by keyboard and announce nothing. This follows PET-33's
precedent for its own disabled "Edit" item, not the month pill's inert `div`. The two banner
actions ("Set limit", "Allocate") are inert on the same terms.

**No empty state, and none is needed.** `Uncategorized` is a system category that
`DELETE /api/categories/:id` refuses to remove (PET-35 AC5), so the grid always holds at least one
card. The state that would need designing is unreachable, which is different from undesigned - so
nothing was invented for it and `docs/TODO.md` gains no entry.

## Tasks

- [x] Update the PET-36 Jira description to match this plan, amending AC1, AC4 and AC6 and adding
      AC7, following PET-35's own "Amended" precedent rather than a silent rewrite
- [x] Add `readCategoriesView()` to `frontend/src/lib/categories.ts` - a third export over the one
      shared request, and the only one that narrows nothing, for the reason recorded in the file
- [x] Add `readTransactionCount()` to `frontend/src/lib/transactions.ts` for the other tab's badge
- [x] Rewrite `TransactionTabs` as two `next/link`s with `aria-current`, taking both counts and an
      active tab, on stock `tabs tabs-border`; declare `TAB_HREFS` there as the single home for the
      new route, with an `fs` check behind it
- [x] Pass both counts from `transactions/page.tsx` and `TransactionsScreen`
- [x] Build `transactions/categories/page.tsx` and a synchronous `CategoriesScreen`
- [x] Build `SpendingSummaryCard`, `CategoryCard` (capped and uncapped) and `categoryCardStatus.ts`
- [x] Fix the two copy defects both designs carry: pluralize the transaction count, and show
      "$0 over" only at exactly the cap
- [x] Tests: `TransactionTabs`, `CategoryCard`, `CategoriesScreen`, plus the inverted assertions in
      `TransactionsScreen.test.tsx` and `(app)/pages.test.tsx`
- [x] Stories under `Screens/13 Categories`: `Default`, `AllUncapped`, `OverBudget`,
      `SingleCategory`
- [x] Record what this leaves owed in `docs/TODO.md`: the uncapped card's invented copy, the extra
      badge request, and the `text-error` contrast measurement
- [x] Update `frontend/src/app/CLAUDE.md` and `frontend/CLAUDE.md`, whose inert-tabs paragraphs are
      now history

## Verification

Every gate green from `frontend/`: `npm run build`, `npx tsc --noEmit` (which is what reaches the
suites, since `next build` does not), `npm test` (90 suites, 1962 tests), `npm run lint`,
`npm run build-storybook`.

**The browser walk found three things a green suite could not, and one of them was a defect in the
walk itself** - which is the argument for probing controls rather than trusting a green check.
Headless Chromium over the DevTools protocol, both themes, 50 checks, 49 passing:

- **A false failure worth recording.** The first version focused the tab with `.focus()` and
  reported `outline-style: none` - exactly the shape of the documented daisyUI trap where a
  `:focus` rule zeroes `--tw-outline-style`. Driven with a real `Input.dispatchKeyEvent` Tab press
  instead, `:focus-visible` matches and the ring is `solid 2px`. `.focus()` does not reliably
  match `:focus-visible`, so a walk that uses it manufactures the very defect it is looking for.
- **A second false failure, from measuring the wrong box.** The bar tones read back at 0.2 alpha,
  which looked like three translucent bars. daisyUI paints the *track* as
  `color-mix(currentcolor 20%, transparent)` and the *filled* portion as
  `::-webkit-progress-value { background-color: currentColor }`, so the bar's real tone is the
  element's `color`. Measured correctly the three are distinct and opaque, and each clears the
  1.5:1 floor PET-22 set against the card - 1.96 / 1.76 / 2.86 in light, 8.08 / 8.98 / 5.53 in
  dark.
- **Two real findings, neither this ticket's to fix.** `text-error` composited over
  `bg-base-100` measures **2.864:1 in light** against WCAG AA's 4.5:1, and 5.53:1 in dark; and
  `text-primary-content` on `bg-primary` measures **4.13:1 in dark**, 6.75:1 in light. Both are
  stock daisyUI pairings that the app already paints elsewhere - the first on `ui/Button`'s
  `textDanger` and every field error message, the second on every `btn-primary` in the app, since
  that modifier sets exactly this pair. Fixing either locally would give the app two different
  reds or two different primaries; fixing them globally means re-theming a semantic colour, which
  `frontend/CLAUDE.md` forbids. `docs/TODO.md` carries both as one designer decision.

**The tab bar does not use daisyUI's `tabs` component, and that reverses what an earlier version
of this plan decided.** Stock `tabs tabs-border` was tried first and its departures from the
design were written off as "radius, colour and style, which daisyUI governs". They are not
incidental: `tabs-border` draws a **3px** underline in **`currentColor`**, **inset by the tab's
inline padding**, where the design draws a **2px** rule in the **accent** colour spanning the
**full tab** and sitting on the container's border. Neither is reachable from outside -
`.tabs-border > .tab:is([aria-current=page])` sets `--tab-border-color` and `.tab:is(.tabs > .tab)`
sets `--tab-p`, both at specificity (0,3,0) against a utility's (0,1,0), and this repo carries no
`!` utilities for a conflict that has another way out. So the bar is plain utilities, which is
what it was before this ticket. Measured after: the rule is 2px, spans the tab exactly, sits on
the border, and resolves to `primary` rather than `currentColor`, in both themes. Two things the
component gave free are now explicit and both are checked - the inactive label's `base-content/50`
dimming, and a focus ring carrying `focus-visible:outline-solid` beside its width, which measures
`solid 2px` under a real Tab press.

**The count badges cost two measurements and both overturned a reasonable-looking choice.**
`badge-ghost` reads as the obvious match for the source's `bg-muted` fill and is
`background-color: var(--color-base-200)` - which is the surface this bar sits on, so the pill
measured **1.000:1 against its own background** in both themes. Invisible, not subtle. And
`badge-soft badge-primary`, the faithful reading of the source's `bg-accent-soft`, put
primary-coloured text on a primary tint at **3.16:1 in dark**, under AA. The shipped pair is
solid `badge-primary` for the active count (**6.75:1** light, **4.13:1** dark - the same
`primary`/`primary-content` pairing `docs/TODO.md` already tracks) and `badge-soft` for the
inactive one, whose number measures **14.7:1** light and **12.2:1** dark on a pill visible at
1.13 / 1.28.

**The first tab keeps the label "All transactions".** The team's Claude Design system calls it
"Transactions", and that one was declined rather than followed: `frontend/CLAUDE.md` gives Figma
authority over **content** specifically, frame 13 draws "All transactions", and PET-36's own
description says the tabs read it. Every other departure on this screen is style or an undrawn
state; this one would have been content, and it is the one place the design file still wins.

**The grid's column ladder was measured at eight viewport widths, and the first version was
wrong in a way no gate could see.** It read `md:grid-cols-2 2xl:grid-cols-3
min-[1920px]:grid-cols-4`, and the four-column step never fired. The class compiled - a browser
probe of `document.styleSheets` found `(width >= 1920px) => grid-template-columns: repeat(4, ...)`
sitting right there - but **Tailwind emits arbitrary variants before the named breakpoints**, and
`2xl` is `width >= 96rem`, which still matches at 1920px. Later in the sheet at equal specificity,
it won. So a rung has to come from the same family as the rungs around it; all four are
`min-[...]` now, at 48rem/96rem/120rem, which are exactly `md`/`2xl`/1920px. Measured after the
fix: **1 / 2 / 2 / 2 / 2 / 3 / 4 / 4** columns at 390 / 768 / 1024 / 1280 / 1440 / 1536 / 1920 /
2560, with no horizontal overflow at any of them and a 20px gutter throughout. Note the stories
render the content column without the shell's 260px sidebar, so the real app's cards are narrower
at the same viewport - at 1440 it is two cards of 540px, which is what frame 13 draws.

**The summary card's bar takes its chip's tone.** It shipped as `progress-primary` under a green
"On track" chip, which made it the one card on the screen where the bar and the chip disagreed -
the category cards below had followed their chips since the start. One `tone` now decides both, so
they cannot drift, and `CategoriesScreen.test.tsx` pins it. That test asserts a class, which this
repo otherwise avoids: it is the documented daisyUI-state exception, since the tone *is* the state
and a `<progress>` exposes no accessible property carrying which colour it took.

**The `CardBanner` strip was rebuilt after review and measured rather than eyeballed.** The first
version flattened it into an `alert alert-soft` box inside the card, which lost the effect: in the
source design system the card body keeps all four corners rounded and **overlaps** a strip pulled
up by exactly one radius, so the strip appears to slide out from behind the card's lower edge. That
rests on three arbitrary-value classes (`mt-[calc(var(--radius-box)*-1)]`,
`rounded-b-[var(--radius-box)]`, `z-1`), and a class Tailwind never compiled paints nothing with
every gate green - so each was measured: margin-top **−8px** against an **8px** card radius, top
corners 0px and bottom corners 8px, `z-index: 1` on the body, and **8px of real overlap** between
the body's bottom edge and the strip's top. The strip spans the full card width in both themes.
It also lost its `role="alert"` in the rebuild, which was wrong for static content present at load:
an assertive live region would interrupt a screen reader to announce something nothing had changed.

Controls ran in the same pass so the harness is seen to discriminate: `base-300` against
`base-100` measures 1.16 light / 1.12 dark and must fail 3:1, and `base-content/50` measures 3.40
light / 4.74 dark and must pass. Both behaved.

Also checked in both themes: the grid renders one card per category; the active tab carries
`aria-current="page"` and only that tab's `::before` underline paints (alpha 1 against 0); the
inactive label is dimmed by the plugin's own rule rather than by a utility; neither link claims
`role="tab"`; the uncapped card draws no bar and no chip and prints no `null` or `NaN`; every
kebab and the header action announce `aria-disabled` while staying focusable; "$0 over" renders at
exactly the cap and "1 transaction" is singular; and on the over-budget story the summary chip
flips to "Over budget" while the unassigned banner correctly disappears rather than reporting a
negative `unallocated`.

No `npm run api:sync`: this ticket changes no request or response body.

## Out of scope

PET-37 (Add category modal), PET-38 (Edit category modal), PET-39 (row menu and delete
confirmation). Each is a small wiring change against a control this ticket ships announcing that
it is not live yet.
