# PET-47: Preferences card, the merged budget field, and a currency that is finally read

Jira: [PET-47](https://decode.atlassian.net/browse/PET-47) · Epic:
[PET-7 Settings](https://decode.atlassian.net/browse/PET-7) · Figma:
[17 Settings](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=40-630)
(frame `40:630`) · Claude Design: `ui_kits/expensa-app/SettingsScreen.jsx` and
`ui_kits/expensa-app/OnboardingScreen.jsx` in the team's Expensa Design System

**Stacked on `feat/PET-46-settings-profile-card`** (PR #81, open, not merged). PET-46 builds the
page `<form>`, the Profile card and the single "Save changes"; this ticket adds fields to that
same form and that same PATCH. Cutting from `main` instead would mean rebuilding all of it.

## Why

`frontend/src/app/(app)/settings/settingsForm.ts` already carries the shape of this ticket in its
header comment: PET-47 adds `currency`, `monthlyBudget` and `monthStartDay` to
`SettingsFormValues`, a case each to `invalidFields`, a comparison each to `toUpdateProfileBody`,
"and nothing else moves". That is still true of the form module, and it is the smallest part of
the work.

The rest is that **three long-standing deferrals all come due on this one card**, and the product
owner has decided all three in favour of doing them properly rather than deferring again.

## What the backend needs: nothing

`PATCH /api/profile` already takes all six fields, `monthStartDay` is already validated `@IsInt`
`@Min(1)` `@Max(28)`, `currency` is already `@IsISO4217CurrencyCode()`, and both DTOs are already
in `frontend/src/types/api.d.ts`. **No request or response body changes, so `npm run api:sync` is
deliberately not run.** Said out loud because the rule is easy to apply by reflex and because the
PET-70 plan records the opposite for itself.

`monthStartDay` is also already load-bearing server-side: `src/common/month-window.ts` is the only
place a period is computed, `CategoriesService.period()` its only caller, and the transactions
list filter, the transaction detail, the whole dashboard and the insights generator all compose
it. Month attribution is the `date` string read at query time, so a changed value re-buckets
history correctly with no backfill. **The value has simply never had a screen that sets it**,
which `docs/TODO.md` records twice.

## Scope: three features, one branch

The product owner chose a single branch and a single PR over a stack. Recorded here because the
diff is large and a reviewer should know the shape was chosen rather than accreted:

1. **Currency becomes live.** `USD` / `EUR` / `GBP`, read from the profile and threaded to every
   money string in the app.
2. **The budget field is rebuilt to Claude Design's**, on Settings **and** on onboarding step 1.
3. **The Preferences card ships**, with the month-start control, and the month-labelling gap that
   control would otherwise expose is closed in the same branch.

## The two authorities disagree, and Claude Design wins on the field

The product owner's ruling: for the Monthly budget field, the team's Claude Design system beats
Figma. Its source is `OnboardingBudgetField` in `ui_kits/expensa-app/OnboardingScreen.jsx`, which
`SettingsScreen.jsx` renders inside a card at `maxWidth: 420`.

| Aspect              | Figma / what ships today                                   | Claude Design                                                        |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Currency control    | Its own `ui/Select` row reading "USD - $"                   | Absorbed into the budget field as its left segment                    |
| Budget input        | A plain `ui/Input`                                          | The right segment of a joined pill                                     |
| Suffix              | None                                                        | A muted "/ month" inside the pill's right edge                        |
| Focus ring          | On the input                                                | On the **container**, so the whole pill lights up                     |
| Currencies offered  | USD only (A6)                                               | USD / EUR / GBP in a custom `role="listbox"` popover                  |

Read off the source, the field is: a 41px-tall pill at `--r-md` with `--ring-card` and
`overflow: hidden`, holding a currency `<button>` on `--bg-muted` (symbol at 600 weight, code at
500, an 18px chevron that rotates 180° when open) with a `1px solid --line-default` right edge,
then the amount `<input>` (`inputMode="decimal"`, `--strong-m` at 600 weight, `tabular-nums`,
transparent, no outline of its own), then the `/ month` span at 400/12px in `--text-muted`.
Focused, the container's shadow becomes `inset 0 0 0 1px var(--bg-accent), var(--ring-focus)`.

Those are Claude Design's own CSS variables, not this repo's. **They get mapped to daisyUI
semantic classes, never copied as raw values** - `frontend/CLAUDE.md`'s Design tokens section is
the authority, and the standing rule that theme-aware colour is daisyUI semantic colour only is
what makes a literal port wrong. `CardBanner.tsx`, `CategoryCard.tsx` and `AllocateBudgetModal.tsx`
are the three existing precedents for translating this system rather than transcribing it.

## What the design does not settle, and what this does about it

| #   | The source shows                                          | What is true                                                                 | Disposition                                                          |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | "Changing your budget applies from the next month onward." | The budget is one column; every read compares the current period immediately    | **Line dropped.** It contradicts AC4, and rewording was declined       |
| 2   | A "Budget" card with an "On track" status chip             | Settings fetches no dashboard data and the chip has nothing behind it           | **Chip dropped**, card stays the ticket's "Preferences"                |
| 3   | No "Month starts on" control anywhere in Claude Design     | The ticket requires one (SET-3)                                                 | Built from the ticket, in the same card, below the budget field        |
| 4   | Currency offered as USD / EUR / GBP                        | AC2 says only USD, and A6 says only USD appears in the file                     | **AC2 amended.** All three ship; see the currency section below        |
| 5   | An avatar block, category chips and a danger zone          | None is in PET-47, and two are whole features                                   | Out of scope, not built                                               |
| 6   | A 28-option list has no design at all                      | Figma never draws a dropdown open (A16, A40)                                    | Ours, and it owes a designer sign-off exactly as `DateField` does      |

AC2 is amended by the product owner's explicit decision. AC1, AC3, AC4, AC5 and AC6 are met in
full, with AC1 reading "currency" as the budget field's left segment rather than a separate row.

## Decisions

**The currency refactor is the base of everything and is invisible on its own.**
`frontend/src/lib/format.ts` builds two `Intl.NumberFormat` singletons at module scope, both
hard-coding `currency: 'USD'`, and its own comments have said "when the onboarding currency is
finally threaded through" since PET-9. `formatCurrency`, `formatWhole` and `formatNegative` have
**72 call sites across 16 components**, 12 of them Server Components and 4 Client. So the field
cannot offer EUR without that thread being pulled first.

The shape: a new `lib/money.ts` exposing `moneyFormatters(currency)` returning the three bound
functions, memoized per currency because constructing an `Intl.NumberFormat` is not free and the
dashboard alone formats dozens of amounts per render. `lib/format.ts` keeps exporting the
USD-bound versions, because one consumer genuinely must not read a profile: `DecorativePanel.tsx`
renders on the **access screens**, before anybody is signed in.

**Server and client reach the currency by different routes, and that is not avoidable.** React
context does not cross into Server Components, so:

- `(app)/layout.tsx` already calls `requireProfile()` and is the only place that does. Server
  pages read the currency by calling `requireProfile()` themselves and passing it down as a prop.
- **`requireProfile()` must be wrapped in React `cache()` first**, or that second call is a second
  HTTP round trip. It deliberately uses `cache: 'no-store'`, and `cache()` does not undo that: it
  memoizes within one render pass, which is exactly the scope wanted and nothing wider.
- The 4 Client Components get a `PreferencesProvider` mounted in the same layout from the same
  read, exposing `useMoney()` and `usePeriod()`.

**The field itself is provider-agnostic, because onboarding has no profile.** Setup step 1 runs
pre-auth against `sessionStorage` (`setup/draft.ts`, which already holds `currency` and `budget`
as the right shapes). So the component takes `currency`, `value` and change handlers as props and
reads no context at all; Settings feeds it from the profile and onboarding from the draft. Making
it read a provider would have made it unusable on exactly one of the two screens it is for.

**Switching currency re-denominates and says nothing.** Amounts are integer cents with no
currency attached, so moving USD to EUR leaves 3,200 as 3,200 and renders it €3,200, and a $12.40
coffee logged last month re-renders as €12.40. There is no FX source and no per-transaction
currency column, and adding either is a different feature. The product owner chose this
explicitly **and chose to ship no warning copy for it**. It goes in `docs/TODO.md` rather than
on screen, because a decision nobody can see is the kind this repo has learned to write down.

**Grouping stays `en-US`; only the symbol changes.** `Intl.NumberFormat('en-US', { style:
'currency', currency })` gives €3,200.00 rather than 3.200,00 €. This keeps
`formatAmountInput`, `reformatAmountInput` and `amountCaret` untouched, all three of which assume
a comma group separator and a dot decimal. It also extends the `en-US` deviation `docs/TODO.md`
already records rather than inventing a second locale story.

**"Month starts on" is a custom listbox, not a `<select>`.** A native select's popup height cannot
be set in CSS in Firefox or Safari, and the product owner wants a guaranteed cap with 28 options.
So this is a `role="listbox"` popover with a fixed `max-height` and its own scroll. That means
owning roving focus, type-ahead, click-away and Escape - `DateField.tsx` already owns all of that
for a calendar and is the closest precedent, including its hard-won `fixed`-not-`absolute`
positioning and `placeAgainst`. `PopoverMenu.tsx` is deliberately **not** the base: it documents
its refusal of `role="menu"`, and a single-select list of 28 values wants listbox semantics, which
is a different accessibility contract. The plan is to extract the shared positioning and
dismissal from `DateField` rather than write a third copy.

**Options read "1st of the month" through "28th of the month", flat.** No shortcut group, no
"custom date" branch, no calendar. This was weighed and rejected: the value is a day-of-month
ordinal that repeats, not a date, so a calendar grid drawing weekdays and a year is the wrong
affordance, and a shortlist of 1st/15th/28th advertises February's ceiling as if it were a
popular choice. A flat list also keeps the mental model to one control.

**The month-labelling gap closes here, and it needs a second pair of functions rather than an
edit to the first.** `monthOverline()` and `monthLabel()` format the calendar month and ignore
`monthStartDay`; `docs/TODO.md` proposes rendering both months ("October / November") when the
value is above 1. The trap: `DateField.tsx` calls `monthOverline` for its calendar popover's own
header, where the calendar month is **correct** and a period label would be nonsense over a grid
of real weeks. So this adds `periodOverline(monthStartDay, today)` and `periodLabel(...)` and
leaves the existing two alone for genuinely calendar-scoped callers.

Five consumers move to the new functions: `dashboard/DashboardScreen.tsx` (both),
`transactions/TransactionsScreen.tsx`, `transactions/categories/CategoriesScreen.tsx`,
`transactions/categories/SpendingSummaryCard.tsx` and `insights/page.tsx`.
`insights/SummaryBanner.tsx` does **not**: its label is `set.monthLabel` off the backend, which is
already period-correct, and the comment in `insights/page.tsx` saying so stays true.

**Onboarding loses its separate Currency select.** `setup/BudgetForm.tsx` currently renders a
`ui/Select` with the single `USD - $` option above a plain `ui/Input`; both are replaced by the
one merged field. The draft's state shape does not change. `SetupBudgetScreen`'s tests and
stories do, and `draft.ts`'s `DEFAULT_CURRENCY` becomes the field's initial value rather than the
only value it can hold.

## Tasks

- [ ] Branch `feat/PET-47-preferences-card` off `feat/PET-46-settings-profile-card`, commit this
      plan alone, push, open a draft PR against PET-46's branch with this checklist in the body
- [ ] `lib/money.ts`: `moneyFormatters(currency)` returning memoized `formatCurrency`,
      `formatWhole`, `formatNegative`; `lib/format.ts` keeps USD-bound re-exports for pre-auth use
- [ ] Wrap `requireProfile()` in React `cache()` so a server page can re-read it without a second
      request, and confirm `cache: 'no-store'` semantics are unaffected
- [ ] `(app)/PreferencesProvider.tsx` holding `currency` and `monthStartDay`, mounted in
      `(app)/layout.tsx` off the existing read, exposing `useMoney()` and `usePeriod()`
- [ ] Thread currency through the 12 Server Component consumers by prop and the 4 Client ones by
      hook; leave `DecorativePanel.tsx` on the static USD formatters
- [ ] Update the tests and stories of every component touched by the thread
- [ ] Add `periodOverline` / `periodLabel` to `lib/format.ts`, rendering one month at
      `monthStartDay` 1 and "October / November" above it; leave `monthOverline` / `monthLabel`
      for `DateField`
- [ ] Move the five period-scoped consumers onto the new functions, and pin the boundary cases in
      `format.test.ts`
- [ ] `BudgetField` component: the merged pill on `FieldShell`, daisyUI-mapped, container focus
      ring, `/ month` suffix, reusing `reformatAmountInput` for live grouping
- [ ] The currency listbox inside it (USD / EUR / GBP), with keyboard, click-away and Escape
- [ ] `BudgetField` stories and tests
- [ ] Adopt `BudgetField` in `setup/BudgetForm.tsx`, delete its separate currency select, update
      `SetupBudgetScreen` tests and stories
- [ ] Extract the shared popover positioning and dismissal from `DateField.tsx`
- [ ] `MonthStartField`: `role="listbox"`, 28 flat options, fixed `max-height` with its own
      scroll, roving focus, type-ahead
- [ ] `MonthStartField` stories and tests
- [ ] `PreferencesCard` composing the two fields; mount it in PET-46's `SettingsForm`
- [ ] Extend `settingsForm.ts`: `currency`, `monthlyBudget`, `monthStartDay` into
      `SettingsFormValues`, `FIELD_ID`, `invalidFields` and `toUpdateProfileBody`
- [ ] Verify AC6 end to end: one "Save changes" sends one PATCH carrying both cards' changed
      fields, and an unchanged form still sends nothing
- [ ] Verify AC4 and AC5 against a running app: save a new budget and a new month start, then
      check the dashboard card, the "This month" filter and the new period labels
- [ ] Update `docs/TODO.md`: close the header-period entry, and record the silent re-denomination
      and the two controls owing a designer sign-off
- [ ] Update `frontend/CLAUDE.md`, `frontend/src/app/CLAUDE.md` and root `CLAUDE.md`'s "what is
      still missing" sentence
- [ ] `npm run build` in both apps as the typecheck, plus lint, tests and Storybook

## What this deliberately does not do

- **No FX conversion**, per the decision above. Numbers are re-denominated, never converted.
- **No locale-native number formatting.** EUR renders as €3,200.00, not 3.200,00 €.
- **No currency beyond the three Claude Design draws.** The backend accepts any ISO 4217 code, so
  widening the list later is a frontend array edit.
- **No avatar upload, category chips or danger zone**, all of which Claude Design's Settings
  screen draws and none of which is in this epic's built tickets.
- **No `api:sync`.** Nothing a request or response body is made of changes.
