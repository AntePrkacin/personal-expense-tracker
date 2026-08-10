# PET-73: move the insight cards to the Dashboard, and turn `/insights` into an AI assistant chat

**One branch, both halves.** Splitting them would leave a merged state where the cards are gone
from `/insights` and the chat has not landed, regressing a complete screen to an empty one.

## What this is written against, and the branch that lands first

Written against `7563ccf` (`main`, after PET-46 and PET-47 merged in #82), **and adjusted for
PET-72 (#84), which is implemented, in review, and lands before this branch.** An earlier draft of
this plan described PET-72 as "two commits and both are docs" and assumed this branch went first.
Both are wrong: #84 is 192 files, +9,726/-5,864, and the ordering is reversed. Everything below is
adjusted for it, so **cut this branch from a `main` that already has #84** and re-read every path
named here at that commit.

Six things it changes that this plan depends on:

- **`PeriodService` exists** (`backend/src/periods/`), and `RuleBasedInsightGenerator` already
  composes it. **`CategoriesService.currentWindow` and `previousWindow` are gone**, so anything
  wanting a window calls `periods.current(userId)` / `periods.previous(userId)`. Its public surface
  is `today()`, `current()`, `previous()`, `startingAt()`, `startingAtOrContaining()`, `all()`,
  `budgetCentsFor(userId, period)`, `monthStartDayFor()`, `ruleInForceAt()` and `rules()`.
- **The user-scope migrations are collapsed into one `20260810085329_init` baseline.** The three that
  existed, `add_category_fallback`, `add_insights` and `add_insights_generating_guard`, are gone as
  files; their tables live in the baseline. So the assistant's tables are a **new migration on top of
  it**, and the instruction below to "copy the `insight_sets`/`insights` migration" no longer points
  at anything - copy the **table definitions in `schema.ts`** instead.
- **The budget and the caps are effective-dated and no longer columns.**
  `profile.monthly_budget_cents` and `profile.month_start_day` are gone, replaced by `budgetHistory`
  and `periodRules`; `categories.monthly_cap_cents` is gone, replaced by `categoryCapHistory`. Read
  all three through the services, never off a column. `profile.currency` survives unchanged, which is
  the one field the generator reads directly.
- **`categories.note` is renamed `description`**, matching the template column it is copied from.
  `transactions.note` is untouched.
- **`profile.first_name` and `last_name` are now `full_name`.** Nothing in this plan sends a name, so
  this is a note rather than a dependency.
- **The Dashboard is period-navigable**, and that is the change with real consequences for Half 1.
  See the next section.

## The Dashboard can now show a past period, and the insight cards must not lie about it

**This is the one genuinely new problem #84 creates for this plan, and it was not in the earlier
draft at all.**

`dashboard/page.tsx` now parses a `?period=` parameter (`lib/periodParams.ts`), passes it to
`readDashboard(period)`, and `DashboardResponseDto` carries a `period` object with `start`, `end` and
`label`. `daysLeft` is documented as `0` for a period navigated back to, which is finished rather
than nearly over. `MonthPill.tsx` is deleted; the header draws a real select built from
`readPeriods()`.

**Insights are generated for the current period only, and the contract says so.**
`DashboardResponseDto.insight`'s own description on #84 reads "**Always the latest set**, not one for
the period being viewed: insights are generated for the current period only." `GET /api/insights`
publishes no `period` at all, which is precisely why `insights/page.tsx` on #84 takes its overline
from `GET /api/periods` rather than from the set's `monthLabel` - that file records the reason: a
set's label "is stale in the ready one the moment a period rolls over".

So moving the banner to the top of the left column and two insight cards under the donut would, on a
past-period view, put **October's analysis above September's figures** with nothing on screen saying
which is which. That is the failure this repo has already paid for three times: the no-results copy
claiming an account was empty, the teaser claiming insights unlock after a first expense, and the
donut caption saying "once you start spending" over real money. An empty or stale state has to be
honest about which thing it is describing.

**The decision: the insight block renders only for the current period.** On any other period the
banner and both cards are absent, and nothing stands in for them.

Two things about how that is expressed, because the obvious spelling breaks a documented rule.

**The slots stay required.** `DashboardScreen.tsx` says outright that every slot is required rather
than optional, because "there is no state in which one is absent, so an optional prop would let a
call site quietly test a dashboard with a card missing". Making these two optional would break that,
so the **component** decides to render nothing, exactly as `CategoryDonut` guards on its own input
rather than on the screen's shared flag. The call site always passes them.

**The condition is resolved once, in `page.tsx`, and threaded as a boolean.** That is PET-26's rule
for `isEmpty` and the reason the Dashboard has two conditions rather than five. So an
`isCurrentPeriod` (comparing `summary.period.start` against `currentPeriod(periods)`) sits beside
`isEmpty` and travels to the insight component as a prop. Do not have the component re-derive it from
a date, and do not read a clock: the frontend host's zone is not the backend's, which is the gap
`BudgetCard` and `TrendCard` each have a paragraph about.

## Why

`/insights` is a complete screen today: it reads `GET /api/insights` and renders three cards off
one `state` field - the dark `SummaryBanner` plus up to two `InsightCard`s from two rule-based
detectors. There is no AI in it. `backend/CLAUDE.md`'s `## Not built here` says so outright, and
`docs/TODO.md`'s "Insights are generated by rules, not an LLM" records the choice as deliberate:
no key, no per-run cost, no non-determinism, and specs that assert AC-exact strings.

Two things are wrong with that arrangement.

**The cards are on the wrong screen.** They summarise the month, which is what the Dashboard is
for, and the Dashboard already carries a fifth card - `InsightTeaserCard` - whose whole job is to
render the same headline and body from a different endpoint and link to the page that repeats
them. One fact, two DTOs, two components, three overlapping copies of "nothing here yet".

**The screen the cards occupy is the natural home for something that is actually AI.** A rules
engine cannot answer a question, and a user can ask one about their own spending. So the cards move
to the Dashboard and `/insights` becomes a chat over the user's transactions, on the same Gemini
key receipt scanning already uses.

Intended outcome: the Dashboard carries the month's analysis, `/insights` answers questions about
it, the duplication between the two disappears, and the `docs/TODO.md` insights entries this change
either makes reachable or makes cheap get closed.

## What must not change

Each of these is a recorded decision that this refactor is easy to undo by accident.

- **The rule-based generator, both tables, `GET /api/insights`, `POST /api/insights/generate` and
  the write-path trigger all survive.** The cards move; the machinery behind them does not. The
  chat generates nothing. `rg -n insight backend/src/assistant/` must come back empty, and so must
  the reverse - make that a review step rather than an intention.
- **`INSIGHT_GENERATOR` stays bound to `RuleBasedInsightGenerator`.** No `LlmInsightGenerator`, so
  the debounce `docs/TODO.md`'s "An LLM generator needs a debounce before it can be bound" says
  that swap owes is **not** owed by this branch, and `backend/CLAUDE.md`'s "**No LLM behind the
  insights**" bullet stays literally true. Deleting it would be wrong.
- **Insight content stays stored as rendered prose.** `backend/CLAUDE.md`, `## Insights`: the one
  place in this database that does, and "do not fix this toward the format-at-the-DTO convention"
  is written there in as many words.
- **The chat does not go in `src/insights/`.** `docs/TODO.md`'s "If `/insights` becomes a chat, the
  module boundary is the thing to get right" already decided it: "A persisted set generated on a
  schedule and a conversation held with a user share a vocabulary and nothing else."
- **The tone map inverts twice.** Backend `warning` renders as daisyUI `error` and backend
  `neutral` as `warning`. `insights/insightTone.ts` holds whole class strings per key. Carry it
  unchanged, including its fallback for an `info` tone stored before the enum narrowed.
- **A zero-card `ready` set is the steady state, not an edge case.** Over-cap needs a category that
  has a cap and is past it; month-over-month needs a previous month. A first-month account with no
  caps sees the banner alone, indefinitely.

## Half 1: the three cards move to the Dashboard

### Layout

`dashboard/DashboardScreen.tsx`'s `<main>` is a `grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]`. After
this change:

- **Left column:** the summary banner, then `budgetCard`, `trendCard`, `recentTransactionsCard`.
- **Right column:** `donutCard`, then the over-cap card, then the month-over-month card.
- **`InsightTeaserCard` is deleted**, and the banner absorbs its `card-actions` footer.
- **Both new slots render nothing on a non-current period**, per the section above.

Two things about that file changed on #84 and have to be worked with rather than around. It now takes
`period` and `periods` props of its own for the header's period select, so this is no longer a screen
with five props and nothing else. And **`MonthPill.tsx` is deleted** - the inert month pill that A8
kept unbuilt is a real control now, which is worth knowing because several paragraphs elsewhere in
the repo still describe the Dashboard as having one inert control.

The two components are already the same box - `card bg-neutral text-neutral-content shadow-sm` plus
`card-body gap-4`, an uppercase `text-neutral-content/60` `Sparkle` eyebrow, a
`font-display font-bold` heading and a `text-neutral-content/70` paragraph. The only structural
difference is the footer, so `SummaryBanner` grows an `action` slot and the teaser file goes. Keep
its `text-xl` heading rather than the teaser's `text-lg`: it is full-width in the wide column now.

**The control goes in `card-actions`, not directly in `card-body`.** That component declares no
`align-items`, so daisyUI's default `stretch` applies and a `btn` that is its direct child spans the
whole card - the trap `InsightTeaserCard` already records against
`frontend/node_modules/daisyui/components/card.css`.

### The banner needs the teaser's three copy states

On `/insights` the banner only ever rendered under `state === 'ready'`. On the Dashboard it is the
topmost card and carries the primary control, so it has to say something in every state. It absorbs
the split `dashboard/InsightTeaserCard.tsx` explains at length:

| Condition                     | Copy                                              | Control                                  |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `ready`                       | the set's own `monthLabel`, `headline` and `body` | "Ask about your spending" into the chat  |
| `generating`                  | `SummaryBannerSkeleton`                           | none while the skeletons are up          |
| `empty` and `isEmpty`         | the teaser's `UNLOCK_COPY`                        | `AddTransactionButton`                   |
| `empty` and not `isEmpty`     | the teaser's `PENDING_COPY`                       | "Ask about your spending"                |

`isEmpty` is `dashboard/page.tsx`'s existing shared `transactionCount === 0` condition from PET-26,
so this adds **no new condition** to the screen - which is the whole point of that ticket resolving
it once. Keep `UNLOCK_COPY` and `PENDING_COPY` exported so no test or story restates a shipped
string.

The label changes from "Open insights" because the destination is a conversation now rather than a
page of cards. That is new copy and joins what A29 owes a designer.

### The poll moves, it does not get rebuilt

`insights/InsightsScreen.tsx` already holds the whole state machine, and it relocates intact:

- the `set` / `stalled` / `seen` state, and the **render-phase state adjustment** that adopts a
  changed prop by comparing `state` and `generatedAt` rather than object identity, because the
  server hands back a fresh object on every `router.refresh()`;
- `POLL_DELAYS = [500, 1000, 2000, 4000]`, `POLL_MAX_DELAY`, and `POLL_CEILING_MS` at 5.5 minutes,
  which sits just past the backend's own staleness cutoff so a wedged timer cannot outlive the
  read's self-healing guarantee;
- the `stalled` flag, which makes reaching that ceiling fall back to the content the read carries
  independently of `state` rather than holding skeletons forever;
- the `catch {}` around the fetch, which is deliberate rather than lazy: A26 records that a failed
  run is invisible by contract, so there is no error state to render and the last-good content is
  already on screen underneath.

`app/api/insights/route.ts` is unchanged, and the poll path stays `/api/insights`.

**One poll, one mount.** The banner and the two cards sit in different grid columns with a Server
Component between them, so the `set` and the timer live in **one** client owner and the two visual
pieces read it from context. That is `transactions/FilterNavigation.tsx`'s shape, which exists for
exactly this problem - a pending state shared by two client pieces on opposite sides of a
server-rendered boundary. `DashboardScreen` gains two `React.ReactNode` slots and stays a Server
Component.

Do **not** give each card its own poll. Two timers on one screen double the requests and can
disagree about which set is current.

### Reads and the contract

**`requireInsights()` becomes a third entry in a `Promise.all` that #84 already built.**
`dashboard/page.tsx` on that branch reads `readDashboard(period)` and `readPeriods()` already, so
this is one more concurrent read rather than a restructure - three backend requests where #84 makes
two, and where `main` before it made one.

**It still reverses PET-25's reasoning, and the reversal is still worth recording.** That ticket
argued "PET-20's endpoint exists so that one call serves the whole screen" and rejected a second
read on those grounds. Two things answer it now. The dashboard summary is a snapshot with no way to
update itself, so an `insight` field on it goes stale exactly where the poll's whole purpose is to
not be. And #84 has already spent that argument itself, by adding `readPeriods()` beside
`readDashboard()` for the header's select. Record it in `docs/TODO.md` beside the generate-on-write
reversal rather than deleting PET-25's argument, which is this repo's convention for an argument that
turned out to be wrong.

**Only one read decides whether the session is alive**, the rule
`transactions/categories/page.tsx` states and #84's own three-read page already follows. Two opinions
about a dead cookie on one page is the shape the `/dashboard` to `/login` redirect loop came out of,
so `requireInsights()` joins as a read that redirects and the others keep their existing policies -
do not give a second one a redirect.

**`DashboardResponseDto.insight` is removed**, along with `InsightSummaryDto`,
`InsightsService.latestReadySummary` and `DashboardModule`'s `InsightsModule` import. Nothing
consumes it once the teaser is gone, and leaving it publishes a set that nothing reads. That is a
response-body change, so `npm run api:sync` from the repo root; `test/openapi.e2e-spec.ts` pins
`insight` as a nullable `$ref` and that assertion inverts, and `test/dashboard.e2e-spec.ts` polls for
a non-null teaser in one place and asserts null in another.

**Note #84 has just sharpened that field's own documentation** rather than removing it, so this
deletes prose written one branch earlier. That is fine and it is the point: the sentence #84 added -
"always the latest set, not one for the period being viewed" - exists because the field is read by a
card that cannot say which period it describes. Deleting the field deletes the need for the caveat,
and the caveat's substance moves to the `isCurrentPeriod` guard above. Do not read the overlap as a
conflict to be avoided by keeping the field.

### File moves

`SummaryBanner.tsx`, `InsightCard.tsx` and `insightTone.ts` move under `dashboard/`.
`InsightsScreen.tsx` and `InsightsEmpty.tsx` are deleted. `lib/insights.ts` and
`app/api/insights/route.ts` stay and gain the Dashboard as their caller.

**`lib/generateInsights.ts` survives.** `POST /api/insights/generate` still exists, and Regenerate
belongs wherever the cards are - so it follows them onto the Dashboard rather than being deleted
with the screen it used to sit on.

`insights/InsightsScreen.test.tsx` is the most valuable artifact in this feature and most of it
transfers unchanged: the backoff timing, the ceiling, the unmount cancel, the prop-change path, the
409-as-success path, the retired-`info` fallback, and the regression test that **nothing POSTs on
mount in either state**. Move it rather than rewrite it.

## Half 2: `/insights` becomes the assistant

### The new backend module

`backend/src/assistant/`, following the `ReceiptScanService` / `ReceiptExtractionService` split one
level further in, so the pure parts need neither a database nor the SDK to test:

| File                               | Role                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `assistant.module.ts`              | `imports: [CategoriesModule, PeriodsModule]`, no exports                       |
| `assistant.controller.ts`          | three routes; `ThrottlerGuard` on the **method**, not the class               |
| `assistant.service.ts`             | the orchestrator - the 503 check, resolve-or-create, the reads, the one write |
| `assistant-completion.service.ts`  | **the only file importing `@google/genai`**                                   |
| `assistant-context.builder.ts`     | pure functions, no DI: the compression, the prompt, the sanitiser             |
| `assistant.constants.ts`           | the model, the timeout and the four ceilings                                  |
| `dto/*.dto.ts`                     | response **classes**, never interfaces                                        |

`DatabaseModule` is `@Global`, so `UserDatabaseService` injects with no import. `SessionGuard` is an
`APP_GUARD`, so every route is guarded without saying so. `ThrottlerModule` is `@Global` and
**must not** be registered here - see the throttler section. Register `AssistantModule` in
`app.module.ts` after `InsightsModule`.

**Compose, do not compute, and the thing to compose is `PeriodService`.** An earlier draft said to
take `currentWindow(userId)` from `CategoriesService`; **that method no longer exists** on #84. Call
`periods.current(userId)` for the window and `periods.today()` for the date, which is exactly what
`RuleBasedInsightGenerator` does on that branch, and never resolve a window locally. Take every
amount through `fromCents()` in `src/common/money.ts` - this becomes its fifth caller, and "a fifth
place doing its own arithmetic is a bug" means it must not do its own division. Read
`profile.currency` directly, which the generator already does and `## Insights` sanctions as "the one
static field neither surfaces".

**The budget and the caps are effective-dated now, so the prompt has to name a period rather than a
number.** `periods.budgetCentsFor(userId, period)` resolves the budget in force; the caps come off
`categories.list(userId)`, resolved the same way. Two consequences worth stating rather than
discovering. The prompt header must say **which period's** budget and caps it is quoting, or the
model will answer a question about last March with this month's limits and sound certain. And **the
budget and cap history is deliberately not sent**: the transaction rows carry no period attribution
of their own, so history would be a second dataset with a join the model has to perform in prose,
and the questions it unlocks ("what was my budget in March") are worth a `docs/TODO.md` entry rather
than a doubling of the prompt.

### Endpoints

| Route                              | Answer                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /api/assistant/messages`     | 201 with the created exchange. Body `{ message, sessionId? }`; an absent id creates one |
| `GET /api/assistant/sessions`      | 200, `{ sessions, total }` - a wrapper object, not a bare array                         |
| `GET /api/assistant/sessions/:id`  | 200 with its messages. `ParseUUIDPipe`, 404 for unknown or tombstoned                  |

One POST rather than `POST /sessions` followed by `POST /sessions/:id/messages`: the user's action
is sending a message, not creating a session, and two round trips make a first message able to
leave a session with no turn in it. `sessionId` carries
`@ValidateIf((_, v) => v !== undefined)` and never `@IsOptional()`, which skips validation for
`null` as well as `undefined` - the trap `UpdateTransactionDto` documents.

Failures, each of which needs a different sentence on screen:

- **400** a malformed or oversized message, or a non-UUID `sessionId`.
- **401** through the global guard.
- **404** a `sessionId` naming no live session of the caller's. **Unambiguous**, unlike `PATCH
  /transactions/:id`'s 404, because this body references exactly one resource by id.
- **429** the new throttler.
- **503** when `GEMINI_API_KEY` is unset, checked **before the user database is opened**, exactly as
  `ReceiptScanService.scan` does, so an unconfigured deployment costs no wasted reads.
- **504** on timeout, via the same `AbortController` bracket receipt extraction uses, and kept
  distinct from the keyless 503 rather than collapsed into it - a hung or quota-throttled call
  leaving a loading state up forever is the failure PET-56 was an entire ticket about.

No documented 500; `test/openapi.e2e-spec.ts` pins that nothing declares one.
`src/common/decorators/api-error-response.decorator.ts` already carries descriptions for all six
statuses, so nothing is added to that map.

**`DELETE /sessions/:id` is deferred**, and the reason belongs in the record rather than being left
as unstated scope. `insight_sets` needed a prune because a row was written per transaction write, so
growth tracked how much the user spent. A conversation only exists because a human typed it, so
growth is bounded by use. `docs/TODO.md` carries it.

**Nothing is persisted unless the reply arrives.** Call the model first, then write the session row
(on a first message), the user message and the reply in **one `db.transaction()`**. Both tables are
user-scope so a transaction is genuinely available, and this is a single synchronous call site with
nothing floated, so the embedded driver's refusal of *overlapping* transactions is not in play.

What that buys is that `assistant_messages` needs **no status column and no lifecycle at all**: a
stored message is by definition part of a completed turn, which is the deliberate contrast with
`insight_sets` and worth stating in the docs. What it costs is that a failed call loses the
question, which the composer holds client-side.

### The rate limiter

A **fourth named throttler, `chat`**, added to the single `ThrottlerModule.forRootAsync` in
`app.module.ts` and keyed with `trackByUser` from `auth/auth.module.ts` exactly as `scan` is.

**Do not add a second `forRootAsync` in `AssistantModule`.** `ThrottlerModule` is `@Global()`, both
registrations export the same `THROTTLER_OPTIONS` token, and whichever loses the resolution race is
silently absent from every route that names it. That is why the one registration already moved from
`AuthModule` to `AppModule` at PET-59.

**Not folded into `scan`.** Both protect the same shared Gemini quota, but the budgets differ by an
order of magnitude in opposite directions: a scan is one photo per logged expense, and a
conversation is ten to thirty turns in five minutes. A shared bucket either starves the chat or
opens the scan cap, and a burst of chat turns would silently disable receipt scanning mid-form with
no message that could explain it.

Only two sites carry `ThrottlerGuard` at all, so the cost is three edits: `AuthController`'s class
decorator gains `chat: true`, `TransactionsController`'s `/scan` gains `chat: true`, and the new
POST carries `@UseGuards(ThrottlerGuard)` with
`@SkipThrottle({ email: true, ip: true, scan: true })` - `ThrottlerGuard` runs every configured
throttler on a route it guards, and the `email` tracker reads `req.body.email`, which is `undefined`
here and would otherwise put every caller in one shared fallback bucket. `TemplatesController` needs
nothing, because it carries no `ThrottlerGuard`. And a bare `@SkipThrottle()` means
`{ default: true }` while no throttler here is named `default`, so it silently skips nothing.

**The guard goes on the method rather than the class**, unlike `AuthController` where all four
routes want limiting: a class-level guard here would spend chat budget on every History page load.
`/scan`'s method-level placement is the precedent.

New `CHAT_RATE_LIMIT` and `CHAT_RATE_TTL_S`, validated in `env.validation.ts` with Joi defaults, so
a spec can trip the limit without waiting out a real window.

State the same honesty paragraph the scan limiter already carries, plus what is new here: the store
is in-memory and the key is per user, so this buys fairness and blast radius rather than a cap on
the project's shared free-tier quota - and because one turn costs roughly 40k input tokens, a single
account can now reach the free tier's tokens-per-minute ceiling in a way scanning never made
possible. That is the argument for a low limit, and it **extends** the existing aggregate-cap TODO
entry rather than opening a second one.

### Schema

Appended to `backend/src/database/user/schema.ts` after `insights`, copying the
`insight_sets` / `insights` parent-child pair:

```
assistant_sessions   id, title, last_message_at, created_at, deleted_at
                     index assistant_sessions_last_message_at_idx

assistant_messages   id, session_id, role, content, sort_order, created_at, deleted_at
                     index assistant_messages_session_id_idx
```

Conventions honoured per `backend/src/database/CLAUDE.md`: UUIDv7 text primary keys from
`src/common/ids.ts`, epoch-ms `integer` instants with `{ mode: 'timestamp_ms' }` and `$defaultFn`,
no `.references()` anywhere, `isNull(deletedAt)` in every read, and the closed `role` set
constrained in TypeScript rather than in SQLite. The v1 RC third argument returns an **array**.

Four deliberate differences from `insight_sets`, each of which belongs in
`backend/src/database/CLAUDE.md`:

- **No `status` and no partial unique index.** `insight_sets_generating_idx` exists because
  generation is asynchronous and single-run; a turn is synchronous and request-scoped, so there is
  no in-flight row to guard and nothing to reclaim past a staleness cutoff.
- **`sort_order` on messages**, copying `insights.sort_order` and adding a reason of its own: two
  messages written inside one transaction share a millisecond, so `created_at` is not a tiebreak.
- **No `updated_at` on either table**, which `insight_sets` also does without. The only mutation a
  session takes is `last_message_at` moving, and that column *is* the record of it.
- **Neither sanctioned exemption from the tombstone convention is taken.** `backend/CLAUDE.md`
  names exactly two - the empty-account placeholder removal and the completed-run prune - and this
  is neither: nothing here hard-deletes and nothing prunes, because growth is bounded by human
  typing rather than by transaction writes.

The migration is generated, never hand-written: the user-scope generate command in
`docs/guides/commands.md` writes `backend/drizzle/user/<timestamp>_add_assistant/` holding
`migration.sql` and `snapshot.json`, and both are committed. There is no separate migrate step - a
user database is migrated on first open, so every existing account upgrades the next time it is
touched. Both tables are **new**, so the constraint that an unattended user-scope migration may only
add nullable or defaulted columns does not bite.

**It sits on top of #84's single `20260810085329_init` baseline**, which is the only user-scope
migration on that branch - the three that used to exist, `add_insights` among them, were collapsed
into it. Two things follow. The generated diff is computed against that baseline's snapshot, so
**generate after cutting from a `main` that has #84**, never before, or the migration describes tables
the baseline already holds. And the assistant's tables are deliberately **not** folded into the
baseline: #84 could collapse the history because `chore/PET-71-reset-databases` reset every database,
and adding to a shipped baseline after that is how a migration silently stops being reproducible.

### The digest and its ceilings

One query in `AssistantService`, not `TransactionsService.list()`: that read is period-filtered and
returns DTOs carrying no category name, so it is the expensive path for data it cannot fully supply.
`ReceiptScanService`'s merchant-history read is the precedent for a feature service reading
`transactions` and `categories` directly.

Three decisions in that query:

- **A `LEFT` join, not the inner join receipt scanning uses.** An inner join is right there - a
  merchant with no live category teaches the model nothing - and wrong here, because it would
  silently drop money through the dangling-category race `## Transaction endpoints` documents, and
  the assistant would then answer "how much did I spend" with a number that is wrong and
  unexplainable. A null name resolves to the account's own `is_fallback` category name, which is
  `CategoriesService.withSpend`'s fold applied here and what keeps the assistant's totals agreeing
  with the donut's.
- **`ORDER BY date DESC` with the `created_at`, `id` tiebreak**, for the reason
  `TransactionsService` already gives: a calendar day is shared routinely and without a tiebreak the
  order reshuffles between two identical requests. Newest first, so a truncation drops the oldest
  rows, which is the right end to lose. Served by `transactions_date_idx`.
- **`limit N + 1`**, so the service knows it truncated without a second `count(*)`; take the count
  only when the extra row comes back.

The format is one row per line, `YYMMDD|Merchant|Amount|Category`, and four things about it are
decisions:

- **A newline as the row separator, not a semicolon.** The same single byte, tokenises the same, and
  cannot collide with a merchant name containing a semicolon.
- **`|`, carriage return and newline are stripped** from the merchant and the category name, with
  runs collapsed to one space. `transactions.merchant` is free text with no character restriction,
  so an unsanitised delimiter shifts every field on that row. **This is the app's first delimited
  format and therefore the first place this class of bug can exist**, and it produces a confidently
  wrong answer rather than an error, so its spec pins it.
- **`YYMMDD` by pure string work.** Nothing constructs a `Date`, per the rule
  `src/common/month-window.ts` and `frontend/src/lib/date.ts` both state from opposite directions.
  It saves about 11% and costs a century ambiguity, so the prompt header states the dates are in the
  2000s. If any wrong answer is ever traced to this field, revert to the ISO form - the saving is not
  worth an argument.
- **`fromCents()` then two decimal places**, with the currency stated once in the header rather than
  repeated per row.

**Merchant names go verbatim. Do not truncate them.** Shortening "Konzum Superkonzum" to "Konzum"
merges two real merchants in the one field the model is being asked questions *about*, and a
confident wrong answer is exactly what `ReceiptScanService` drops a hallucinated `categoryId` to
avoid. The saving is also trivial, measured: in `backend/src/scripts/showcase/fixture.data.json` the
mean merchant is 9.86 characters and the longest is 20, with 97 distinct names over 2,249 rows, so
the entire merchant field is roughly 22KB of an 80KB string. Cap the field's length to bound a
pathological name and nothing else.

**Measured on that fixture in exactly this format: 2,249 rows, 80,679 bytes, 35.9 bytes per row.**
Tokens are the number that matters and bytes-over-four understates it, because a pipe-delimited row
splits on digits and delimiters - expect roughly 12 to 18 tokens per row. Per turn, with no caching:
the showcase account's own history is about 27k to 40k tokens of data, a full 3,000-row prompt is
36k to 54k, and on top of either sits the prior conversation plus roughly 0.5k of instruction. So
**call it 40k input tokens every message on a real account, and 55k at the ceiling** - twenty turns
in one session is comfortably past 800k. **Re-measure with the SDK's own token count against a real
built prompt before freezing the constant** - that call is one round trip and costs nothing.

Three ceilings, all in `assistant.constants.ts`, and the first two must be **told to the model**
rather than applied silently, because a model that does not know its data was cut will confidently
answer "you never shopped there":

- **`MAX_PROMPT_TRANSACTIONS` is 3,000**, decided at review. That sits above the showcase account's
  2,249 rows with headroom, so **the demo is never truncated** and the assistant answers over that
  account's whole history. The cost is paid in the worst case rather than the common one: a full
  3,000-row prompt is roughly 108KB and 36k to 54k tokens, where the showcase's own 2,249 rows are
  about 80KB and 27k to 40k. The consequence for testing is the one to carry: **the truncation path
  is now unreachable on every account this project has**, so its spec has to construct the case
  directly rather than relying on the seed to exercise it, and the browser walk cannot check it at
  all without a hand-built account.
- **`MAX_HISTORY_MESSAGES`**, because sessions are resumable and every turn re-sends the whole
  conversation. Twenty turns is roughly 6k tokens on top of the data.
- **`MAX_MESSAGE_CHARS`** on the DTO, so a pasted novel cannot be what blows the context. The
  composer restates it as a literal with the DTO named in a comment, the `MAX_CAP_ROWS` precedent,
  because `maxLength` reaches no generated type and the resulting 400 would otherwise produce advice
  the user cannot act on.

**Truncation is reported to the screen as well as to the model**, through a nullable field on the
reply DTO carrying how many of how many rows went and the oldest date included. A fact the model is
told should also be a fact the UI can state, or the only witness to it is a sentence the model may
or may not produce.

There is **no response schema and no JSON response type**, because the answer is prose. That is the
one respect in which this differs from every other Gemini call in the repo, and it means there is no
schema whose field descriptions double as instruction - the whole instruction is the prompt string.

### What crosses the wire to Google

`backend/src/assistant/CLAUDE.md` carries a `### What crosses the wire` subsection mirroring
`backend/CLAUDE.md`'s for receipt scanning. The literal prompt stays in
`assistant-context.builder.ts` and is deliberately **not** restated in the doc - it would drift the
first time somebody tuned a sentence. What the doc owns is the inventory.

One call carries three things: the instruction header - the model's role, the profile's currency,
today's date in `APP_TIMEZONE`, the current period's bounds, the monthly budget, the per-category
caps, and the refusal rules; **every live transaction up to the ceiling**, with every merchant name,
amount, date and category name, denormalized; and **the whole prior conversation of that session**,
re-sent on every turn.

What deliberately does not go, stated so it can be said quickly: no email, no name, no user id, no
session token, no database url or token, no category id - a name suffices here, unlike the scan
where an id has to come back verbatim - and **no per-transaction note**. Notes are excluded on
purpose, and the reason is worth writing down: a note is the one field a user writes for themselves,
it surfaces on no list row, and the marginal answer quality does not buy that disclosure.

Nothing persists on Google's side beyond the request: no Files API, and **no context caching**.
Enabling caching later would change that sentence, because the dataset would then live there for the
cache lifetime.

**The disclosure is categorically larger than receipt scanning's.** That one sends a receipt image,
category names and up to fifty merchant names, and its review found the copy naming two of the three.
This one sends every amount and every date as well, so the on-screen line has to name four things:
that your transactions go, naming merchant, amount, date and category; that this conversation goes
with them; that it may be used to improve Google's models; and that **the conversation is saved to
your account**, where a receipt scan stores nothing. It sits on the Chat view beside the composer,
visible before the first message, and static rather than dismissible - there is no preferences store
to remember a dismissal, and a real training opt-in is still deferred. Keep the string in the
component and cite it from the doc by file name; do **not** add a second copy under
`docs/explainers/`, because the receipt-scanning preview already mirrors a string with nothing
checking that the two agree, and a second unchecked mirror doubles that liability.

### Frontend

Two routes, both under `frontend/src/app/(app)/insights/`, so `SIDEBAR_HREFS` and `SidebarNav` need
no change at all - `matchItem()` matches by prefix with a trailing-slash boundary, which keeps
Insights lit on the History route for free.

- **`insights/page.tsx`** is the Chat view. It owns `PageHeader` and the tab bar as **Server
  Components** and renders the client screen below them. That is a genuine improvement on
  `InsightsScreen.tsx`, which had to wrap the header because Regenerate's label and disabled state
  were derived from the same value the cards were.
- **Resuming is a query parameter, not a dynamic segment.** An `/insights/[sessionId]` route would
  be a third path the tab bar has to disambiguate - both `/insights/history` and a uuid keep the
  sidebar lit, but the bar would have to decide which tab a uuid belongs to - where a query
  parameter keeps exactly two routes and two tabs. An invalid or deleted session **drops the
  parameter and renders an empty chat with a `role="status"` line**, rather than `notFound()`: the
  call `transactions/[id]/page.tsx` already makes about an invalid `?sort=`, and it avoids a
  `not-found.tsx` for this segment entirely.
- **`insights/history/page.tsx`** awaits the sessions read and hands the resolved list to a
  synchronous screen. It is a static segment beside no dynamic one, so nothing shadows it.
- **`insights/InsightsTabs.tsx`** copies `transactions/TransactionTabs.tsx` structurally, and that
  file's comment is the authority for every piece of it: a `<nav>` of `next/link`s with
  `aria-current`, the inactive label's dimming written out by hand, the active rule as an
  `aria-hidden` span sitting on the container's own border, and a focus ring that names
  `outline-solid` as well as its width - a daisyUI `:focus` rule zeroes `--tw-outline-style`, so a
  ring declared by width alone computes to `2px none` and paints nothing with every gate green.
  **No `role="tab"`**, because these navigate to separate routes and replace the page rather than
  swapping a panel. **No daisyUI `tabs` or `tab` class**, because `--tab-border-color` and `--tab-p`
  are both set at a specificity of (0,3,0) against a utility's (0,1,0) and this repo carries no `!`
  utilities. **No count badges**: no frame draws this bar, and a badge on Chat would force the bare
  route to fetch a count, which is exactly the blocking wait the screen is specified not to have.
- **The tab href map lives in that component** and is the app's **fourth** route declaration.
  `SIDEBAR_HREFS` declares the four the sidebar renders, `lib/routes.ts` declares the access screens
  and says outright that the two sets must not restate each other, and `TAB_HREFS` declares the
  categories tab. The history route is in none of them, so it is declared once beside the component
  that links to it and **built from `SIDEBAR_HREFS.insights`** so the nesting cannot drift. Never
  write the path as a literal: a sibling route would match none of the four sidebar hrefs, fall
  through to the fallback item, and light **Dashboard** while this bar said Insights. Its suite
  asserts with `fs` that both hrefs have a `page.tsx` behind them, the check
  `TransactionTabs.test.tsx`, `SidebarNav.test.tsx` and `lib/routes.test.ts` all run for their own
  sets.
- **The chat screen is a client component rendering `<main>` only**, and its send is **injected as a
  prop rather than imported** - the precedent both transaction modals set for `create` and `scan`.
  That is what lets the suite pass a `jest.fn()` and keeps the `@/` alias trap out of it entirely.
  Note one reason for injection has **gone away** now the send is a `fetch` rather than an action:
  there is no `next/headers` for Storybook's Vite build to trip over. The remaining reasons are
  enough on their own, and injection matters slightly more than before, because what is behind the
  prop is a real network call.
- **The message list is `role="log"` with `aria-live="polite"`**, and each turn is labelled in
  **text** rather than by colour or side alone - the rule the trend chart's `sr-only` list settled.
- **The composer is a real `<form noValidate onSubmit>`** with `preventDefault()` and a
  `type="submit"` button, per the three silent failures `app/setup/BudgetForm.tsx` records. A
  `<textarea>`, so Enter submits and Shift+Enter inserts a newline, which needs an explicit keydown
  handler - the mirror image of `IconSelect`, where `Modal` wraps its body in a real form so Enter
  submitting is the default and had to be *stopped*. Here it is wanted, and its absence is silent.
  **While a turn is in flight the submit button becomes "Stop"** and calls `abort()` rather than
  being merely disabled, which is the visible half of the cancellation section above. Escape does
  **not** cancel: this screen is not in a dialog, and a key with no affordance naming it is not
  discoverable.
- **The typing indicator is mounted from the first render and only its text changes.** A polite live
  region created in the same commit as its content is generally not announced at all, and
  `getByRole('status')` cannot tell that apart from a working one - which is why its suite asserts
  the region's **text**. That is the Allocate modal's review finding, transferring verbatim.
- **The History list puts its link on the session title**, not the row, for the accessible-name
  reason the transactions table's merchant cell records. Its empty state is
  `components/EmptyState.tsx`, which is the right component here - a full-card centred treatment
  replacing the content, which is exactly what the dashboard's in-card empty treatments are not.

**How a turn lands on screen.** Append the user's message optimistically, set pending, await the
send **inside a `try`**, then append the reply and adopt the returned session id and title. On any
failure, **remove the optimistic message, put the text back in the composer, and render one line.**
That removal is not fussiness: the backend persists nothing unless the reply arrives, so leaving the
question on screen asserts a stored turn that does not exist and a reload would make it vanish. It
is the same class of dishonesty the transactions no-results copy and the teaser's third state each
paid for separately.

**A cancel takes the same path minus the message.** The optimistic message is removed and the text
restored exactly as on a failure, and nothing is rendered - so the screen returns to precisely the
state it was in before the user pressed send. The `try` must therefore branch on the error being an
`AbortError` before it reaches the taxonomy, not after.

**`lib/assistant.ts`** holds the two reads over `authorizedGet`, each redirecting on an
unauthenticated answer and throwing otherwise - `lib/dashboard.ts`'s policy, because both are read
from a `page.tsx`.

**It also holds the non-redirecting POST the route handler calls, so `lib/insights.ts`'s two-export
shape does apply here after all.** An earlier draft said not to copy it, on the grounds that the
split exists for a poll this feature does not have. That reasoning was about the wrong half: the
split exists because a **route handler** and a Server Component answer a dead session differently,
and a `redirect()` reached from inside a handler answers the browser's `fetch` with an HTML login
page carrying a 200 - which the composer would try to render as a reply. The send therefore returns
an `AuthorizedResult` and the handler maps a dead session to a bare 401, exactly as
`app/api/insights/route.ts` already does for the read.

**`lib/sendAssistantMessage.ts`** is the write, and it is **a plain async function taking
`(body, signal)` rather than a `'use server'` action** - see the cancellation section above for why.
It runs in the browser and calls the same-origin handler, so it touches neither `next/headers` nor
`BACKEND_URL`; the handler does both on its behalf.

**`lib/scanReceipt.ts` is still the file to copy for its taxonomy**, not one of the category writes:
it already publishes 429, 503 and 504. This one publishes **seven** reported reasons, each earning
its place because each needs different copy - a success; an invalid message; an unauthenticated
session; a missing session, where the id is dropped and the text kept; a rate limit, whose copy says
wait rather than retry; an unconfigured key, where nothing the user does fixes it so the copy must
not blame the message; a timeout, where retrying the identical question **is** the right next move,
which is why it cannot fold into the generic arm; and that generic arm for everything else including
a request that never completed.

**Cancellation is an eighth outcome and deliberately not a reported reason.** An `AbortError` means
the user chose to stop, so it carries no copy at all - it restores the composer and renders nothing.
Folding it into the generic arm would show a failure message for a deliberate act, which is the same
mistake as the no-results copy claiming an account is empty.

**A sixth verb in `lib/session.ts`.** `authorizedPost` deliberately discards the response body, and
the reply **is** the body here. The precedent already exists: the form-data verb is "the fifth verb,
and the first over a body that is not JSON", and it returns the parsed body for the scan. So add a
JSON-body-returning post beside it. The friction is the result type, which is the right shape under a
name that now describes only one of its two callers - **rename it in its own commit** so the diff
reads as a rename, and have both verbs share it.

**That verb also takes an optional `signal`**, which no existing verb does, and it is the second hop
of the abort chain. Thread it into the underlying `fetch` and nothing else; the handler supplies
`request.signal` and every other caller omits it, so the widening costs the other five nothing.

### Cancelling a turn, and why the send is a route handler

**The send is `app/api/assistant/messages/route.ts`, not a Server Action, and cancellation is the
whole reason.** An earlier draft of this plan made it an action and accepted a soft cancel - a
generation-counter ref that discards a late result while the request runs to completion server-side.
That was the wrong trade here, and it was reversed at review.

A client component calling a Server Action has **no `AbortController` to reach**: the RPC is opaque,
there is no `signal` parameter, and `AddTransactionModal` settled for the counter trick precisely
because the platform offers nothing better. A route handler makes the send an ordinary `fetch`, and
an ordinary `fetch` takes a `signal`. Given that a turn costs 40k input tokens and runs for tens of
seconds on a free tier, being able to actually stop one is worth a file.

That makes it the app's **fourth** route handler and the **first the browser POSTs to**. The other
three exist for the two reasons this plan previously cited as exhaustive - a GET navigation
(`app/auth/verify/route.ts`) and a browser timer's poll (`app/api/insights/route.ts`,
`app/api/categories/route.ts`) - so **a cancellable long write is a third reason**, and
`docs/agents/api-contract.md` should say so rather than leaving the next reader with a two-item list
that no longer covers the set.

**The abort travels three hops, each has to be wired, and each is a place it silently does not
work.** **All three are in scope, decided at review** - hop 3 was briefly offered as deferrable and
is not. Verify it in a browser rather than by reading the code.

The plain-language account of this whole section, for anyone who wants the reasoning without the
mechanics, is `docs/explainers/cancelling-an-ai-request.md`.

1. **Browser to handler.** The composer owns an `AbortController`, passes `signal` to `fetch`, and
   "Stop" calls `abort()`. The fetch rejects with an `AbortError`, which the caller must
   **distinguish from a real failure** - a cancel renders no error line, it just restores the
   composer. Getting this wrong shows the user a failure message for something they chose.
2. **Handler to backend.** A Next route handler receives `request.signal`, which aborts when the
   client disconnects. Pass it through to the `fetch` at the backend. This is what makes hop 1 more
   than cosmetic: without it the handler keeps waiting on a backend nobody is listening to.
3. **Backend to Gemini.** `@google/genai` already accepts an `abortSignal`, which is how
   `ASSISTANT_TIMEOUT_MS` is enforced. Combine it with a signal derived from the request closing, so
   an abandoned turn stops spending quota: `AbortSignal.any([timeout, disconnect])`. That is safe on
   this project - Node is pinned to 26 and the engines floor is 22.12, well past where
   `AbortSignal.any` landed.

**Hop 3 has no precedent in this repo and one trap that will bite.** There is no `@Req()`, no
`@Res()` and no `request.signal` anywhere in `backend/src` today, so this is the first. The platform
adapter is Express, where **`close` fires on a normally completed response as well as on a dropped
connection** - so the disconnect signal must be guarded on the response not having finished
(`res.writableEnded`), or the backend aborts its own successful reply. That failure is
indistinguishable from a flaky model call in a log, which is why it is a browser check and not a
unit test.

**Do not persist an aborted turn.** The single completion transaction already runs only after the
model answers, so an abort throws before any write - which means "nothing is persisted unless the
reply arrives" now covers cancellation too, at no extra cost. Verify it: cancel a turn, reload, and
the question must be gone rather than stored without an answer.

**The gap-list bullet is therefore filled rather than resolved-without.** `frontend/CLAUDE.md`
reserves `/api/chat`; this ticket builds it under the name `/api/assistant/messages`, so that bullet
is **deleted** and the shell's-content bullet gains the route.

**The header's action becomes "New chat"** - `ui/Button`'s `href` variant pointing at the bare chat
route, still secondary, on the Chat tab only; History carries none, which `PageHeader`'s optional
action already supports. Making it a navigation rather than state keeps the header on the server and
drops the session parameter for free.

**The sidebar label does not change.** `ui/Sidebar.tsx` renders "Insights" under a section heading
"ASSISTANT"; "AI Insights" is the `PageHeader` **title**. Renaming the item to "Assistant" would
repeat the heading directly above it and cost edits to the item list, the section list and the suite
pinning those strings. So the sidebar is untouched and the **title becomes "Assistant"** on both
tabs, with the overline staying `periodOverline(...)` so the four routed views keep reading
consistently - the same argument the 2026-08-08 review made when it took this overline to a period.
That title is asserted in `(app)/pages.test.tsx`, and it **amends INS-1 again**, so the Jira ticket
carries the note.

**This screen has no Figma frame at all**, which makes it the third in the app after the verify
failure screen and the error boundary. Every string on it is invented - both tab labels, the composer
placeholder, the typing indicator, the truncation notice, the empty History card, the "conversation
no longer available" line, and each of the seven failure arms - and they join what A29 owes a
designer. The failure, truncated and unconfigured stories exist to put them in front of one at once,
which is what the Add category modal's messages story is for.

### Storybook and Jest

Stories for both screens under `Screens/`, and **both registered in
`frontend/src/app/screens.stories.test.tsx`'s module list**. That omission is precisely what the
suite exists to catch, and two screens have already shipped unregistered: `storybook build` bundles
a module without ever running a story, so a runtime throw ships through a green CI.

Two harness facts bite anyone adding a screen story. It **builds each story from `render` or
`meta.component` and never applies the meta's `decorators`**, so everything the screen needs goes
inside `render`, and the action is defaulted in the shared meta args so a story added later cannot
forget it. And a story whose screen reaches a router hook needs
`parameters: { nextjs: { appDirectory: true } }`, which no gate will tell you about:
`build-storybook` bundles without running, and the Jest harness already mocks `next/navigation`.
**Open every new story in a browser.**

Suites: the tab bar (labels read from the component's own tables so no assertion can pass against a
table that disagrees with the links, the `fs` check, `aria-current`, and the absence of both
`role="tab"` and any `tab` class); the chat screen (optimistic append, pending disables the composer,
the reply lands and the session id is adopted, a failure removes the optimistic message and restores
the text, one case per taxonomy arm, the live region's **text**, and the character cap); the History
screen; and one case per status for each of the two `lib/` modules. `(app)/pages.test.tsx` needs its
Regenerate case rewritten, its `queryByRole('link')` expectations widened for the two tabs and the
header button, and a mock for the new History page.

Backend: the completion service with the SDK mocked wholesale (what it sends, the keyless 503, the
504 on abort, a malformed answer); the context builder pure (the format, the delimiter sanitiser, the
date conversion, the truncation notice, money through `fromCents`); the orchestrator (the 503 before
the database is opened, the 404, the fallback-name fold, one transaction per turn, the sort order);
and `test/assistant.e2e-spec.ts` against a real migrated database with a stubbed completion provider,
including the throttler at a low configured limit.

## The `docs/TODO.md` entries, and what this branch does with each

| Entry                                                        | Disposition                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A cap change can leave the insight set stale                 | **Fixed.** See below                                                                                                            |
| A burst of transaction writes leaves one stale set           | **Fixed** with a bounded dirty flag. See below                                                                                  |
| An LLM generator needs a debounce before it can be bound     | **Narrowed.** The chat is a separate module binding no generator, so the entry stands but blocks nothing here. Amend it to say so |
| A reclaimed insight run can overlap the run that replaced it | **Left.** Unreachable while generation is rule-based and sub-second against a five-minute cutoff                                 |
| The single-run index ignores tombstones                      | **Left.** Nothing soft-deletes a set, and the entry says to fix it together with the identical fallback-index asymmetry or not at all |
| Generate-on-write was argued against, then reversed          | **Extended** with the dashboard read reversal above as a second recorded reversal                                               |
| If `/insights` becomes a chat, get the module boundary right | **Rewritten in place as history.** It was a forecast and this ticket executes it; keep the argument as the record of why         |
| "the app's only transactional call site" is no longer true   | **Fixed in passing.** The sentence is already wrong and the chat adds another                                                    |

### `CATEGORY_CHANGED`

One event emitted from all four category write methods - create, update, bulk cap set and remove -
because emitting from one and not the other would make the same user action behave differently
depending on which modal performed it, which is the argument PET-70 already made for not starting.

An event rather than a direct call, for `TRANSACTION_CHANGED`'s reason: `InsightsModule` imports
`CategoriesModule` for the generator's composition surface, so a call back would close the loop into
a circular module dependency. Mirror `transactions/transaction-changed.event.ts` exactly - a `const`
name and a payload interface carrying the user id and a reason, emitted with `emitAsync` inside a
`try`/`catch` that only warns.

The listener is the same action, so rename `insights/transaction-changed.listener.ts` to a neutral
name and give it a second `@OnEvent` handler delegating to one private helper. Leaving it named after
one of two events it handles is how a filename becomes a lie.

**No debounce is needed for it**, which reverses what that TODO entry assumed. Its objection was
that "a rule-based run per cap change is cheap, and an LLM run per cap change is not" - and no LLM is
being bound. The bulk cap write is one statement per modal save, not one per keystroke.

### The dirty flag

The stale-set entry is real, and this branch makes it more visible: the cards move onto the landing
page, and a category write can now lose the same 409 race a transaction write can. That entry says
every honest fix is a re-entrant loop on the write path. A **bounded** one is not:

1. A 409 in the listener sets a per-user dirty flag instead of only logging.
2. `runGeneration` clears the flag as its own run starts.
3. On the success path, if the flag is set again, start exactly one more run.

Because each run clears the flag as it starts, a burst of N writes produces at most two runs, and
there is no path that schedules a third from the second. State it that way in the code, because
"bounded" is the entire argument for doing it at all.

## Tasks

- [ ] Write this plan, commit it alone as the branch's first commit, push, open a draft PR
- [ ] **Wait for #84 to merge, then rebase this branch onto the post-#84 `main`** and re-read every
      path this plan names before writing code
- [x] `docs/explainers/cancelling-an-ai-request.md`, the plain-language version of the cancellation
      section, plus a `docs/TODO.md` entry carrying the same retrofit for the receipt scan, to be
      done **after** this ticket's hop 3 is verified rather than alongside it
- [ ] Schema for both tables, then generate the user-scope migration; commit `migration.sql` and
      `snapshot.json`
- [ ] `assistant.constants.ts` and `assistant-context.builder.ts` with its spec - pure, no DI, no SDK
- [ ] `assistant-completion.service.ts` with its spec, SDK mocked wholesale
- [ ] `AssistantService`, the controller, the DTOs, the module, and the `AppModule` wiring
- [ ] `npm run api:sync` from the repo root; commit both artifacts
- [ ] The `chat` throttler, the two `@SkipThrottle` edits, `env.validation.ts`, `.env.example` and
      the `docs/guides/configuration.md` table, whose `GEMINI_API_KEY` row still says "for receipt
      scanning"
- [ ] `test/assistant.e2e-spec.ts`, including the throttler at a low configured limit
- [ ] `CATEGORY_CHANGED` from all four category write methods; rename the insights listener and add
      its second handler; specs for both
- [ ] The bounded dirty flag, with coverage for the two-run bound
- [ ] Remove `DashboardResponseDto.insight`, `InsightSummaryDto`, `latestReadySummary` and
      `DashboardModule`'s `InsightsModule` import; invert the OpenAPI assertion; fix the dashboard
      e2e suite; `api:sync` again
- [ ] Backend: hop 3 of the abort chain - a request-close signal combined with the timeout through
      `AbortSignal.any`, guarded on the response not having finished
- [ ] `lib/session.ts`: rename the shared body-carrying result type and add the JSON post verb with
      its optional `signal`, alone
- [ ] `SummaryBanner` gains an `action` slot and the teaser's three copy states; delete
      `InsightTeaserCard`, its test and its stories
- [ ] One client owner for the poll, two new `DashboardScreen` slots, `requireInsights()` as a third
      entry in `dashboard/page.tsx`'s existing `Promise.all`, and the **`isCurrentPeriod` guard** that
      renders neither slot on a period navigated back to, with its Jest case in the same commit
- [ ] Move `SummaryBanner`, `InsightCard`, `insightTone.ts` and the poll's test coverage under
      `dashboard/`; delete `InsightsScreen.tsx` and `InsightsEmpty.tsx`
- [ ] `lib/assistant.ts` (two reads plus the non-redirecting send), `app/api/assistant/messages/route.ts`
      passing `request.signal` through, and `lib/sendAssistantMessage.ts` taking `(body, signal)`,
      with their suites
- [ ] `InsightsTabs.tsx` with its suite, both `page.tsx` files, and the title change
- [ ] The chat screen, the message list, the composer, the typing indicator, the History screen,
      their suites, both story modules, **and the `screens.stories.test.tsx` registration**
- [ ] Amend `(app)/pages.test.tsx` for the new header action, the new links and the History route
- [ ] New `backend/src/assistant/CLAUDE.md` with its own `## Not built here` and its
      `### What crosses the wire`; the parent gains a pointer and a `Read before you touch` row
      rather than a new section
- [ ] Docs: root `CLAUDE.md`, `backend/CLAUDE.md`, `backend/src/database/CLAUDE.md`,
      `frontend/CLAUDE.md` (delete the `/api/chat` bullet - it is built now),
      `frontend/src/app/CLAUDE.md`, `docs/agents/api-contract.md` (a **third** reason a route handler
      exists: a cancellable long write, alongside the GET navigation and the polled read),
      `docs/TODO.md`
- [ ] Fix the stale comments this branch touches in `(app)/pages.test.tsx`,
      `(app)/AddTransactionButton.tsx` and `backend/src/database/CLAUDE.md`
- [ ] `npm run docs:check` from the repo root

## Verification

Gates, in the order they catch things:

1. From `backend/`: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`
2. From `frontend/`: `npm run lint`, `npm test`, `npm run build`, `npm run build-storybook`
3. From `frontend/`: `npx tsc --noEmit`. `npm run build` is the typecheck but never reaches
   `*.test.tsx`, and this branch changes prop types on components whose suites construct them by hand
4. `npm run api:sync` from the repo root, then `git diff --exit-code` on both artifacts
5. `npm run docs:check` from the repo root - no hook runs it
6. `rg -n insight backend/src/assistant/` empty, and the reverse empty too

Then the checks no gate can make:

7. **A browser walk, headless Chromium over the DevTools protocol.** The Dashboard in both themes:
   the banner's contrast in the wide column, the two insight cards in the narrow one, at the designed
   1440px and below `lg` where the grid collapses to one column. Then both assistant screens in both
   themes. Probe the old values in the same run, so each check is seen to fail before it is trusted.
8. **The poll, end to end.** Save a transaction, land on the Dashboard, and watch the skeletons
   resolve with no reload. Then the stalled path, by blocking the poll and waiting past the ceiling.
9. **Message-list scrolling**, which is a browser check and must **not** use `scrollIntoView`:
   `frontend/src/lib/pickerScroll.ts` records that it scrolls every scrollable ancestor. One
   `scrollTop` on one element, or that helper if the geometry fits.
10. **The chat against a real key**, on a seeded showcase account. At a ceiling of 3,000 its 2,249
    rows all go, so check that the prompt really carries the account's whole history and that the
    answers agree with the Dashboard's own figures - the totals are the cross-check, since both derive
    from the same fold. Also confirm a keyless backend answers 503 rather than hanging. **The
    truncation path is unreachable here**, so it is covered by its spec alone and the walk cannot see
    it without a hand-built account of more than 3,000 transactions.
11. **The abort chain, all three hops, in a browser.** Send a question, press Stop, and check three
    separate things: the composer comes back with the text in it and **no error line**; the network
    panel shows the request cancelled rather than completed; and the **backend stops** - a log line,
    or the absence of a completion, because hops 1 and 2 alone look identical on screen to all three
    working. Then reload and confirm the cancelled question was **not stored**. Finally, force the
    trap directly: let a turn complete normally and confirm the reply still arrives, since an
    unguarded `close` listener aborts its own successful response.
12. **Open every new story in Storybook.** `build-storybook` bundles stories without running one, and
    a story reaching a router hook throws with every gate green.
13. **Local mode only.** Move `backend/.env` aside before seeding or running, or its `TURSO_*` values
    make the seed and the dev server contradict each other.

## Risks

- **PET-72 (#84) lands first, and this plan is written for that.** Both facts reverse an earlier
  draft, which called it "two commits and both are docs" and assumed the opposite order. What that
  settles: the migration-baseline collision is gone (this branch generates on top of #84's `init`),
  `PeriodService` is a dependency rather than a forecast, and the effective-dated budget and caps are
  a fact to read through services rather than a risk to insulate against. What it costs: **this
  branch cannot start against `main` as it stands**, and every path in this plan wants re-reading at
  the post-#84 commit.
- **The period-navigation interaction is new and is the piece most likely to be got wrong**, because
  it is invisible until somebody navigates. Nothing fails if the `isCurrentPeriod` guard is missing:
  the Dashboard simply shows October's analysis over September's numbers, on a screen where every
  other figure is correct. Its Jest case and its browser step both belong in the first commit that
  moves a card, not in a later one.
- **The `CATEGORY_CHANGED` emit now lands in a file #84 has just rewritten.** The four category write
  methods are all still there (`list`, `create`, `update`, `setCaps`, `remove`, `monthStatsFor`), but
  caps write through `categoryCapHistory` rather than a column, so read `setCaps` on the post-#84 code
  before adding the emit rather than assuming the shape this plan describes.
- **A twenty-to-sixty-second request, which nothing in this app has ever had.** The
  cancellation section answers the largest part of this - the send is a route handler precisely so
  the client owns a signal - but three things survive that change. **Hop 3 is unverified**: nothing
  in `backend/src` reads `@Req()` or a request signal today, and Express's `close` firing on a
  completed response is a trap that aborts your own successful reply while looking correct in the
  diff. **The frontend host's own function-duration ceiling still applies** to the route handler, so
  check it rather than assuming a sixty-second POST completes. And **the `try` still goes in from the
  first commit**: a `fetch` rejects on a dropped connection as readily as an action did, and
  uncaught it leaves the pending state up forever with the composer stuck on "Stop" - the exact
  review finding the scan handler produced, arrived at through a different mechanism.
- **A cancel that only reaches hop 1 looks identical to one that reaches all three.** The UI returns
  to its previous state either way; the difference is invisible on screen and shows up only as
  spent quota. So the walk has to observe the backend actually stopping - a log line, or the absence
  of a completion - rather than trusting that the button worked because the screen looked right.
- **`backend/CLAUDE.md` is past 1,000 lines** and `docs/agents/conventions.md` nominates the next
  ticket touching `backend/src/categories/` to split it. Decided: the assistant gets its own scoped
  file, Insights and Categories stay in the parent, and that nomination stays open for a smaller
  ticket.
- **`npm run docs:check` asserts every backticked rooted path in the docs resolves**, so a docs
  commit naming an assistant source file before that file exists fails the `conventions` job. Docs go
  last, which the task order above already does.
- **An insights fix has already been silently reverted once** by an unrelated refactor, when a seed
  guard was dropped in a rewrite half an hour after it landed. The dirty flag and the
  `CATEGORY_CHANGED` listener are exactly the kind of small guard that goes missing in a rebase.
