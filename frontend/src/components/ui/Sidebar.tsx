import Link from 'next/link';

import { initials, shortName } from '@/lib/format';

// Sidebar (Figma "Components", node 18:252).
//
// The fixed dark navigation panel on all four app frames - 04/05 Dashboard,
// 06/07 Transactions, 14/15/16 AI Insights and 17 Settings - drawn as a
// component set with one variant per active item (DSH-1).
//
// This is the ninth and last tile on the Components page, and the first
// component to use the six dark-surface tokens: surface-ink, -ink-raised and
// -ink-elevated, plus text-on-dark and -on-dark-subtle. They have shipped unused
// since the Foundations work; only text-on-dark-muted still has no consumer.
//
// Nothing mounts this yet. The (app) route group, the four routes and the page
// header are PET-19's; the profile that feeds the footer needs the read endpoint
// (PET-45) reached with the session cookie (PET-52). Until those land the footer
// props have no data source, which is why they are required rather than
// defaulted to the designed sample values - see the props below.

/**
 * The four routed views, matching the Figma variant property exactly.
 *
 * Exported as an array as well as a union so the tests can assert the set is
 * complete: an it.each over a shrunken list still passes.
 */
export const SIDEBAR_ITEMS = ['dashboard', 'transactions', 'insights', 'settings'] as const;

export type SidebarItem = (typeof SIDEBAR_ITEMS)[number];

type NavState = 'active' | 'inactive';

/**
 * The three properties that flip between states, one map each.
 *
 * Split rather than concatenated for the reason Field.tsx records: two classes
 * setting the same property have equal specificity, so emitting both would make
 * the winner depend on the order Tailwind happens to write them. One map per
 * property means exactly one candidate is ever applied.
 *
 * The icon needs its own map because it does not follow the label. Active draws
 * the glyph in `brand-accent` against a white label, so `currentColor`
 * inheritance from the row would paint it white.
 *
 * `inactive` is `bg-transparent` rather than `''`. Figma simply omits the fill,
 * but an empty string contributes a candidate that utilities.test.ts rejects,
 * and naming the absence is what makes the pair diffable.
 *
 * Class strings are spelled out in full: Tailwind's scanner reads this file as
 * raw text, so a class built by interpolation compiles to nothing with no build
 * error.
 */
export const NAV_ITEM_SURFACE: Record<NavState, string> = {
  active: 'bg-surface-ink-raised',
  inactive: 'bg-transparent',
};

export const NAV_ITEM_LABEL: Record<NavState, string> = {
  active: 'text-text-on-dark',
  inactive: 'text-text-on-dark-subtle',
};

export const NAV_ITEM_ICON: Record<NavState, string> = {
  active: 'text-brand-accent',
  inactive: 'text-text-on-dark-subtle',
};

/**
 * The four nav glyphs, traced from the Figma exports (nodes 18:12, 18:19, 18:33
 * and 18:40) and re-pointed at `currentColor` so each inherits NAV_ITEM_ICON.
 *
 * All four are 20x20 and fill-only, and every shape sits wholly inside the
 * viewBox, so unlike ListRow's CategoryGlyph and Select's Chevron none of them
 * needs `overflow-visible`: there is no stroke whose half-width falls outside the
 * box to be sheared flat.
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
 * The hrefs have no Figma counterpart - Figma has no concept of a destination -
 * and are the contract PET-19 has to match when it creates the routes. Until it
 * does, all four are dead links.
 */
