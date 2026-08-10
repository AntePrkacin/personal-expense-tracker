# PET-72: Make budget, caps and period rules historical

One ticket, one PR, by decision: the launch window is days away and every database is reset
before launch, so the whole data-model change ships together and migrations are regenerated as
fresh baselines with no backfill.

## Context

Budget, category caps and the month start day are stored as single current values
(`profile.monthly_budget_cents`, `profile.month_start_day`, `categories.monthly_cap_cents`), and
every historical month is computed against them. Changing any of them silently rewrites history:
a 2026 budget raise re-prices every 2025 month, a cap change rewrites past category views, and a
start-day change re-buckets all history. Until now that was celebrated as a feature ("a changed
`monthStartDay` re-buckets history for free"); this ticket reverses that decision for the
settings themselves while keeping spend aggregation computed on read. Bundled in, because the
reset window makes them nearly free: fullName replaces firstName/lastName, EUR becomes the
default of a real currency list, `categories.note` becomes `description`, onboarding asks the
paycheck day, Settings gets its first card, and the dashboard month select becomes real period
navigation (without navigation, historical correctness would be invisible).

## User story

**Human context only - skip when executing this plan.** The narrative walkthrough (Marko's job
change and the three paycheck-anchor scenarios) lives in PET-72's Jira description and the PR
body. Every engineering fact it carries is restated below: the anchoring rule under Decisions,
and the three concrete period layouts under Verification.

## Decisions already settled

- **Periods are anchored to paychecks.** A schedule change is anchored to T, the first
  new-schedule paycheck date. The old-rule boundary immediately before T is removed (arrears:
  that paycheck never arrives), one stretched **transition period** runs from the last kept old
  boundary to T, the new rule runs from T. T may be in the past or the future.
- **The transition period keeps the old budget**; the new budget applies from T.
- **Budget-only changes get the same month question**, anchored to that period's start.
- **Deferred, expressible later with zero schema change**: the same-employer pay-date shift
  (a short stub instead of the merge) becomes one extra modal question that stores
  `transition_start` one boundary later. Out of scope for launch.
- Currency list restricted to two-decimal currencies, because `src/common/money.ts` assumes
  exponent 2.

## Relationship to the Settings epic (checked 2026-08-10)

PET-7's other children overlap this ticket, and this plan lands **on top of** them, not beside
them:

- **PET-46 (PR #81, in review)** ships the Profile card (first/last name + email), the
  page-level single-save `SettingsForm` and `lib/updateProfile.ts`. After it merges, PET-72
  collapses its two name inputs into one "Display name" field and moves `settingsForm.ts` onto
  `fullName`.
- **PET-47 (PR #82, in review, stacked on #81)** ships live currency (USD/EUR/GBP) via
  `lib/money.ts` `moneyFormatters(currency)` + `PreferencesProvider`, the `BudgetField` pill
  reused on onboarding step 1, the `MonthStartField` listbox, and frontend
  `periodOverline`/`periodLabel`. PET-72 **adopts** that currency mechanism (the earlier
  "currency travels on the response" idea is dropped), widens the list and flips the default to
  EUR, **moves** the budget and month-start-day writes off the single `PATCH /api/profile` onto
  the anchored schedule write, and **supersedes** the frontend period labels with the backend's
  `period.label`, because a variable-start history cannot be labelled by frontend month math.
- **PET-48 (in progress)** is the read-only categories summary card with a "Manage" link. It
  reads current-period figures, so it survives with at most renamed fields.
- **PET-49 (to do)** verifies that one Save propagates everywhere, and its **AC7 codifies the
  recompute-history behaviour this ticket abolishes**. Amend AC7 to the historical semantics
  (ACs are amendable) and schedule PET-49 after PET-72, where it becomes the natural home of
  the propagation re-verification.

**Sequencing.** #81 and #82 (and PET-48's PR when it opens) merge first; this branch then
merges `main` in as its own bare commit before any frontend work. Backend tasks conflict with
none of them and may proceed meanwhile, with one exception that must not ship alone: narrowing
`UpdateProfileDto` breaks PET-47's budget and month-start saves, so the DTO narrowing and the
Settings rework land together in this one PR (which they do).

## Design

### Data model (per-user DB)

Three new append-only tables, repo conventions throughout (UUIDv7 text PK via `newId()`,
epoch-ms `created_at`, nullable `deleted_at`, FK-less, text `YYYY-MM-DD` dates). Nothing updates
or deletes rows; corrections are appends resolved latest-wins.

- `period_rules(id, effective_from, month_start_day, transition_start, ...)`, unique index on
  `effective_from`. `effective_from` = T, always day-N of its own month. `transition_start` is
  stored, not derived (NULL on the seed rule), so the period walk stays dumb and the deferred
  stub case is a write-time choice.
- `budget_history(id, effective_from, budget_cents, ...)`, index on `effective_from`.
- `category_cap_history(id, category_id, effective_from, cap_cents, ...)`, `cap_cents` NULL =
  uncapped, index on `(category_id, effective_from)`.

Resolution: greatest `effective_from <= window.start`, ties by `created_at DESC, id DESC`.
Budget falls back to the earliest row for periods older than the account; caps fall back to
uncapped (sparse history: provisioning writes no cap rows, starter categories are uncapped).

Removed or changed: drop `profile.monthly_budget_cents`, `profile.month_start_day`,
`categories.monthly_cap_cents`; `first_name`+`last_name` become `full_name`; `categories.note`
becomes `description` (`transactions.note` untouched); `categories.icon` tightens to NOT NULL;
currency default becomes `'EUR'`; `OnboardingPayload` gains `fullName` and keeps
`monthStartDay`.

### Backend

- `backend/src/common/period-rules.ts` (new, pure): the walk. A rule tiles plain month
  arithmetic from its `effective_from` up to the next rule's `transition_start`; one transition
  period sits between segments; the first rule extends backward, the last forward. Includes
  `transitionStartFor(activeRule, T)` and `periodLabel` ("October 2025",
  "October / November 2025"). `month-window.ts` shrinks to `todayIn`, `addDays`, `daysBetween`,
  `daysLeftInWindow`.
- `PeriodService` (new, own module): owns the `period_rules` read, windows, enumeration (from
  min(first rule, earliest transaction incl. tombstoned) to current) and `budgetCentsFor`. This
  is the promotion `docs/TODO.md` Housekeeping already asks for; Categories, Transactions,
  Dashboard, Insights, Profile and Verification compose it, and it fixes the documented
  `daysLeft` midnight edge.
- Cap resolution lives in `CategoriesService.withSpend` as a correlated scalar subquery
  (greatest `effective_from <= window.start`), date predicates staying in the JOIN condition;
  `list(userId, periodStart?)` serves any period and the allocation summary becomes
  period-scoped. `monthStatsFor` stays current-window.
- Writes stay off `db.transaction()` (embedded driver refuses overlap): the bulk cap write
  becomes one conditional `INSERT ... SELECT ... FROM (VALUES ...) WHERE (live-count) = n
  RETURNING` (the PET-70 shape, all-or-nothing preserved); the schedule write is an ordered
  pair (rule insert with `onConflictDoNothing` on the unique index, then budget insert), retry
  convergent; single-category cap changes become cap-history appends.
- New `POST /api/profile/schedule` (`monthlyBudget`, `monthStartDay`, `firstPaycheckDate`);
  `UpdateProfileDto` drops budget/start-day and swaps the names for `fullName`;
  `ProfileResponseDto` keeps `monthlyBudget`/`monthStartDay` as resolved current values.
- Period parameter: transactions `period` widens to `current|previous|all|YYYY-MM-DD` (inline
  `@Matches`); new `{ period?: YYYY-MM-DD }` query DTOs on `GET /api/categories` and
  `GET /api/dashboard`; unknown start answers 400. `DashboardResponseDto` gains
  `period { start, end, label }` (closing the docs/TODO.md entry that asks for it); the
  categories and transactions responses gain the same `period` object where their screens
  need the label. Currency stays on the profile read, threaded by PET-47's
  `PreferencesProvider`; no response DTO carries a currency field.
- New `GET /api/periods`: guarded, wrapper DTO, `{ start, end, label, current }` newest first.
- Registration: `RegisterDto.fullName`; `currency` via `@IsIn(SUPPORTED_CURRENCIES)` (new
  `src/common/currency.ts`, publishes a real enum); EUR default in `AuthService.register`;
  verification seeds one `period_rules` and one `budget_history` row (skip-if-any-row guards,
  resumable).
- Delete `legacy-colour-backfill.ts` (file, call site, e2e spec); regenerate `drizzle/central`
  and `drizzle/user` as one baseline migration each.

### Frontend

- **Currency: adopt PET-47's mechanism, do not rebuild it.** `lib/money.ts`
  `moneyFormatters(currency)` and `PreferencesProvider` already thread currency to every money
  string (12 Server Components by prop, 4 client ones by hook; locale stays `en-US`). PET-72
  widens the offered list from USD/EUR/GBP to the full two-decimal allowlist off the contract's
  new enum, flips the default to EUR, and keeps `BudgetField`'s currency segment as the picker
  on both Settings and onboarding.
- Setup: `CURRENCY_OPTIONS` moves into `draft.ts` typed off the contract enum with
  `DEFAULT_CURRENCY = 'EUR'`, so **the onboarding budget step's currency select preselects EUR
  on a fresh draft** (via `EMPTY_DRAFT`), `parseDraft` falls back to EUR on unknown stored
  codes, and the backend's `RegisterDto`/schema defaults are the same EUR safety net for a
  payload that omits it; the paycheck-day question is a third field on the
  budget step (not a fourth step); `RegisterForm`'s two name inputs collapse to one, label
  "Display name", placeholder "Your name, full name or nickname."; `initials`/`shortName`
  become single-argument.
- Settings: **rework PET-46/47's shipped form, not greenfield.** ProfileCard's two name inputs
  collapse to one "Display name" field (`settingsForm.ts` moves onto `fullName`); the budget
  and month-start writes leave the single `PATCH /api/profile` and go through the anchored
  schedule write (`lib/changeSchedule.ts` server action to `/api/profile/schedule`), carrying
  the paycheck month question (last 4 / current / next 4; T derived as month + day).
  **Decided (2026-08-10): intercept the single Save.** `BudgetField` and `MonthStartField`
  stay inline in PET-47's form; when Save carries a budget or pay-day change, a confirmation
  dialog (on `(app)/Modal.tsx`, confirmation shape) asks the paycheck month, then the app
  sends the schedule write plus the ordinary PATCH for any other changed fields; a Save with
  neither field changed never shows the dialog. Currency and the profile fields stay on the
  single-save PATCH.
- Period navigation: `MonthPill` becomes a real labeled select fed by new `lib/periods.ts`;
  `?period=<start>` absent for the current period; dashboard and categories pages gain
  `searchParams`; transactions `filters.ts` widens period (the `AssertNever` exhaustiveness
  pair is reworked); overlines switch to the response's `period.label`.
- `note` to `description` in the category form and modals only.

## Checklist

- [ ] 0. Ticket, worktree branch `feat/PET-72-historical-budget-periods`, this plan committed
      alone, draft PR opened
- [ ] 1. Schemas (user + central): three history tables, drops, fullName, description, icon
      NOT NULL, EUR default
- [ ] 2. `period-rules.ts` pure walk + exhaustive specs; trim `month-window.ts`; `currency.ts`
- [ ] 3. `PeriodService`/`PeriodModule`; rewire Categories/Transactions/Dashboard/Insights/
      Profile off `CategoriesService.period()`
- [ ] 4. Regenerate baseline migrations (both scopes); delete legacy-colour-backfill
- [ ] 5. `CategoriesService`: cap subquery in `withSpend`, period param on `list`, `setCaps` as
      conditional `INSERT ... SELECT`, create/update cap-row handling
- [ ] 6. Transactions period widening; Dashboard query DTO + `period`/`currency` fields;
      `GET /api/periods` module
- [ ] 7. Profile: `fullName`, narrowed `UpdateProfileDto`, `POST /api/profile/schedule`
- [ ] 8. Auth/provisioning: `RegisterDto`, EUR default, history seeding at verification
- [ ] 9. Root `npm run api:sync`; commit both artifacts
- [ ] 10. Backend tests: re-pin `openapi.e2e-spec.ts`; sweep name fixtures across the e2e
      suites; rework `categories.e2e-spec.ts`; new periods + schedule-change e2e covering the
      three user-story scenarios, retroactive T and setCaps all-or-nothing
- [ ] 11. Frontend: currency threading + formatters; setup changes; Settings screen + modal;
      period select + threading; note to description; update pinned tests; stories for new
      surfaces
- [ ] 12. Fixture/seed: `showcase/generate.ts` + `seed-showcase.ts` history writes;
      `mise run seed:fixture` (own commit)
- [ ] 13. Docs sweep: root/backend/frontend CLAUDE.md claims, guides' curl payloads,
      docs/TODO.md resolved entries deleted
- [ ] 14. Verification: builds, suites, `docs:check`, seeded browser walk of the three
      scenarios

## Verification

- `npm run build` + `npm test` in both apps; `npm run test:e2e` in `backend/`;
  `npx tsc --noEmit` in `frontend/`; `npm run docs:check` at the root; committed `api:sync`
  artifacts keep both CI drift gates green; `npm run build-storybook`.
- New e2e walks the user story literally: seed rules at day 1, change the schedule with T in a
  past, the current and a future month, assert the three period layouts, the old budget on
  every transition period, re-bucketed transactions and per-period cap resolution.
- `mise run seed` (local mode) then a browser walk: the dashboard period select navigates
  history with correct labels and figures; the Settings modal changes budget and pay day and
  December stretches to 14 Jan; the Allocate modal stays all-or-nothing; onboarding asks the
  pay day; the sidebar shows the fullName; amounts render in EUR.

## Risks pinned up front

- Deliberate tripwires that will fire: `filters.ts` `EveryPeriodIsOffered`, required formatter
  arguments, `draft.test.ts`'s monthStartDay-omission pin, the Dashboard combobox and Settings
  zero-controls pins, every `openapi.e2e-spec.ts` pin named above (change them in the same
  commit as the DTOs).
- No new `db.transaction()` call sites on user databases, ever.
- Insights month-over-month across a stretched transition period needs its own spec case.
- In `withSpend`, NULL-vs-no-row both mean uncapped; documented on the schema comment.
- The `note` rename must not leak into `transactions.note` or receipt scanning; sweep with
  `rg -in --hidden` before committing.
