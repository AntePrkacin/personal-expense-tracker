# backend/src/assistant/CLAUDE.md

Guidance for Claude Code inside `backend/src/assistant/`: the AI assistant chat, its prompt, and
what it sends to Google. `backend/CLAUDE.md` is the authority for the rest of the NestJS app and
loads alongside this file; root `CLAUDE.md` carries the rules that hold everywhere.

This file exists for the reason `backend/src/database/CLAUDE.md` does - `backend/CLAUDE.md` is past
1,000 lines and `docs/agents/conventions.md` sets the promotion trigger - and for one of its own:
this is the second place in the app that sends a user's data to a third party, and what crosses
that wire wants a home somebody can find without reading four files.

## What this is

**A conversation held with a user about their own transactions.** `POST
/api/assistant/messages` sends one turn, `GET /api/assistant/sessions` lists the account's
conversations and `GET /api/assistant/sessions/{id}` reads one back. The model is Gemini on the same
`GEMINI_API_KEY` receipt scanning uses.

**It generates nothing.** `src/insights/` still owns the rule-based insight sets, `INSIGHT_GENERATOR`
is still bound to `RuleBasedInsightGenerator`, and `backend/CLAUDE.md`'s "**No LLM behind the
insights**" bullet is still literally true.

**The check for that is on imports, not on the word.** PET-73's plan asked for
`rg -n insight backend/src/assistant/` to come back empty, and it does not - this file and three
docblocks say "insight" precisely to explain the boundary, so the sweep reports its own
documentation. The assertion that holds, and the one to run, is that **neither directory imports the
other**:

```
rg -n "from '.*insights" backend/src/assistant/
rg -n "from '.*assistant" backend/src/insights/
```

Both are empty, and keeping them empty is the point rather than a coincidence.

**Deliberately its own module.** `docs/TODO.md` decided that boundary before this ticket existed: "a
persisted set generated on a schedule and a conversation held with a user share a vocabulary and
nothing else."

## The files, and why they are split

| File                              | Role                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `assistant.module.ts`             | `imports: [CategoriesModule, PeriodsModule]`, no exports                      |
| `assistant.controller.ts`         | three routes; `ThrottlerGuard` on the **method**, not the class               |
| `assistant.service.ts`            | the orchestrator - the 503 check, resolve-or-create, the reads, the one write |
| `assistant-completion.service.ts` | **the only file importing `@google/genai`**                                   |
| `assistant-context.builder.ts`    | pure functions, no DI: the compression, the prompt, the sanitiser             |
| `assistant.constants.ts`          | the model, the timeout and the four ceilings                                  |

The split follows `ReceiptScanService` / `ReceiptExtractionService` one level further in, so the
pure parts need neither a database nor the SDK to test: the builder's spec pins the format with
literals, and the completion service's mocks the SDK wholesale.

## Decisions that are easy to undo by accident

**Nothing is persisted unless the reply arrives.** The model is called first; then the session row
(on a first message), the question and the answer are written in **one** `db.transaction()`. That is
what lets `assistant_messages` carry no status column and no lifecycle at all - a stored message is
by definition part of a completed turn, which is the deliberate contrast with `insight_sets`, whose
whole read is a lifecycle. It also makes a **cancelled** turn store nothing at no extra cost, since
the abort throws before any write. What it costs is that a failed call loses the question, which the
composer holds client-side and puts back.

**Compose, do not compute.** The window is `PeriodService.current`, the budget
`PeriodService.budgetCentsFor`, the caps and the fallback category name `CategoriesService.list`.
Only `profile.currency` is read directly, which is what `RuleBasedInsightGenerator` already does and
what `## Insights` sanctions as "the one static field neither surfaces". A window resolved here would
be the fifth copy of arithmetic `backend/CLAUDE.md` calls a bug at the third.

**The digest is this feature's own query, and three things about it are decisions.** It is not
`TransactionsService.list()`, which is period-filtered and returns DTOs carrying no category name -
the expensive path for data it cannot fully supply; `ReceiptScanService`'s merchant-history read is
the precedent. It uses a **`LEFT` join, not the inner join receipt scanning uses**: an inner join
would silently drop money through the dangling-category race `## Transaction endpoints` documents,
and the assistant would answer "how much did I spend" with a number that is wrong and
unexplainable - a null name folds onto the account's own fallback category, which is
`CategoriesService.withSpend`'s fold applied here and what keeps these totals agreeing with the
donut's. And it reads **`limit N + 1`**, so it knows it truncated without a `count(*)` on every turn.

**The prompt header names which period's budget and caps it is quoting.** Both are effective-dated
since PET-72, so a bare number lets the model answer a question about last March with this month's
limits and sound certain about it. The budget and cap **history** is deliberately not sent: the
transaction rows carry no period attribution of their own, so a history would be a second dataset
with a join the model performs in prose. `docs/TODO.md` carries the questions that would unlock.

**The digest is the app's first delimited format**, and therefore the first place a delimiter
injection can exist. `transactions.merchant` is free text with no character restriction, so an
unsanitised `|` shifts every field on its row and the model reads an amount as a category name -
producing a _confidently wrong answer_ rather than an error. `sanitizeField` is what stops it and its
spec pins it from every direction.

**Merchant names go verbatim.** Shortening "Konzum Superkonzum" to "Konzum" merges two real merchants
in the one field the model is being asked questions _about_. `MAX_NAME_CHARS` bounds a pathological
name and nothing else; the constant says why at length.

**Truncation is told to the model and reported to the screen.** A model that does not know its data
was cut will confidently answer "you never shopped there". A fact the model is told should also be a
fact the UI can state, or the only witness to it is a sentence the model may or may not produce -
hence the nullable `truncation` on the reply DTO.

