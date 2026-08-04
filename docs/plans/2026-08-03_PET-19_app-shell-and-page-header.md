# PET-19: app shell, four routed views and the shared page header

Jira: [PET-19](https://decode.atlassian.net/browse/PET-19) `[FE] Build shared page header and
app routing`, epic PET-2, High, assigned to Ante Prkacin.

## Context

`ui/Sidebar.tsx` landed with PET-18 but **nothing mounts it**: there is no `(app)` route
group, none of its four nav links resolve, and `/` is still the scaffold greeting page that
fetches `GET /api/hello`. PET-19 is the ticket that turns nine finished Figma components into
a navigable application: it creates the shell that mounts the sidebar, the four routes behind
it (`/dashboard`, `/transactions`, `/insights`, `/settings`), and the page header pattern that
every one of those screens opens with.

Two dependencies are genuinely absent and shape the scope. PET-52 (verify page, session
cookie) has no branch and the cookie's **name is not decided anywhere in the repo**; PET-45
(`GET /api/profile`) is a plan on open PR #16 with no implementation. Since the sidebar footer
needs `firstName`, `lastName` and `email`, and those come from two different databases, the
shell cannot feed it real data yet.

Scope decided with the user:

- **AC5 does not land.** A single `requireSession()` seam ships with a documented TODO that
  currently lets everything through, so the shell is reachable in dev. PET-52 fills it in and
  picks the cookie name.
- **The sidebar footer gets hardcoded placeholders** with a TODO naming PET-45 and PET-52.
- **The header owns overline + title + a generic action slot.** The month pill, the search
  pill and "Regenerate" are built as small per-route components and passed in, so the tickets
  that make them functional own them without touching the header.
- **The four pages are empty stubs and `/` redirects to `/dashboard`.** The scaffold greeting
  page is deleted.

## What the design actually says

Read with `get_design_context` on the four topbar nodes: `21:56` (Dashboard), `26:137`
(Transactions), `38:542` (AI Insights), `40:677` (Settings), cross-checked against the tech
spec's DSH-2, TRN-1, INS-1, SET-1 and CTG-1.

**Shared frame.** `flex items-center justify-between`, `px-40 pt-28 pb-20` → `px-10 pt-7 pb-5`.
No bottom border and no own background; it sits on the body's `surface-canvas`.

**Left block.** A `gap-3px` column: overline at Label/M / Text/Secondary
(`text-label-m text-text-secondary`), title at Display/M / Text/Primary
(`text-display-m text-text-primary`, 26px Plus Jakarta Bold, tracking -2%).

**Right block**, `gap-12px` → `gap-3`, and it differs on every screen:

| Screen | Node | Overline | Title | Right block |
| --- | --- | --- | --- | --- |
| Dashboard | `21:56` | October 2025 | Dashboard | month pill "October" + **primary** "Add transaction" |
| Transactions | `26:137` | October 2025 | Transactions | search pill "Search transactions" + **primary** "Add transaction" |
| AI Insights | `38:542` | Your money assistant | AI Insights | **secondary** "Regenerate" |
| Settings | `40:677` | Manage your account | Settings | nothing |

Both pills share one shell: `bg-surface-card`, `border-border-strong`, `rounded-[10px]`,
`py-10` → `py-2.5`, `text-label-l text-text-primary`, `gap-8px` → `gap-2`. They differ only in
which side carries 14px and which 12px, and in the glyph side: the month pill is
`pl-3.5 pr-3` with a trailing chevron, the search pill is `pl-3 pr-3.5` with a leading 16px
magnifier.

**Three conflicts and inconsistencies found, all worth recording rather than silently
resolving:**

1. **The ticket's AC3 is wrong about Transactions.** It says the month select appears on
   Dashboard *and* Transactions. Figma node `26:137` and tech-spec TRN-1 both give Transactions
   a **search input instead**, and only DSH-2 has the month select. Following Figma and the
   spec; AC3 therefore lands for Dashboard only. **Fix the Jira issue description itself** so
   the ticket stops asserting something the design contradicts (see step 11).
2. **"Regenerate" is in Figma and INS-1 but not in the ticket text.** INS-1 also says it reads
   "Generating..." in flight and is absent in the empty state, which is the Insights ticket's
   business. PET-19 renders the resting secondary button.
3. **Figma's bottom padding is inconsistent**: 20px on Dashboard and Insights, 18px on
   Transactions and Settings. Standardising on `pb-5` (20px).

**"Add category" (CTG-1) is out of scope.** It belongs to the Categories tab inside
`/transactions`, whose tab strip Figma draws in the *content* area (`26:150`), not the topbar.
The action-slot design accommodates it with no header change.

## Decisions

- **`PageHeader` and `SidebarNav` go in `src/app/(app)/`, not `components/ui/`.** CLAUDE.md
  states the `ui/` library is complete and mirrors the nine Figma Components tiles: "a new
  component from here on is a feature's own, not a tile". The header is the shell's, and
  CLAUDE.md's own rule is that such components go "next to the route that uses them".
  Consequence: the story is filed under `Shell/` rather than `Components/`, so it cannot join
  `ui.stories.test.tsx` (which asserts every module's title matches `/^Components\//`). It gets
  its own colocated smoke test instead, the same shape as the existing
  `src/stories/foundations/foundations.stories.test.tsx`.
- **`SidebarNav` is the only `'use client'` file added.** This is the trap PET-18 recorded
  verbatim: `Sidebar` takes `active` as a prop to stay a Server Component, and an App Router
  layout cannot read the pathname on the server. `SidebarNav` calls `usePathname()`, maps it to
  a `SidebarItem` and passes it down. It also owns the `sticky top-0 h-screen shrink-0` wrapper
  the sidebar's own comment asks for, since `Sidebar` is `h-full` and needs a constrained
  height for `justify-between` to pin the footer.
- **The pathname maps by prefix, not by equality.** `/transactions/abc` must still highlight
  Transactions, so the mapping walks the four hrefs and matches on `===` or `startsWith(href + '/')`,
  falling back to `dashboard` for the unreachable no-match case.
- **`requireSession()` returns `Promise<void>` but is not `async`.** Declaring the async
  signature now means PET-52 adds a body rather than changing every call site, and returning
  `Promise.resolve()` from a non-async function avoids an async body with nothing to await. Its
  doc comment spells out exactly what PET-52 must do: read the httpOnly cookie with
  `cookies()`, lift the value into `Authorization: Bearer <token>`, call
  `GET /api/auth/session`, and `redirect()` to the access flow on 401 or a missing cookie. It
  deliberately does **not** name the cookie — that is PET-52's undecided contract.
- **`export const dynamic = 'force-dynamic'` on the `(app)` layout.** The pages compute the
  month overline from `new Date()`, and without this Next bakes the string at build time and
  every screen reads "October 2025" forever. PET-52's cookie read will make the segment dynamic
  anyway; this makes it true today. Route segment config applies to the segment and its
  children, so one declaration covers all four pages.
- **The month string is derived in `lib/format.ts`, not in the pages.** Two functions beside
  `formatCurrency` / `initials`, for the same reason PET-18 put `initials` there: Transactions
  and Dashboard both need the identical string and must not drift.
- **The month period ignores `monthStartDay` for now.** A9 says the profile's month start
  defines the period, and that value is PET-45's. PET-19 shows the calendar month, which is
  correct for the default of 1. Recorded in `docs/TODO.md`.
- **`Chevron` gets exported from `ui/Select.tsx`** so the month pill uses the designed glyph
  rather than a second copy. Precedent: `Button.tsx` exports `TrashGlyph` for exactly this.
- **The search pill is static, not a live `<input>`.** It filters a list that does not exist
  until PET-28, and a typeable box that filters nothing is worse than an obviously inert one.
  It gets the same treatment A8 gives the month select. Stated as an assumption; a real input
  is one line when the list lands.
- **Each page renders its own `<PageHeader>`, not the layout.** A layout cannot know the page's
  title. AC4's "header persisting" is satisfied by one shared component in one fixed position,
  which is what the design means.
- **The placeholder profile uses Figma's own sample values** (`Marko` / `Kovač` /
  `marko@email.com`), because that is what makes the Storybook and browser diff against the
  design honest. `Sidebar.test.tsx` pins that those strings are absent from the *component*,
  which this does not violate. The constant is named `PLACEHOLDER_PROFILE` and carries a loud
  TODO so it cannot be mistaken for a real read.

