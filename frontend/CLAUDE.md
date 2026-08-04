# frontend/CLAUDE.md

Guidance for Claude Code inside `frontend/`. Root `CLAUDE.md` carries the rules that hold
everywhere and points here; this file is the authority for everything inside the Next.js app.
Runnable detail lives in the guides: commands in `docs/guides/commands.md`, environment values
in `docs/guides/configuration.md`.

Read Design tokens before you write a single class. Tailwind's own palette and type scale are
cleared, so `text-red-600` and `text-4xl` generate no CSS, fail no build, and look exactly like
a class that did nothing.

## Design tokens

`frontend/src/app/globals.css` is the single source of truth for the design system and
mirrors the Figma **Foundations** page. Tailwind v4 is configured CSS-first, so there is
no `tailwind.config` to look for. Read the stylesheet before styling anything.

**Tailwind's own palette and type scale are cleared** (`--color-*: initial`,
`--text-*: initial`). This is the load-bearing decision: `text-red-600`, `bg-zinc-100`
and `text-4xl` genuinely do not exist and generate no CSS. Because Tailwind drops
unknown utilities silently rather than erroring, a class that appears to do nothing is
usually a class that is not in the design. Use the tokens (`text-body-m`,
`bg-status-danger-soft`, `text-text-secondary`) or add one to the theme.

Colour tokens are group-prefixed to match the Figma groups: `brand-*`, `surface-*`,
`text-*`, `border-*`, `status-*`, `category-*`. This is why you write
`text-text-primary` and `border-border-default`; the stutter is deliberate.

Each `status-*` group carries three values and they are not interchangeable: the bare name
is the fill (`status-danger`, `#dc2626`), `-text` is the darker one to set type in
(`status-danger-text`, `#b91c1c`), and `-soft` is the tint to sit that type on
(`status-danger-soft`). Red type therefore takes `text-status-danger-text`, not
`text-status-danger`. Note also that the three status colours carry meaning - danger means an
error or an over-budget condition - so reaching for one purely because a design asks for that
hue says something the interface did not intend.

**The 19 type styles are `@utility` blocks, not `--text-*` tokens**, because a type
style has to carry its font-family and the compiler only accepts `--line-height`,
`--letter-spacing` and `--font-weight` as paired suffixes on a `--text-*` token.

**The spacing scale is Tailwind's, not a redeclared Figma one.** The `--spacing`
namespace also drives `w-*`, `h-*`, `size-*`, `inset-*` and `translate-*`, so overriding
it would silently delete every sizing key not explicitly listed. The Figma mapping
(`Space/16` = 16px = `p-4`) is documented in `globals.css`.

Two smaller traps. `--radius-full` is ignored by the compiler, so Radius/Full is
Tailwind's built-in `rounded-full`; and clearing `--radius-*` also removes the bare
`rounded` utility, so use `rounded-md` explicitly.

**Only light mode is designed.** No dark theme ships, and `dark:` variants should not be
added. Note that Tailwind cannot make `dark:` a build error, so this rests on review.

The two typefaces load through `next/font/google` in `frontend/src/app/fonts.ts`. That
module exists separately from `layout.tsx` so `.storybook/preview.ts` can import the same
loaders. The variable classes must land on `<html>`, which is where `:root` resolves.

`npm test` runs `frontend/src/app/globals.test.ts`, which both asserts every documented
value and compiles the stylesheet through Tailwind's own `compile()` to confirm each
utility actually generates. `npm run storybook` renders the whole system under
**Foundations** for diffing against Figma.

## Shared components

`frontend/src/components/ui/` holds the design-system primitives, mirroring the Figma
**Components** page. **Every tile on that page now has a component**: `Button`, `Input`,
`Select`, `Tag`, `ProgressBar`, `Stat`, `SectionHeader`, `ListRow` and `Sidebar`.
`npm run storybook` renders them under **Components**. The library is complete; a new
component from here on is a feature's own, not a tile.

