# PET-74: The Expensa daisyUI theme pair, and the guard that prices it

Jira: [PET-74](https://decode.atlassian.net/browse/PET-74) · Amends:
[PET-57](https://decode.atlassian.net/browse/PET-57) (its "a stock daisyUI theme is active"
criterion, and nothing else of it) · Token sources: the pre-PET-57 `globals.css`
(`git show 4b4e055^:frontend/src/app/globals.css`) and the team's Claude Design "Expensa Design
System" project (`components/fig-tokens.css`, `tokens/colors.css`, `tokens/elevation.css`)

Branched from `main` as `feat/PET-74-expensa-daisyui-theme`, deliberately not stacked: nothing
open touches `globals.css`.

## Why

PET-57 retired the hand-rolled Figma token layer for stock daisyUI, and shipping the stock
`light`/`dark` pair was the right first move: it bought responsiveness, dark mode and a component
library for the price of the look. The product owner has now judged the look's half of that trade:
the drift between the running app and the design sources (the Figma Foundations page and Claude
Design) in colour, radius and border treatment is not acceptable, and the fix is a custom theme
pair authored from the design tokens. This is a deliberate amendment of one PET-57 decision, made
with the trade-off in view, not a regression toward the token layer: daisyUI stays the component
library, semantic colour classes stay the only theme-aware colour, and no bespoke component
returns.

**Scope is theme-only, by the product owner's explicit choice.** A daisyUI theme reaches colours,
radii, border width and the depth/noise effects. It cannot reach the ~40 `shadow-*` utilities in
markup (Claude Design is "a hairline system, not a shadow system"), per-element type sizes and
spacing, or how components open and animate. Those three are recorded as deferred follow-ups in
`docs/TODO.md` by this ticket, each a candidate ticket of its own.

## The sources agree, and nobody has to open the dead Figma pages

`frontend/CLAUDE.md` declares the Figma Foundations page dead and forbids new work taken from it.
That rule survives this ticket intact, because the token values come from two places that are not
that page: the pre-PET-57 `globals.css`, which transcribed every Foundations value from the Figma
variables and is recoverable at `git show 4b4e055^:frontend/src/app/globals.css`, and the Claude
Design project's generated `components/fig-tokens.css`, which carries the same values from the
same variables. The two were compared value for value during the exploration that produced this
ticket and disagree nowhere.

**Claude Design is the token authority for this work**, the same ruling PET-47 recorded for the
budget field. It matters where it is a superset of Figma: the `.fig` is "Light mode; dark-ready"
and authors no dark theme, while Claude Design's `tokens/colors.css` composes one from tokens the
file already defines (the Surface/Ink ramp and the Text/On Dark ramp), and that composition is
what `expensa-dark` is built from. Figma remains the authority for screen structure, layout and
content exactly as today.

## The mapping

Both themes are `@plugin "daisyui/theme"` blocks in `frontend/src/app/globals.css`:
`expensa-light` with `--default` and `color-scheme: light`, `expensa-dark` with `--prefersdark`
and `color-scheme: dark`. OS-based selection is untouched and no theme controller is added, so
the no-toggle rule and its reasoning stand.

The rows that map cleanly, light theme:

| daisyUI slot | Value | Source token |
| --- | --- | --- |
| `base-100` | `#ffffff` | Surface/Card |
| `base-200` | `#f5f7f8` | Surface/Canvas |
| `base-300` | `#edeff2` | Surface/Muted |
| `base-content` | `#131820` | Text/Primary |
| `primary` | `#4f46e5` | Brand/Accent |
| `neutral` | `#101720` | Surface/Ink (the sidebar) |
| `success` / `warning` / `error` | `#16a34a` / `#e0a020` / `#dc2626` | the Status ramp |
| `--radius-field` / `--radius-box` / `--radius-selector` | 12px / 16px / 8px | Radius md / lg / sm |
| `--border` | 1px | the hairline system |
| `--depth` / `--noise` | 0 / 0 | ditto |

Dark theme, from Claude Design's `[data-theme="dark"]` composition: `base-100` is Surface/Ink
Raised `#18202b` (the card), `base-200` is Surface/Ink `#101720` (the canvas), `base-300` is
Surface/Ink Elevated `#232c38` (the muted step), `base-content` from the Text/On Dark ramp, and
the status bases keep their hues with their text steps lightened as that file specifies
(`#7FD096` / `#E7C24A` / `#F0908F`).

## The judgement calls, named before they are made

Four slots have no clean source row, and each is a decision this plan assigns to measurement
rather than to taste. Final values land as comments in `globals.css` beside the block.

1. **The `-content` pairs cannot be plain white.** Figma's Text/On Accent is `#ffffff`, but the
   17-token category allowlist in `ui/categoryColour.ts` includes eight `-content` tokens as
   picker swatches in their own right: several identical whites would collide with each other,
   and any near-white fails the 8px-dot-on-`base-100` condition outright. So the content pairs
   take tinted values, sourced where possible from ramps Figma already defines (the Status `-text`
   steps `#15803d` / `#b4820e` / `#b91c1c`; Text/On Dark Muted `#b4bcc9` for `neutral-content`),
   and the explainer measurement is the arbiter of every one.
2. **`info`, `secondary` and `accent` do not exist in the sources**, and all three are picker
   colours among the 17, so they need real, mutually distinct hues rather than indigo variants.
   The candidate source is Figma's own Category ramp: `info` from Category/Blue `#3f8ee6`,
   `accent` from Category/Teal `#34b9ae`, `secondary` from Category/Pink `#ce6fb8`. Invented
   slots, so they join the designer sign-off ledger in `docs/TODO.md`.
3. **Dark `primary` has a tension daisyUI cannot express.** Claude Design keeps backgrounds on
   the full indigo in dark while lightening accent *text* to `#A79FF6`; daisyUI has one `primary`
   token serving both. The candidates are keeping `#4f46e5` (buttons match Claude Design, and
   every `text-primary`-on-base usage must then be found and measured) or lightening the token
   (text passes everywhere, buttons drift lighter than Claude Design's). Decided during
   implementation by enumerating the `text-primary` / `link-primary` call sites and measuring,
   and recorded with the block.
4. **Dark `neutral`** is whatever keeps the sidebar legible when the canvas around it is already
   ink: Surface/Ink Elevated `#232c38` is the candidate.

## The guard is the price, and it is paid in full

`frontend/CLAUDE.md`'s "Changing or adding a theme: the category palette is the guard" section
was written for exactly this ticket and is the governing procedure. Nothing automated checks any
of it: no build, lint or Jest run reads a colour, so a theme that collapses six categories ships
green. The three conditions, under **both** new themes: all 17 allowlist tokens mutually
distinguishable, every colour visible against `bg-base-100` as an 8px dot, every tile glyph
legible on its own background. `docs/explainers/category-color-palette-preview.html` and
`docs/explainers/category-colors-icons-description-preview.html` are the two instruments, and
three pairs are already deliberately close, so there is no margin to spend.

Consequences the guard forces:

- **`COLOUR_CONTRAST` in `backend/src/database/central/template-tokens.ts` is re-measured and
  rewritten**, by compositing over the card and reading the painted pixel, never by
  `getComputedStyle`, because `base-content/50` carries an alpha. This is the ticket's one
  backend touch; no request or response body changes, so `npm run api:sync` is deliberately not
  run.
- **If seventeen distinguishable colours cannot be carried, the escape hatch is `COLOUR_SEED`**,
  never shipping the collision. Budgeted for rather than hoped against.
- **Two measured figures in `frontend/CLAUDE.md` go stale by definition**: the trend chart's
  muted `base-content/20` (1.527:1 light, 1.876:1 dark) and the donut's fallback
  `base-content/50` (3.401:1, 4.769:1) were measured against the stock themes. Both are
  re-measured through the same compositing harness and the docs corrected.

## What else moves

- **`globals.css`'s header comment** currently promises the file registers the built-ins and
  nothing more; it is rewritten to record this decision and its token authority.
- **`frontend/CLAUDE.md`** is amended in place: the Figma-boundary rule 2 ("never re-theme
  daisyUI toward Figma's values", "no theme block ever") records PET-74 as the decision that
  superseded it, and the guard section's measured figures are refreshed. Corrections happen in
  the sentences that made the claims, per the conventions file.
- **Root `CLAUDE.md`** says the interface is "built on a stock daisyUI design system", which
  stops being true; the sentence is corrected. A sweep for other "stock daisyUI" claims
  (`rg -in --hidden "stock daisyui" -g '!node_modules' -g '!.git/**'`) decides whether any other
  file needs the same one-line correction.
- **`docs/TODO.md`** gains the three deferred follow-ups (hairline cards, the type/spacing pass,
  component behaviours) and the invented-slot sign-offs.
- **Tests are expected to survive**: PET-57 reworked the suites to assert behaviour and roles
  rather than class strings, and a theme changes values behind `var(--color-*)`, not classes.
  Storybook inherits the theme through its `globals.css` import. Any suite that does break is
  asserting a colour and gets fixed toward behaviour, not toward the new value.

## Tasks

- [ ] Branch `feat/PET-74-expensa-daisyui-theme` off `main`, commit this plan alone, push, open a
      draft PR with this checklist in the body
- [ ] Author `expensa-light` in `frontend/src/app/globals.css` from the mapping table, replacing
      the stock pair; rewrite the file's header comment
- [ ] Author `expensa-dark` from Claude Design's dark composition, `color-scheme: dark`
- [ ] Settle the four judgement calls (content pairs, `info`/`secondary`/`accent`, dark
      `primary`, dark `neutral`) by composited measurement, and record each with its reasoning
      beside the theme blocks
- [ ] Open both category explainer files under both themes; verify the guard's three conditions;
      iterate token values, or `COLOUR_SEED` per the escape hatch, until they pass
- [ ] Re-measure and rewrite `COLOUR_CONTRAST` in
      `backend/src/database/central/template-tokens.ts` for both themes; `npm run build` in
      `backend/`
- [ ] Re-measure the two chart tones (`base-content/20`, `base-content/50`) and correct the
      figures `frontend/CLAUDE.md` records for them
- [ ] Browser walk of the built app and Storybook under both themes per
      `docs/agents/claude-tooling.md`, probing the known traps (focus rings, the progress track,
      the tab underline) rather than only eyeballing
- [ ] `npm run lint`, `npm run test`, `npm run build` and `npm run build-storybook` in
      `frontend/`; fix any suite that turns out to assert a colour
- [ ] Amend `frontend/CLAUDE.md` (rule 2 and the guard figures), root `CLAUDE.md`'s "stock
      daisyUI" sentence, and run the "stock daisyui" sweep for stragglers
- [ ] Update `docs/TODO.md`: three deferred follow-ups plus the invented-slot sign-offs;
      `npm run docs:check`

## What this deliberately does not do

- **No markup shadow changes.** The `shadow-*` utilities stay; the hairline-card treatment is a
  follow-up ticket.
- **No type or spacing pass.** Tailwind's scale stays; the fonts already match.
- **No component behaviour overrides.** How a modal opens or a popover anchors is daisyUI's and
  the platform's, and fighting the plugin's CSS is the wrong tool for that complaint.
- **No category picker palette change.** The 16 offered colours are admin-managed rows in the
  central database (`COLOUR_SEED`); this ticket changes what the 17 semantic tokens resolve to,
  and touches the seed only if the guard forces it.
- **No theme toggle.** The `--default` / `--prefersdark` pair preserves the automatic selection;
  the toggle stays on `docs/TODO.md`'s list with its reasoning intact. **Amended by the addendum
  below**, which the product owner folded in after this plan shipped: a three-way
  System / Light / Dark control whose `system` arm keeps the automatic selection.
- **No `api:sync`.** Nothing a request or response body is made of changes.

## Addendum: the theme switcher (2026-08-10, same branch by the product owner's decision)

The product owner folded a second deliverable into PET-74 rather than opening a ticket: the
Settings Preferences card gains a **Theme** control - System / Light / Dark - built the way the
Claude Design system's `SettingsScreen.jsx` draws it (`ThemeSegmented`): a row below the card's
inset rule, "Theme" over a per-selection hint line on the left ("Follows your device setting." /
"Always the light palette." / "Always the dark palette."), and a pill segmented control on the
right whose selected segment lifts on a card-coloured pill. Three decisions were the product
owner's, asked rather than assumed:

- **Persistence is a cookie**, `spendifico.theme`, readable by the server so the page arrives
  already themed with no flash; per-browser rather than per-account, and no backend or contract
  change. Not httpOnly, because the control writes it client-side.
- **It applies instantly on click**, as the design draws. The page-level "Save changes" keeps
  governing only the profile fields, and the control deliberately does not freeze while a save
  is in flight, because no part of it travels in the PATCH.
- **Same branch and same ticket**, because the control sets `data-theme` to the Expensa theme
  names and PR #87 is where those exist.

The mechanism: `lib/theme.ts` owns the pref union, the cookie name and the pref-to-theme-name
mapping, React-free so server and client both import it. The root layout reads the cookie and
stamps `data-theme` on `<html>` when the pref is not `system`; daisyUI's own emission does the
rest, because `expensa-dark`'s prefers-dark media selector is `:root:not([data-theme])`, so an
explicit choice suppresses the automatic one by construction and `system` restores it by removing
the attribute. The control is native radios (arrow keys and a single tab stop for free, the same
native-first argument `Modal` and the popovers make), visually the design's segmented pill mapped
to semantic classes.

**This closes the "no theme controller" doctrine rather than violating it.** The rule existed
because a two-way toggle and automatic prefers-dark cannot coexist; the three-way control's
`system` arm is the coexistence. The `## Not built here` bullet, the `docs/TODO.md` entry and the
no-controller sentences in `globals.css` and `docs/agents/claude-tooling.md` all close together.

**One regression this addendum catches and fixes**: `app/DecorativePanel.tsx` pins its art with
`data-theme="light"`, which stopped matching any registered theme the moment the stock pair went -
silently, since the panel simply follows the page theme instead. It becomes
`data-theme="expensa-light"`.

### Addendum tasks

- [ ] `lib/theme.ts`: the `ThemePref` union, `parseThemePref`, `THEME_COOKIE`, `themeAttribute`
- [ ] The root layout reads the cookie and stamps `data-theme` on `<html>`
- [ ] `settings/ThemeField.tsx`: the segmented radiogroup, applying instantly (attribute plus
      cookie)
- [ ] Thread `themePref` from `settings/page.tsx` through the screen and form into the card
- [ ] Fix `DecorativePanel`'s dead `data-theme="light"` pin
- [ ] ThemeField suite and story; update the Settings suites and stories for the new prop
- [ ] Close the toggle deferral across the docs; update the Jira ticket and the PR body
- [ ] Gates, plus a headless check that the attribute really flips the painted theme

## Second addendum: the sidebar is Claude Design's card panel (2026-08-10)

Reported by the product owner from a dark-mode walk: the sidebar and the app background painted
identically. The diagnosis overturned an assumption this plan restated - the mapping table's
"Surface/Ink (the sidebar)" and the dark theme block's ink-on-ink comment both took the Figma
frames' dark sidebar as the design, and the Expensa dark canvas *is* ink, so the panel dissolved
into it. The design project's own `components/navigation/Sidebar.jsx` draws the opposite:
`--bg-card` with a 1px `--line-default` right border **in both themes**, the active item on a
`--bg-muted` pill with a `--brand-accent` glyph. Asked rather than assumed, the product owner
chose to match it fully - which changes light mode visibly too, retiring the dark ink sidebar.

So `ui/Sidebar.tsx` is `bg-base-100 border-base-300 border-r` now: white on the light canvas,
raised ink on the dark one, the hairline separating it either way; the active pill is `base-300`
in heading ink, the glyph's colour splits from the label's (`GLYPH_STATE`, accent when active),
the footer avatar sits on the muted tile, and the focus rings moved to `outline-primary`, since
a `neutral-content` ring is invisible on a card. **No theme value moved**, which is the part
worth noticing: the fix retires the shell's use of `bg-neutral` rather than re-picking dark
`neutral`, so the 17-token guard is untouched and `neutral` stays the picker's "Ink" and the
Welcome panel's ground.

### Second addendum tasks

- [ ] Restyle `ui/Sidebar.tsx` to the Claude Design panel (container, item states, glyphs,
      footer)
- [ ] Amend the docs that called the sidebar dark (`components/CLAUDE.md`,
      `frontend/src/app/CLAUDE.md`, the `globals.css` neutral comments)
- [ ] Gates, plus a headless measure of panel-against-canvas separation in both themes
