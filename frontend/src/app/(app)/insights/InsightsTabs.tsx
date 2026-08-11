import Link from 'next/link';

import { SIDEBAR_HREFS } from '@/components/ui/Sidebar';

// The "Chat" / "History" tab bar on the assistant screens (PET-73).
//
// **Structurally `transactions/TransactionTabs.tsx`, and that file's comment is the authority for
// every piece of it.** A `<nav>` of `next/link`s carrying `aria-current`, the inactive label's
// dimming written out by hand, the active rule as an `aria-hidden` span sitting on the
// container's own border, and a focus ring naming `outline-solid` as well as its width.
//
// **No `role="tab"`**, because these navigate to separate routes and replace the page rather than
// swapping a panel: the ARIA tab pattern describes one container with `aria-controls` pointing at
// a `role="tabpanel"` in the same document, and announcing that here would promise a relationship
// that does not exist.
//
// **No daisyUI `tabs` or `tab` class**, because `--tab-border-color` and `--tab-p` are both set at
// a specificity of (0,3,0) against a utility's (0,1,0), and this repo carries no `!` utilities.
// The consequence is that the dimming and the focus ring are ours to write, which is what the two
// class maps below are.
//
// **No count badges, which is the one place this differs from the transactions bar.** No frame
// draws this bar at all, so there is nothing to match - and a badge on Chat would force the bare
// route to fetch a count, which is exactly the blocking wait the chat screen is specified not to
// have.
//
// **Both labels are ours**, like every other string on these two screens, and join what A29 owes
// a designer.

export const INSIGHTS_TABS = ['chat', 'history'] as const;

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

/**
 * Where each tab goes. The single declaration of the History route.
 *
 * **The app's fourth route declaration, and it had to be.** `SIDEBAR_HREFS` declares the four the
 * sidebar renders, `lib/routes.ts` declares the access screens and says outright that the two
 * sets must not restate each other, and `TransactionTabs`' `TAB_HREFS` declares the categories
 * tab. The History route is in none of them, so it is declared once beside the component that
 * links to it.
 *
 * **Built from `SIDEBAR_HREFS.insights` rather than written as a literal**, so the nesting cannot
 * drift. That nesting is load-bearing rather than cosmetic: `SidebarNav.matchItem()` matches by
 * prefix with a trailing-slash boundary, so `/insights/history` keeps Insights lit in the sidebar
 * for free. A sibling route would match none of the four sidebar hrefs, fall through to
 * `FALLBACK_ITEM` and light **Dashboard** while this bar said Insights.
 *
 * `InsightsTabs.test.tsx` asserts with `fs` that both have a `page.tsx` behind them, the check
 * `TransactionTabs.test.tsx`, `SidebarNav.test.tsx` and `lib/routes.test.ts` all run for their own
 * sets. Renaming a folder is otherwise invisible to the whole suite while the link 404s.
 */
export const INSIGHTS_TAB_HREFS: Record<InsightsTab, string> = {
  chat: SIDEBAR_HREFS.insights,
  history: `${SIDEBAR_HREFS.insights}/history`,
};

const TAB_LABELS: Record<InsightsTab, string> = {
  chat: 'Chat',
  history: 'History',
};

/**
 * The label's own colour per state, since this bar does not inherit `.tab`'s dimming.
 *
 * Whole class strings per key, never interpolated: Tailwind's scanner reads source as raw text, so
 * a `text-base-content/${opacity}` compiles to nothing with no build error. `ui/categoryColour.ts`
 * is the pattern. (The daisyUI Blueprint MCP's quality inspector reports this convention as
 * "dynamic classes"; it is the opposite, and `docs/agents/claude-tooling.md` records the false
 * positive.)
 */
const LABEL_CLASS: Record<'active' | 'inactive', string> = {
  active: 'text-base-content',
  inactive: 'text-base-content/50',
};

type InsightsTabsProps = {
  /** Which route is being rendered. Drives `aria-current` and therefore the underline. */
  active: InsightsTab;
};

export function InsightsTabs({ active }: InsightsTabsProps) {
  return (
    // The rule under the whole bar is the container's own border - the active tab's underline
    // sits *on* it rather than replacing it. `gap-7` matches the transactions bar's designed 28px.
    <nav aria-label="Assistant views" className="border-base-300 flex items-end gap-7 border-b">
      {INSIGHTS_TABS.map((tab) => {
        const state = tab === active ? 'active' : 'inactive';

        return (
          <Link
            key={tab}
            href={INSIGHTS_TAB_HREFS[tab]}
            aria-current={tab === active ? 'page' : undefined}
            // `relative` is what the underline below is positioned against. The focus ring names
            // `outline-solid` as well as its width, which is not redundant: a daisyUI `:focus`
            // rule sets `--tw-outline-style: none` and Tailwind's `outline-2` reads that variable,
            // so a ring declared by width alone computes to `2px none` and paints nothing - a WCAG
            // 2.4.7 failure invisible to every gate.
            className={`focus-visible:outline-primary relative flex items-center rounded-sm pb-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid ${LABEL_CLASS[state]}`}
          >
            <span>{TAB_LABELS[tab]}</span>

            {/* The active rule, `aria-hidden` because `aria-current` already says which tab is
                current - an unlabelled 2px box would announce as an empty generic. `-bottom-px`
                puts it *on* the container's 1px border rather than above it, which is what stops
                the label lifting by a pixel when it becomes active. */}
            {tab === active ? (
              <span aria-hidden="true" className="bg-primary absolute inset-x-0 -bottom-px h-0.5" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
