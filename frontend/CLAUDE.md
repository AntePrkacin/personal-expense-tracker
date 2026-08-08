# frontend/CLAUDE.md

Guidance for Claude Code inside `frontend/`. Root `CLAUDE.md` carries the rules that hold
everywhere and points here; this file is the authority for everything inside the Next.js app.
Runnable detail lives in the guides: commands in `docs/guides/commands.md`, environment values
in `docs/guides/configuration.md`.

## Design tokens

**daisyUI 5 on Tailwind v4 is the design system as of PET-57**, which retired the hand-rolled
Figma-token layer. `frontend/src/app/globals.css` is now small enough to read in one breath: the
Tailwind import, the daisyUI plugin registering the built-in `light` / `dark` themes selected
automatically from the OS, and the two font tokens. There is no `tailwind.config`; Tailwind v4
is configured CSS-first.

### Figma against daisyUI: the division of authority

**Read this before opening the design file. It is not a preference and it is not negotiable** -
it is the decision PET-57's plan rests on, and every one of its three parts has already been
violated once by somebody working from the design file in good faith.

1. **The Figma Foundations and Components pages are dead. Do not work from them, for anything.**
   Foundations documents the retired token layer - the 19 named type styles, the hand-rolled
   palette, the radius and shadow scales - and Components documents a nine-tile set that no
   longer exists. **daisyUI is the component library.** Whatever either page says about colour,
   type, radius, shadow, spacing or how a control is constructed is superseded, and consulting
   them for any of it is precisely how the token layer returns one class at a time.

   Two things this rule deliberately does **not** ask for, so that it needs no sweep to be true.
   **Existing references to those pages stay.** A comment saying `ui/` mirrors the nine tiles, or
   naming node `18:252` as a story's diff target, is a record of why a file sits where it sits -
   history, not an instruction to go and open the page - and rewriting nine such comments would
   change no behaviour and lose the reasoning. Read them as dated. What the rule forbids
   is **new** work taken from either page, and adding a reference of your own to them.

   **Icon geometry used to be exempt from this rule and is not any more.** The exemption existed
   because daisyUI ships no icon set, so a vector export was the only source for a glyph and two
   files traced theirs from the dead Components page. PET-33 added `lucide-react` and migrated
   every glyph onto it, which is the ticket that exemption was waiting for - so a mark now comes
   from the library, never from a Figma node, and the last reason to open either dead page is
   gone. See the icon-library rule under Shared components below.

2. **On the Screens page the split is exact.** Figma governs **structure, layout and content** -
   what is on the screen, in what order, grouped how, with which words. Stock daisyUI governs
   **colour, type, radius and shadow**. **Never re-theme daisyUI toward Figma's values.**
   Concretely: `globals.css` registers the built-in `light` / `dark` pair and declares two font
   variables, and that is the whole of what it may ever contain - no theme block, no overridden
   `--color-*`, no custom radius or shadow scale. The colour rule below is the same prohibition
   from the other end, because a raw `text-red-600` is re-theming by hand, one element at a time.

3. **Match the frame as closely as those boundaries allow, and build it with the daisyUI
   Blueprint MCP.** Closeness is measured in structure, layout and content; it is never measured
   in hex values, pixel radii or shadow spreads, and a diff against the frame that reports those
   as defects is reporting the design system working. Two standing carve-outs, both already
   exercised across this app: the frames are a fixed 1440px and draw no narrow viewport, so a
   designed fixed width becomes a `max-w-*` ceiling rather than a `w-*`; and where a frame draws
   no state at all - focus, disabled, pending, empty, error - that state is ours to invent, and
   `docs/TODO.md` tracks the sign-offs A19 and A29 owe for the ones already shipped. The MCP's
   three stages earn three different levels of trust, which `docs/agents/claude-tooling.md` sets
   out; do not treat its inspector as an authority over any of the above.

Four rules keep the rest coherent:

- **Theme-aware colour is daisyUI semantic colour, never a raw palette class.** The names are
  `base-100/200/300`, `base-content`, `primary`, `secondary`, `accent`, `neutral`, `info`,
  `success`, `warning` and `error`, each with a `-content` pair for what sits on it. Tailwind's
  full palette is back, so `text-red-600` now compiles and quietly bypasses the theme - the
  exact inversion of the old failure, where a wrong class generated nothing. The compile-time
  check died with the token layer, so this rests on review.