const NAV_SECTIONS = [
  {
    heading: 'MENU',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', Glyph: DashboardGlyph },
      {
        key: 'transactions',
        label: 'Transactions',
        href: '/transactions',
        Glyph: TransactionsGlyph,
      },
    ],
  },
  {
    heading: 'ASSISTANT',
    items: [{ key: 'insights', label: 'Insights', href: '/insights', Glyph: InsightsGlyph }],
  },
  {
    heading: 'ACCOUNT',
    items: [{ key: 'settings', label: 'Settings', href: '/settings', Glyph: SettingsGlyph }],
  },
] as const satisfies readonly {
  heading: string;
  items: readonly {
    key: SidebarItem;
    label: string;
    href: string;
    Glyph: () => React.ReactElement;
  }[];
}[];

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
    // w-65 is 260px, the designed width, and belongs to the component. The
    // height does not: h-full rather than the frame's 1024px, because 1024 is the
    // Figma canvas rather than a design decision. justify-between is what pins
    // the footer to the bottom, so the shell has to give this a constrained
    // height - a `sticky top-0 h-screen` aside is the shape PET-19 wants.
    <aside className="bg-surface-ink flex h-full w-65 flex-col justify-between px-5 pt-7 pb-6">
      <div className="flex flex-col gap-5.5">
        {/* Not a link. Figma draws no affordance on the wordmark, and picking a
            destination for it is a routing decision. */}
        <div className="flex items-center gap-2.75 pt-1 pb-2 pl-2">
          <div className="bg-brand-accent flex size-8.5 shrink-0 items-center justify-center rounded-[10px]">
            {/* U+20B5 CEDI SIGN, as drawn. A text glyph rather than a traced
                path, which is what Figma has, so it depends on Plus Jakarta Sans
                carrying it - worth an eye in Storybook, because a fallback glyph
                would look wrong here and no test can see it. */}
            <span aria-hidden="true" className="text-heading-m text-text-on-dark">
              ₵
            </span>
          </div>
          {/* "Spendifico", not Figma's "Expensa": the rename was decided on
              2026-08-02 and this is its most visible string. The design file is
              the only half that has not moved - swapping the logo asset is the
              designer's call - and the divergence is recorded under "The Figma
              file still says Expensa" in docs/TODO.md. Do not "correct" this
              back to the design. */}
          <p className="text-wordmark text-text-on-dark">Spendifico</p>
        </div>

        {/* One nav, three labelled lists. The overlines are the groups' names, so
            each list points at its own with aria-labelledby: that gives a screen
            reader the MENU / ASSISTANT / ACCOUNT structure without promoting
            them to headings, which the design does not draw and which would put
            them in the heading rotor ahead of the page's own title. */}
        <nav aria-label="Main" className="flex flex-col gap-5.5">
          {NAV_SECTIONS.map(({ heading, items }) => {
            const headingId = `sidebar-${heading.toLowerCase()}`;

            return (
              <div key={heading} className="flex flex-col gap-1">
                <p id={headingId} className="text-overline text-text-on-dark-subtle pb-0.5 pl-3">
                  {heading}
                </p>
                <ul aria-labelledby={headingId} className="flex flex-col gap-1">
                  {items.map(({ key, label, href, Glyph }) => {
                    const state: NavState = key === active ? 'active' : 'inactive';

                    return (
                      <li key={key}>
                        {/* aria-current is the real signal that this item is the
                            open one; the fill is only how it looks. */}
                        <Link
                          href={href}
                          aria-current={state === 'active' ? 'page' : undefined}
                          className={`text-label-l focus-visible:outline-white flex w-full items-center gap-3 rounded-[10px] px-3 py-2.75 focus-visible:outline-2 focus-visible:outline-offset-2 ${NAV_ITEM_SURFACE[state]} ${NAV_ITEM_LABEL[state]}`}
                        >
                          <span className={NAV_ITEM_ICON[state]}>
                            <Glyph />
                          </span>
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

      <div className="flex w-full items-center gap-2.75 pt-3 pl-2">
        {/* Hidden rather than described: the initials repeat the name that is
            read out immediately after, which is the same call ListRow makes for
            its category tile. */}
        <div
          aria-hidden="true"
          className="bg-surface-ink-elevated text-strong-s text-text-on-dark flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          {initials(firstName, lastName)}
        </div>

        {/* min-w-0 is what lets truncate work; without it a long address widens
            the flex item and overflows the 260px panel. Figma clips instead,
            because it only ever draws the short sample address. */}
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <p className="text-strong-s text-text-on-dark truncate">
            {shortName(firstName, lastName)}
          </p>
          <p className="text-caption text-text-on-dark-subtle truncate">{email}</p>
        </div>

        {/* No sign-out control, deliberately. No frame in the file draws one,
            including Settings, even though sessions exist (A39), and the
            designer still owes an answer. Sidebar.test.tsx pins its absence so
            it cannot be added here by reflex. */}
      </div>
    </aside>
  );
}
