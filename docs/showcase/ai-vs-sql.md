# The AI Assistant against SQL

Three questions, asked of the assistant and answered independently in SQL, so a room can see
whether the model is reading the data or inventing something plausible.

## Why this is fair rather than a stunt

`MAX_PROMPT_TRANSACTIONS` is **3,000** and this account holds **2,220** transactions, so the entire
36-month history goes into every prompt and the truncation path is unreachable. Two consequences
follow, and both are worth saying out loud before the first answer:

- A wrong answer is a **genuine hallucination**, not a consequence of data the model never saw.
- The questions are **not period-limited**. The budget and caps in the prompt header are the
  current period's, but the transaction rows are the whole account.

## The account these figures come from

Read back from the demo account's own database **after the final reseed**, which is the only
moment they mean anything: the seeder drops current-month rows dated after today, so the account
is a function of the day it was seeded. Recorded **2026-08-12**, 2,220 transactions spanning
2023-09-01 to 2026-08-12.

Every query takes `LIMIT 5` rather than `LIMIT 1`. The runner-up proves the margin, and "second
place was a tenth of that" is what makes a right answer credible to a room rather than merely
asserted.

Four traps the SQL has to respect, and any replacement query must too:

- **`deleted_at IS NULL` everywhere.** Transactions tombstone rather than delete.
- **Amounts are integer cents**, divided by 100 exactly once.
- **The category join folds the same way the digest does.** A query that folds a null or dangling
  category differently disagrees with the model for a reason that has nothing to do with the model.
- **Merchant is free text** and reaches the model verbatim, so grouping is on the exact string.

---

## 1. A group-by sum over a date window

> Which merchant did I spend the most money at in 2025, and how much was it?

**SQL answer: Riverside Property, EUR 17,400.00** over 12 transactions. Runner-up Meridian Health
at EUR 1,740.00 - a **tenfold** margin.

```sql
SELECT merchant, SUM(amount_cents) AS cents, COUNT(*) AS n
FROM transactions
WHERE deleted_at IS NULL
  AND date >= '2025-01-01'
  AND date <= '2025-12-31'
GROUP BY merchant
ORDER BY cents DESC
LIMIT 5;
```

| Merchant | Total | Transactions |
| --- | --- | --- |
| Riverside Property | EUR 17,400.00 | 12 |
| Meridian Health | EUR 1,740.00 | 12 |
| Lidl | EUR 1,713.89 | 24 |
| Konzum | EUR 1,312.51 | 23 |
| Cogito Coffee | EUR 1,203.66 | 41 |

Two words in that question are load-bearing. **"In 2025" rather than "last year"**, because "last
year" also reads as the trailing twelve months and the two windows disagree. And **"merchant"
rather than "store"**, because the top two are rent and a health provider: "store" invites the
model to reinterpret the question and answer Lidl, genuinely third at EUR 1,713.89, which would be
an interpretation miss dressed up as an arithmetic one.

## 2. A maximum within a category

> What is the most expensive gift I have ever bought, and where and when did I buy it?

**SQL answer: EUR 319.33 at Gift Gallery on 2026-07-04.** Runner-up EUR 114.52.

```sql
SELECT t.date, t.merchant, t.amount_cents
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.name = 'Gifts'
ORDER BY t.amount_cents DESC
LIMIT 5;
```

| Date | Merchant | Amount |
| --- | --- | --- |
| 2026-07-04 | Gift Gallery | EUR 319.33 |
| 2026-05-03 | Present & Co | EUR 114.52 |
| 2026-06-07 | Flower Shop | EUR 110.59 |
| 2025-11-22 | Gift Gallery | EUR 110.18 |
| 2024-06-27 | Flower Shop | EUR 108.17 |

**Three checkable facts from one answer** - amount, merchant and date - and a needle in a haystack:
34 gift rows inside 2,220 transactions.

## 3. A group-by count within a category

> Which merchant do I shop at most often for groceries, and how many times have I been there?

**SQL answer: Konzum, 90 times.** Runner-up Lidl at 68.

```sql
SELECT t.merchant, COUNT(*) AS visits, SUM(t.amount_cents) AS cents
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.name = 'Groceries'
GROUP BY t.merchant
ORDER BY visits DESC
LIMIT 5;
```