- **Never write a `dark:` variant.** Semantic colours resolve through the active theme, so dark
  mode needs nothing from markup, and a `dark:` override would fight the theme instead of
  following it.

- **Colour modifiers are semantic state, not decoration.** `btn-primary` marks the one
  emphasized action per screen; `btn-error`, `input-error` and `text-error` mark destructive
  actions and invalid state. The three status colours still carry meaning: reaching for one
  because a design asks for that hue says something the interface did not intend.

- **Class strings stay complete literals.** Tailwind's scanner reads source as raw text, so an
  interpolated `bg-${tone}` compiles to nothing with no build error. Variant maps keep whole
  strings per key (`ui/categoryColour.ts` is the pattern), and daisyUI modifiers are literal
  classes in markup.

Typography: the two families load through `next/font/google` in `frontend/src/app/fonts.ts`,
whose variable classes must stay on `<html>` - that is where `:root` resolves, and both
`.storybook/preview.ts` and the root layout apply them. `--font-sans` (Inter) is what Tailwind's
preflight reads as the default body family; `font-display` (Plus Jakarta Sans) is the heading
and wordmark face. Type sizes are Tailwind's own scale (`text-sm`, `text-2xl`); the 19 named
Figma type styles are gone.

**Light and dark both ship**, selected by `prefers-color-scheme` with no theme controller,
deliberately: a controller and automatic prefers-dark must not coexist, or a browser already in
dark mode makes the control switch dark to dark. A visible toggle is deferred and trades away
the automatic behaviour when it lands.

### Changing or adding a theme: the category palette is the guard

**A theme is not a private decision of `globals.css`. It repaints seventeen category colours at
once, and two committed artifacts are what say whether the result is usable.** Read this before
registering a third daisyUI theme, before swapping either of the two that ship, and before any
change that moves what a `--color-*` resolves to.

- `docs/explainers/category-color-palette-preview.html` draws all **seventeen** allowlist tokens
  as the four marks the app really paints them as, with the measured light and dark contrast
  beside each.
- `docs/explainers/category-colors-icons-description-preview.html` draws the **thirteen** seeded
  categories, which is what a real account actually shows.

Both are stock HTML pinned to the installed daisyUI, Tailwind and lucide, so opening one in a
browser is the whole procedure. **Open both under the new theme and satisfy three conditions
before the theme lands.** First, every one of the seventeen tokens has to stay **distinguishable
from every other**, because a picker offering two colours that paint the same is a picker with
sixteen entries and a lie in it - three pairs are already deliberately close (`categoryColour.ts`
names them with their measured ΔE), so a theme that collapses a fourth pair is spending margin
that was already spent. Second, every colour has to stay **visible against `bg-base-100`** as an
8px dot, not merely as a 36px tile: that is the mark a theme change breaks first, and the whole
reason both files draw the small marks at all. Third, every tile's glyph has to stay legible on
its own background, which is what the `-content` pairing buys and what a re-themed palette can
silently take away.

**None of that is checked by anything.** No build, no lint, no Jest run and no CI job reads a
colour, `COLOUR_CONTRAST` is documentation with a type on it rather than a runtime assertion, and
the frontend's exhaustiveness proofs catch a missing _key_ while saying nothing about the value.
So a theme that makes six categories look identical ships entirely green. That is the failure this
guard exists for, and it is the same failure `backend/CLAUDE.md` records for `warning-content`:
the claim "a semantic token is theme-aware and therefore safe" is false, was written down anyway,
and was caught by measuring rather than by reasoning.

**Re-measure rather than reuse the numbers.** Both files carry figures from headless Chromium
against the installed daisyUI, and a new theme invalidates every one of them - `COLOUR_CONTRAST`
in `backend/src/database/central/template-tokens.ts` is where the table lives and where a
re-measurement belongs. Compositing matters: a token carrying an alpha means nothing until it is
painted over the card and the pixel is read, so a check that stops at `getComputedStyle` has not
checked `base-content/50`. And if a theme genuinely cannot carry seventeen distinguishable
colours, the answer is to change the palette in `COLOUR_SEED` and re-run both files, not to ship
the theme and let the categories collide.

## Where daisyUI and Tailwind fight

**Every entry below is a class that is present in the markup and paints nothing**, and not one
of them can fail a build, a lint or a Jest run. That is the same inversion the colour rule above
describes, and it is the whole reason this section exists: under the token layer a wrong class
generated no CSS and the compile harness caught it, and now a wrong class generates CSS that
loses. Each of these cost a review finding on PET-57 or its incorporation, verified against
`frontend/node_modules/daisyui/components/*.css` rather than reasoned about - **read that CSS
when a daisyUI class does not do what its name says**, because the plugin ships the compiled
rules and they answer these questions in one grep.