**Shared UI is split by role, not by file type.** `components/ui/` is the primitive layer,
the vocabulary every screen draws from. Components that only make sense for one feature go
in `components/` beside it, or next to the route that uses them. Nothing has earned a
feature folder yet, so `ui/` is currently the only child - the app shell's own components
took the second option and live under `app/(app)/`, described below.

The Storybook section is still called **Components** while the folder is `ui/`. That
mismatch is deliberate: `ui/` says where the code lives, **Components** is the Figma page
name, and the stories exist to be diffed against it.

Five conventions, all of which existing files demonstrate:

- **Tests and stories are colocated**, `Tag.tsx` next to `Tag.test.tsx` and
  `Tag.stories.tsx`. Do not "tidy" them into `__tests__/` or `stories/` trees. Parallel
  trees make a rename touch three directories, and they hide the one signal worth having
  at a glance: a component with no test file beside it.
- **Files are flat inside `ui/`**, not a folder per component. Alphabetical sort already
  groups a component with its satellites, and it keeps imports at `@/components/ui/Tag`
  rather than a stuttering `.../Tag/Tag` or nine files all named `index.tsx`. Promote one
  component to its own folder when it first needs private sub-parts; a mixed directory is
  fine. There is no barrel `index.ts` and adding one is not an improvement.
- **Variant classes come from a `Record<Variant, string>` holding complete literal class
  strings** (`TAG_TONES`, `CATEGORY_TILE`, `BUTTON_VARIANTS`, `INPUT_VARIANTS`,
  `FIELD_CONTROL_BORDER`), interpolated into a template literal. This is
  not style preference. Tailwind's scanner reads these files as raw text, so a class built
  by interpolation (`bg-category-${n}`) is found by nobody and compiles to nothing, with
  no build error and no failing test. There are no `clsx` / `cva` style dependencies and
  none are needed.
- **`src/components/ui/utilities.test.ts` compiles every one of those classes** through
  Tailwind and fails if any generates no CSS. It is what makes the point above enforceable
  rather than a rule people remember. Add new class maps to it.
- **Components stay Server Components.** None of them carry `'use client'`, because none
  holds state. `Button`, `Input` and `Select` accept handler props without it: a client
  component that imports one pulls it into the client bundle on its own, and only a Server
  Component trying to pass a function would break. Only add the directive when a component
  genuinely needs the client itself.

**Form fields go through `ui/Field.tsx`.** `Input` and `Select` are both built on it, and
it owns the label, the inline validation message, and the `aria-invalid` /
`aria-describedby` wiring between them. Build a new control on it rather than repeating the
pattern; that is what keeps every form in the app reporting errors identically. Two things
about it look like friction and are not: `id` is a **required** prop, because `useId()` is a
hook and generating one would force `'use client'` onto the whole field layer; and each
state-dependent colour comes from its own `Record` (`FIELD_CONTROL_SURFACE` for the fill,
`FIELD_CONTROL_BORDER` for the border) rather than being appended conditionally, because
`border-border-strong` and `border-status-danger` have equal specificity, so emitting both
makes the winner depend on stylesheet order. Classes carrying a variant prefix
(`focus-within:`, `disabled:`) are exempt, since the extra pseudo-class settles it.

**Padding sits on the control, never on the bordered box.** Both `Input` and `Select` put it
on the `<input>` / `<select>`, and `Input`'s `$` prefix and `Select`'s chevron are absolutely
positioned over the control with `pointer-events-none`. A padded box turns its own 14-16px
band into a dead zone where a click places no caret and opens no list.

**Five details of the form components have no Figma counterpart.** They were chosen, not
read, so do not "correct" them without asking the designer:

- **The inline error pattern** - red border plus one line of `text-body-s
text-status-danger-text`, no icon. Assumption A29 records that no form error visual exists
  anywhere in the file.
- **The disabled button dimming** (`disabled:opacity-60`). Frame 15 draws the in-flight
  "Generating..." button identically to a resting secondary one, so the design says only the
  label changes (A26). A control that looks enabled while it is not is a defect, hence the
  addition.
