# PET-79: The brand and theming pass, and the guard that finally runs itself

Jira: [PET-79](https://decode.atlassian.net/browse/PET-79) · Follows:
[PET-74](https://decode.atlassian.net/browse/PET-74) (the Expensa theme pair and its Settings
theme control), [PET-64](https://decode.atlassian.net/browse/PET-64) (the central template
tables and the seventeen-token colour allowlist),
[PET-57](https://decode.atlassian.net/browse/PET-57) (daisyUI as the design system)

Branched from `main` as `feat/PET-79-brand-and-theming-pass`, deliberately not stacked: nothing
open touches `globals.css`, `lib/theme.ts` or either logo call site.

## Why

PET-74 authored the Expensa light and dark pair from the design tokens and stopped there on
purpose, leaving three gaps recorded in `docs/TODO.md`. Its addendum added the app's one theme
control, a three-way System / Light / Dark segmented row on the Settings Preferences card. That
control is real and it works; what it cannot do is offer a *choice of themes*, because there are
only two and they are the same theme in two casts.

This ticket does five things. It replaces the brand mark, which is currently a text glyph in a
tile and is drawn twice from two hand-copied sources. It audits the type usage that PET-57 left
as ad-hoc Tailwind scale steps. It reviews the two shipped themes. It turns the segmented row
into a real theme picker. And it registers three daisyUI stock themes beside the Expensa pair,
taking the app from two themes to five.

**The last of those is the one with teeth**, and the reason is a constraint nobody would guess
from the outside: this app uses all eight daisyUI `-content` tokens as *category colours*, on top
of their real job as text-on-colour values. A stock theme has no reason to keep those eight
distinguishable from each other, and mostly does not.

## What was measured before this plan existed

`frontend/CLAUDE.md` states that nothing automated checks any of the colour guard, and that a
theme which makes six categories look identical "ships entirely green". That is still true, so
the numbers below came from throwaway probes written during planning, calibrated against the two
collisions the repo already documents.

**Calibration first.** Measuring the Expensa pair reproduced exactly the two pairs
`categoryColour.ts` names, at exactly the ΔE it names them at: 0.020 for
`primary-content`/`secondary-content` (Education / Travel) and 0.060 for
`accent-content`/`success-content` (Personal care / Gifts). A probe that reproduces the known
answer is a probe whose unknown answers are worth reading.

**Then all thirty-five stock themes.** Every single one collides. Counting pairs of the sixteen
semantic category tokens falling under the repo's own 0.10 ΔE floor: the best are `aqua` and
`abyss` at 4, stock `light` and `dark` at 5, and it runs to `lemonade` at 32. Expensa sits at 2.
The cause is structural rather than incidental: stock themes set several `-content` slots to one
near-white or near-black, because text on a coloured button is all they were ever for.

**The product owner's list was then measured and cut.** `wireframe` has twelve exact-duplicate
pairs at ΔE 0.000 and reduces the sixteen tokens to six colours, which is not a defect but its
design intent as daisyUI's low-fidelity mockup theme. `silk` collapses `primary`, `secondary`,
`accent` and `neutral` into one colour, so its own picker swatch row would read as four circles.
`caramellatte` sets `secondary-content`, `accent-content`, `info-content` and `success-content`
to one identical value. `bumblebee`, `synthwave`, `cmyk` and `pastel` were dropped as weaker on
the same two measures.

**The three that ship are `abyss`, `light` and `dark`**, beside `expensa-light` and
`expensa-dark`.

## The rule stays word for word, and that decides the approach

`frontend/CLAUDE.md` says: "if a theme genuinely cannot carry seventeen distinguishable colours,
the answer is to change the palette in `COLOUR_SEED` and re-run both files, not to ship the theme
and let the categories collide." The product owner ruled that this sentence is not amended, and
separately that `COLOUR_SEED` is not to be changed, on the grounds that every category also
carries its own icon.

Those two rulings together rule out both of the escape hatches the rule itself offers, so the
third path is the one taken: **override the small number of colliding token values inside the
stock themes.** Nothing is amended, no seeded category moves, and the picker still offers every
colour it offers today.

Two facts make that cheap rather than expensive. `error-content` ("Maroon") is already
`enabled: false` in `COLOUR_SEED`, so only sixteen tokens must stay mutually distinguishable.
And **two of the collisions in stock `light` and `dark` are the exact two pairs Expensa already
ships knowingly**, so they introduce nothing new and need no override. Excluding those, the
minimum override set per theme is:

| Theme | New colliding pairs | Minimum overrides |
| --- | --- | --- |
| `expensa-light` | 0 | 0 |
| `expensa-dark` | 0 | 0 |
| `abyss` | 4 | 3 |
| `light` | 3 | 2 |
| `dark` | 3 | 2 |

**Seven values across three themes.** The Expensa pair reporting zero is the second calibration:
its only collisions are precisely the grandfathered ones.

**Which token to override is a choice, and it is made on visual impact.** A minimum vertex cover
is rarely unique, so the cover is steered onto `-content` tokens wherever a same-sized one exists,
because those paint text on a coloured surface rather than the surface itself. For `abyss` that
means `secondary-content`, `info-content` and `success-content` rather than a cover touching
`neutral`, which is a visible surface in that theme. For `light` and `dark` the cover is
`neutral-content` plus one of `accent`/`success`, and `accent` is chosen because `success` is
semantically load-bearing here: it is the budget banding's "on track" colour.

Every override still owes the thing a `-content` value exists for, which is legibility on its own
base colour. That is a contrast measurement, not a judgement, and the guard measures it.

## The guard becomes a gate

The product owner asked for a guard tool rather than a report, and this is where the ticket pays
for itself. Today the entire procedure is a human opening two HTML files per theme and looking,
and five explainer files restate the theme values in their own `<style>` blocks with nothing
checking the copies. At five themes the manual version is ten browser walks per change.

- `frontend/src/lib/themeGuard.ts` holds the pure measurement: parse the `@plugin
  'daisyui/theme'` blocks from `globals.css` and the `[data-theme=...]` blocks from the installed
  `daisyui/themes.css`, convert hex and `oklch()` alike to OKLab, composite `base-content/50`
  over the card, and report per theme the colliding pairs, the WCAG contrast of every token
  against `base-100`, and each `-content` value's contrast against its own base.
- `frontend/src/lib/themeGuard.test.ts` is the gate. It fails on any colliding pair that is not
  one of the two grandfathered ones, on any token below the 3:1 non-text floor against the card,
  and on any `-content` token that has stopped being legible on its base. The grandfathered pairs
  are named in one exported constant, so widening the exception is a visible diff and never an
  accident.
- The same module checks the remaining `docs/explainers/` `<style>` blocks against `globals.css`,
  which closes the gap `docs/TODO.md` records as belonging "with the next theme edit if not
  sooner". This is that edit. It is **three** blocks rather than the five that exist today, because
  two of the five are merged into one generated page - see the merge section below, which also
  explains why the parse lives here once and reaches the page as committed JSON.
- A `npm run theme:report` script prints the tables for a human deciding whether a candidate
  theme can join at all, which is the reporting half.

**It measures values, not painted pixels, and that limit is recorded rather than hidden.**
`frontend/CLAUDE.md` requires composited pixel reads because a token carrying an alpha means
nothing until painted. The arithmetic is exact for authored values, which is why PET-74 already
computed from the hexes and used the browser only to cross-check. The browser walk stays in the
checklist for that reason, and the test is what stops a regression between walks.

`COLOUR_CONTRAST` in `backend/src/database/central/template-tokens.ts` is regenerated from the
tool's output for all five themes. It is a code constant rather than seed data, so **the central
template seed is not touched by this ticket at all** and the manual per-environment seeding step
that a `COLOUR_SEED` change would need does not apply.

## The picker

The three-way segmented row is replaced in place, on the Preferences card, by a grid of
single-select buttons following the onboarding category picker's pattern
(`app/setup/categories/CategoryChip.tsx`). Six tiles: **Automatic** first, then one per
registered theme. Selecting one applies immediately, exactly as today.

**Each tile previews its own theme by wearing it.** A tile carries `data-theme="<name>"` on its
own wrapper, so the eight circles inside it (`primary`, `secondary`, `accent`, `neutral`, `info`,
`success`, `warning`, `error`) paint that theme's real values through the same semantic classes
the app uses. No hex is hardcoded, and a theme edit updates every swatch for free. The Automatic
tile carries no attribute, which is what that arm means.

Everything PET-74 decided about the mechanism survives unchanged, because all of it was right:
`lib/theme.ts` stays the sole owner of the union, the cookie and the mapping, and touches neither
React nor `next/headers`; the choice applies instantly and never travels in the page's PATCH;
the server stamps `data-theme` in the root layout so a reload arrives already themed; an unknown
cookie value reads as `system`; and the control stays a native radio group under the skin, so
roving focus and arrow keys come from the platform rather than from a `role` we would then owe
behaviour for.

Two things do change. The union stops being `system | light | dark` and becomes `system` plus the
registered theme names, so `themeAttribute` becomes a lookup rather than two branches. And that
creates one **deliberate collision worth writing down**: the cookie value `light` currently means
`expensa-light`, and after this ticket it means the stock `light` theme. Nobody's stored
preference is migrated, because there are no real users and test accounts are purged; a browser
holding the old cookie silently lands on a different theme, once.

`expensa-light` keeps `default: true` and `expensa-dark` keeps `--prefersdark`, so a first visit
still follows the OS between the two Expensa casts. That is what the Automatic tile selects, and
it is unchanged behaviour.

## The logo

`components/LogoLockup.tsx` and `components/ui/Sidebar.tsx` each draw the mark independently.
Both render a `primary` tile carrying U+20B5 CEDI SIGN as a **text glyph**, which depends on Plus
Jakarta Sans resolving and has no fallback that looks right. LogoLockup's own comment records
that unifying the two was deferred because it needs a `size` and a `tone` pair, and names this as
the ticket that would do it.

One component, two props, both call sites, and a real asset in place of the glyph. The supplied
SVG becomes the mark; `frontend/src/app/icon.svg` is the existing favicon by Next's file
convention and is replaced from the same source, so the tab and the shell agree. The app has no
`public/` directory and this does not add one unless an `apple-icon` needs the PNG.

**The wordmark stays "Spendifico".** The design file still says "Expensa", `Sidebar.test.tsx`
pins the string so it cannot be half-reverted, and `docs/TODO.md` records the divergence. Nothing
here reverts toward the design.

### The supplied artwork, and what is superseded

The product owner supplied `SPENDIFICO_LOGO` and `SPENDIFICO_ICON` as SVG and PNG, kept at
`docs/explainers/assets/logo/`. The mark is a rounded tile carrying a dollar sign, followed by
"PENDIFICO" - the `$` is doing double duty as the S. Both files were trimmed
(`docs/explainers/generators/trim_svg.py`): 43% and 41% of each canvas was empty, and each carried
exporter junk including **a stroke-only duplicate of the box outline in the box's own colour**,
which had to go rather than stay, because once the fill becomes a theme token a leftover stroke is
a hardcoded purple hairline around a themed box.

**"The supplied SVG becomes the mark" above is superseded for the in-app lockup, and stands for
the favicon.** The artwork is set in a typeface, IM Fell English SC, so the letterforms are not
bespoke and the wordmark can be *text*. That retires the objection this plan was written on, which
was that no font reproduces them. So:

- **The in-app lockup is HTML and CSS**, a `primary` tile carrying a `warning` `$` with the
  wordmark beside it, all in the display face. The exact size relation is measured rather than
  guessed: `font-size = tile height x 0.6146 / (the family's cap/em)`.
- **The favicon stays vector.** `app/icon.svg` is served as a static file and an SVG loaded as an
  image cannot fetch a webfont, so `<text>` there would render in whatever the viewer's machine
  happens to have. The trimmed icon path is what ships.

Three findings from building the preview page belong here, because each is a trap rather than a
detail. A **non-zero viewBox origin** is one: referencing a mark through `<use>` inside an `<svg>`
carrying the same viewBox applies the offset twice, so the artwork slides out of its own box and
clips. Both trimmed files are therefore normalised to `0 0 W H` with a translate on a group, which
keeps every `d` byte-identical. The **corner radius is exactly 1/6 of the tile** (arc 16.5725 of
99.4331), so it belongs in a percentage rather than as three hardcoded pixel values - and since the
path draws its own corners, the tile needs no CSS radius at all, which makes today's `rounded-lg`
redundant. And a **ring cannot be an inset shadow behind the tile**: an inset box-shadow paints
under the element's content, and the content is an opaque square, so it would be invisible. If a
ring is ever wanted it has to composite over the tile or be a stroke inside the SVG.

**The colour mapping is the product owner's, taken against the measurement.** A `primary` tile with
a `warning` `$` measures 1.37:1 in `abyss` and clears 3:1 only in stock `light`. Four alternatives
that pass everywhere were drawn and priced in
`docs/explainers/logo-tile-options-preview.html`; the mapping was chosen anyway, knowingly, and
that page is the record of what it was chosen over.

**One accessibility consequence.** The visible text becomes "PENDIFICO" with a `$` for the S, which
a screen reader renders as "dollar P E N D I F I C O", and `Sidebar.test.tsx` pins the string
"Spendifico". The lockup therefore needs an explicit accessible name with the visible glyphs hidden
from the accessibility tree.

## The installable shell, and the half of PWA this ticket refuses

**The manifest, the icon set and the browser chrome colour come in; the service worker, offline
support and the install prompt do not.** The product owner's split, and the line is drawn where the
work overlaps: the icons come from the artwork this ticket already trimmed, `app/icon.svg` is already
being replaced here, and `layout.tsx` already exports a `viewport` carrying
`colorScheme: 'light dark'` - so doing this later means touching the same three files twice.

- `app/manifest.ts`, Next 16.2.12's own `MetadataRoute.Manifest` convention, with `display:
  'standalone'`, `start_url`, `name` and `short_name`.
- **192, 512 and a maskable icon**, plus an `apple-icon`, generated from
  `docs/explainers/assets/logo/SPENDIFICO_ICON.trimmed.svg`. The trim pays for itself here: the
  trimmed icon is an exact 99.4331 square, where the original canvas was 127.54 x 136.13 and would
  have produced a letterboxed or off-centre icon at every size.
- **The maskable variant needs padding that the others must not have.** A maskable icon has to keep
  its content inside a circle of 80% of the icon's width, and the trimmed artwork is a tile drawn
  edge to edge - so that one variant is the tile inset on a filled ground, not the same file at a
  different size. Getting this wrong crops the corners of the tile on Android.

**The chrome colour cannot follow the picker, and that is a fact about the platform rather than a
gap to close.** The manifest's `theme_color` is one static value, and `<meta name="theme-color">`
varies only by media query - never by a cookie-driven `data-theme`. So the meta tag carries a
light/dark pair keyed on `prefers-color-scheme`, which is exactly right for the `system` arm and
wrong for an explicit pick that disagrees with the OS. **`ThemeField` therefore writes the meta tag
alongside `data-theme`**, which closes the explicit case, and the manifest's single value stays a
brand constant. Without that two-line addition the tag would be correct on load and stale from the
first theme change, which is the worse of the two failures because it looks like it works.

**Installability itself is not claimed until it is measured.** Chrome has historically required a
registered service worker with a fetch handler before offering an install prompt, and that criterion
has moved between versions - so this ticket ships `display: standalone` and a correct icon set, and
the browser walk **reports** whether an install prompt appears rather than the plan asserting it
will. If it does not, that is the deferred ticket's to close and not a defect here.

**Why the rest is deferred rather than squeezed in**, recorded so the next person does not read it as
an oversight. **Every route in this app is dynamic** and not one carries `export const dynamic`,
because the cookie read opts each one out - so there is no prerendered shell to serve offline, and an
offline experience would have to be authored from nothing. Caching per-user financial data in the
Cache API is a security decision (a shared machine, a cache outliving a logout) rather than a build
step. And **the passwordless flow collides with an installed app**: the emailed login link opens the
default browser rather than the installed PWA, so the session cookie lands in the browser's jar and
the installed app stays signed out. That needs a decision of its own, and it is not a theming one.

## The typography audit

Two families load through `next/font/google` in `app/fonts.ts`: Inter as `--font-sans`, Plus
Jakarta Sans as `font-display`. PET-57 retired the nineteen named Figma type styles, so sizes are
Tailwind's own scale applied per element, and `docs/TODO.md` lists that as one of PET-74's three
surviving gaps.

This is an audit with a written outcome, not a redesign. Collect what is actually painted across
the four routed views, the six access frames and Storybook; decide whether the two families and
the ad-hoc scale stand; record the decision either way. **"No change" is an acceptable outcome
and is recorded as a decision with its reasoning**, which is the point: an unanswered item comes
back, a decided one does not.

### The outcome: Crimson Pro for display, Inter stays

The audit is answered, and the answer is not "no change". **Plus Jakarta Sans is replaced by
Crimson Pro** as `font-display`, which is also the wordmark's face - the product owner's
requirement was that the mark and the page titles share a family. **Inter stays** as `--font-sans`.
Eight candidate display faces and six body faces were measured from their own font binaries and
drawn at matched cap height in `docs/explainers/font-pairing-review.html`.

Two constraints drove it, and both are the silent kind that a visual comparison alone would miss.

**A display face needs real weights, because 25 of the 26 `font-display` call sites pair it with
`font-bold` or `font-semibold`.** A single-weight family gets synthesized bold at every one of
them. That is what ruled out the artwork's own IM Fell English SC (one weight), along with its
rendering lowercase as small caps, so "Dashboard" would read "Dᴀsʜʙᴏᴀʀᴅ". Crimson Pro has eight
weights, 200 to 900.

**A body face needs a `tnum` feature, because six call sites depend on `tabular-nums`** and the
class is inert without one - `TransactionRow` ("so the column's digits line up down the page") and
`BudgetField` ("so the digits stop shifting as they are typed") say why in their own comments.
Quicksand, the product owner's presentation body face, has no `tnum`, and neither do Nunito, Source
Sans 3 or IBM Plex Sans. Keeping Inter sidesteps this entirely. Crimson Pro carries `tnum` too,
which matters because one heading in this app *is* a number: `font-display text-4xl font-bold
tabular-nums` on the transaction detail amount.

**Crimson Pro is the least dense of the eight**, which was the brief: `cap/em` 0.5732, the lowest
measured, so it carries the most air around its capitals.

**That lightness has a consequence, and it is the one mechanical cost of this choice.** Crimson
Pro's caps are **76.9%** the height of Plus Jakarta Sans's at the same font-size (0.5732 against
0.7450), so every heading would read about a quarter smaller if the sizes were left alone. Matching
them optically means multiplying by 1.300, which lands close enough to Tailwind's own steps to be a
one-step bump: `text-lg` to `text-2xl`, `text-2xl` to `text-3xl`, `text-3xl` to `text-4xl`,
`text-4xl` to `text-5xl`. That pass over the 26 call sites **is** the "per-element type sizes and
spacing" gap `docs/TODO.md` has listed since PET-74, so this ticket closes that entry rather than
adding to it.

**The wordmark gets no tracking, and the lever stays documented anyway.** `letter-spacing` on the
wordmark alone would open the mark without touching a single heading or paragraph, so it was drawn
as a ladder from 0 to 0.12em in the review page. The product owner picked **0**: Crimson Pro is open
enough on its own that the mark needs no help, which is the same property that made it the pick.
The ladder stays in the page as the record of what 0 was chosen over.

### The explainers hijack the stock selectors, and one of them is about to become ambiguous

Worth knowing before touching the five explainer `<style>` blocks, because their shape is not what
it looks like. None of them registers `expensa-light` or `expensa-dark` as a name. Each loads
daisyUI's `daisyui.css` for component CSS, deliberately skips `themes.css`, and paints the Expensa
*values* into daisyUI's *stock* selectors: bare `:root` for light, and both
`@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` and `[data-theme='dark']` for
dark, the latter so the page's own `theme-controller` checkbox keeps working.

Three things follow. **`[data-theme='dark']` stops being unambiguous the moment this ticket
registers the real stock `dark` theme** - in the app that attribute will select stock dark, while in
these five files it selects Expensa dark. They should move to `[data-theme='expensa-dark']` so the
app and its own evidence agree. **The pages cannot show the three new themes**, since each hardcodes
one pair, so "open both explainers under each theme" is not a procedure that survives this ticket;
that is another argument for the guard tool owning the measurement. And **the block-diff has to know
the real shape**: the light block carries all 22 colours while the dark block carries only the 6 that
actually change between the pair, plus a redundant but identical `--color-neutral`. A check demanding
22-for-22 in both would report five false failures.

All five were verified in sync by hand while planning: 22 of 22 light tokens match `globals.css`, and
all 6 dark overrides match. That is the first time anything has confirmed it, which is exactly the
gap `docs/TODO.md` records.

### The two palette pages merge into one generated, theme-aware page

**`category-color-palette-preview.html` and `category-colors-icons-description-preview.html` are
replaced by a single generated page**, `docs/explainers/category-palette-preview.html`, carrying a
**theme switcher that enumerates whatever themes are actually installed** rather than a hardcoded
pair. Both originals are deleted. The product owner's call, and it is the right one: two files each
pinning one theme pair was already a maintenance cost, and at five themes it becomes a page that
lies.

**The switcher's list is derived, so "five" is nobody's constant.** The generator reads
`globals.css` for both `@plugin 'daisyui/theme'` blocks and for the stock names the
`@plugin 'daisyui'` registration enables, then applies this ticket's seven overrides, so the page
paints each theme's *effective* values. Add a sixth theme and the page grows a sixth option with no
edit.

**Contrast is one column that follows the switcher.** Seventeen tokens across five themes is 85
figures, and a five-column table gets wider with every theme. The generator emits every theme's
measured figures as data and the switcher swaps the visible column. Cross-theme comparison is the
guard tool's job, and the guard is better at it than a table.

**It follows `icon-set`'s convention rather than inventing one.**
`docs/explainers/icon-set/build-icon-page.js` already generates a sibling explainer from
`template-tokens.ts` and `template-seed.ts`, with a paired `check-icon-page.js`, a `README.md` and
cached JSON beside it, run as plain Node with the repo root as `argv[2]` and deliberately not wired
to an npm script. So this page gets `docs/explainers/category-palette/` with `build-palette-page.js`,
`check-palette-page.js` and a `README.md`, in that same shape. **The four generator scripts committed
earlier during planning are ported to it too**, so the repo carries one pattern for this job rather
than two.

**One implementation of the theme parse, not two, and that decides the data flow.** A parser in the
frontend guard and a second in the page builder is the restatement this repo treats as a defect. So
`lib/themeGuard.ts` stays the single implementation, the one with tests around it, and it **emits
`docs/explainers/category-palette/theme-data.json`** - every theme's effective token values and
measured contrast. `build-palette-page.js` is then a dumb renderer over that committed JSON, exactly
as `build-icon-page.js` renders over its cached `lucide-categories.json`, and `check-palette-page.js`
fails if the committed page does not match a fresh render.

**The other three theme-embedding explainers keep their hardcoded pair for now** and get only the
selector rename, `[data-theme='dark']` to `[data-theme='expensa-dark']`, so nothing collides with
the real stock `dark`. Making them theme-aware is a follow-up, not this ticket.

**Deleting the two files means re-pointing seven live references**, and deliberately not two others.
The live ones: `template-seed.ts` and `template-tokens.ts` comments, `frontend/CLAUDE.md`'s guard
procedure which names both files, `category-icon-set-preview.html`,
`how-category-templates-work.html`, `icon-set/build-icon-page.js`, and
`setup/categories/SetupCategoriesScreen.stories.tsx`. The two that stay untouched are
`docs/plans/2026-08-07_PET-64...` and `docs/plans/2026-08-10_PET-74...`, because a plan is a dated
record of what was true when it was written and rewriting one is falsifying it.

## Order of work

The guard comes first, before any theme is registered. It is the thing that says whether the
seven overrides are correct, and building it after the themes would mean measuring by hand
exactly once and then automating the measurement nobody needs again.

## Checklist

- [ ] Commit this plan alone, open the draft PR on it
- [ ] Build `lib/themeGuard.ts`: parse both theme sources, hex and `oklch()` to OKLab,
      composite `base-content/50`, report collisions, token contrast against the card, and
      `-content` legibility on its own base
- [ ] Build `lib/themeGuard.test.ts` as the gate, with the two grandfathered pairs in one named
      exported constant
- [ ] Extend the guard to diff the five `docs/explainers/` `<style>` blocks against
      `globals.css`, closing that `docs/TODO.md` entry
- [ ] Add the `theme:report` script for the human-facing tables
- [ ] Verify the gate fails on today's tree for the right reasons, then register `abyss`,
      `light` and `dark` and watch it fail for theirs
- [ ] Author the seven overrides, steered onto `-content` tokens, until the gate is green
- [ ] Review the Expensa pair against the guard's output, including the three invented slots
      (`info`, `secondary`, `accent`) that owe a designer sign-off
- [ ] Regenerate `COLOUR_CONTRAST` in `backend/src/database/central/template-tokens.ts` for all
      five themes from the tool's output
- [ ] Have `themeGuard.ts` emit `docs/explainers/category-palette/theme-data.json`: every installed
      theme's effective token values, with the seven overrides applied, plus measured contrast
- [ ] Build `docs/explainers/category-palette/` in `icon-set`'s shape - `build-palette-page.js`,
      `check-palette-page.js`, `README.md`, plain Node, repo root as `argv[2]`, no npm script - and
      generate `category-palette-preview.html` with a switcher enumerating the installed themes and
      one contrast column that follows it
- [ ] Delete `category-color-palette-preview.html` and
      `category-colors-icons-description-preview.html`, and re-point the seven live references
      (both backend template files, `frontend/CLAUDE.md`, two sibling explainers,
      `icon-set/build-icon-page.js`, `SetupCategoriesScreen.stories.tsx`), leaving the two plan docs
      untouched as dated records
- [ ] Port the four planning-time Python generators into the same Node shape
- [ ] Rename `[data-theme='dark']` to `[data-theme='expensa-dark']` in the three remaining
      theme-embedding explainers, and keep their hardcoded pair; the guard knows their dark block
      carries only the 6 tokens that change
- [ ] Widen `lib/theme.ts`: `system` plus the five registered names, `themeAttribute` as a
      lookup, unknown values still reading as `system`
- [ ] Replace the segmented row with the six-tile picker on the Preferences card, each tile
      wearing its own `data-theme` and drawing the eight swatches, native radios underneath
- [ ] Update `ThemeField` stories and tests; assert the attribute-and-cookie writes rather than
      class strings
- [x] Trim the supplied artwork, normalise both origins to `0 0 W H`, and commit the originals,
      the trimmed pair, the generators and the two review pages under `docs/explainers/`
- [x] Decide the logo colour mapping against measurement, and the display and body faces against
      the font binaries; record both, including what each was chosen over
- [ ] Swap `app/fonts.ts` to Crimson Pro plus Inter, remap the `--font-display` token, and apply
      the same loaders in `.storybook/preview.ts`
- [ ] Bump the 26 `font-display` call sites one Tailwind step to compensate for Crimson Pro's
      lower cap height, closing the `docs/TODO.md` type-sizes entry
- [ ] Unify the logo into one component with `size` and `tone`, replace both call sites, drop
      the Sidebar copy, build the lockup as text in the display face with `letter-spacing` on the
      wordmark only, and give it an explicit accessible name with the glyphs hidden
- [ ] Replace `app/icon.svg` from the trimmed icon path, which stays vector because an SVG loaded
      as an image cannot reach a webfont
- [ ] Add `app/manifest.ts` with `display: 'standalone'`, plus 192, 512, a **padded** maskable
      variant and an `apple-icon`, all from the trimmed square icon
- [ ] Add `viewport.themeColor` as a `prefers-color-scheme` pair beside the existing `colorScheme`,
      and have `ThemeField` write the meta tag alongside `data-theme` so an explicit pick is not
      stale until reload
- [ ] Report in the walk whether an install prompt actually appears, rather than assuming a manifest
      is sufficient without a service worker
- [ ] Confirm the tile needs no CSS radius now the path draws its own corners, and that no ring is
      drawn behind an opaque tile
- [ ] Amend `frontend/CLAUDE.md`: the theme list, the guard now being automated and what it does
      not cover, the `globals.css` contract growing the override blocks, and the picker replacing
      the segmented row
- [ ] Amend the `globals.css` header comment and close the `docs/TODO.md` entries this ticket
      finishes
- [ ] Headless-browser walk: all five themes across the four routed views, the access frames and
      the modals, plus the picker's six arms and Storybook
- [ ] `npm run lint`, `npm run test`, `npm run build` in `frontend/`; `npm run build` in
      `backend/`; `npm run docs:check` at the root

## What this ticket does not do

The hairline-versus-shadow card treatment stays out, as it did in PET-74: roughly forty
`shadow-*` call sites against Claude Design's "a hairline system, not a shadow system". daisyUI
component interaction and animation stays out, judged in `docs/TODO.md` as not worth doing at
all. No HTTP contract changes, so `npm run api:sync` is not involved. And `COLOUR_SEED` is not
touched, which is the ruling this whole plan is built around.