- **Two modifiers from the same daisyUI component in one class string are resolved by the
  plugin's emission order, not by yours.** They land at equal specificity in the same cascade
  layer, so the later rule in `button.css` wins whatever the attribute says. The worked example
  is `btn-ghost btn-outline`: `.btn-outline` sets `--btn-border` to the button's colour
  and `.btn-ghost` sets it to transparent, ghost is emitted second, and the outline never
  renders - which is how `(app)/DateField.tsx`'s "today" marker was pixel-identical to a plain
  day with `toHaveClass('btn-outline')` green. A **colour** modifier is safe to pair with a
  style one, because `btn-primary` only sets `--btn-color` and `--btn-fg`, which the style
  modifier reads: `btn-outline btn-primary` is the supported combination and is what that file
  uses now. Two style modifiers is the mistake.

- **A daisyUI `:focus` rule sets `--tw-outline-style: none`, and Tailwind's `outline-2` reads
  that variable.** So `focus-visible:outline-2` alone computes to a 2px outline of style `none`
  and there is no focus ring at all - a WCAG 2.4.7 failure that looks correct in the diff, has
  the right colour class beside it, and is invisible to every gate. **Any restored focus ring
  needs `focus-visible:outline-solid` too.** `.link` and `.menu` both do this; assume the next
  component does as well. `ui/Sidebar.tsx` and `app/WelcomeScreen.tsx` are the two call sites,
  and the app currently has no `outline-2` anywhere without its `outline-solid`.

- **daisyUI sets no cursor on a resting `select`, so `cursor-pointer` is not redundant.**
  `select.css` sets `not-allowed` when the control is disabled and `pointer` on an `<option>`
  inside the picker, and nothing else - an enabled select keeps the user agent's arrow and reads
  as inert. `btn` does carry one, which is why this is easy to assume. PET-10 fixed this
  app-wide once; `ui/Select.tsx` holds the constant, and `(app)/DateField.tsx`'s `<button>`
  trigger and the transactions filter pills each state it too.

- **`fieldset` is `display: grid`, so `self-start` on a child does nothing.** The class is a
  one-column `1fr` grid, where the horizontal axis is `justify-self` and `align-self` is the
  block axis - so a label that shrank to its text under a `flex flex-col` parent stretches to
  full width the moment the same markup moves onto `fieldset`, and every click in the invisible
  strip beside the word is forwarded to the control. `ui/FieldShell.tsx` records what that looks
  like on a `<select>` and its suite pins the fix.

- **The `<fieldset>` element is not the `fieldset` class.** The element publishes
  `role="group"`, and daisyUI's own idiom is one of them around a _set_ of fields named by a
  `legend.fieldset-legend`. Wrapping a single control in the element gives every field in the
  app its own nameless group boundary, announced entering and leaving. The class is pure CSS and
  works on a `div`, which is what `ui/FieldShell.tsx` uses.

- **`status` draws a drop shadow from `currentColor`**, and sets `color` to a translucent black
  for exactly that purpose. Handing it a class pair that includes a `text-*-content` half turns
  that shadow into an opaque coloured smudge. This is why `ui/categoryColour.ts` exports
  `CATEGORY_DOT` beside `CATEGORY_TILE`: a `text-*` class is inert on a mark with no content
  only where nothing reads `currentColor`, and a surprising number of daisyUI components do.

- **`modal-box` animates through the `scale` property, which makes it a containing block for
  `position: fixed` descendants.** The one defect of this migration that a browser walk caught
  and nothing else could; `frontend/src/app/CLAUDE.md` owns the account of it, under The app
  shell, along with the `translate-none scale-none` that pays for it.

**The daisyUI Blueprint MCP is this repo's method for writing that markup, and its three stages
earn three different levels of trust** - follow the syntax stage verbatim, adjudicate the quality
inspector's findings rather than applying them, and treat the browser walk as the real output.
`docs/agents/claude-tooling.md` is the single home for all three and for the false positives this
codebase reliably produces; read it before running the server, not after.