- **The disabled field fill** (`bg-surface-muted` plus `text-text-tertiary`). No disabled
  field is drawn anywhere in the file, and it cannot simply be left out: author styles beat
  the user agent's own disabled treatment, so an undecorated disabled field is
  pixel-identical to an editable one.
- **The forced-colors focus outline** on the field box. Windows High Contrast forces every
  border colour to one system colour, so the designed accent border cannot signal focus
  there. The outline is scoped to `forced-colors:` alone, so normal rendering still matches
  Figma exactly.
- **The currency field at rest.** The 1.5px `brand-accent` border is treated as the _focus_
  style, which is what the ticket and spec BUD-3 assert, but Figma only ever draws it on the
  currency amount field and never draws that field unfocused. Its 1px resting border is
  inferred from the plain Input tile. Focus also keeps that accent border on an _invalid_
  field rather than holding the red: invalidity is still carried by the message and by
  `aria-invalid`, and a 0.5px width change is too little focus signal to see.

**`ui/Sidebar.tsx` takes its active item as a prop, and that has a consequence for whoever
mounts it.** `active` is one of four keys matching the Figma variant property, not a
`usePathname()` call, which is what keeps the component a Server Component like the rest of
`ui/`. But an App Router layout cannot read the pathname on the server, so the `(app)` shell
needs a thin `'use client'` wrapper that calls `usePathname()` and passes `active` down;
reading it inside the sidebar instead would force `'use client'` onto the whole component and
break `ui.stories.test.tsx`, which renders every story under Jest with no router in context.
The four hrefs (`/dashboard`, `/transactions`, `/insights`, `/settings`) are declared in that
file's `NAV_SECTIONS` and are the contract the routing ticket has to match.

It is also the **first and only consumer of the six dark-surface tokens** (`surface-ink`,
`-ink-raised`, `-ink-elevated`, `text-on-dark`, `-on-dark-subtle`), which had shipped unused
since the Foundations work. `text-on-dark-muted` is now the one Foundations colour with no
consumer at all.

**Four more details have no Figma counterpart**, on top of the five form ones above:

- **The sidebar's white focus ring** (`focus-visible:outline-white`), where every other
  component uses `focus-visible:outline-brand-accent`. No sidebar focus state is drawn, and
  the accent on `surface-ink` is too dark to read as one.
- **The truncating footer name and email.** Figma clips inside a fixed 260px column because
  it only ever draws the short sample address; `min-w-0` plus `truncate` is the honest
  equivalent, the same pattern `ListRow` uses for a long merchant name.
- **`rounded-[10px]` on the logo tile and the nav pills**, the one place a literal beats a
  token. Figma bound that corner to a raw 10px rather than a radius variable, and the scale
  offers only 8 and 12. Worth a designer answer; until then the literal matches the design.
- **The wordmark reads "Spendifico", not Figma's "Expensa".** The rename was decided on
  2026-08-02 and this is its most visible string. PET-51 finished it everywhere in the repo,
  so the design file is the only holdout left; `docs/TODO.md` records that, and the one
  constraint the rename leaves on any future change to the per-user database naming.

`frontend/src/lib/format.ts` owns display formatting, in three halves. Money: amounts are
stored as positive magnitudes and displayed negative, and the sign is U+2212 MINUS SIGN
rather than the hyphen `Intl.NumberFormat` emits, matching the design. Names: `initials()`
and `shortName()` derive the sidebar footer's "MK" and "Marko K." from the two stored name
fields. Both are derived and never stored (SET-2), and SET-6 requires the sidebar footer and
the Settings avatar to agree, which is why one shared function is the point rather than a
convenience. Both take the first character with `Array.from(name)[0]` rather than
`charAt(0)`, which would split an astral-plane character into a lone surrogate. Period:
`monthOverline()` and `monthLabel()` give the page header its "October 2025" and "October",
shared because Dashboard and Transactions draw the identical overline. Both use the calendar
month and therefore ignore the profile's `monthStartDay`, which A9 says defines the period -
that value is PET-45's, and the display is correct for its default of 1.