## Files

**New:**

- `frontend/src/lib/session.ts` — `requireSession()`, the deferred AC5 seam
- `frontend/src/app/(app)/layout.tsx` — the shell
- `frontend/src/app/(app)/SidebarNav.tsx` + `SidebarNav.test.tsx` — the `'use client'` wrapper
- `frontend/src/app/(app)/PageHeader.tsx` + `PageHeader.test.tsx` + `PageHeader.stories.tsx`
- `frontend/src/app/(app)/shell.stories.test.tsx` — story smoke test for the `Shell/` section
- `frontend/src/app/(app)/pages.test.tsx` — AC1/AC2/AC3 across all four routes
- `frontend/src/app/(app)/dashboard/page.tsx` and `dashboard/MonthPill.tsx`
- `frontend/src/app/(app)/transactions/page.tsx` and `transactions/SearchPill.tsx`
- `frontend/src/app/(app)/insights/page.tsx`
- `frontend/src/app/(app)/settings/page.tsx`

**Modified:**

- `frontend/src/app/page.tsx` — becomes `redirect('/dashboard')`; the greeting UI is deleted
- `frontend/src/app/page.test.tsx` — rewritten to assert the redirect
- `frontend/src/lib/format.ts` + `format.test.ts` — `monthOverline`, `monthLabel`
- `frontend/src/components/ui/Select.tsx` — export `Chevron`
- `frontend/src/components/ui/utilities.test.ts` — the compile guard
- `CLAUDE.md`, `docs/TODO.md`

