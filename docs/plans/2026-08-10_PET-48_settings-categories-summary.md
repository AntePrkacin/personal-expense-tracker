# PET-48: Build the Settings categories summary card

Jira: [PET-48](https://decode.atlassian.net/browse/PET-48) · Epic:
[PET-7 Settings](https://decode.atlassian.net/browse/PET-7) · Figma:
[17 Settings](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=40-630)
(frame `40:630`, Categories card `40:722`) · Claude Design:
`ui_kits/expensa-app/SettingsScreen.jsx` in the team's Expensa Design System

**Stacked on `feat/PET-47-preferences-card`** (PR #82, open, itself stacked on
`feat/PET-46-settings-profile-card`, PR #81). This card drops into the `<form>` PET-46 built and
sits below the card PET-47 built, so cutting from `main` would mean rebuilding both.

## Why

Frame 17 draws **three** cards over one "Save changes". PET-46 built the Profile card and the
page-level form; PET-47 built the Preferences card. The third - Categories - is the last thing
missing on the last routed view, and it is currently **absent rather than inert**: both of those
tickets argued that a card whose controls would submit through a form that does not carry them is a
promise the form cannot keep, so Settings shipped short rather than with dead cards on it. This
ticket ends that, and it is the ticket four files in this repo mistakenly attribute to PET-47.

The card is read-only. One line of text - `{n} categories · {allocated} allocated of {budget}` -
and a secondary "Manage" beside it. Both authorities agree on it exactly: the Figma node and the
Claude Design `SettingsScreen.jsx` draw the same box, the same sentence and the same button. There
is no header rule on this card, unlike the two above it.

## What the backend needs: nothing

`GET /api/categories` already answers `{ categories, allocation: { monthlyBudget, allocated,
unallocated } }`, and `docs/plans/2026-08-04_PET-35_category-endpoints.md` chose that shape partly
_for_ this card, naming PET-48 in as many words - it also records the trade it accepted, that this
consumer pulls every category to read two integers, and that a `?stats=false` flag is a smaller
change later than splitting the endpoint would be. So no request or response body moves and
**`npm run api:sync` is deliberately not run**. Said out loud because the rule is easy to apply by
reflex, and because the PET-70 plan records the opposite for itself.

`lib/categories.ts` already holds the read this needs: `readCategoriesView()`, the third projection
over the one `authorizedGet('/api/categories')`, which narrows nothing and carries `allocation`.
Neither narrow projection is widened, which is the rule that file sets.

## The four decisions taken with the product owner

| #   | Question                                                                                   | Decision                                                                                            |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | AC3 says "Manage" opens the Categories tab, and that route exists and is complete          | **"Manage" does nothing for now**, and is **not** `disabled` or `aria-disabled`. AC3 is amended.     |
| 2   | Is the `Uncategorized` fallback in the "{n} categories" count?                              | **Excluded.** The count is live non-fallback categories.                                            |
| 3   | Does "of $2,000" follow the saved budget or the budget field above it?                     | **The saved budget**, `allocation.monthlyBudget`.                                                    |
| 4   | What happens if the new categories read fails?                                              | **Degrade the card only.** Profile and Preferences stay editable.                                     |

Two of these depart from something already written down, so each gets its own paragraph.

**The inert "Manage" departs from this repo's own convention, knowingly.** Every drawn-but-unbuilt
control in this app announces `aria-disabled` - the Categories tab's kebab, "Set limit", "Allocate"
- and PET-70 cleared the last of them, so this card reintroduces the app's only silently inert
control. That was raised and the call is to ship it enabled-looking and inert anyway. What follows
from it: the button is a real `<button type="button">` with no handler, `type` is mandatory rather
than tidy because a bare `<button>` inside a `<form>` submits it, and `docs/TODO.md` records the
gap. The alternative was one line - `<Button href={TAB_HREFS.categories}>` - which is worth stating
so nobody re-derives it as an oversight.

**Excluding the fallback makes Settings disagree with the Transactions tab badge by one**, which
counts every live category, `Uncategorized` included, and is documented as never 0 for that reason.
Accepted: this card is about the categories a user manages, and the fallback is the one they
cannot. The seam it opens is that `allocation.allocated` is used verbatim and _does_ include a cap
on the fallback if one was ever set - impossible from the UI, and `docs/TODO.md` already records
that `Uncategorized` can be neither renamed nor capped there, though the API accepts it. Recorded
rather than fixed by a second summation: `allocated` is the same figure the Categories tab's
summary card and the Allocate modal both read, and a private re-sum here would be a second
authority on one number.

## What the design does not settle, and what this does about it

| #   | The design shows                                    | What is true                                                          | Disposition                                          |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `8 categories · $1,800 allocated of $2,000`          | Mock figures contradicting the caps drawn on the Categories tab (A25, A44) | Every figure is real, from the read. The ticket says so itself. |
| 2   | A `$` on both amounts                                | Money follows the profile's currency as of PET-47                     | `useMoney()`'s `formatWhole`, so `EUR` renders `€1,800` |
| 3   | An 820px column                                      | The frames are 1440px only and draw no narrow viewport                | Inherits the form's `max-w-205` ceiling, the standing carve-out |
| 4   | No failure and no empty state                        | The read can fail, and an account can have zero non-fallback categories | Both invented; both owe A29 a sign-off               |
| 5   | A secondary "Manage" with no prototype link          | The Categories tab exists and is complete                             | Inert, by decision 1 above                            |

AC1, AC2, AC4 and AC5 are met in full. AC3 is amended by decision 1, and AC4's "when I return to
Settings" half still holds, because the figures come from a fresh read on every render.

## Decisions

**The card lives inside `SettingsForm`'s `<form>`, as a literal sibling of `ProfileCard` and
`PreferencesCard`.** The frame puts it between Preferences and the Save row, and Save is inside the
form, so the card has to be too. It is **not** a `ReactNode` slot on `SettingsScreen`, for
`CategoriesScreen`'s reason that `frontend/src/app/CLAUDE.md` already applies to both siblings: a
slot with one possible occupant expresses no choice.

**It carries no `'use client'` of its own**, like both siblings: its only importer is
`SettingsForm`, which is a client module, so the directive would advertise a boundary that is not
there. Being client-by-import is also what lets it call `useMoney()` from
`(app)/PreferencesProvider` rather than taking a currency prop - and that provider reads the
_saved_ profile off the layout, which is exactly what decision 3 wants. A currency edited and not
yet saved does not re-denominate this card, and that is correct rather than a lag: every figure on
it is a saved figure, so a `€` beside a budget nothing has stored would be the lie.

**Its props are one object, not the four-prop card shape.** `values` / `errors` / `disabled` /
`onChange` is the shape of a card that writes; this one reads and has no field to disable. It takes
`summary: CategoriesSummary | null`, where `null` is decision 4's degraded state.

**The derivation lives in `settings/categoriesSummary.ts`, React-free**, which is the split
`settingsForm.ts`, `categoryForm.ts`, `(app)/transactionForm.ts` and `allocateForm.ts` all make:
the rules are plain functions whose suite needs no jsdom, and the card is left with rendering. It
exports the type, `toCategoriesSummary(categories, allocation)` and `categoryCountLabel(count)`.

**`categoryCountLabel` is a local ternary and not a helper lifted from anywhere.** It is the app's
fourth pluralized string after `dashboard/BudgetCard.tsx`'s "days left" and the two "transactions"
in `transactions/categories/`; each of those three carries a note saying that N call sites with N
different nouns is not a pluralization library, and that reasoning is unchanged by a fourth.

**The fallback filter is written here rather than imported.** `allocateForm.ts`'s
`allocatableCategories` is the identical one-line filter and it lives under
`transactions/categories/`; a settings module reaching into that folder would invert the layering
the way `lib/pickerScroll.ts`'s move fixed, and the rule of three says duplicate until a third
consumer appears. So: duplicated, with a comment naming its twin and the ticket that would lift
both.

**The categories read never decides whether the session is alive, including on its own 401.** That
is `lib/palette.ts`'s policy applied unchanged, and the reason is the one
`transactions/categories/page.tsx` states: only one read on a page may hold an opinion about the
session, and two opinions is the shape the `/dashboard` to `/login` loop came out of. So _every_
failure - 401 included - becomes `summary: null` and the card draws its unavailable line, while
`requireProfile()` above it stays the read that redirects. Throwing would trade a working profile
form for an error page over one summary sentence, which is the opposite of the call
`transactions/categories/page.tsx` makes for its own list, where the response _is_ the screen.

**The profile is awaited before the categories read rather than beside it**, matching that same
file. It costs nothing: `requireProfile()` is wrapped in React's `cache()` as of PET-47, so the
shell's call and this one are one `GET /api/profile` per render pass.

## Markup

Stock daisyUI, mapped from both designs rather than transcribed - the Claude Design file's
`var(--text-heading)` and `600 15px/1.3` are its own system's values, and `frontend/CLAUDE.md`'s
Design tokens section is the authority for what they become here. Same box as its two siblings,
`card bg-base-100 shadow-sm`, because the three cards on this page must not drift apart.

Three things in it are deliberate. The flex row is an **inner `div`** rather than
`card-body flex-row`: `card-body` sets its own `flex-direction`, and a utility at equal specificity
is resolved by daisyUI's emission order rather than by the attribute - the mechanism
`frontend/CLAUDE.md` records for paired modifiers, reached from a different direction. There is
**no header rule**, unlike the two cards above, because neither design draws one here. And the
title is an `h2` because `PageHeader` owns the page's `h1`, which is what keeps
`SettingsScreen.test.tsx`'s one-page-heading assertion green.

Watch `.card-body p { flex-grow: 1 }` in the browser walk. It is the trap `frontend/CLAUDE.md`
records for a two-`<p>` card footer; the sentence here sits in a flex column rather than beside the
button, so it should not bite, and "should not" is what a walk is for.

## Tasks

- [ ] Branch `feat/PET-48-settings-categories-summary` off `feat/PET-47-preferences-card`, commit
      this plan alone, push, open a draft PR against that branch with this checklist in the body
- [ ] `settings/categoriesSummary.ts` and its suite: the type, the fallback filter, the pluralized
      label
- [ ] `settings/CategoriesSummaryCard.tsx`: the card, its degraded branch and the inert "Manage"
- [ ] `settings/SettingsForm.tsx`: the `summary` prop, the card rendered between `PreferencesCard`
      and the failure line, and the placeholder comment replaced by the real thing
- [ ] `settings/SettingsScreen.tsx` and `settings/page.tsx`: the prop threaded, the
      `readCategoriesView()` read with its degrade-only failure policy, and both files' stale
      PET-47 comments corrected
- [ ] `SettingsForm.test.tsx`: a `describe` per acceptance criterion - real figures, pluralization
      at 1 and at many, the fallback excluded, "Manage" carrying neither `disabled` nor
      `aria-disabled`, pressing it calling `save` zero times (the assertion that catches a missing
      `type="button"`, which would submit the form), and the degraded card keeping its heading and
      its button
- [ ] `SettingsScreen.test.tsx` and `(app)/pages.test.tsx`: the heading counts, and
      `../../lib/categories` mocked with a **relative** specifier, since `jest.mock` cannot resolve
      `@/`
- [ ] `SettingsScreen.stories.tsx`: `summary` in `args`, plus `SingleCategory`, `NoCategories` and
      `CategoriesUnavailable`
- [ ] Gates from `frontend/`: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`,
      `npm run build-storybook`; then `npm run docs:check` from the repo root
- [ ] Browser walk against every acceptance criterion, in both themes, recorded in the PR
- [ ] Update `docs/TODO.md`: the inert "Manage", the fallback-count seam against `allocated`, and
      the two invented states owing A29
- [ ] Update `frontend/CLAUDE.md`, `frontend/src/app/CLAUDE.md` and root `CLAUDE.md`, including the
      four sentences attributing this card to PET-47 and the comment in
      `frontend/src/app/screens.stories.test.tsx`
- [ ] Jira: record the AC3 amendment, the fallback-exclusion call, and the saved-versus-typed
      budget decision on PET-48

## What this deliberately does not do

- **It does not wire "Manage"**, by decision 1. `TAB_HREFS.categories` is the destination when a
  ticket picks it up, and no fourth route declaration is needed.
- **It does not add a category-count field to any endpoint.** `categories.length` at the call site
  is what `TransactionTabs`' badge already does on two routes.
- **It does not re-sum the caps.** `allocation.allocated` is the authority, for the reason under
  decision 2.
- **It does not touch the Save gate or the diff.** The card holds no value, so
  `SettingsFormValues`, `invalidFields`, `toUpdateProfileBody` and `sameSettingsValues` are all
  untouched - which is the difference between this card and PET-47's, and worth stating because
  PET-47's plan predicted five edits in those files and this one predicts none.
