# Rebuilding the category icon set explainer

`docs/explainers/category-icon-set-preview.html` is **generated**, not hand-written. These are the
scripts that generate and check it. Run them from the repo root; each takes the repo root as its
first argument.

Nothing here is wired into a build, a lint or CI. That is deliberate - the page documents a set
that changes once a ticket, and a generator nobody can run is worse than no generator, so the
cost of keeping it is a README rather than a pipeline.

| Script                | What it does                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `build-icon-page.js`  | Writes the explainer from `ICON_NAMES`, `ICON_SEED` and `CATEGORY_SEED`. Throws if any name is not in lucide 1.29.0 |
| `check-icon-page.js`  | Drives headless Chromium over the built page: every card drew a real glyph, counts match, no duplicate keys, and a control proving a bogus name draws nothing |
| `scan-app-icons.js`   | Scans `frontend/src` for every `lucide-react` import that is **not** the category map, and writes `app-icons.json` for the page's interface-scan section |
| `check-icon-refs.js`  | Fails if any `icon:` literal anywhere in the repo is not in `ICON_NAMES` - a stale one is a 400 at runtime, not a type error |
| `contact-sheet.js`    | Draws the whole set as large glyphs, for judging shape similarity by eye. Extra names can be appended to audition a candidate |

```
node docs/explainers/icon-set/scan-app-icons.js .
node docs/explainers/icon-set/build-icon-page.js .
node docs/explainers/icon-set/check-icon-page.js docs/explainers/category-icon-set-preview.html
node docs/explainers/icon-set/check-icon-refs.js .
```

`scan-app-icons.js` must run before `build-icon-page.js`, which reads its output.

## The two cached data files

`lucide-1.29.0-names.txt` is every icon the installed `lucide-react` ships, derived from
`frontend/node_modules/lucide-react/dist/esm/icons/`. `lucide-categories.json` is lucide's own
per-icon category metadata, fetched from `lucide.dev/api/categories`.

Both are committed rather than fetched at build time, for different reasons. The name list makes
the generator's "is this a real icon" check work with no `node_modules` present. The category map
is **not shipped in `lucide-react` at all** - components only, no metadata - so the alternative is
a network call, and the tags are decorative: nothing in the app reads them, and no template row
references them.

Two consequences worth knowing before trusting them. The category map serves the **current**
lucide rather than the pinned 1.29.0, so a tag can be newer than the glyph beside it. And lucide
leaves **258 of its 2011 icons untagged entirely** - `waves` is one, which is why the page renders
"no lucide category" rather than an empty row, and why `check-icon-page.js` asserts that label
exists rather than asserting every card has a tag. Refresh the name list after a `lucide-react`
bump; refresh the category map only if a tag looks wrong.

## Judging a change

The whole set was decided at the **18px the app actually draws** (`size-4.5` on the transaction
row's tile), not at the large size a contact sheet shows. Both sizes are on every mark in the
page's decision record for that reason.

The other rule the seventeen swaps were learned from: **re-read the whole set after every change,
not the pair you were fixing.** Two picks that looked right against their own collision turned out
to collide with something else - `bot` was chosen against `book` and was the seeded `tv`, and
`squirrel` was chosen against `bus` and was `rabbit`. The page's residual list records the three
near-misses that survived, so they are not rediscovered as defects.