Nothing under `backend/`. **`npm run api:sync` must not be run**; no contract changes.
`globals.css` is untouched, so `globals.test.ts` stays green — which is the check that no token
was quietly added.

## Steps

### 1. `lib/format.ts`: the month strings

```ts
export function monthOverline(date: Date): string; // 'October 2025'
export function monthLabel(date: Date): string; //    'October'
```

Both through `Intl.DateTimeFormat('en-US', ...)`, matching the hardcoded locale
`formatCurrency` already uses. `format.test.ts` gains a fixed date plus a December case, so a
year-boundary mistake in the overline is caught.

### 2. `lib/session.ts`: the AC5 seam

```ts
export function requireSession(): Promise<void>;
```

Returns `Promise.resolve()`. The doc comment is the deliverable here: it names PET-52, spells
out the four steps above, and says the cookie name is PET-52's to pick.

### 3. `(app)/SidebarNav.tsx`

`'use client'`. Reads `usePathname()`, prefix-maps it onto `SidebarItem`, and renders

```tsx
<div className="sticky top-0 h-screen shrink-0">
  <Sidebar active={active} {...profile} />
</div>
```

Takes `firstName`, `lastName`, `email` as props so the placeholder lives in the Server
Component layout rather than in client code. Keep the href-to-key table in one array so it
cannot drift from `Sidebar`'s `NAV_SECTIONS`.

`SidebarNav.test.tsx` mocks `next/navigation` (`jest.mock`, since jsdom has no router) and
asserts each of the four paths marks the right item `aria-current="page"`, plus that
`/transactions/abc` still marks Transactions.

### 4. `(app)/layout.tsx`

```tsx
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  await requireSession();
  return (
    <div className="flex flex-1">
      <SidebarNav {...PLACEHOLDER_PROFILE} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
```

`flex flex-1` because the root `<body>` is already `flex min-h-full flex-col`. `min-w-0` on the
content column so a wide table later cannot blow the sidebar out. No `<main>` here — each page
owns its own.

### 5. `(app)/PageHeader.tsx`

Props: `overline: string`, `title: string`, `action?: React.ReactNode`.

```tsx
<header className="flex items-center justify-between px-10 pt-7 pb-5">
  <div className="flex flex-col gap-0.75">
    <p className="text-label-m text-text-secondary">{overline}</p>
    <h1 className="text-display-m text-text-primary">{title}</h1>
  </div>
  {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
</header>
```

`<h1>`, which has no Figma counterpart — Figma has no document outline, and this is the one
place in a screen that earns level 1. It also keeps `SectionHeader`'s default `h2` correct
underneath. Presence of `action` is the switch, following `SectionHeader`'s own reasoning about
Figma's inability to model an optional property.

`PageHeader.test.tsx`: the title renders as a level-1 heading, the overline renders, the action
renders when passed, and **nothing extra renders when it is omitted** (the machine-checkable
half of AC2).

### 6. The four routes and the two pills

`MonthPill` (`pl-3.5 pr-3`, trailing `Chevron`) and `SearchPill` (`pl-3 pr-3.5`, leading 16px
magnifier). Both are plain non-interactive `div`s; each carries a comment naming the ticket
that makes it real and, for the month pill, A8/DSH-2.

The magnifier glyph must be **traced from the Figma export of node `26:143`** (16x16), the way
`Sidebar`'s four glyphs and `Button`'s `TrashGlyph` were, re-pointed at `currentColor`. The
asset URL from `get_design_context` expires in ~7 days, so re-fetch it at implementation time
rather than reusing a stale link.