**Every trap above was found in a browser and none of them by a gate, so the walk is the check.**
That means headless Chromium over the DevTools protocol, reading computed style and the
accessibility tree - and probing the old classes in the same run, so the check is seen to fail
before it is trusted. Prefer it over anything that drives a human's browser. The method, the four
gotchas (colour arrives as `oklab`, headless starts light, `next/font` needs network, Storybook
does not reach the gated screens) and how to get story ids are all in
`docs/agents/claude-tooling.md`.

## Shared components

`frontend/src/components/CLAUDE.md` is the authority: what earns a file there, the four `ui/`
primitives and two helpers, the six direct children, and the three conventions they follow. It
loads whenever you read a file under `src/components/`, so read it before adding or changing one
rather than reasoning from this file - the bar a wrapper has to clear is the whole reason six
components were deleted in PET-57.

Two rules stated there are reached from outside that folder often enough to name here. **The rule
of three**: duplicate rather than share until a third consumer appears, then lift it into one
owner - `lib/session.ts`'s `authorizedGet` and `components/FormError.tsx` are the two worked
examples. And **tests assert behaviour and semantics, not class strings**, with daisyUI's state
classes the one exception, as the visible half of an aria attribute the same test pins.

**`lucide-react` is the icon library, and there are no hand-traced glyphs left.** Every mark in
the app was a hand-drawn inline `<svg>` with its Figma node id in the comment until PET-33
introduced the dependency and migrated all thirteen. **PET-64 added the one case where a glyph
is chosen at runtime rather than imported at a call site**: a category carries an icon _name_,
and `ui/categoryColour.ts`'s `CATEGORY_ICON` is the static map that turns sixty-four of them into
components - thirteen at PET-64, the rest added by PET-65 so a user naming a category of their own
is not forced to reuse a glyph a seeded category already carries. Reach for that map rather than `lucide-react`'s own barrel - `icons[name]` works and
pulls every glyph the library ships into the bundle - and note the map is keyed by the
contract's published enum, so it is an exhaustiveness proof rather than a lookup table. It is named here rather than in
`frontend/src/components/CLAUDE.md` because routes draw glyphs too - `(app)/layout.tsx`'s
hamburger and `(app)/DateField.tsx`'s month arrows are not components. Import the icon, size it
with a Tailwind `size-*` class, and pass `aria-hidden="true"` **explicitly**: lucide renders a
bare `<svg>` with no ARIA of its own, and several suites assert that attribute on a glyph. Do not
reintroduce a traced SVG for a mark the library already has; the two that legitimately stay
hand-made are `app/icon.svg` (the favicon) and `components/LogoLockup.tsx` (the brand mark, which
must not follow an icon set at all).

Two consequences worth knowing. Lucide is **stroke-based throughout**, so a filled mark is not
available without fighting the library - which is why the sidebar reads lighter than Figma draws
it, and `docs/TODO.md` records that deviation as owing a designer's sign-off. And every icon
carries `'use client'` internally, which costs nothing here: a Server Component may render one
and stays a Server Component, so `ui/Sidebar`, `ui/Button` and `(app)/layout.tsx` all still
render on the server with icons in them.

## The chart library

**Recharts is how a chart is drawn in this app, as of PET-22's retrofit.** Before it, the two
dashboard charts were hand-rolled and PET-22's plan argued that at length for the whole epic; the
reversal and what survives it are in `docs/plans/2026-08-06_PET-22_weekly-spending-trend.md`. The
short version is that the argument was right about one chart and wrong about its scope. Do not
hand-roll a new chart, and do not add a second charting library.

**It is MIT, and the obvious alternative is not.** The daisyUI Blueprint MCP recommends
ApexCharts and its skill guide presents the paid tier as a watermark on a few premium features.
The `LICENSE` in the published package says something else: ApexCharts 6 is dual-licensed on
**organisation revenue**, free only below $2M a year, with a further paid tier for
redistribution. Read a licence out of the tarball before adopting a dependency on a tool's
recommendation, and note the Blueprint server will keep recommending it - `docs/agents/claude-tooling.md`
already sets out which of its stages earn how much trust.

**It is not cheap, and the number is on record so nobody has to guess.** Recharts 3 brings
`@reduxjs/toolkit`, `react-redux`, `immer`, `reselect` and `victory-vendor` (five d3 packages).
Built client chunks went from 879,657 to 1,230,462 bytes on the branch that added it: **+343 KB,
+40%**. The second chart is nearly free and the first was not, which is the whole reason it is
worth using for the second.

Four rules for writing one, each of which cost something to learn:

- **A chart is a client component and the card around it is not.** Recharts measures its own box
  through a `ResizeObserver`, so it cannot render on the server. Push the boundary into the
  smallest wrapper - `(app)/dashboard/TrendChart.tsx` is the pattern - and keep the heading, the
  caption and anything a screen reader needs as server-rendered HTML beside it. This does not
  make the library cheaper in the bundle; it keeps the card's text assertable and available
  before hydration.

- **Colour goes in as `var(--color-*)` on a `fill`, never as a Tailwind class.** `fill` is an SVG
  presentation attribute and a class string is not a valid value for one, so `CATEGORY_DOT`'s
  habit of handing out whole `bg-*` literals does not transfer. A `var()` reference in the
  attribute is resolved by the browser exactly as the class would be, so it follows the theme
  with no JavaScript and needs no `dark:` variant - confirmed by flipping
  `prefers-color-scheme` mid-walk and watching the computed fill change. An alpha is a separate
  `fillOpacity`, and a translucent fill still has to be **composited and measured**, because
  `getComputedStyle` reports it uncomposited.

- **`accessibilityLayer={false}`, explicitly.** It defaults to **`true`** in Recharts 3, and
  declining to enable something is not the same as disabling it. Left alone it puts
  `role="application"` and `tabindex="0"` on the `<svg>`: a tab stop on a card that has no
  keyboard interface, and a role telling assistive technology to leave browse mode and forward
  every key to it. It is worse inside an `aria-hidden` plot, which is the ordinary arrangement
  here, because `aria-hidden` does not remove focusable descendants from the tab order - so the
  default produced an element that was focusable and unannounceable at once. Assert the negative
  in the suite; a comment saying the layer is unused is what shipped the bug.

- **No Jest suite may assert a chart's geometry.** jsdom implements no `ResizeObserver` and runs
  no layout, so `jest.setup.ts` supplies a stub and an invented box just to make the chart render
  at all - and Recharts does not throw without one, it renders nothing and passes every
  assertion that counts elements. Suites assert counts, fills, text and roles. Heights, widths
  and proportions are browser checks, measured with `getBoundingClientRect()` on the laid-out
  nodes.

## Storybook

Storybook keeps three sections: **Components** for `ui/`, **Screens** for the frames, **Shell**
for the app shell's own pieces. **Foundations is gone** with the token layer it documented.
`.storybook/preview.ts` imports `globals.css` and applies the font variable classes, so the
daisyUI plugin registration lands in every story automatically.

It is also the cheapest surface to verify a change on, since every component and screen renders
there with no backend and no session: `docs/agents/claude-tooling.md` covers driving it headlessly,
including the story-id index. The four `(app)` screens are the exception, being behind the session
gate.

## Formatting and dates

