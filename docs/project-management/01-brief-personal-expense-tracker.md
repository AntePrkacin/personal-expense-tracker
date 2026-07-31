# Personal Expense Tracker: app brief

**One-line pitch:** Expensa is a desktop web app where one person logs expenses by hand, tracks spending against a monthly budget split into categories, and gets AI-written insights about where the money goes. The Welcome screen says it directly: "Take control of your money."

> **Source:** Figma file [Personal Expense Tracker](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=1-4), page "Screens", 24 frames in 5 sections (Onboarding, Dashboard, Transactions, AI Insights, Account). Everything in this brief comes from those frames. Inferences are labeled as inferences.
>
> **Notation:** Figma frame names and some UI copy contain a long dash character. Per DECODE writing rules, these documents write it as a hyphen (so the frame is referenced as "06 · Transactions - List"). Everything else is quoted exactly as designed.

## Problem and target users

The design shows a single-user tool for tracking personal spending by hand. Expenses are typed into a modal (amount, category, date, merchant, note); there is no bank feed or import anywhere in the file. Each user has an account, created at the last step of onboarding and reached afterwards by an emailed login link, never a password. One profile (Marko K., marko@email.com) appears in the sidebar on every screen, and nothing suggests sharing or multiple users inside one account.

**Inferred problem:** spending is hard to see and control month to month. Every screen is organized around one monthly budget ($2,000 in the sample data), how much of it is used, and how many days remain.

**Inferred target users:** individuals managing everyday personal spending. The inference comes from the Welcome overline "PERSONAL FINANCE, SIMPLIFIED", the footer "Made for mindful spending.", and the sample data (groceries, rent, Netflix, Uber, a pharmacy).

## Core value proposition

Log an expense in seconds, then see three things in one calm place: how the month is going (Dashboard), where the money went (Transactions and Categories), and what to do about it (AI Insights). The insights empty state promises: "Once you log a few transactions, I'll analyze your spending, flag anomalies and suggest ways to stay on budget." Strong empty states on Dashboard, Transactions, and Insights all pull the user toward logging the first expense.

## Key user flows

1. **Onboarding and sign-up (three steps):** Welcome → Setup - Currency & budget (step 1) → Setup - Starter categories (step 2) → Register user (step 3) → Check your email → open the emailed link → Dashboard - Empty
2. **Returning sign-in:** Welcome ("I already have an account") → Log in → Check your email → open the emailed link → Dashboard
3. **Log an expense:** Dashboard (or Transactions, or an empty-state button) → Add transaction (modal) → save → Transactions - List, updated
4. **Review spending:** Dashboard → Transactions - List → Transaction detail → back via "All transactions" breadcrumb
5. **Manage a transaction:** Transactions - List → Row menu → Edit transaction (modal) or Delete confirmation → Transactions - List, updated
6. **Check category budgets:** Transactions - List → Categories tab (allocation bar and one budget card per category)
7. **Manage categories:** Categories tab → "Add category" (modal), or a card's kebab → Categories - Row menu → Edit category (modal) or Delete confirmation for category → Categories, recomputed
8. **Get AI insights:** Dashboard ("Open insights") → AI Insights → Regenerate → AI Insights - Generating → AI Insights, refreshed

## Screen inventory