| Merchant | Visits | Total |
| --- | --- | --- |
| Konzum | 90 | EUR 4,742.95 |
| Lidl | 68 | EUR 4,141.74 |
| Kaufland | 49 | EUR 2,736.22 |
| Spar | 39 | EUR 2,785.94 |
| dm | 31 | EUR 1,754.48 |

The most robust of the three: "most" is ambiguous between visits and money, and **both readings
answer Konzum** (EUR 4,742.95 against EUR 4,141.74), so the ambiguity cannot produce a
wrong-looking right answer.

---

## What the assistant said

**Each ask is a new chat session, not a follow-up.** In one conversation the model sees its own
previous answer and will tend to restate it, so three asks in one thread measure its consistency
with itself rather than the reproducibility of the answer - a different and much less interesting
quantity, and one that looks identical in the transcript afterwards. Nine turns fits inside
`CHAT_RATE_LIMIT`, which production sets to 20 an hour.

The model is not deterministic even when the data is, so one right answer proves nothing.

Asked through `POST /api/assistant/messages` against production on **2026-08-12**, one call per
ask with `sessionId` omitted - which is what makes the backend open a new conversation.

| Question | Ask 1 | Ask 2 | Ask 3 | Verdict |
| --- | --- | --- | --- | --- |
| 1. Top merchant in 2025 | **Correct** | **Correct** | *upstream failure* | Right every time it answered |
| 2. Most expensive gift | **Correct** | **Correct** | **Correct** | 3/3, all three facts each time |
| 3. Groceries merchant by visits | **91** - merchant right, count **wrong** by one | *upstream failure* | *upstream failure* | The one genuine miss |

### What it got right, and it went further than it was asked

On question 1 the model volunteered the composition without being asked: twelve monthly payments
of EUR 1,450.00 filed under *Loans & debt* on the 1st of each month. Every one of those details
checks out against the SQL above.

On question 2 it returned all three checkable facts - EUR 319.33, Gift Gallery, 2026-07-04 - on
every ask, phrased differently each time. That is a needle in a haystack: 34 gift rows inside
2,220 transactions.

### The one genuine miss, and why it is the useful one

Asked how many times the account has shopped at Konzum for groceries, the model answered **91**.
The answer is **90**.

It is worth being precise about what kind of error that is, because the obvious explanation is
wrong. It is **not** a definitional disagreement about which rows count: `Konzum` appears exactly
90 times in the whole account, every one of them in `Groceries`, and the model quoted the date
range `2023-09-07` to `2026-08-06` - which is *precisely* the correct span. So it found the right
rows and then miscounted them by one.

That is the honest headline of this whole comparison. **The model reads the data correctly and
does arithmetic on it unreliably.** It is also the cheapest possible thing to check: one line of
SQL, one integer, no interpretation.

Note the asymmetry with the other two questions. A *maximum* and a *sum over twelve rows* it gets
right; a *count over ninety* it does not. Nothing here should be read as "the assistant is
accurate" - it is accurate on two shapes of question and was caught being wrong on the third, on
the first ask, with one query.

### Three of nine turns never got an answer at all

Five turns answered, one answered wrongly, and **three failed upstream** - so the table above has
gaps that are not omissions. Google returned `503 UNAVAILABLE`, "This model is currently
experiencing high demand", and on the retries two calls simply timed out. Nothing about the
account, the prompt or the questions changed between the asks that worked and the ones that did
not.

That is worth stating rather than hiding, because it is a real property of the thing being
demonstrated: **this feature depends on a free-tier third-party model, and a third of the attempts
in one sitting did not complete.**

**One defect surfaced by it.** An upstream `503` reaches the client as a **generic 500**, because
`AssistantController` documents 503 for "not configured" and 504 for a timeout, and an overloaded
model matches neither - so it falls through `AllExceptionsFilter` as an unhandled exception. A
transient "try again in a moment" is therefore indistinguishable from a real bug, and the UI
offers no retry affordance for it. Recorded in `docs/TODO.md`; mapping it to a true 503 is small
but it touches the error taxonomy and wants its own ticket.