## The app shell

`frontend/src/app/(app)/` is the shell every signed-in screen renders inside: the fixed dark
sidebar beside a content column, with the four routed views `/dashboard`, `/transactions`,
`/insights` and `/settings` under it. A **route group**, so the paths stay exactly the hrefs
`ui/Sidebar` declares while sharing one layout; the access screens (01, 02, 03, 22, 23, 24)
sit outside it and inherit none of it.

**`PageHeader` and `SidebarNav` live here rather than in `components/ui/`, deliberately.**
`ui/` mirrors the nine tiles on the Figma Components page and is complete, and neither of
these is a tile - they are the shell's own. The visible consequence is that `PageHeader`'s
stories are filed under **Shell**, not **Components**, so they cannot join
`ui.stories.test.tsx` (which asserts every module's title starts with `Components/`);
`(app)/shell.stories.test.tsx` is the third copy of that smoke test for them. Their
hard-coded classes are still guarded by `ui/utilities.test.ts`, because a _fourth_ copy of
the Tailwind compile harness was worse than one list covering both folders.

**`SidebarNav` is the shell's only `'use client'` file, and it exists for exactly one
reason.** `Sidebar` takes `active` as a prop so it can stay a Server Component, and an App
Router layout cannot read the pathname on the server, so something has to call
`usePathname()`. It matches by **prefix with a trailing-slash boundary**, so
`/transactions/abc` keeps Transactions lit while `/settings-import` does not light Settings.

Two details of it are testability decisions rather than style, and both were review findings:

- **`matchItem()` returns `SidebarItem | undefined` and the caller supplies the fallback.**
  With `?? 'dashboard'` inside the function, `matchItem('/dashboard') === 'dashboard'` could
  not fail - a completely broken lookup returns `'dashboard'` too - so the app's landing route
  was the one case with no real coverage. The fallback now lives in `SidebarNav`, where a
  separate test covers it.
- **`SIDEBAR_HREFS` in `ui/Sidebar.tsx` is the single declaration of the four routes.** It is
  exported for the same reason `SIDEBAR_ITEMS` is. Those hrefs previously existed as four
  hand-written copies (the component, its test, `SidebarNav`, its test), each asserting itself
  against itself, so none could notice a divergence. The fifth copy is the one code cannot
  hold: the route directories on disk. `SidebarNav.test.tsx` therefore checks with `fs` that
  every href has a `page.tsx` behind it, because renaming a folder is otherwise invisible to
  the whole suite while the link 404s.

**The header owns the overline, the title and a slot - nothing else.** Each route passes its
own action, because all four differ: Dashboard a month select plus primary "Add transaction",
Transactions a **search field** plus the same button, AI Insights a **secondary**
"Regenerate", and Settings nothing at all. Two consequences worth knowing. The tickets that
eventually make those controls work never touch `PageHeader`. And CTG-1's "Add category",
which swaps in on the Categories tab, needs no header change either.

Two things about that list contradict PET-19's own acceptance criteria, and the design won
both times: **AC3 claimed the month select appears on Transactions too** (TRN-1 and node
`26:137` draw a search field there instead), and **the ticket never mentioned "Regenerate"**
(INS-1 and node `38:542` both do). The Jira description was corrected rather than the code.

**The month select and the search field are inert `div`s, not controls.** A8 says the select
renders the current period and does nothing until month navigation is designed, and the
search filters a list that does not exist until PET-28. Neither is a `<select>`, `<input>` or
`<button>`, so neither announces itself as operable, and `(app)/pages.test.tsx` pins that -
`queryByRole('combobox')` and `queryByRole('textbox')` both have to stay empty.

**`export const dynamic = 'force-dynamic'` on the layout is load-bearing today.** The pages
read `new Date()` for the overline; without it Next prerenders them and every screen shows
whatever month the build ran in, a bug that only appears a month after deploying. PET-52's
`cookies()` read makes the segment dynamic on its own, at which point the line becomes
redundant and should be deleted rather than left as a claim about nothing.

`(app)/layout.test.tsx` asserts both that export and that `requireSession()` is called, because
the layout is three lines long and every one of them fails silently when deleted. The session
call is the sharper of the two: it is a documented no-op today, so without the assertion the
call site could be dropped with the suite green, and PET-52's deferral would quietly become an
omission.

**Two Jest traps come from the parentheses in `(app)`, and both report as something else.**
`jest.mock('@/lib/session')` from inside that directory fails with `Cannot find module`, because
Jest's resolver mishandles the parens when applying the `@/` alias mapping - a plain `import`
through the same alias works, which is what makes it confusing. Use a relative specifier in
`jest.mock` there. The same character broke the pre-commit hook; see `docs/CONTRIBUTING.md`.

**`/` is a bare `redirect('/dashboard')`.** No frame in the design corresponds to it: VER-4
lands both a new and a returning account on the Dashboard, and a signed-out visitor belongs
in the access flow, which the shell's own session check sends them to. It is here rather than
in a middleware matcher so the rule has one home.

**`lib/session.ts` is a stub, and that is PET-19's deferral of AC5.** `requireSession()` is
called once, by the `(app)` layout, and currently lets every request through, so the shell is
browsable with no backend. Its doc comment is the specification PET-52 fills in: read the
httpOnly cookie, lift it into `Authorization: Bearer <token>`, call `GET /api/auth/session`,
redirect on 401 or absence. It deliberately does **not** name the cookie, because that name
is not decided anywhere in the repo and choosing it here would hand PET-52 a contract it did
not pick. It returns `Promise<void>` from a non-`async` function so the signature is already
the real one.

**The sidebar footer's profile is fabricated.** `PLACEHOLDER_PROFILE` in `(app)/layout.tsx`
is Figma's own sample data ("Marko", "Kovač", "marko@email.com"), so the shell diffs against
the design rather than against invented copy - which also means it looks entirely real in a
screenshot. It cannot be fixed here: names live in the per-user database's `profile` row and
the email on the central `users` row, so it needs PET-45's read reached with PET-52's cookie.
`ui/Sidebar` itself stays clean; its test pins that those three strings appear nowhere in the
component.

## Environment

`BACKEND_URL` (default `http://localhost:3000`) is the only variable this app reads, from
`frontend/.env.local`, and `docs/guides/configuration.md` is its single home. One rule about it
is inline in root `CLAUDE.md` because breaking it cannot be undone:

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately
has no prefix because it is read server-side only; a `NEXT_PUBLIC_` variable is inlined
into the browser bundle and is therefore public forever.

## The frontend's half of CI

The frontend's `build-storybook` step is not redundant with `build`: `tsconfig.json`
includes `.storybook/**` and the story files, so `next build` already typechecks them.
The extra step catches what typechecking cannot, such as a broken framework option or a
CSS import that no longer resolves.

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **The `/api/chat` route handler.** No route handler exists, and the env template deliberately
  declares no model-provider key. Add whichever variable your provider needs when you build the
  route, server-side only and never behind `NEXT_PUBLIC_`. Related: `@google/genai` was once
  present in `frontend/node_modules` while absent from `package.json`, so a clean install
  removes it. Declare any SDK properly rather than relying on a leftover install.
- **The shell's content, and its authentication.** The `(app)` group, the four routes and the
  page header exist and every screen renders its designed header. What is missing is everything
  below the header - all four `<main>` elements are empty - plus the two things the shell fakes:
  `requireSession()` lets every request through (PET-52), and the sidebar footer shows
  `PLACEHOLDER_PROFILE` rather than a real profile (PET-45 reached with PET-52's cookie). The
  month select and the search field are drawn but inert by design.
- **Any call to the backend at all, which is the single biggest gap.** **Nothing in
  `frontend/src` fetches the backend**: no verify page, no session cookie, no reads. The backend
  half is complete, so what is missing is this side. The session cookie is the frontend's own
  httpOnly first-party one, forwarded server-side; the backend reads no cookies, and the
  cookie's name is still undecided. Everything above inherits from this.
