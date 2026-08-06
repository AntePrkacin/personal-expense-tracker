import { AlignLeft, LayoutGrid, Sparkle, SlidersHorizontal, type LucideIcon } from 'lucide-react';
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

// **The four nav glyphs were hand-traced from Figma (nodes 18:12, 18:19, 18:33 and 18:40) and
// are now lucide's.** They were the only *filled* marks in the set, so this is the one place
// the migration is a visible change rather than a swap: lucide is uniformly stroke-based, and
// the sidebar reads a shade lighter for it. Taken deliberately, because four solid glyphs
// beside a stroked hamburger, chevron and magnifier was the inconsistency.
//
// `Sparkle` is the one to not "correct" to `Sparkles`: the design's AI mark is a single
// four-pointed concave star, which is what `Sparkle` draws - `Sparkles` adds two smaller ones.
//
// `AlignLeft` keeps the ragged short line the traced mark had, which is what stops the
// Transactions item reading as a second hamburger next to the drawer's own; it draws four
// lines where the trace drew three. `SlidersHorizontal` is the same kind of near-miss for
// Settings: three rows against the trace's two, knobs still offset on opposite sides, which is
// the part that says "adjustable" rather than "toggled".

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
      { key: 'dashboard', label: 'Dashboard', Glyph: LayoutGrid },
      { key: 'transactions', label: 'Transactions', Glyph: AlignLeft },
    ],
  },
  {
    heading: 'ASSISTANT',
    items: [{ key: 'insights', label: 'Insights', Glyph: Sparkle }],
  },
  {
    heading: 'ACCOUNT',
    items: [{ key: 'settings', label: 'Settings', Glyph: SlidersHorizontal }],
  },
] as const satisfies readonly {
  heading: string;
  items: readonly {
    key: SidebarItem;
    label: string;
    Glyph: LucideIcon;
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
 *
 * **The idle wash is deliberately lighter than the active one.** Both were
 * `neutral-content/10`, which made a hovered item pixel-identical to the open one -
 * so a mouse user pointing at Transactions from the Dashboard saw two items in the
 * same state and neither said which page they were on. The fill that marks "you are
 * here" has to outweigh the one that marks "you could click this", and /5 against
 * /10 is that with no third colour introduced. Invisible to the suite, which asserts
 * `menu-active` and `aria-current` rather than hover weights.
 */
const LINK_STATE: Record<'active' | 'idle', string> = {
  active:
    'menu-active bg-neutral-content/10 text-neutral-content focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-content',
  idle: 'hover:bg-neutral-content/5 focus-visible:bg-neutral-content/5 focus-visible:text-neutral-content focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-content',
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
  /**
   * Called when any nav link is clicked, before the navigation.
   *
   * Optional and unused by this component itself, which is why it does not make this a client
   * component: it is `(app)/SidebarNav.tsx`'s hook for closing the off-canvas drawer, and it
   * exists because the pathname effect that used to be the only closer cannot see a click on
   * the section already open. A Server Component cannot pass a function prop, so only a client
   * parent may supply it - which is exactly the one caller that does.
   */
  onNavigate?: () => void;
};

export function Sidebar({ active, firstName, lastName, email, onNavigate }: SidebarProps) {
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
                          onClick={onNavigate}
                          className={LINK_STATE[isActive ? 'active' : 'idle']}
                        >
                          <Glyph className="size-5 shrink-0" aria-hidden="true" />
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
