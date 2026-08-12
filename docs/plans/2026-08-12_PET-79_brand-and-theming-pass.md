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
- The same module checks the five `docs/explainers/` `<style>` blocks against `globals.css`,
  which closes the gap `docs/TODO.md` records as belonging "with the next theme edit if not
  sooner". This is that edit.
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
- [ ] Update the five explainer `<style>` blocks for all five themes; the guard now proves they
      match
- [ ] Widen `lib/theme.ts`: `system` plus the five registered names, `themeAttribute` as a
      lookup, unknown values still reading as `system`
- [ ] Replace the segmented row with the six-tile picker on the Preferences card, each tile
      wearing its own `data-theme` and drawing the eight swatches, native radios underneath
- [ ] Update `ThemeField` stories and tests; assert the attribute-and-cookie writes rather than
      class strings
- [ ] Unify the logo into one component with `size` and `tone`, replace both call sites, drop
      the Sidebar copy, replace the glyph with the supplied asset, replace `app/icon.svg`
- [ ] Run the typography audit and record its outcome, "no change" included
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