Each page is a Server Component rendering `<PageHeader …>` followed by an empty
`<main className="flex-1 px-10 pb-10" />` with a comment naming the ticket that fills it. The
action per route is exactly the table in the design section above; Settings passes none.

`pages.test.tsx` renders all four page components and asserts overline, title, and the presence
or absence of each action — AC1, AC2 and AC3 in one file.

### 7. Root redirect

`app/page.tsx` becomes `redirect('/dashboard')` from `next/navigation`. The greeting UI, its
`BACKEND_URL` fetch and its `paths['/api/hello']` typing are deleted, which makes the frontend
temporarily call the backend from nowhere. `page.test.tsx` is rewritten to mock
`next/navigation` and assert the target.

### 8. `utilities.test.ts`: extend the compile guard

Not optional — this file is what makes the literal-class convention enforceable. Add every new
hardcoded class, building the final list from the finished code rather than from this plan.
Expected additions: `text-display-m`, `gap-0.75`, `px-10`, `pb-5`, `pb-10`, `py-2.5`, `pl-3.5`,
`pr-3`, `sticky`, `top-0`, `h-screen`.

And **move `bg-surface-card` from `STORY_CHROME` to `HARDCODED`**: the two pills use it in real
code now, which is exactly the `gap-3` precedent the file already records in a comment.

### 9. Storybook

`PageHeader.stories.tsx`, `title: 'Shell/Page header'`, type-only Storybook import (a value
import breaks the Jest smoke test with an opaque ESM error). Four stories — `Dashboard`,
`Transactions`, `Insights`, `Settings` — because those are the four real combinations and the
direct diff against the four Figma nodes. Decorator: a `bg-surface-canvas` frame; add its
classes to `STORY_CHROME`.

`shell.stories.test.tsx` mirrors `ui.stories.test.tsx` but asserts `/^Shell\//`. It must not
import `SidebarNav`, which calls `usePathname()` and has no router under Jest.

### 10. Docs

**CLAUDE.md** needs more than an addition, because deleting the greeting page invalidates
standing claims:

- "What this is" — "Exactly one feature works end to end" is no longer true; the frontend now
  calls the backend from nowhere.
- Architecture, "Frontend to backend data flow" — `page.tsx` is a redirect; the async Server
  Component fetch example is gone. The CORS and `cache: 'no-store'` reasoning still holds for
  what comes next, so reframe rather than delete.
- Shared components — a short shell section: what `(app)/` holds, why `PageHeader` is not a
  `ui/` tile, and the `'use client'` wrapper trap now that it is real code rather than a
  prediction.
- Not yet built — delete "The app shell, and therefore anything that renders the sidebar";
  replace with what is genuinely still missing: the auth redirect is a stub, the footer profile
  is a placeholder, and all four content areas are empty.

**docs/TODO.md** gains, under Deferred by design: the stubbed `requireSession()` and what
PET-52 owes it; the placeholder profile; the inert month and search pills; that the period
label ignores `monthStartDay` until PET-45; the AC3-versus-TRN-1 conflict; and Figma's 18px vs
20px bottom padding as a designer question.

### 11. Correct the Jira issue description

No comment on the issue — edit the **description** of PET-19 in place, so the ticket stops
disagreeing with the design it links to. Three edits, each the smallest change that makes the
text true:

- **AC3**: drop "or Transactions". The month select is Dashboard's alone (DSH-2); Transactions
  has the search input (TRN-1, Figma `26:137`). The Context paragraph's "Dashboard and
  Transactions also show a month select displaying 'October' (DSH-2)" needs the same fix, and
  should name the search input as Transactions' equivalent.
- **AC2 / Context**: add AI Insights' **secondary "Regenerate"** to the list of per-screen
  actions, which currently jumps from "Add transaction" to "none on Settings" and skips it
  (INS-1, Figma `38:542`).
- **AC5**: record that the redirect is deferred to PET-52, which owns the session cookie it
  has to read. Leave the criterion itself intact so it is still tracked, and say where it moved.

Keep the description's existing voice and structure; do not rewrite the ticket.

## Deviations from this plan, as built

Three, all found by running the thing rather than by rereading the plan.