`frontend/src/lib/format.ts` owns display formatting, in seven parts. Money: amounts are
stored as positive magnitudes and displayed negative, and the sign is U+2212 MINUS SIGN
rather than the hyphen `Intl.NumberFormat` emits, matching the design. PET-21 added
`formatWhole()` beside it, the `docs/TODO.md` cents item's answer: the design draws every
aggregate figure whole (`"$1,240"`, the dashboard budget card's own readout) while every
per-transaction amount keeps its cents through `formatCurrency`/`formatNegative`, so a
second `Intl` instance at zero fraction digits sits beside the first rather than replacing
it. It **rounds** rather than truncating, which keeps a whole-dollar aggregate as close to
the real total as one dollar allows. Names: `initials()`
and `shortName()` derive the sidebar footer's "MK" and "Marko K." from the two stored name
fields. Both are derived and never stored (SET-2), and SET-6 requires the sidebar footer and
the Settings avatar to agree, which is why one shared function is the point rather than a
convenience. Both take the first character with `Array.from(name)[0]` rather than
`charAt(0)`, which would split an astral-plane character into a lone surrogate. Period:
`monthOverline()` and `monthLabel()` give the page header its "October 2025" and "October",
shared because Dashboard and Transactions draw the identical overline. Both use the calendar
month and therefore ignore the profile's `monthStartDay`, which A9 says defines the period -
that value is PET-45's, and the display is correct for its default of 1. Amount input:
`formatAmountInput()`, `parseAmountInput()` and `amountCaret()` are the currency field as it is
being typed into, and they are deliberately **not** `formatCurrency`. That one goes through
`Intl`, which forces two decimals, rounds, drops a trailing separator and emits a symbol -
every one of which is wrong mid-keystroke, where a user typing `24.` would watch it become
`$24.00` under the caret. So none of the three touches `Number` on the way out, the fraction is
truncated rather than rounded, and the `$` belongs to `Input variant="currency"` instead of to
the string. `formatAmountInput` is **idempotent**, which the controlled input in
`app/setup/BudgetForm.tsx` depends on rather than merely benefits from. Calendar date:
`formatIsoDate()` turns the `YYYY-MM-DD` a transaction is stored under into the "Oct 8, 2025" the
Date field's trigger draws, and it goes through `lib/date.ts`'s `dateFromIso` rather than
`new Date(iso)` - which parses a date-only string as **UTC midnight**, so any zone behind UTC
formats it as the day before. Short calendar date: PET-29 added `formatIsoDayMonth()`, the same
date without its year - the "Oct 8" the transactions table's DATE column draws, where every row
in a period filtered to one month would otherwise repeat it. A second formatter rather than a
slice off the first, because `"Oct 8, 2025".split(',')[0]` is an assumption about a separator
that stops holding the moment the locale does.

**`lib/date.ts` is the other half of that and is deliberately not this file.** It owns the wire
form - today's date, the parts either side of a `YYYY-MM-DD` string, calendar-date arithmetic -
and touches neither `Intl` nor UTC, because a calendar date is a day rather than an instant and
must never follow a locale. That file records the two directions the mistake runs in;
`lib/calendar.ts` builds the picker's month grid on top of it.

All seven parts hard-code `en-US` and its separators, "Today" and "Yesterday" included. When the currency chosen during onboarding
is finally stored, the locale follows it through all of them together; `docs/TODO.md` tracks
that. The one thing that must **not** follow it is `lib/date.ts`, for the reason above.

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

**Relative date is the seventh part, PET-24's `formatRelativeDate(iso, today?)`.** It answers
"Today", "Yesterday", or `formatIsoDayMonth(iso)` beyond that, for the dashboard's
recent-transactions caption. `today` is a parameter with a default rather than a bare clock
read, the same shape `lib/date.ts`'s own helpers take, so "Yesterday" can be pinned in a suite
without faking a timer. It diffs `Date.UTC` of the two dates' parts rather than subtracting the
local `Date`s `dateFromIso` would hand back, because that pair is not always 24 hours apart
across a DST transition. What it cannot answer is whose "today" it is: the default reads the
frontend host's own zone, while every other figure on the page is scoped to a period the
backend resolved through `APP_TIMEZONE`, and `docs/TODO.md` records that gap beside the
per-user timezone item it already owes.

## The screens

The signed-in shell, its four routed views and the access screens outside it are documented in
`frontend/src/app/CLAUDE.md`, which loads whenever you read a file under `src/app/`. Read it
before touching a route, a layout or the session gate: two of the seams there are deliberate
stubs, and the session gate's one-read shape is load-bearing.

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

**`npm run build` is the typecheck for shipped code, but it does not reach `*.test.ts(x)`.**
Root `CLAUDE.md` states the short rule; this is the exception to know. `tsconfig.json` includes
every `.tsx` in the project, so a test file with a type error is in scope on paper - and yet
`next build` passes with one, because Next typechecks the module graph its routes actually pull
in and nothing imports a test. PET-12 found this the direct way: an exclusive-union prop was
being violated in four places in one suite while `build`, `lint` and `test` were all green,
because Jest transpiles without checking types and the build never looked. **`npx tsc --noEmit`
from `frontend/` is what covers them.** Reach for it after changing a prop type, a discriminated
union or anything a test constructs by hand; CI does not.

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **A visible theme toggle.** There is no `theme-controller` anywhere, so nothing in markup may
  assume one: adding it trades the automatic `prefers-color-scheme` selection away rather than
  sitting beside it. `docs/TODO.md` carries why, per the conventions table's rule that a gap list
  holds the warning and points at the reasoning.
- **The `/api/chat` route handler.** The env template deliberately declares no model-provider
  key. Add whichever variable your provider needs when you build the route, server-side only and
  never behind `NEXT_PUBLIC_`. Note this is not the repo's _first_ route handler -
  `app/auth/verify/route.ts` is, and it is the one to copy the shape from.
- **The shell's content.** The `(app)` group, the four routes and the page header exist, every
  screen renders its designed header, and the shell is really gated and really shows the signed-in
  user's profile as of PET-52. What is missing is everything below the header on **one** of the
  four: the Settings `<main>` is empty. AI Insights was the other until PET-42-43-44, which fills
  it with frames 14, 15 and 16 off the one `state` its read carries - so read the sentence that
  named two as dated. Dashboard is no longer one of
  them as of PET-21: its `<main>` is a grid holding the real Monthly budget card, PET-22 filled
  the second, the weekly spending trend chart, PET-23 the third, the spending-by-category donut,
  PET-24 the fourth, the recent transactions card, and PET-25 the fifth and last, the AI insight
  teaser - so Dashboard is a **complete** screen too, the same word this list uses for
  Transactions below. Transactions is the exception that came before it, and as of
  PET-29 it is a **complete** screen
  rather than a partial one: the tab bar
  and its real count badge, both empty states, the filter bar and the table are all built, and the
  two slots PET-30 left are filled by `page.tsx`. They are still slots rather than direct imports,
  because both need reads the screen cannot make and Storybook has to be able to hand it
  stand-ins. The search field is a real `<input>` now and the three filter selects are real
  `<select>`s; what stays inert there is the Dashboard's month select (A8 wants a designed control
  first) and **both transactions tabs**, because "Categories" opens frame 13, which is PET-36's
  route with no `page.tsx` behind it. Every "Add transaction" button is real as of PET-31, and as
  of PET-29 a save finally shows its effect in the list rather than only in the badge - unless the
  date is backdated out of the current period, which the period select can now go and find.
  What the transactions screen still does not do is **navigate**: a row click opens nothing,
  which is PET-34's detail page, drawn and deliberately inoperable the same way the inert tabs
  are. **The kebab is live as of PET-33** and no longer belongs on that list: it opens a real
  popover menu whose "Delete" really deletes. The one thing still inert inside it is "Edit",
  which renders `menu-disabled` with `aria-disabled` because PET-32's edit modal does not
  exist - a different claim from the drawn-but-dead controls around it, since this one says so.
  **PET-32 built that modal, so nothing in the menu is inert any more**: "Edit" is a real button
  opening frame 11 prefilled from the row, and the `menu-disabled` and `aria-disabled` above are
  gone with it. A **row click** is now the only dead affordance left on the screen, which makes it
  the one a reviewer is most likely to try; it is PET-34's.
  **PET-34 built it, and the screen has no dead affordance left.** The merchant cell links to
  `/transactions/[id]`, the app's first dynamic route. Read the sentence above as history - though
  "a row click" stays literally true of the other four cells, because the link is on the merchant
  alone for the accessible-name reason `frontend/src/app/CLAUDE.md` records.
  **PET-36 made both tabs real, so the "stays inert" list above is down to the Dashboard's month
  select alone.** `/transactions/categories` exists, both labels are `next/link`s carrying
  `aria-current`, and the badge on each tab now reads a real count - so the sentence naming "both
  transactions tabs" is history. What that ticket adds to _this_ list is smaller and of the same
  kind: its card kebab and its "Add category" header button are drawn and not yet operable,
  belonging to PET-39 and PET-37, and unlike every inert control before them they announce
  `aria-disabled` rather than staying silent. The Categories screen is otherwise complete - it
  reads its own data and renders every state the contract can hand it, the uncapped card included.
