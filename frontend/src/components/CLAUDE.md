# frontend/src/components/CLAUDE.md

Guidance for Claude Code inside `frontend/src/components/`: the shared components themselves.
This file is the authority for what earns a file here, what each existing one owns, and the
conventions they all follow.

It does not repeat the design system. `frontend/CLAUDE.md` owns the daisyUI theme, the Figma
boundary and the cascade traps, and it loads alongside this file, so read it before writing any
class: theme-aware colour is daisyUI semantic colour only, the Foundations and Components pages
of the design file are dead, and a wrong daisyUI class now compiles and loses rather than
compiling to nothing.

This file exists because `frontend/CLAUDE.md` passed 400 lines when the PET-57 review landed,
which is the promotion trigger `docs/agents/conventions.md` sets - and it names this file as the
candidate it had been holding in reserve. It is one directory deeper, so it loads only when the
work is actually in a component.

## What earns a file here

**daisyUI is the component library now.** A screen reaches for daisyUI classes directly, and a
local component earns a file only when it carries real logic or genuinely shared behaviour.
PET-57 deleted `Tag`, `ProgressBar`, `Stat`, `SectionHeader` and `ListRow` - story-only or
single-decorative-use wrappers around what daisyUI ships as `badge`, `progress`, `stat` and
`list` - and `Field`; the identical half of what the two field components absorbed is regrouped
in `ui/FieldShell`, which is smaller than `Field` was. When a view finally needs a
stat row or a transaction list, write the daisyUI classes in place rather than resurrecting a
wrapper; the ticket that needs shared behaviour can extract one then.

**The rule of three is this repo's, and `docs/TODO.md` is not where it lives.** Duplicate rather
than share until a third consumer appears, then lift it into one owner. `lib/session.ts`'s
`authorizedGet` is one worked example, extracted when `lib/transactions.ts` became its
third caller; that file used to cite the deleted `ui/utilities.test.ts` for the rule, which is
why it is written down here instead. `FormError` below is the other. The trigger counts
consumers, not lines - `FormError` is five tokens - because what duplication costs is the drift
between copies, and its four copies had already drifted in their comments before they drifted in
their markup.

## The `ui/` primitives

`frontend/src/components/ui/` keeps four primitives and two helpers, each owning behaviour:

- **`ui/Button` either navigates or acts, never both.** Its props are an exclusive union: pass
  `href` and it renders a `next/link`, otherwise a `<button>` with `type` (defaulting to
  `button`, not HTML's `submit`), `disabled` and `onClick`. The `never`s are load-bearing - an
  anchor cannot be disabled by author styles, so `<Button href disabled>` would look dimmed and
  still navigate - and `npm run build`, the typecheck gate, is what rejects the combination.

- **`ui/Input` and `ui/Select` own the field pattern, on the shell `ui/FieldShell` renders for
  both**: the `fieldset` / `label` pair and the inline `text-error` message are the shell's one
  copy, and each control keeps its own `aria-invalid` / `aria-describedby` wiring, pointed at
  the shell's `fieldErrorId`. The shell also puts an `id` on its label, because a `<button>`
  trigger (the modal's Date field) is named from its own subtree under HTML-AAM and needs
  `aria-labelledby` to reach the label at all. daisyUI's `validator` class is deliberately
  unused: it colours from the HTML validation API, and every form here is `noValidate` with
  controlled messages. `id` is a required prop because `useId()` is a hook and would force
  `'use client'` onto the field layer. There is deliberately no `type="number"` - the currency variant would
  render spinners and discard a half-typed `24.` mid-keystroke; `inputMode="decimal"` gets the
  numeric keypad without either problem.

- **The shell wears daisyUI's `fieldset` class on a `div`, and its label is
  `justify-self-start`.** Both are bug fixes rather than taste, both were review findings, and
  both are counter-intuitive enough to re-derive wrongly: the element publishes a nameless
  `role="group"` around every field in the app, and the class is a one-column grid where
  `self-start` does nothing at all. `frontend/CLAUDE.md`'s Where daisyUI and Tailwind fight is
  the single home for the mechanism; `ui/FieldShell.tsx` carries the rest.

- **`ui/Sidebar` takes its active item as a prop**, not a `usePathname()` call, which keeps it a
  Server Component; the `(app)` shell's thin `'use client'` wrapper (`SidebarNav`) reads the
  pathname. `SIDEBAR_HREFS` is the single declaration of the four app routes and the contract
  the route folders match. The panel is `bg-neutral`, daisyUI's always-dark slot, so it stays
  dark in both themes the way the design draws it. Its collapse lives in the layout, not here:
  the `(app)` shell wraps everything in a daisyUI `drawer` that is fixed open at `lg` and
  off-canvas behind a hamburger below it. Its one optional handler prop, `onNavigate`, exists
  for that drawer: the pathname effect that used to close it cannot see a click on the section
  already open, and only a client parent may pass a function.

- **`ui/categoryColour.ts` holds three maps and three lookups, and which one you want depends on
  what is being painted.** `CATEGORY_TILE` (background plus its `-content` half) for an icon tile,
  `CATEGORY_DOT` (background alone) for a mark with no content on it, and `CATEGORY_FILL`
  (`var(--color-*)` strings) for an **SVG `fill`**, which PET-23's donut slices are. The third
  exists because a Tailwind class is not a valid value for a presentation attribute: `fill="bg-error"`
  paints nothing at all, with no error anywhere. Each has a `categoryTileClass` / `categoryDotClass`
  / `categoryFillVar` lookup taking a stored hex, all three carrying the same `Object.hasOwn` guard
  and uppercase normalisation, and all three falling back to a neutral grey. The suite pins
  the three maps against each other, so a ninth colour added to one and not the others fails there
  rather than leaving a hole in a ring.
  **Two neutral greys, not one, and the review of PET-23 is why.** The tile keeps `base-300`; the
  dot and the fill are `base-content/50`, which is the same colour written twice (Tailwind's `/50`
  compiles to the `color-mix` the fill spells out). The split is whether anything is drawn on top:
  a tile carries a glyph and reads as a shape whatever its background does, while a legend dot and
  a donut slice are bare colour, and `base-300` is the theme's _empty-surface_ token - measured in
  a browser at **1.157:1** in light and **1.115:1** in dark against a `bg-base-100` card, the same
  near-invisibility PET-22 rejected for the trend chart's muted bars. It matters here rather than
  being a nicety because the backend's orphan fold routes real money into that slice, so an
  invisible one is the donut's ring failing to close by another route. The replacement measures
  **3.401:1** light and **4.769:1** dark through the same harness.

- **`ui/categoryColour.ts` maps the eight stored colour words onto theme colours**,
  nearest-match and lossy on purpose: orange and yellow both land on `warning`, accepted because
  category colours are decoration. The colour words are the stable identity the category rows
  and the picker use; only the rendered hue follows the theme. Do not "fix" the collision by
  reaching for a raw palette value. It exports the tile **and** `CATEGORY_DOT`, the background
  without its `-content` half, because daisyUI's `status` draws a shadow from `currentColor` -
  a tile value turns that shadow into an opaque smudge, and its suite pins the two maps
  together so they cannot drift.

## The direct children

`components/` has six direct children. Four belong to the access screens: `LogoLockup.tsx`
(the accent tile and wordmark), `AccessCard.tsx` (the centred column and `card` box, with an
`aboveCard` slot the onboarding step indicator drops into), and `ResendLink.tsx` with
`LogInAgain.tsx`, the recovery controls. The fifth is `EmptyState.tsx` and the sixth
`FormError.tsx`, both documented below. Each is shared by more screens
than one route segment holds, which is why they are neither in `ui/` nor beside a route.

**`components/EmptyState.tsx` is the fifth direct child, and it arrived before its second
consumer rather than after.** `AccessCard` above records the usual sequence: chrome lives beside
one route until a second screen turns out to draw the identical box, then moves. This one skipped
the wait because the second consumer is already measurable in the design file - frame 07
Transactions (node `45:1044`) and frame 16 AI Insights (node `39:665`) are the same card, same
72px accent-soft circle, same heading, same 440px body, same primary button, differing only in
glyph and copy, and DSH-7 describes the same shape a third time inside the dashboard's
recent-list card. Waiting for PET-44 to prove what PET-30 could already see would have bought a
move commit and nothing else. It takes `icon`, `heading`, `body`, an optional `action` and a
`headingLevel`, defaulting to 2 because `PageHeader` owns the page's `h1`. Its box is stock
daisyUI - Figma's raw 16px radius and shadowless card stopped binding when PET-57 handed radius
and shadow to the theme - and the one deliberate deviation from the frame is `max-w-110` where
it fixes 440px: identical at the designed 1440 width, and a narrower window wraps instead of
overflowing the card's padding, the same call `AccessCard` makes about a viewport Figma never
draws.

The sixth is **`components/FormError.tsx`, the form-level error line, and it is the worked
example of the rule of three** stated above. It renders one `role="alert"` line in the
same `text-error text-sm` treatment `ui/FieldShell` gives a field message, and renders nothing
when its message is absent, so a call site passes state straight through with no ternary. What
earns it a file is arithmetic rather than taste: the identical five tokens stood in
`app/login/LoginForm.tsx`, `app/setup/register/RegisterForm.tsx` and twice in
`app/(app)/AddTransactionModal.tsx`, each with its own paragraph explaining the same
`role="alert"` decision and each rewritten independently during PET-57 - four copies of a
three-copy trigger. `components/ResendLink.tsx` deliberately does **not** use it: that one
switches between `role="alert"` and `role="status"` over three treatments, and a component with
a politeness prop would be a worse answer than two files.

## Conventions

Three conventions, all of which existing files demonstrate:

- **Tests and stories are colocated**, `Button.tsx` next to `Button.test.tsx` and
  `Button.stories.tsx`. Do not "tidy" them into `__tests__/` or `stories/` trees.

- **Files are flat inside `ui/`**, no folder per component and no barrel `index.ts`.

- **Components stay Server Components.** `ResendLink` is the one exception - it holds its
  request's pending and confirmation state, and `frontend/src/app/CLAUDE.md` names it screen
  24's one client boundary. Everything else takes handler props without the directive; a client
  component that imports one pulls it into the client bundle on its own, so only add the
  directive when a component genuinely needs the client itself.

Tests assert behaviour and semantics, not class strings. The daisyUI state classes
(`menu-active`, `input-error`) are the one exception, as the visible half of an aria attribute
the same test pins. The old compile-pinning suites (`globals.test.ts`, `utilities.test.ts`) are
gone with the token system they guarded. Where a class **is** the behaviour - an outline that
paints, a label that does not stretch - the assertion needs its negative beside it, because the
losing class is still in the attribute and a bare `toHaveClass` passes over a defect.

## Not built here

`frontend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in a component. That list is the single home, so
nothing is restated here.

The one trap to carry into every file in this directory: **this folder is smaller than the
design file implies, and deliberately.** Six components were deleted in PET-57, and their
absence is not a gap to fill - `badge`, `progress`, `stat` and `list` are daisyUI classes a
screen writes in place. Before adding a wrapper, check it clears the bar at the top of this
file, because the ones that did not are the ones that got deleted.