- **The month chevron is not `ui/Select`'s.** The plan proposed exporting `Chevron` from
  `Select.tsx`. Two reasons not to: the designed pill chevron is 9x4.5 (node `21:63`) where
  the form control's is 10x5, and `Select`'s bakes its own absolute positioning into its class
  string, so sharing would have meant a size prop and a positioning prop on a nine-pixel
  arrow. `MonthPill` traces its own, the way `Sidebar` traces its four nav glyphs.
  `Select.tsx` is untouched.
- **The chevron's size is literal pixels, not spacing steps.** 4.5px is `h-1.125`, and
  Tailwind generates nothing for a three-decimal step - it drops the candidate silently.
  `utilities.test.ts` is what caught it, which is the guard doing exactly its job. `h-[4.5px]
  w-[9px]` compiles with no token lookup and is therefore not on the guard's list.
- **`bg-surface-card` did not need moving out of `STORY_CHROME`.** It is already in `EXPECTED`
  via `BUTTON_VARIANTS.secondary`, so the pills' use of it was guarded before this ticket
  touched anything. The guard's header comment was widened to say it now covers `app/(app)/`
  too, rather than a fourth copy of the compile harness being added next to the shell.

## Commits

Branch `feat/PET-19-app-shell-and-page-header`, cut from `main` (PET-18 merged at `33a0281`).
Not stacked — PR #16 (PET-45) is open but PET-19 does not depend on it.

1. `feat(frontend): derive the month overline and label (PET-19)`
2. `feat(frontend): add the app shell with the sidebar mounted (PET-19)`
3. `feat(frontend): add the shared page header (PET-19)`
4. `feat(frontend): add the four routed views and redirect the root (PET-19)`
5. `test(frontend): extend the compile guard to the app shell (PET-19)`
6. `chore(frontend): add a Storybook page for the page header (PET-19)`
7. `docs: document the app shell and the deferred auth redirect (PET-19)`

## Verification

Everything from `frontend/`. No backend command; `npm run api:sync` must **not** run.

1. `npm run lint`
2. `npm test` — new `PageHeader`, `SidebarNav` and `pages` suites, two new `format.test.ts`
   cases, a grown `utilities.test.ts` `it.each`, a rewritten `page.test.tsx`.
   `globals.test.ts` and `Sidebar.test.tsx` must stay green **untouched**: the first proves no
   token was added, the second proves the shell mounts the sidebar without modifying it.
3. `npm run build` — the typecheck gate; there is no separate `typecheck` script.
4. `npm run build-storybook`.
5. `npm run dev`, then in the browser: `/` redirects to `/dashboard`; click all four sidebar
   links and confirm each loads, the highlight and `aria-current` move, and the sidebar and
   header stay in place (AC4). Confirm the header's overline shows the **real current** month,
   not "October 2025" — that is the check that `force-dynamic` is doing its job.
6. `npm run storybook`, **Shell/Page header**, and diff the four stories against Figma nodes
   `21:56`, `26:137`, `38:542`, `40:677`. Check specifically: the 3px gap between overline and
   title, Display/M's negative tracking, the pill borders and 10px corners, and that Settings
   renders no action at all.
7. Tab through a real page and confirm focus order runs sidebar → header action, and that the
   `h1` is the page's only level-1 heading.
8. Grep the diff for `dark:` (none should appear) and for `Expensa` in `frontend/` (none should
   remain).

## Known risks and accepted trade-offs

- **AC5 does not land**, by decision. The shell is unauthenticated until PET-52. Say so in the
  PR description and in the corrected Jira description so a reviewer does not read it as an
  oversight.
- **The sidebar footer shows fabricated data** that happens to be Figma's sample values. It
  looks real in a screenshot. The TODO and the constant's name are the only things stopping
  that from being mistaken for a working profile read.
- **AC3 is satisfied for Dashboard only**, because Figma and TRN-1 both disagree with the
  ticket about Transactions. If the designer sides with the ticket, the fix is passing a
  `MonthPill` into one more header.
- **Deleting the greeting page removes the frontend's only backend call**, so
  `BACKEND_URL` is unused until PET-52 and no frontend test exercises the API contract. The
  generated `src/types/api.d.ts` stays committed and CI's drift gate still runs, so nothing
  rots silently — but the end-to-end proof is gone until the verify page lands.
- **`force-dynamic` opts the whole `(app)` segment out of static rendering** for what is today
  only a date string. It is the right answer once the session read lands; until then it is
  stricter than strictly necessary.
- **The static search pill is a chosen behaviour, not a read one.** TRN-1 describes a real
  search input. Flagging it because it is the one place PET-19 renders something the spec calls
  interactive as something inert.