- **Every read a screen needs for its own data, bar the transactions list, the dashboard summary
  and the categories.** PET-52 ended the "nothing reads at all" era: `lib/session.ts` calls
  `GET /api/auth/session` and `lib/profile.ts` calls `GET /api/profile`, both lifting the session
  cookie into an `Authorization` header server-side. PET-30 added the third, `lib/transactions.ts`,
  and it is the first read a _screen_ makes for its own data - so it, rather than the two access
  reads, is the one to copy: it shows the classified-failure policy, and it shows what to do when
  the API's answer is ambiguous. PET-31 added `lib/categories.ts`, narrowed to what a picker needs.
  PET-21 added `lib/dashboard.ts`'s `readDashboard()`, the same two-branch failure policy as
  `lib/profile.ts` beside it - deliberately, since the shell already read the profile through the
  same guard a moment earlier - and no probe: the endpoint takes no filters at all, so there is no
  ambiguous-empty case for a second request to resolve. All five now go through `authorizedGet` in
  `lib/session.ts`, which is where the cookie becomes a bearer token; do not inline a sixth copy of
  that. PET-34's `lib/transactionDetail.ts` took the transaction _detail_ **and** the
  categories' month stats off this list together, in one request: `GET /api/transactions/:id`
  embeds the whole `CategoryResponseDto`, caps included, so the narrowing above is intact and
  `lib/categories.ts` was not widened. PET-42-43-44 added `lib/insights.ts`, which is the first to
  export **two** reads over one endpoint for two callers rather than two projections for two
  screens: `readInsights` returns `AuthorizedResult` and `requireInsights` redirects on top of it,
  because the Server Component must redirect a dead session and the route handler serving the
  browser's poll must never - a `redirect()` there answers a `fetch` with an HTML login page
  carrying a 200. It is also the read to copy for a **404**, which is the
  app's third failure policy - `authorizedGet` grew a `missing` arm so a deleted transaction calls
  `notFound()` instead of throwing like an unreachable backend. No other read's endpoint answers
  404, so the five above are unchanged.
  `lib/categories.ts` now holds **two** projections over one shared request: `readCategoryOptions`
  for the modal's `<select>`, and PET-29's `readCategoryLabels`, which adds `color` because a
  transaction row carries only a `categoryId` and the table joins the name and the tile colour
  onto it. A screen wanting a cap or a spend widens the right one or adds a third; do not open
  either up, since the point of the narrowing is that a cap and a month's spend never reach a
  browser bundle drawing neither. PET-64 added `icon` to the **wide** one only, for that exact
  reason: the table's tile draws the category's own glyph now, and the `<select>` draws neither
  tile nor glyph.
  **PET-64 also added the app's first unauthenticated read**, `lib/categoryTemplates.ts`, and it
  is the one that goes through none of the above. Onboarding step 2 runs before an account
  exists, so there is no cookie for `authorizedGet` to lift and no 401 to classify; it calls the
  `@Public()` `GET /api/templates/categories` directly. Its failure policy is a **third** one:
  it degrades to an empty list rather than throwing, because the chips are a selection on a step
  whose Continue is unconditional (A4), so an unreachable backend costs the user their starter
  categories rather than the whole onboarding flow. Do not copy that policy to a read that _is_
  the content of its screen - `lib/transactions.ts` is right to throw. Note that module deliberately **never redirects** - its
  route-handler caller would be handed an HTML login page with a 200 on it - so a Server
  Component using it applies the 401 policy at the call site, which
  `app/(app)/transactions/page.tsx` is the worked example of.
