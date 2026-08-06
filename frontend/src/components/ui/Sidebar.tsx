import Link from 'next/link';

import { initials, shortName } from '@/lib/format';

// Sidebar (Figma "Components", node 18:252), on daisyUI `menu` (PET-57).
//
// The dark navigation panel on all four app frames - 04/05 Dashboard, 06/07
// Transactions, 14/15/16 AI Insights and 17 Settings. It renders inside the
// `drawer` the (app) layout owns, which is where its small-screen collapse
// comes from: this component is only ever the panel's content.
//
// `bg-neutral` rather than a fixed dark colour: neutral is daisyUI's
// "always-dark, not-saturated UI" slot, so the panel stays dark in both themes
// the way the design draws it, without a single `dark:` variant.

/**
 * The four routed views, matching the Figma variant property exactly.
 *
 * Exported as an array as well as a union so the tests can assert the set is
 * complete: an it.each over a shrunken list still passes.
 */
export const SIDEBAR_ITEMS = ['dashboard', 'transactions', 'insights', 'settings'] as const;

export type SidebarItem = (typeof SIDEBAR_ITEMS)[number];

/**
 * Where each item goes. The single declaration of the four routes.
 *
 * Exported for the same reason as SIDEBAR_ITEMS, and it has to be: these hrefs
 * have no Figma counterpart, so they are a contract between this component, the
 * `(app)` shell that maps a pathname back to a key, the route folders under
 * `app/(app)/`, and the tests for all three. Every one of those was a separate
 * hand-written copy until they were collapsed into this, and nothing had caught
 * a divergence because each test asserted its own copy against itself.
 *
 * A `Record` keyed by `SidebarItem` rather than a list, so adding a fifth view
 * to SIDEBAR_ITEMS is a type error here until it has somewhere to go.
 */
export const SIDEBAR_HREFS: Record<SidebarItem, string> = {
  dashboard: '/dashboard',
  transactions: '/transactions',
  insights: '/insights',
  settings: '/settings',
};

/**
 * The four nav glyphs, traced from the Figma exports (nodes 18:12, 18:19, 18:33
 * and 18:40) and re-pointed at `currentColor`, so each inherits the menu item's
 * own state colour.
 *
 * All four are 20x20 and fill-only, and every shape sits wholly inside the
 * viewBox, so none of them needs `overflow-visible`: there is no stroke whose
 * half-width falls outside the box to be sheared flat.
 */
function DashboardGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      <rect width="8.5" height="8.5" rx="2.5" />
      <rect x="11.5" width="8.5" height="8.5" rx="2.5" />
      <rect y="11.5" width="8.5" height="8.5" rx="2.5" />
      <rect x="11.5" y="11.5" width="8.5" height="8.5" rx="2.5" />
    </svg>
  );
}

function TransactionsGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      <rect y="2" width="20" height="3" rx="1.5" />
      <rect y="8.5" width="20" height="3" rx="1.5" />
      {/* Deliberately short. The ragged third bar is what makes this read as a
          list rather than as a hamburger menu. */}
      <rect y="15" width="13" height="3" rx="1.5" />
    </svg>
  );
}

function InsightsGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      {/* A four-pointed star with concave sides, the same "AI" mark the insights
          teaser card carries on 04 Dashboard (node 23:127). The control points
          are 7.17157, i.e. 10 - 10/sqrt(2), so the waist sits exactly on the
          inscribed square's corner. */}
      <path d="M10 0L12.8284 7.17157L20 10L12.8284 12.8284L10 20L7.17157 12.8284L0 10L7.17157 7.17157L10 0Z" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      {/* Two sliders. The knobs sit off-centre and on opposite sides, which is
          what says "adjustable" rather than "toggled". */}
      <rect y="4.4" width="20" height="2.6" rx="1.3" />
      <circle cx="16" cy="6.1" r="3" />
      <rect y="13" width="20" height="2.6" rx="1.3" />
      <circle cx="7" cy="14.7" r="3" />
    </svg>
  );
}

/**
 * The navigation as designed: three labelled groups, four items.
 *
 * Declared once here rather than spelled out in the markup, so the headings and
 * the items cannot drift apart from the tests that assert them.
 *
 * The destination is read from SIDEBAR_HREFS rather than written out per item,
 * so this file states each route exactly once. Everything else about an item -
 * its label and its glyph - is genuinely local to the navigation.
 */
const NAV_SECTIONS = [
  {
    heading: 'MENU',
    items: [
      { key: 'dashboard', label: 'Dashboard', Glyph: DashboardGlyph },
      { key: 'transactions', label: 'Transactions', Glyph: TransactionsGlyph },
    ],
  },
  {
    heading: 'ASSISTANT',
    items: [{ key: 'insights', label: 'Insights', Glyph: InsightsGlyph }],
  },
  {
    heading: 'ACCOUNT',
    items: [{ key: 'settings', label: 'Settings', Glyph: SettingsGlyph }],
  },
] as const satisfies readonly {
  heading: string;
  items: readonly {
    key: SidebarItem;
    label: string;
    Glyph: () => React.ReactElement;
  }[];
}[];

