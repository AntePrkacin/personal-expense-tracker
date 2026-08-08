# PET-65: expand the category icon template set from 13 to 64

Ticket: [PET-65](https://decode.atlassian.net/browse/PET-65). Stacked on PET-64, which creates
the three template tables and the palette endpoint this ticket fills in.

## Context

PET-64 moved the icon list into `central.icon_templates` and seeded it with **13** names: the
twelve the starter categories use, plus `circle-question-mark` for the `Uncategorized` fallback.
That set was sized for a fixed list of categories, not for a person naming a category of their
own.

The consequence is arithmetic rather than taste. Every one of the thirteen is already spoken for
by a seeded category, so the very first custom category a user creates has to reuse a glyph that
already means something else on their own screen. PET-37 will build the picker that exposes this;
against thirteen icons it is a picker with nothing to pick.

Colour does not have this problem, and the asymmetry is worth naming because it looks like an
oversight and is not. PET-64 shipped **seventeen** colours against thirteen categories precisely
so four were spare. The icons got no such slack, and this ticket is that omission being repaired
rather than a new capability.

## Decision 1: sixty-four, not fifty and not a hundred — AGREED

51 new, for 64 total.

Below roughly 40 a picker cannot cover ordinary budget lines and users are forced into reuse
again, which is the problem this ticket exists to fix. Above roughly 70, browsing stops working
and the picker needs search, which is a different and much larger ticket. Comparable expense apps
sit between 40 and 100.

64 also grids as **8x8**. That is not decoration: PET-37's picker has no design behind it, frame
13 draws no icon grid at all, and a square grid is the cheapest thing to draw and the easiest to
defend in review when the designer finally looks at it.

## Decision 2: chosen by spending domain, not by browsing the library — AGREED

The set is derived from what people actually keep as budget lines, then checked against lucide
rather than picked from it. All 51 are verified present in the pinned `lucide` 1.29.0.

| Domain | Icons |
| --- | --- |
| Food and drink (4) | `coffee` `beer` `pizza` `cake-slice` |
| Transport (5) | `fuel` `bus` `train-front` `bike` `circle-parking` |
| Home and bills (8) | `house` `droplets` `flame` `wifi` `smartphone` `trash-2` `wrench` `sofa` |
| Health and fitness (4) | `pill` `stethoscope` `dumbbell` `glasses` |
| Shopping (4) | `shopping-bag` `shirt` `package` `gem` |
| Money (8) | `wallet` `credit-card` `piggy-bank` `banknote` `coins` `receipt` `trending-up` `shield` |
| Entertainment and hobbies (7) | `gamepad-2` `music` `film` `ticket` `book` `camera` `palette` |
| Work and study (3) | `briefcase` `laptop` `newspaper` |
| Family and social (3) | `baby` `users` `hand-heart` |
| Personal care (1) | `sparkles` |
| Travel (3) | `luggage` `hotel` `tent` |
| Other (1) | `circle-ellipsis` |

The uneven weighting is the point. **Money gets 8** because Rent, Savings, Insurance, Taxes and
Subscriptions are five distinct lines people really keep and the shipped set answers all of them
with `landmark`. **Home and bills gets 8** because a household splits utilities into water, gas,
internet and phone, where the shipped set has only `zap`. **Personal care gets 1** because
`scissors` already covers it.

Nothing here duplicates a shipped glyph, and nothing is chosen because it is pretty.

## Decision 3: append rather than reorder — AGREED

The 51 are appended after the existing 13, in the domain order above, so every shipped icon keeps
its current `sort_order`.

Regrouping all 64 by domain would read better in a picker and is deliberately not done. The seed
runs once and is guarded, so a database seeded before this change and one seeded after would
disagree about every `sort_order` in the table, for a cosmetic gain, on data an admin is meant to
reorder for themselves anyway.

## Decision 4: the seed guard is left exactly as it is — AGREED

`seedTemplates` returns early when any `category_templates` row exists. That guard is not merely
idempotence: it is what stops a boot re-creating a template an administrator deliberately deleted.

So new `ICON_SEED` entries reach a **fresh** central database only. Two consequences, and both are
accepted rather than worked around:

- **Production needs nothing.** PET-64 has not been deployed, and the deploy is a manual
  `workflow_dispatch`, so the first deploy carrying these tables seeds all 64 at once.
- **A local central database seeded on the PET-64 branch will not pick them up** and must be
  deleted so it re-seeds. This is the one thing most likely to cost somebody an hour, which is why
  it is in the ticket, in this plan and in the PR body.

Making the seed top up per icon would fix the second point and would silently undo the guard. If
that trade is ever wanted it is its own decision, with the deletion behaviour re-argued, not a
convenience bolted on here.

## Implementation

### 1. The allowlist

`backend/src/database/central/template-tokens.ts`: add the 51 names to `ICON_NAMES`, and correct
the docblock that currently says thirteen. The comment explaining `circle-question-mark` over the
deprecated `circle-help` alias stays as is.

### 2. The seed

`backend/src/database/central/template-seed.ts`: add the 51 to `ICON_SEED` with a picker label
each, appended in domain order. Labels are the word a person picks, not the lucide name:
`fuel` is "Fuel pump", `trending-up` is "Upward trend", `gamepad-2` is "Game controller",
`hand-heart` is "Helping hand", `circle-ellipsis` is "Ellipsis". Correct the docblock that says
thirteen.

### 3. The contract

`npm run api:sync` from the repo root; commit `backend/openapi.json` and
`frontend/src/types/api.d.ts` together. Skipping this is catastrophic rather than untidy: the
union degrades to `string`, `Record<IconName, LucideIcon>` accepts any subset of keys, and missing
icons render as nothing with the build green.

### 4. The frontend map

`frontend/src/components/ui/categoryColour.ts`: 51 further **static** imports from `lucide-react`
and 51 further `CATEGORY_ICON` entries. Never `icons[name]` off the library barrel, which pulls all
~2000 glyphs into the bundle. Correct the docblock that says thirteen.

### 5. Tests

`frontend/src/components/ui/categoryColour.test.ts` carries the only hardcoded count,
`expect(ICONS).toHaveLength(13)`. The backend's `template-seed.spec.ts` already derives from
`ICON_NAMES.length` and needs no edit, and its "every seeded icon is in the allowlist" assertion
keeps holding by construction.

### 6. Documentation

The count is stated in prose in five places: `frontend/CLAUDE.md`,
`frontend/src/components/CLAUDE.md`, and all three pages under `docs/explainers/`. The explainer
`how-category-templates-work.html` additionally argues *why* icons have no spares where colours do,
and that paragraph becomes false with this change and has to be rewritten rather than renumbered.

### 7. What this plan does not contain

The picker UI is PET-37's. The super-admin write side remains unbuilt and unticketed beyond
PET-64's note. No new table, no new endpoint, no migration, and no change to any colour.

## Verification

Names are the risk here, not logic. A misspelled lucide name is invisible to review, so every
check below is mechanical.

1. `cd backend && npm run build && npm test && npm run test:e2e`
2. `cd frontend && npm run build && npm test && npx tsc --noEmit`
3. `npm run api:sync` from the root a second time; `git diff --exit-code` must be clean, proving
   the committed artifacts match the code.
4. **Render all 64 in a browser, both themes**, and assert each produces a non-empty `<svg>` with
   at least one path. A name that lucide does not have renders nothing at all, silently, and no
   suite in either app can see that. This is the same class of gap the palette explainers exist
   for.
5. Delete the local central database, boot, and confirm `GET /api/templates/palette` answers 64
   icons.
6. Create a category through the API carrying a new icon and confirm it draws on the transactions
   list, the detail card and the donut legend.

## Checklist

- [ ] Add the 51 names to `ICON_NAMES` and fix its docblock
- [ ] Add the 51 to `ICON_SEED` with picker labels, appended in domain order, and fix its docblock
- [ ] Run `npm run api:sync` from the repo root and commit both artifacts
- [ ] Add 51 static imports and `CATEGORY_ICON` entries, and fix that file's docblock
- [ ] Update the hardcoded count in `categoryColour.test.ts`
- [ ] Update the count in `frontend/CLAUDE.md` and `frontend/src/components/CLAUDE.md`
- [ ] Update the count in all three `docs/explainers/` pages, rewriting the icons-have-no-spares
      argument rather than renumbering it
- [ ] Run both suites, both builds, and `npx tsc --noEmit`
- [ ] Prove the committed contract matches the code with a second `api:sync` and a clean diff
- [ ] Render all 64 headlessly in both themes and assert every glyph is non-empty
- [ ] Re-seed a fresh central database and confirm the palette endpoint answers 64
- [ ] Walk one new icon end to end on a real category

## Risks worth stating

**A wrong name fails silently, in both apps.** Backend-side it is a string in an array and passes
every check. Frontend-side an import of a non-existent export is a build error, which is the good
case, but a name that exists in `ICON_NAMES` and is simply absent from `CATEGORY_ICON` is a
compile error only because the `Record` is exhaustive. That exhaustiveness is doing real work here
and must not be weakened to make this ticket easier.

**The bundle grows by roughly 25 to 40 KB raw.** `lucide-react` imports per icon so the cost is
close to linear, and it is paid by every visitor including signed-out ones if the map is ever
pulled into a shared chunk. Worth a look at the built chunk sizes, the way PET-22 recorded
Recharts at +343 KB rather than guessing.

**Sixty-four icons in an undesigned picker is a design risk, not a technical one.** The ticket
carries `design-review` for that reason. If the designer wants a different set, the change is
data plus one map, and nothing about this plan's shape has to move.
