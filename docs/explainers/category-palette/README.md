# Rebuilding the category palette explainer

`docs/explainers/category-palette-preview.html` is **generated**, not hand-written. These are the
scripts that generate and check it. Run them from the repo root; each takes the repo root as its
first argument.

Nothing here is wired into a build, a lint or CI. That is deliberate and copied from
`docs/explainers/icon-set/`: the page documents a palette that changes once a ticket, and a
generator nobody can run is worse than no generator, so the cost of keeping it is a README rather
than a pipeline.

| Script                  | What it does                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `build-palette-page.js` | Writes the explainer from `theme-data.json` plus `COLOUR_SEED`, `CATEGORY_SEED` and `FALLBACK_CATEGORY`. Parses no CSS and measures nothing |
| `check-palette-page.js` | Drives headless Chromium over the built page: every mark paints an opaque colour in **every** theme, the counts match, no two themes render identically, and two controls proving the harness discriminates |

```
cd frontend && npm run theme:report && cd ..
node docs/explainers/category-palette/build-palette-page.js .
node docs/explainers/category-palette/check-palette-page.js docs/explainers/category-palette-preview.html
```

**`npm run theme:report` must run first**, because it is what writes `theme-data.json`.

## This page replaced two, and that is the point of it

`category-color-palette-preview.html` drew the seventeen allowlist tokens and
`category-colors-icons-description-preview.html` drew the seeded categories. Each embedded **one
theme pair** in a hand-maintained `<style>` block, because the pinned CDN `daisyui.css` carries
only the stock themes.

PET-79 took the app from two themes to five, at which point two pages each pinning one pair is not
merely a maintenance cost - it is a page that lies. So they merged into this one, which carries a
**theme switcher that enumerates whatever themes are actually installed**: add a sixth theme and
the page grows a sixth option with no edit to any script here.

It also removes two of the six hand-held copies of the palette that `docs/TODO.md` recorded, which
is the better half of closing that entry. The three that remain are diffed against `globals.css` by
`frontend/src/lib/themeGuard.test.ts`.

## Which command owns `theme-data.json`, and why not the test

`theme-data.json` is written by `cd frontend && npm run theme:report` and by nothing else. A Jest
test must not write it: a suite that regenerates a committed artifact passes on a machine whose
output has drifted, which is the opposite of a gate, and it makes `npm run test` mutate the working
tree.

So the division is the same one `check-icon-page.js` draws against `build-icon-page.js`:
`theme:report` writes, and `themeGuard.test.ts` asserts that the committed file matches what the
module computes now. A theme edit therefore **fails the frontend suite** until the report is re-run
and the JSON committed - which is the behaviour wanted, because the artifact and the theme cannot
then drift silently.

## One theme parser, and this is not it

`frontend/src/lib/themeGuard.ts` is the only thing in this repo that parses a theme, converts a
colour or measures a contrast ratio. `build-palette-page.js` is a **dumb renderer** over its
output: it reads `theme-data.json`, reads the seed constants out of their own TypeScript, and emits
markup. If a figure on the page looks wrong, the guard is where it is wrong.

A second parser living in this directory is exactly the restatement this repo treats as a defect,
and it is why the page carries effective token values rather than declared ones - PET-79's seven
overrides are already folded in upstream.

## What the check exists to catch

Every mark on the page is filled from a CSS custom property, and **a property that does not resolve
paints transparent**. So the tile, the dot and the bar all vanish into the card while the row
around them still looks correct, the label still reads and the contrast column still shows a
number. `base-content/50` is the likely one, being the single token whose name carries a `/` and
therefore the one whose custom-property name has to be rewritten.

That is why the assertions are about painted colour rather than about emitted markup, why they run
under **every** installed theme rather than only the first, and why two of the nine are controls.