| Screen name | Figma frame (linked) | Purpose |
|---|---|---|
| Welcome | [01 · Welcome](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=41-696) | Entry screen with the pitch and two ways in: "Get started" and "I already have an account" |
| Setup - Currency & budget | [02 · Setup - Currency & budget](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=42-700) | Step 1 of 3: pick a currency (USD - $) and set the monthly budget ($2,000) |
| Setup - Starter categories | [03 · Setup - Starter categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=43-705) | Step 2 of 3: toggle starter category chips on or off, then "Continue" |
| Register user | [22 · Register user](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=129-1128) | Step 3 of 3: first name, last name, email, then "Finish setup". No password field |
| Log in | [23 · Log in](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=132-1138) | Returning user asks for a login link by email |
| Check your email | [24 · Check your email](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=134-1142) | Confirms the link was sent to the address, offers "Resend link" |
| Dashboard | [04 · Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4) | Monthly overview: budget progress, stats, weekly trend, category donut, recent transactions, AI teaser |
| Dashboard - Empty | [05 · Dashboard - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706) | Same layout with zero data; every card points to adding a transaction |
| Transactions - List | [06 · Transactions - List](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=26-90) | Searchable, filterable, sortable table of all transactions |
| Transactions - Empty | [07 · Transactions - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=45-752) | Transactions page before any expense exists, with a single call to action |
| Transaction detail | [08 · Transaction detail](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=34-349) | One transaction in full: amount, details, note, category month context, edit and delete |
| Add transaction (modal) | [09 · Add transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=28-135) | Form to log an expense: amount, category, date, merchant, optional note |
| Row menu | [10 · Row menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=30-257) | Per-row kebab menu on the list with Edit and Delete |
| Edit transaction (modal) | [11 · Edit transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=29-196) | Same form prefilled, plus a "Delete transaction" action |
| Delete confirmation | [12 · Delete confirmation](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=31-302) | Dialog that confirms permanent deletion of a transaction |
| Categories | [13 · Categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=36-423) | Second tab of Transactions: budget allocation bar and one budget card per category |
| Categories - Row menu | [18 · Categories - Row menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=75-806) | Per-card kebab menu on the Categories tab with Edit and Delete |
| Add category (modal) | [19 · Add category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-878) | Form to create a category: name, monthly budget, color, icon, optional note |
| Edit category (modal) | [21 · Edit category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=116-1040) | Same form prefilled, plus a "Delete category" action |
| Delete confirmation for category | [20 · Delete confirmation for category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-1078) | Dialog confirming removal; the category's transactions move to Other |
| AI Insights | [14 · AI Insights](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=38-495) | Monthly summary banner plus four insight cards, with Regenerate |
| AI Insights - Generating | [15 · AI Insights - Generating](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=39-540) | Loading state with skeleton cards while insights are produced |
| AI Insights - Empty | [16 · AI Insights - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=39-665) | Insights page before the first expense, explains what insights will do |
| Settings | [17 · Settings](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=40-630) | Edit profile (name, email), preferences (currency, budget, month start), reach category management |

The file also contains Introduction (file navigation notes), Foundations (color and type tokens), and Components (component library) pages. Those support the Screens page and don't add screens. The token values are listed in the tech spec, section 5.1.

## In scope

Exactly what the 24 frames show:

- Three-step onboarding (currency and monthly budget, then starter category chips, then account registration)
- Passwordless access: registration and log in both send a login link by email and land on "Check your email", which offers a resend. No password exists anywhere in the design
- Category management: create, edit, and delete categories with a name, monthly budget, color, icon, and optional note; deleting one moves its transactions to Other
- A dashboard with monthly budget progress and status chip, three stats (transactions, average per day, top category), a weekly spending bar chart, a spending-by-category donut with legend, the three most recent transactions, and an AI insight teaser card
- Manual expense logging, editing, and deleting via modals, with a confirmation before delete
- A transactions table with search, category filter, period filter ("This month"), sort ("Newest first"), count badge, and per-row actions
- A transaction detail page with amount, merchant, category, date, time, payment, status, note, and "category this month" context
- A Categories tab with a budget allocation summary and per-category cards (spent vs cap, status chip, amount left or over, transaction count)
- An AI Insights page with a generated monthly summary, four insight cards, a Regenerate action with a loading state, and an empty state
- Settings for profile fields, preferences (currency, monthly budget, month start day), and a categories summary
- Empty states for Dashboard, Transactions, and AI Insights

## Out of scope

Commonly expected but absent from the design, so not part of this build:

- Password-based sign-in: no password, confirm-password, or reset field exists on any frame, so the emailed link is the only credential
- What happens when the login link is opened: no landing, expired-link, already-used-link, or wrong-device screen is designed
- Logout and account deletion: no control for either exists anywhere, Settings included, even though the design now implies sessions
- Bank connections, imports, or automatic capture: payment details ("Visa ····4021") appear as display data only
- Income or deposits: every amount is an expense; nothing records money coming in
- Recurring transactions: insights mention subscriptions, but no recurring feature exists
- Month navigation: only October 2025 exists; the Dashboard month control shows a single value
- A date picker: the Add/Edit date field is a closed select-style control; no calendar is drawn
- Search results and no-match states: the search field exists, but no result state is designed
- Notifications, reminders, sharing, export, or multi-user support
- Mobile or tablet layouts (every frame is 1440x1024 desktop), dark mode, unit or language switching
- Error, offline, and form-validation states (no error visuals exist anywhere in the file)

Where the design is ambiguous or self-contradictory, the tech spec records the working decision in its assumptions log (A1 to A44).