- **Every write except creating, editing and deleting a transaction.** PET-31 is the app's first authenticated write:
  `lib/createTransaction.ts` is a Server Action over `authorizedPost` in `lib/session.ts`, the
  write half of `authorizedGet` and the second thing to reuse rather than re-derive. Two of its
  decisions generalise to the writes still to come. It **surfaces the status on rejection** where
  the read helper collapses everything non-401 into `unavailable`, because 400, 404 and 401 need
  three different messages from a form and one of them must not say "try again". And it **does not
  parse the created row**: a 2xx whose body will not parse still means the write landed, so
  reporting failure there would have the user create a duplicate. PET-33 added the second,
  `lib/deleteTransaction.ts` over a new `authorizedDelete`, which is where to see what
  generalises: it reuses `AuthorizedWriteResult` rather than growing a shape of its own, and it
  publishes **three** reasons where the create publishes four, because a 400 there is a body the
  user can fix and a 400 here is only a malformed id. Editing and every category and profile
  write are still unbuilt.
  PET-32 added the third, `lib/updateTransaction.ts` over a new `authorizedPatch`, and it is the
  one whose classification generalises furthest: it publishes **five** reasons where the create
  publishes four and the delete three, because `PATCH /api/transactions/:id` answers 404 for a
  missing transaction **and** for a missing category and distinguishes them only in the message
  text. It splits them on whether the body it sent carried a `categoryId`, which is a fact the
  caller already has - rather than matching backend error prose, which nothing pins across the two
  apps. Its other reusable half is the **diffed body**: `(app)/transactionForm.ts`'s
  `toUpdateTransactionBody` sends only the fields that changed, `null` to clear a note, and an
  empty object when nothing did - which the caller must treat as "close without asking", because
  the endpoint rejects an empty patch. PET-42-43-44 added the fourth, `lib/generateInsights.ts`,
  and its classification is the shortest of the four for a reason worth copying: a **409 is
  reported as `ok`**. The single-run guard answers it when another tab, or a transaction the user
  just saved, already started a run - so the thing the button was pressed for is already happening,
  and the caller's next move is identical either way. A failure taxonomy is for failures the caller
  would do something different about. Every **category and profile** write is still unbuilt.
