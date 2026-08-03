# PET-18: app sidebar with navigation and profile footer

Jira: [PET-18](https://decode.atlassian.net/browse/PET-18) `[FULL] Build app sidebar with
navigation and profile footer`, epic PET-2 (App shell, navigation and design system).

Plan file to be saved at `docs/plans/2026-08-03_PET-18_app-sidebar.md` on landing (the
naming pattern CLAUDE.md documents; note the four existing files in that folder use an
older `YYYY-MM-DD-slug` shape, worth a one-line housekeeping mention).

## Context

The Figma **Components** page has nine tiles. Eight are built and live in
`frontend/src/components/ui/` (Button, Input, Select, Tag, ProgressBar, Stat,
SectionHeader, ListRow). **Sidebar is the ninth and last**, drawn as a component set with
four `Active=*` variants (Figma node `18:252`), and it appears on all four app frames.
CLAUDE.md currently says it "belongs to the app-shell ticket rather than here", which this
ticket resolves.

Three neighbouring tickets own PET-18's prerequisites and are all **To Do**:

| Ticket | Owns |
| --- | --- |
| PET-19 `[FE] shared page header and app routing` | The `(app)` shell, the four routes, the auth redirect |
| PET-45 `[BE] profile and preferences read and update endpoints` | `getProfile()`, the only source of first/last name |
| PET-52 `[FE] verify page, session cookie, signed-in redirects` | The httpOnly cookie that authenticates a profile read |

**Scope decided with the user: PET-18 ships the Sidebar component only.** No routes, no
`(app)` layout, no session helper, no backend endpoint. The component takes `active` and
the three profile fields as props, so it is complete and diffable against Figma the moment
it lands, and PET-19 mounts it without changing it.

Consequences to state plainly rather than paper over:

- **AC1, AC2, AC5 land fully.**
- **AC3 lands at the component boundary.** The four items are real `next/link`s carrying
  `aria-current="page"` on the active one, and the highlight moves with the `active` prop.
  "The matching view opens" cannot be exercised because no route exists yet; that is
  PET-19's, by the user's decision.
- **AC4 lands at the component boundary.** Initials, the short name and the email are
  derived from required props, and a test pins that none of Figma's sample values
  ("MK", "Marko K.", "marko@email.com") appears anywhere in the component. Wiring those
  props to a stored profile needs PET-45 plus PET-52.

The one visible product change bundled in: the wordmark reads **"Spendifico"**, not
Figma's "Expensa". `docs/TODO.md` records the rename as decided on 2026-08-02 and lists the
frontend `<title>` among the safe find-and-replace targets. Frontend strings only; the
backend half (mail template, OpenAPI document title, `USER_DB_NAME_PREFIX`) stays
untouched, so no `api:sync` is needed and no drift gate fires.

## What the design actually says

Read from `get_design_context` on nodes `18:2` (Active=Dashboard) and `18:52`
(Active=Transactions), plus screenshots of the frame `21:4` and the four-variant set
`18:252`. Every value below came from the Figma variables, not from an eyedropper.

**Container.** 260px wide, `bg-surface-ink`, `px-5 pt-7 pb-6`, column with
`justify-between`: the nav block at the top, the profile footer at the bottom.

**Logo row** (`pl-2 pt-1 pb-2`, `gap-2.75`, non-interactive in the design): a 34px
`bg-brand-accent` tile with radius 10 holding a `₵` (U+20B5 CEDI SIGN) at
`text-heading-m text-text-on-dark`, then the wordmark at
`text-wordmark text-text-on-dark`.

**Three sections**, `gap-5.5` between them, `gap-1` inside each. Heading row is
`pl-3 pb-0.5` with `text-overline text-text-on-dark-subtle`: `MENU`
(Dashboard, Transactions), `ASSISTANT` (Insights), `ACCOUNT` (Settings).

**Nav item.** `w-full px-3 py-2.75 gap-3 items-center`, radius 10, a 20px icon plus a
`text-label-l` label. Exactly three things flip between states:

| | Row fill | Label | Icon |
| --- | --- | --- | --- |
| active | `bg-surface-ink-raised` | `text-text-on-dark` | `text-brand-accent` |
| inactive | none | `text-text-on-dark-subtle` | `text-text-on-dark-subtle` |

The icon colour differs from the label colour in the active state, so `currentColor`
inheritance is not enough: the icon needs its own class.

**Footer** (`pl-2 pt-3`, `gap-2.75`): a 36px `bg-surface-ink-elevated rounded-full` avatar
with the initials at `text-strong-s text-text-on-dark`, then a `gap-px` column of the short
name (`text-strong-s text-text-on-dark`) and the email
(`text-caption text-text-on-dark-subtle`). **No logout control anywhere** (A39).

Two useful findings. First, all six type styles the sidebar needs already exist as tokens
(`text-wordmark`, `text-heading-m`, `text-overline`, `text-label-l`, `text-strong-s`,
`text-caption`), and the tracking matches Figma's percentages exactly. Second, this is the
first component to use `surface-ink`, `surface-ink-raised`, `surface-ink-elevated`,
`text-on-dark` and `text-on-dark-subtle`; those five tokens have shipped unused since
PET-15. Only `text-on-dark-muted` stays unused.

**The four icons are trivially inlineable.** The exported SVGs are all 20x20, fill-only,
and every shape sits inside the viewBox, so unlike `CategoryGlyph` and `Chevron` none of
them needs `overflow-visible`:

- Dashboard: four 8.5px squares, `rx="2.5"`, at (0,0) (11.5,0) (0,11.5) (11.5,11.5)
- Transactions: three bars `h=3 rx=1.5`, `y=2 w=20`, `y=8.5 w=20`, `y=15 w=13`
- Insights: `M10 0L12.8284 7.17157L20 10L12.8284 12.8284L10 20L7.17157 12.8284L0 10L7.17157 7.17157L10 0Z`
- Settings: `rect y=4.4 w=20 h=2.6 rx=1.3`, `circle cx=16 cy=6.1 r=3`, `rect y=13 w=20 h=2.6 rx=1.3`, `circle cx=7 cy=14.7 r=3`

## Decisions

- **`active` is a required prop, not derived from `usePathname()`.** This is what keeps the
  component a Server Component, matching every other file in `ui/`. It also mirrors the
  Figma component's own variant property. **Trap to record for PET-19:** a Server
  Component layout cannot read the pathname, so whoever mounts the sidebar in
  `(app)/layout.tsx` needs a thin `'use client'` wrapper that calls `usePathname()` and
  passes `active` down. Deriving it inside the sidebar would force `'use client'` onto the
  whole thing and break the Jest story smoke test, which renders stories with no router.
- **Radius 10 is used literally, as `rounded-[10px]`.** Figma bound this corner to a raw
  10px rather than a radius variable, and the scale offers only 8 (`rounded-sm`) and 12
  (`rounded-md`). Matching the design exactly is the smaller lie than snapping it; record
  it as a question for the designer alongside the existing "no Figma counterpart" list.
- **Initials and the short name are derived, never stored.** SET-2 says so outright
  ("initials derive from the name, no upload exists"), and the tech spec's data model
  marks `avatarInitials` as derived.
- **They go in `frontend/src/lib/format.ts`**, beside `formatCurrency` / `formatNegative`,
  rather than inside the component. PET-46 (`[FE] Settings profile card with avatar
  initials`) needs the identical derivation, and SET-6 requires the two places to agree.
- **A focus ring is added, with no Figma counterpart.** The design draws no sidebar focus
  state, and `brand-accent` on `surface-ink` is too dark to read as one, so the items get
  `focus-visible:outline-white` in the shape Button already uses. This joins the five
  "chosen, not read" details CLAUDE.md already lists.
- **The email truncates.** Figma uses `whitespace-nowrap` inside a clipped 260px column,
  which on the web means a long address would simply be cut mid-character. `min-w-0` plus
  `truncate` is the honest equivalent, same pattern as `ListRow`.
- **The logo is not a link.** Figma draws no affordance on it, and inventing a
  "home" destination is a routing decision that belongs to PET-19.

## Files

**New:**

- `frontend/src/components/ui/Sidebar.tsx`
- `frontend/src/components/ui/Sidebar.test.tsx`
- `frontend/src/components/ui/Sidebar.stories.tsx`

**Modified:**

- `frontend/src/lib/format.ts` and `format.test.ts` (two derivations)
- `frontend/src/components/ui/utilities.test.ts` (the compile guard)
- `frontend/src/components/ui/ui.stories.test.tsx` (register the module)
- `frontend/src/app/layout.tsx` (`metadata.title` to Spendifico)
- `CLAUDE.md`, `docs/TODO.md`

Nothing under `backend/`. `frontend/src/app/globals.css` is untouched: no new token is
needed, which also keeps `globals.test.ts` ("36 colours and nothing else") green.

## Steps

### 1. `lib/format.ts`: two derivations

```ts
export function initials(firstName: string, lastName: string): string
export function shortName(firstName: string, lastName: string): string
```

`initials('Marko', 'Kovač')` is `'MK'`; `shortName` is `'Marko K.'`. Two details worth
getting right rather than discovering later: take the first character with
`Array.from(name)[0]` rather than `charAt(0)`, so a surrogate pair is not split in half,
and uppercase with `toLocaleUpperCase()`. An empty `lastName` must yield `'Marko'` with no
dangling `" ."`, even though `RegisterDto` marks both names `@IsNotEmpty`.

`format.test.ts` gains cases for both, including the empty-last-name guard and a non-ASCII
name.

### 2. `Sidebar.tsx`

Follow the file shape of `ListRow.tsx`: a leading comment naming the Figma node, local
non-exported icon components, then the class maps, then the component.

Three exported `Record`s, one per state-dependent property, following the `Field.tsx`
precedent that each gets its own map so two equal-specificity classes never fight over
stylesheet order:

```ts
export type SidebarItem = 'dashboard' | 'transactions' | 'insights' | 'settings';

export const NAV_ITEM_SURFACE: Record<'active' | 'inactive', string>;  // bg-surface-ink-raised | bg-transparent
export const NAV_ITEM_LABEL:   Record<'active' | 'inactive', string>;  // text-text-on-dark | text-text-on-dark-subtle
export const NAV_ITEM_ICON:    Record<'active' | 'inactive', string>;  // text-brand-accent | text-text-on-dark-subtle
```

Complete literal class strings interpolated into a template literal, never built by
interpolation: Tailwind's scanner reads these files as raw text. `inactive` is
`bg-transparent` rather than `''` because `utilities.test.ts` rejects an empty candidate.

A module-level `NAV_SECTIONS` array of `{ heading, items: [{ key, label, href, Icon }] }`
drives the render, so the three headings and four items are declared once. Hrefs are
`/dashboard`, `/transactions`, `/insights`, `/settings`; **PET-19 must match these**, so
name them in the file comment.

Props: `active: SidebarItem`, `firstName: string`, `lastName: string`, `email: string`. All
required. No defaults, no sample values.

Markup and accessibility:

- `<aside className="... h-full">` with `justify-between`. `h-full` rather than a fixed
  1024px: Figma's frame height is not this component's business, and the shell that mounts
  it decides (a `sticky top-0 h-screen` aside, most likely). Say so in the comment.
- One `<nav aria-label="Main">` holding three `<ul>`s, each `aria-labelledby` the `id` of
  its own overline `<p>`. That gives a screen reader the MENU / ASSISTANT / ACCOUNT
  grouping without inventing headings Figma does not draw.
- `aria-current="page"` on the active link. This, not the class, is the real machine
  signal for AC2 and AC3.
- Icons `aria-hidden="true"`, `fill="currentColor"`, `className="size-5 shrink-0"`.
- The initials tile is `aria-hidden="true"`: it repeats the name that is already read out,
  exactly the reasoning `ListRow` gives for its category tile.

### 3. `Sidebar.test.tsx`

Mirror `Tag.test.tsx`: a first test guarding the `it.each` collection, then the variants,
then the negatives worth locking in.

1. `expect(SIDEBAR_ITEMS).toEqual(['dashboard', 'transactions', 'insights', 'settings'])`,
   so a dropped variant cannot silently shrink the suite.
2. `it.each` over the four items: the active link has `aria-current="page"` and the other
   three have none.
3. `it.each`: the active row carries `NAV_ITEM_SURFACE.active`, inactive rows carry
   `NAV_ITEM_SURFACE.inactive`, and the icon carries `NAV_ITEM_ICON[state]`.
4. All three headings render, each `<ul>` is labelled by its heading, and the `<nav>` has
   an accessible name.
5. The four links point at the four hrefs.
6. Footer: `firstName="Marko" lastName="Kovač"` renders `MK`, `Marko K.` and the email,
   and the initials tile is `aria-hidden`.
7. **AC5:** no logout affordance. No `button` role, and no text matching
   `/log ?out|sign ?out/i`.
8. **AC4:** no hardcoded sample values. Render with different props and assert that `MK`,
   `Marko K.` and `marko@email.com` are all absent.

Note the convention every test file in this folder states: `next/jest` stubs CSS imports,
so no test asserts a rendered colour. These assert class names, and
`utilities.test.ts` proves the classes generate CSS.

### 4. `utilities.test.ts`: extend the compile guard

This is the file that makes the class-map convention enforceable, and adding to it is not
optional. Import the three new maps into `EXPECTED`, add their key counts (2 each) to the
"collects a candidate from every map" test, and extend `HARDCODED` with everything the
sidebar hard-codes inline. That list is roughly: `text-wordmark`, `text-overline`,
`text-label-l`, `text-caption`, `bg-surface-ink`, `bg-surface-ink-elevated`,
`text-text-on-dark`, `text-text-on-dark-subtle`, `rounded-[10px]`, `size-9`, `gap-5.5`,
`gap-2.75`, `gap-1`, `gap-px`, `px-5`, `py-2.75`, `px-3`, `pl-3`, `pl-2`, `pt-7`, `pt-3`,
`pt-1`, `pb-6`, `pb-2`, `pb-0.5`, `justify-between`, `flex-col`, `items-center`,
`focus-visible:outline-white`. Build the final list from the finished component rather than
from this plan.

The fractional spacing steps (`gap-5.5` = 22px, `py-2.75` = 11px) are the same technique
`BUTTON_VARIANTS` already uses with `py-3.25`, so they are known to compile, but they are
exactly the sort of thing this guard exists to catch.

### 5. `Sidebar.stories.tsx`

`title: 'Components/Sidebar'`, `component: Sidebar`, `tags: ['autodocs']`, type-only
Storybook import (a value import breaks the Jest story smoke test with an opaque ESM
error). Keep the global `layout: 'fullscreen'`, and add a decorator giving the sidebar a
`h-[1024px]` frame against `bg-surface-canvas`, because `justify-between` needs a
constrained height to put the footer at the bottom.

Three stories: `Playground` (controls over `active`), `AllVariants` (the four side by side,
the direct diff against Figma `18:252`), and `LongName` (a long name and email, showing
the truncation).

Then register `Sidebar` in the `MODULES` array of `ui.stories.test.tsx` and add the
decorator's classes to `STORY_CHROME` in `utilities.test.ts`.

### 6. Wordmark and title

`Sidebar.tsx` renders `Spendifico`, with a comment recording the deliberate divergence
from Figma and pointing at the rename section of `docs/TODO.md`. `layout.tsx`'s
`metadata.title` moves off `'Decode Academy Demo'` in the same commit. Backend copy stays
as it is, so `openapi.json` does not move and neither CI drift gate fires.

### 7. Docs

**CLAUDE.md**, under Shared components: add Sidebar to the built list and delete "The
Sidebar is the one tile still missing, and it belongs to the app-shell ticket rather than
here." Add the three things a future reader will otherwise get wrong: that `active` is a
prop because a Server Component layout cannot read the pathname, and what PET-19 therefore
has to supply; that the five dark-surface tokens now have their first consumer; and the
off-token `rounded-[10px]`, added to the "no Figma counterpart" list along with the focus
ring and the truncating email. Under Not yet built, say the sidebar exists but is mounted
nowhere, and name the three tickets that change that.

**docs/TODO.md**: note that the frontend wordmark is now Spendifico while the backend copy
is not, narrowing the existing "sender and copy disagree" entry; record the raw 10px radius
as a designer question; and record that the footer's profile props have no data source
until PET-45 and PET-52.

## Commits

Branch `feat/PET-18-app-sidebar-and-profile-footer`, cut from `main` (PET-17 merged at
`b57572c`, so nothing to stack on). Mirroring PET-17's own commit shape:

1. `feat(frontend): derive avatar initials and the short name form (PET-18)`
2. `feat(frontend): add the app sidebar component (PET-18)`
3. `test(frontend): extend the compile guard to the sidebar (PET-18)`
4. `chore(frontend): add a Storybook page for the sidebar (PET-18)`
5. `feat(frontend): rename the product to Spendifico in the frontend (PET-18)`
6. `docs: document the sidebar component and what mounts it (PET-18)`

## Verification

Everything runs from `frontend/`. No backend command is needed, and `npm run api:sync` must
**not** be run: nothing about the contract changed.

1. `npm run lint`
2. `npm test`. Expect the new `Sidebar.test.tsx` cases, two new `format.test.ts` cases, the
   grown `utilities.test.ts` `it.each`, and `ui.stories.test.tsx` picking up three more
   stories. `globals.test.ts` must stay green untouched, which is the check that no token
   was quietly added.
3. `npm run build`. This is the typecheck gate; there is no separate `typecheck` script.
4. `npm run build-storybook`. Catches what typechecking cannot, such as a story that no
   longer resolves.
5. `npm run storybook`, open **Components/Sidebar → AllVariants**, and diff it against
   Figma node `18:252` (four variants side by side). Check specifically: the active pill
   fill, the accent icon against the white label on the active row only, the wordmark
   weight and tracking, the 10px corners on the logo tile and the pills, and the footer
   baseline alignment.
6. **Confirm `₵` (U+20B5) renders in Plus Jakarta Sans rather than falling back.** This is
   the one real font risk in the component: a fallback glyph will look visibly wrong inside
   the 34px accent tile and no test can catch it.
7. Tab through the sidebar in Storybook and confirm the focus ring is visible on the dark
   surface, and that the active item is announced as the current page.
8. Grep the diff for `dark:` (none should appear) and for `Expensa` in `frontend/` (none
   should remain).

## Known risks and accepted trade-offs

- **AC3 and AC4 are only verifiable at the component boundary**, by the user's scoping
  decision. Nothing renders this sidebar and nothing feeds it a real profile until PET-19,
  PET-45 and PET-52 land. Worth saying in the PR description so the reviewer does not read
  it as an oversight, and worth a comment on PET-18 in Jira.
- **The hrefs are an unagreed contract.** `/dashboard`, `/transactions`, `/insights`,
  `/settings` are chosen here and PET-19 has to match them. If PET-19 picks differently,
  the fix is one array in one file, but four dead links until it happens.
- **`rounded-[10px]` bypasses the token system.** It compiles to literal CSS with no token
  lookup, so no token change can break it, but it is also the one place in the component a
  designer could reasonably ask us to change.
- **The wordmark diverges from Figma on purpose.** Anybody diffing Storybook against the
  design will see it. The comment in the component is what stops it being "fixed" back.
- **`text-on-dark-muted` stays unused** after this, the last Foundations colour with no
  consumer. Not a problem, just no longer explainable as "the sidebar will use it".