**The message is trimmed in the DTO, and a review of PR #86 is why that is not cosmetic.**
`@MinLength(1)` measures the **untrimmed** string, so `{"message":"   "}` was a valid turn: the
composer's `canSend` guards the UI and this endpoint is reachable directly, `deriveSessionTitle`
collapsed the value to `''`, and `assistant_sessions.title` is NOT NULL but not non-empty - so the
History row rendered a link with no text and therefore no accessible name, over a blank question the
model was asked and charged for. Trimmed at the DTO rather than in the service, which is
`ListTransactionsQueryDto.search`'s call: both length bounds then measure what will actually be sent.

**There is no response schema and no JSON response type**, which is the one respect in which this
differs from every other Gemini call in the repo: the answer is prose. So there is no schema whose
field descriptions double as instruction - the whole instruction is the prompt string.

**The abort chain's third hop lives here.** `AssistantCompletionService.complete` combines the
request-close signal with its own timeout through `AbortSignal.any`, so an abandoned turn stops
spending quota. `src/common/request-abort.ts` is what produces that signal, and its `writableEnded`
guard is the whole of the difficulty: Express fires `close` on a normally completed response as well
as on a dropped connection, so an unguarded listener aborts its own successful reply - a failure
indistinguishable from a flaky model call in a log and perfectly correct-looking in the diff. Verify
it in a browser. `docs/explainers/cancelling-an-ai-request.md` is the plain-language account of all
three hops.

**The `chat` throttler is a fourth named one rather than a share of `scan`.** Both protect the same
Gemini quota, and the budgets differ by an order of magnitude in opposite directions: a scan is one
photo per logged expense, a conversation is ten to thirty turns in five minutes. A shared bucket
either starves the chat or opens the scan cap, and a burst of chat turns would silently disable
receipt scanning mid-form with no message that could explain it. `AppModule` carries the honesty
paragraph about what it does and does not buy.

### What crosses the wire

**The second place in the app that sends a user's data to a third party, so what goes is written
down rather than left to be reconstructed from four files.** The literal prompt string is
`buildPrompt` in `assistant-context.builder.ts` and is **not** restated here - it would drift the
first time somebody tuned a sentence. What is here is the inventory, which is what the composer's
disclosure line is a claim about.

One `generateContent` call carries three things:

- **The instruction header**: the model's role, the profile's currency, today's date in
  `APP_TIMEZONE`, the current period's bounds and label, the monthly budget in force, every
  category's name with its cap, and the refusal rules.
- **Every live transaction up to `MAX_PROMPT_TRANSACTIONS`**, with its merchant name, amount, date
  and category name, denormalized one per line. At 3,000 the showcase account's whole 2,249-row
  history goes.
- **The whole prior conversation of that session**, re-sent on every turn up to
  `MAX_HISTORY_MESSAGES`.

**What deliberately does not go, and is worth being able to say quickly:** no email, no name, no user
id, no session token, no database url or token, no category id - a name suffices here, unlike the
scan where an id has to come back verbatim - and **no per-transaction note**. Notes are excluded on
purpose: a note is the one field a user writes for themselves, it surfaces on no list row, and the
marginal answer quality does not buy that disclosure.

Nothing persists on Google's side beyond the request: no Files API, and **no context caching**.
Enabling caching later would change that sentence, because the dataset would live there for the cache
lifetime.

**The disclosure is categorically larger than receipt scanning's**, and the copy has to stay that
way. That one sends a receipt image, category names and up to fifty merchant names, and its review
found the copy naming two of the three. This one sends every amount and every date as well, so the
on-screen line names four things: that your transactions go, naming merchant, amount, date and
category; that this conversation goes with them; that it may be used to improve Google's models; and
that **the conversation is saved to your account**, where a receipt scan stores nothing. The string
is `DISCLOSURE` in `frontend/src/app/(app)/insights/AssistantComposer.tsx`, cited by file name rather
than copied - the receipt-scanning preview already mirrors a string with nothing checking that the
two agree, and a second unchecked mirror would double that liability.

## Not built here

Treat these as planned, not available. One bullet per capability, ordered alphabetically by its bold
lead-in; when a capability lands, delete its whole bullet and nothing else. Why each one is deferred,
where that was a decision rather than a queue, is in `docs/TODO.md`.

- **Deleting a conversation.** There is no `DELETE /api/assistant/sessions/{id}` and no prune.
  `insight_sets` needed one because a row was written per transaction write, so growth tracked how
  much the user spent; a conversation only exists because a human typed it, so growth is bounded by
  use. Both tables carry `deleted_at` and every read filters it, so the endpoint is a service method
  and a route rather than a schema change.

- **Editing, branching or regenerating a turn.** A stored message is immutable and the API exposes
  no way to replace one. Each of those needs a lifecycle this schema deliberately does not have.

- **Renaming a conversation.** The title is derived from the first message and never rewritten,
  which is why `assistant_sessions` carries no `updated_at`. A rename is a column update and a
  route, plus the `updated_at` this table would then owe.

- **Sending the budget and cap history.** The prompt quotes only the **current** period's budget and
  caps, so a question about what the budget was in March cannot be answered from the data the model
  holds. The rows carry no period attribution of their own, so history would be a second dataset
  with a join performed in prose.

- **Streaming a reply.** The turn is one request and one response; the composer waits on it with a
  typing indicator. Streaming needs a different transport end to end, and the abort chain that
  exists is what makes waiting acceptable.

- **Tools, retrieval or actions.** The assistant reads a prompt and answers prose. It cannot add,
  edit or delete anything, and the prompt tells it to say which screen does instead.