/**
 * How an item looks per state, complete literal strings per the repo's Record
 * convention.
 *
 * These overrides exist because daisyUI's menu defaults assume a menu on a base
 * surface, and this one sits on `bg-neutral`. Three of those defaults fail here,
 * verified against `daisyui/components/menu.css` (5.7.16):
 *
 *   - `.menu` sets `--menu-active-bg` to `neutral` itself, so the active fill
 *     was the exact colour of the panel behind it - in both themes, whose
 *     `neutral` is the same near-black. Four pixel-identical items.
 *   - The focus rule recolours the label `base-content` (near-black in the
 *     light theme) behind a `base-content` wash that is equally dark-on-dark.
 *   - The focus rule and `menu-active` both set `outline-style: none` and
 *     `--tw-outline-style: none`, which is why `outline-solid` is spelled out
 *     below: `outline-2` only reads that variable, so without the style
 *     utility the restored ring computes to no outline at all.
 *
 * Everything is therefore stated in `neutral-content` terms, which contrasts
 * with `neutral` by definition in both themes. `menu-active` stays on the
 * active item: it is the state daisyUI names and the visible half of
 * aria-current that the tests pin; the utilities beside it are what make it
 * visible on this panel, and they win because Tailwind emits them unlayered
 * inside `utilities` while daisyUI's rules sit in a nested sub-layer.
 */
const LINK_STATE: Record<'active' | 'idle', string> = {
  active:
    'menu-active bg-neutral-content/10 text-neutral-content focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-content',
  idle: 'hover:bg-neutral-content/10 focus-visible:bg-neutral-content/10 focus-visible:text-neutral-content focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-content',
};

type SidebarProps = {
  /**
   * Which of the four views is open, the Figma variant property.
   *
   * A prop rather than a `usePathname()` call, which is what keeps this a Server
   * Component like every other file in ui/. The consequence for whoever mounts
   * it: an App Router layout cannot read the pathname on the server, so
   * (app)/layout.tsx needs a thin 'use client' wrapper that calls usePathname()
   * and passes the result down. Reading the pathname here instead would force
   * 'use client' onto the whole component and break the story smoke test, which
   * renders stories under Jest with no router in context.
   */
  active: SidebarItem;
  /** Both names, from the stored profile. The footer derives "MK" and "Marko K.". */
  firstName: string;
  lastName: string;
  email: string;
};

export function Sidebar({ active, firstName, lastName, email }: SidebarProps) {
  return (
    // min-h-full rather than a height of its own, because the drawer's side
    // column is what constrains it; justify-between pins the footer to the
    // bottom of whatever height that gives. w-64 is the designed 260px column
    // on Tailwind's scale.
    <aside className="bg-neutral text-neutral-content flex min-h-full w-64 flex-col justify-between px-4 pt-6 pb-5">
      <div className="flex flex-col gap-5">
        {/* Not a link. Figma draws no affordance on the wordmark, and picking a
            destination for it is a routing decision. */}
        <div className="flex items-center gap-3 pt-1 pb-2 pl-2">
          <div className="bg-primary text-primary-content rounded-field flex size-9 shrink-0 items-center justify-center">
            {/* U+20B5 CEDI SIGN, as drawn. A text glyph rather than a traced
                path, which is what Figma has, so it depends on Plus Jakarta Sans
                carrying it - worth an eye in Storybook, because a fallback glyph
                would look wrong here and no test can see it. */}
            <span aria-hidden="true" className="font-display text-base font-semibold">
              ₵
            </span>
          </div>
          {/* "Spendifico", not Figma's "Expensa": the rename was decided on
              2026-08-02 and this is its most visible string. The design file is
              the only half that has not moved - swapping the logo asset is the
              designer's call - and the divergence is recorded under "The Figma
              file still says Expensa" in docs/TODO.md. Do not "correct" this
              back to the design. */}
          <p className="font-display text-lg font-bold">Spendifico</p>
        </div>

        {/* One nav, three labelled lists. The overlines are the groups' names, so
            each list points at its own with aria-labelledby: that gives a screen
            reader the MENU / ASSISTANT / ACCOUNT structure without promoting
            them to headings, which the design does not draw and which would put
            them in the heading rotor ahead of the page's own title. */}
        <nav aria-label="Main" className="flex flex-col gap-5">
          {NAV_SECTIONS.map(({ heading, items }) => {
            const headingId = `sidebar-${heading.toLowerCase()}`;

            return (
              <div key={heading} className="flex flex-col gap-1">
                <p
                  id={headingId}
                  className="text-neutral-content/50 pb-0.5 pl-3 text-xs font-medium tracking-widest"
                >
                  {heading}
                </p>
                <ul aria-labelledby={headingId} className="menu w-full gap-1 p-0">
                  {items.map(({ key, label, Glyph }) => {
                    const isActive = key === active;

                    return (
                      <li key={key}>
                        {/* aria-current is the real signal that this item is the
                            open one; menu-active is only how it looks. */}
                        <Link
                          href={SIDEBAR_HREFS[key]}
                          aria-current={isActive ? 'page' : undefined}
                          className={LINK_STATE[isActive ? 'active' : 'idle']}
                        >
                          <Glyph />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex w-full items-center gap-3 pt-3 pl-2">
        {/* Hidden rather than described: the initials repeat the name that is
            read out immediately after. */}
        <div aria-hidden="true" className="avatar avatar-placeholder">
          <div className="bg-base-100/10 text-neutral-content w-9 rounded-full">
            <span className="text-xs font-semibold">{initials(firstName, lastName)}</span>
          </div>
        </div>

        {/* min-w-0 is what lets truncate work; without it a long address widens
            the flex item and overflows the panel. Figma clips instead, because
            it only ever draws the short sample address. */}
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <p className="truncate text-sm font-semibold">{shortName(firstName, lastName)}</p>
          <p className="text-neutral-content/60 truncate text-xs">{email}</p>
        </div>

        {/* No sign-out control, deliberately. No frame in the file draws one,
            including Settings, even though sessions exist (A39), and the
            designer still owes an answer. Sidebar.test.tsx pins its absence so
            it cannot be added here by reflex. */}
      </div>
    </aside>
  );
}
