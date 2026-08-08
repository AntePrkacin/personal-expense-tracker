# Personal Expense Tracker: tech spec

This spec turns the Figma design into buildable requirements. Every requirement references the screen it comes from. If a requirement has no screen behind it, it doesn't belong here.

> **Source:** Figma file [Personal Expense Tracker](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=1-4), page "Screens" (24 frames in 5 sections: Onboarding, Dashboard, Transactions, AI Insights, Account). Frame names and UI copy are quoted as designed, except that long dashes are written as hyphens per DECODE writing rules.
>
> **Product name:** the app is **Spendifico**, renamed from "Expensa" on 2026-08-02 (PET-51). The requirements below say Spendifico because that is what the app must ship, and the code already does. The Figma file has not caught up: it still draws the old logo and wordmark, so this is the one place the spec knowingly departs from the design. Swapping the asset is a designer task, and until it happens `ui/Sidebar.tsx` diverges deliberately, with a test pinning it so the divergence cannot be half-reverted.
>
> **How to read requirement IDs:** each screen has a code (WEL, BUD, CAT, REG, LOG, VER, DSH, TRN, DET, ADD, EDT, MNU, DEL, CTG, CED, INS, SET). "TRN-3" means requirement 3 of the Transactions screens. Use these IDs when you write Jira tasks so every task traces back here.
>
> **For students:** read the brief first, then work through this spec screen by screen. Every bolded ID is one requirement your Jira tasks must reference. Section 6 records working decisions where the design is ambiguous: challenge an assumption with your teacher if you disagree, don't silently change it. When the design and your instinct conflict, the design wins.

## 1. Overview

**Platform:** desktop web app. Every frame is 1440x1024 with a fixed left sidebar (app screens) or a centered card on a plain canvas (onboarding and access screens), which is a desktop-first web layout. No mobile or tablet frames exist, and only light mode is designed.

**Suggested architecture:** a single-page web app with four routed views (Dashboard, Transactions, AI Insights, Settings) behind a shared app shell, plus a set of unauthenticated screens outside that shell (01, 02, 03, 22, 23, 24) and modals for transaction create, edit, and delete and for category create, edit, and delete. Data is a small store of profile, preferences, categories, and transactions, sensibly kept in a relational database behind a thin backend.

Two parts need real backend work beyond CRUD:

- **Passwordless access.** The design has no password field anywhere. Registration (22) and log in (23) both end at "Check your email" (24), so the build needs emailed single-use login links, link verification, and sessions (REG, LOG, VER; assumptions A31 to A38).
- **Insight generation.** One asynchronous "generate insights" operation with a visible loading state (15) that produces stored, re-readable text.

**Terms used in this spec:**

- **Modal:** a dialog that opens on top of the page and blocks it until closed.
- **Empty state:** what a screen shows before any data exists.
- **Overline:** the small caption text sitting above a page title.
- **Breadcrumb:** a small link at the top of a page that leads back to the parent page.
- **Kebab menu:** a three-dot button that opens a small menu of actions.
- **Badge (or chip):** a small rounded label that shows a status, like "On track".
- **Tab:** one of a row of switches at the top of a page ("All transactions" / "Categories").
- **Donut chart:** a ring chart where each slice is a category's share of spending.
- **Skeleton:** gray placeholder bars shown in place of content while it loads.
- **Magic link:** a single-use link emailed to the user that signs them in, used instead of a password (23, 24).
- **Step indicator:** the row of dots above the onboarding card; the active step is a filled pill (02, 03, 22).

## 2. Functional requirements per screen

### 2.1 Welcome

**Figma frame:** [01 · Welcome](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=41-696). **Purpose:** entry point; pitch the product and route new vs. returning users.

UI elements and behavior:

- **WEL-1.** Show the Spendifico logo (top left), the overline "PERSONAL FINANCE, SIMPLIFIED", the heading "Take control of your money.", the intro "Track every expense, set budgets by category, and get AI insights that keep you on plan - all in one calm, focused space.", and the footer microcopy "Made for mindful spending."
- **WEL-2.** Primary button "Get started" opens Setup - Currency & budget (02) (assumption A1).
- **WEL-3.** Text link "I already have an account" opens Log in (23) (assumption A2). This is the only route into the returning-user flow.
- **WEL-4.** Right half: a dark decorative panel with a sample budget card ("October budget", "$1,240 of $2,000", green "On track" chip, "$760 left · 8 days to go") and two floating chips ("Dining $298", "Transport $223"). Display only, no interactions.

Validation: none (no inputs).

States: default only. No loading, error, or filled variants are designed.

Navigation: entry point is first app launch. Exits: "Get started" → 02, "I already have an account" → 23.

Edge cases: none visible.

### 2.2 Setup - Currency & budget

**Figma frame:** [02 · Setup - Currency & budget](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=42-700). **Purpose:** step 1 of 3; set the currency and the monthly budget the whole app tracks against.

UI elements and behavior:

- **BUD-1.** Centered Spendifico logo, a step indicator (three dots, first active as a filled pill), and a card with overline "STEP 1 OF 3", heading "Set your monthly budget", and supporting copy "How much do you plan to spend each month? You can change this anytime in Settings." (which proves the value is editable on 17).
- **BUD-2.** Select "Currency" showing "USD - $". Only USD appears in the file; the option list is unknown (assumption A6).
- **BUD-3.** Input "Monthly budget" with a "$" prefix and value "2,000". The frame shows its focused state (highlighted border), so a designed focus style exists.
- **BUD-4.** Text button "Back" returns to Welcome (01).
- **BUD-5.** Primary button "Continue" keeps both values and opens Setup - Starter categories (03). Nothing is persisted to an account yet: the account does not exist until step 3 (assumption A32).

Validation implied by the design:

- **BUD-6.** Budget is numeric, displayed with thousands separators and the currency prefix. No minimum, maximum, or error state is designed (assumption A5).

States: default, plus the designed focused-input style.

Navigation: entry from 01. Exits: "Back" → 01, "Continue" → 03.

Edge cases: an empty or zero budget makes dashboard copy like "$2,000 left" meaningless; treat the field as required (assumption A5).

### 2.3 Setup - Starter categories

**Figma frame:** [03 · Setup - Starter categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=43-705). **Purpose:** step 2 of 3; choose starter categories to track.

UI elements and behavior:

- **CAT-1.** Step indicator (second dot active) and a card with overline "STEP 2 OF 3", heading "Pick your categories", and copy "Choose what you'd like to track. Tap to toggle - you can always add or edit categories later."
- **CAT-2.** Ten toggle chips in three rows, each with a colored dot and name, in this order: Groceries, Dining out, Transport, Shopping, Housing, Health, Entertainment, Bills, Subscriptions, Other. Selected chips show a checkmark and a tinted border. Selected in the mock: Groceries, Dining out, Transport, Shopping, Housing, Entertainment, Bills (7). Unselected: Health, Subscriptions, Other.
- **CAT-3.** Text button "Back" returns to 02 with entered values kept (assumption A3).
- **CAT-4.** Primary button "Continue" keeps the selection and opens Register (22). Onboarding does not finish here: "Finish setup" now lives on step 3 (assumption A3).

Validation implied: none designed. No minimum selection is enforced anywhere in the file (assumption A4).

States: chip selected and unselected (both designed).

Navigation: entry from 02. Exits: "Back" → 02, "Continue" → 22.

Edge cases: the onboarding chip set conflicts with the categories the app screens actually show (no Bills or Subscriptions ever again; Health and Other appear active on 13 despite being unselected here). Each screen follows its own mock until the designer resolves it (assumption A7). The "add or edit categories later" promise is now kept by the category editor (2.15).

### 2.4 Register user

**Figma frame:** [22 · Register user](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=129-1128). **Purpose:** step 3 of 3; create the account that owns the budget and categories chosen in steps 1 and 2.

UI elements and behavior:

- **REG-1.** Centered Spendifico logo, step indicator (three dots, third active as a filled pill), and a card with overline "STEP 3 OF 3", heading "Register", and copy "Create your account to start tracking your spending."
- **REG-2.** Fields: "First name" ("Marko") and "Last name" ("Kovač") side by side on one row, then "Email" ("marko@email.com") full width. All three are required; there is no password field anywhere in the file, so access is passwordless by design (assumption A31).
- **REG-3.** Text button "Back" returns to 03 with the category selection kept (assumption A3).
- **REG-4.** Primary button "Finish setup" creates the account, persists the currency, monthly budget, and starter categories collected in steps 1 and 2, emails a single-use login link, and opens Check your email (24) (assumption A31). The Dashboard is reached only after that link is opened (assumption A33).
- **REG-5.** The name and email captured here are the profile shown in the sidebar footer ("Marko K.", "marko@email.com") and prefilled on Settings (DSH-1, SET-2). Avatar initials "MK" derive from the two names.
- **REG-6.** Registering with an email that already has an account is not designed. Do not create a duplicate account; send a login link instead and land on 24 (assumption A35).

Validation implied by the design: all three fields required, email in a valid format. No error states are designed (assumption A29).

States: default only. No loading state is designed for the account-creation request (assumption A19).

Navigation: entry from 03 "Continue". Exits: "Back" → 03, "Finish setup" → 24.

Edge cases: the account does not exist during steps 1 and 2, so those values must survive until this screen submits (assumption A32). If account creation fails there is no designed error surface.

### 2.5 Log in

**Figma frame:** [23 · Log in](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=132-1138). **Purpose:** let a returning user request a login link.

UI elements and behavior:

- **LOG-1.** Centered Spendifico logo and a card with heading "Log in" and copy "Enter the email you signed up with and we'll send you a secure login link." No step indicator (this is not part of onboarding) and no overline.
- **LOG-2.** One field, "Email" ("marko@email.com"), required and validated as an email address.
- **LOG-3.** Primary button "Log in" emails a single-use login link and opens Check your email (24).
- **LOG-4.** Text button "Back" returns to Welcome (01).
- **LOG-5.** Entry is the "I already have an account" link on Welcome (WEL-3). No other route into this screen is designed.
- **LOG-6.** An email with no account behind it is not designed. Show the same 24 confirmation either way so the screen never reveals whether an account exists (assumption A35).

Validation implied by the design: email required and well formed. No error states are designed (assumption A29).

States: default only. No sent, pending, or throttled variant is designed.

Navigation: entry from 01. Exits: "Back" → 01, "Log in" → 24.

### 2.6 Check your email

**Figma frame:** [24 · Check your email](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=134-1142). **Purpose:** confirm the login link was sent and offer one retry.

UI elements and behavior:

- **VER-1.** Centered Spendifico logo and a card with heading "Check your email" and body "We've sent a secure login link to marko@email.com. Open the link on this device to access your account." The address is interpolated from whatever was submitted on 22 or 23, and the copy commits to a same-device link.
- **VER-2.** Secondary button "Resend link" sends a fresh link and invalidates the previous one. No cooldown, counter, or success confirmation is designed (assumption A36).
- **VER-3.** ~~Text button "Back" returns to whichever screen opened this one, 22 or 23 (assumption A37).~~ **Withdrawn by PET-11: 24 has no "Back" control.** By the time this screen renders the account exists and the link is sent, so there is nowhere backwards to go, and "Resend link" is the only recovery the design offers (A36). The deciding case is the 22 path: PET-11 clears the onboarding draft on a successful register, so reopening 22 would show an empty card and invite a user who already has an account to re-type everything. Dropped for the 23 path too, rather than kept on one exit and not the other. See the revised A37.
- **VER-4.** Opening the link signs the user in and lands them in the app: Dashboard - Empty (05) for a new account, Dashboard (04) for a returning one. The link-opening step has no frame of its own (assumption A33).
- **VER-5.** Link and session rules are not designed. Working decision: single use, short expiry, and a normal session afterwards, so the user does not repeat this flow on every visit (assumption A34). An expired, reused, or wrong-device link has no designed screen (assumption A38).

Validation: none (no inputs).

States: default only. No resent, expired, or error variant is designed.

Navigation: entry from REG-4 or LOG-3, both of which pass the submitted address to this screen so VER-1 can interpolate it. Exits: opening the emailed link → 05 or 04. There is no in-app exit backwards (revised VER-3).

Edge cases: this screen is a dead end inside the app until the user leaves for their inbox, so the session must survive the round trip. Nothing is designed for a user who never opens the link.

### 2.7 Dashboard (filled and empty)

**Figma frames:** [04 · Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4), [05 · Dashboard - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=44-706). **Purpose:** show the month at a glance and route the user to logging, the list, and insights.

Shared shell (also applies to Transactions, AI Insights, Settings):

- **DSH-1.** Fixed dark sidebar: Spendifico logo; section "MENU" with "Dashboard" and "Transactions"; section "ASSISTANT" with "Insights"; section "ACCOUNT" with "Settings". The active item is highlighted (Sidebar component variants). Footer shows avatar initials ("MK"), name "Marko K." and email "marko@email.com" from the profile.
- **DSH-2.** Page header: overline "October 2025", title "Dashboard", a month select showing "October", and a primary "Add transaction" button that opens the Add transaction modal (09). Only October exists in the file, so the month select renders the current month and stays non-functional until month navigation is designed (assumption A8).

Monthly budget card:

- **DSH-3.** Card "Monthly budget" with a status chip, readout "{spent} of {budget}", a progress bar, left caption "{remaining} left", right caption "{n} days left in {month}", and a stats row of three Stat components: "Transactions", "Avg / day", "Top category".
- **DSH-4.** Filled state (04): chip "On track" (green), readout "$1,240 of $2,000", captions "$760 left" and "8 days left in October", stats "38 Transactions", "$54 Avg / day", "Groceries Top category". Statuses beyond "On track" aren't designed for this card (assumption A26 covers chip tones elsewhere).
- **DSH-5.** Empty state (05): readout "$0 of $2,000" (the onboarding budget is already present), empty bar, captions "$2,000 left" and "Full month ahead", stats "0 Transactions", "$0 Avg / day", and a dash placeholder for "Top category".

Main content:

- **DSH-6.** Card "Spending trend" with caption "Weekly · October": a bar chart of the month's weeks with value labels ($280, $410, $250, $300) and week labels (Week 1 to Week 4); one bar is highlighted. Display only. Empty state (05): a small bar glyph and "No spending to chart yet".
- **DSH-7.** Card with Section header "Recent transactions" and action "View all" linking to Transactions - List (06). Three most recent transactions as List rows: category icon tile, merchant, caption "{category} · {relative or short date}", negative amount ("Whole Foods, Groceries · Today, -$24.00", "Uber, Transport · Yesterday, -$18.50", "Netflix, Entertainment · Oct 3, -$15.99"). "Today"/"Yesterday" imply relative date formatting. Empty state (05): icon, "No transactions yet", "Your recent expenses will appear here as you add them."

Right column:

- **DSH-8.** Card "Spending by category": donut chart with center total "$1,240 Total spent" and a legend of dot, name, amount, and percent rows (Groceries $397 32%, Dining out $298 24%, Transport $223 18%, Shopping $174 14%, Other $148 12%). Empty state (05): gray donut, center "$0 spent", caption "Your category breakdown appears here once you start spending." Whether small categories group into "Other" is unresolved because the sample data conflicts across screens; show all nonzero categories until the designer answers (assumption A25).
- **DSH-9.** Dark "AI INSIGHTS" card. Filled state (04): headline "You're spending 18% more on dining out than last month.", body "That's $46 above your usual pace. Cutting two takeouts keeps you on budget.", button "Open insights →" → AI Insights (14). The teaser shows content from the latest generated insight set (assumption A27). Empty state (05): title "Insights unlock after your first expense.", body "Log a few expenses and I'll surface patterns and ways to save.", button "Add transaction →" → modal (09).

States: filled (04) and empty (05). No loading or error states are designed (assumption A19).

Navigation: entry after onboarding and first sign-in (03 → 22 → 24 → 05), on later sign-ins (23 → 24 → 04), and from the sidebar. Exits: "Add transaction" → 09, "View all" → 06, "Open insights" → 14, sidebar → 06/14/17.

Edge cases visible or implied: "8 days left in October" and "Full month ahead" require day math against the configured month start (17, assumption A9); the dash placeholder when no top category exists; the current week highlighted in the trend chart; every displayed number must come from the transactions store, not the mock values (assumption A25).

### 2.8 Transactions - List and empty state

**Figma frames:** [06 · Transactions - List](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=26-90), [07 · Transactions - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=45-752). **Purpose:** the full expense log with search, filters, and sort.

Header and tabs:

- **TRN-1.** Page header: overline "October 2025", title "Transactions", a search input with magnifier icon and placeholder "Search transactions", and a primary "Add transaction" button → modal (09).
- **TRN-2.** Tabs: "All transactions" with a count badge (128 in 06, 0 in 07) and "Categories" → 13. The badge shows the total transaction count (assumption A17).
- **TRN-3.** Filter bar under the tabs: select "All categories" (category filter), select "This month" (period filter, aligned to the configured month start, assumption A9), and a right-aligned "Newest first" sort select. Only the closed controls are designed; sort implies at least newest ordering (assumption A16). The filter bar is not rendered in the empty state (07), a deliberate visible difference.

Table (06):

- **TRN-4.** Columns: MERCHANT, CATEGORY, DATE, AMOUNT, plus a kebab (three-dot) button per row.
- **TRN-5.** Each row: rounded category-colored icon tile + merchant name; colored dot + category name; short date ("Oct 8" to "Oct 2"); right-aligned negative amount ("-$62.40", "-$1,100.00"). Mock rows: Whole Foods/Groceries, Uber/Transport, Netflix/Entertainment, Starbucks/Dining out, Shell/Transport, Amazon/Shopping, Rent - October/Housing, Spotify/Entertainment, Trader Joe's/Groceries, City Pharmacy/Health.
- **TRN-6.** The mock lists 10 rows while the badge says 128. No pager or scroll indicator is designed, so assume vertical scrolling of one list (assumption A11).
- **TRN-7.** Clicking a row opens Transaction detail (08). The click target isn't marked, but 08 carries an "All transactions" breadcrumb back (assumption A10).
- **TRN-8.** The kebab button opens the Row menu (10).

Empty state (07):

- **TRN-9.** Centered card: icon, heading "No transactions yet", copy "Log your first expense and it'll show up here, sorted and categorised automatically." (UK spelling as designed, assumption A30), button "Add transaction" → modal (09). The search input and header button remain visible.

States: populated list (06) and empty (07). A no-results state for search or filters is not designed; show the 07-style message without hiding the controls until a designed variant exists (assumption A15).

Navigation: entry from sidebar "Transactions", dashboard "View all", and after modal actions. Exits: row → 08, kebab → 10, "Add transaction" → 09, "Categories" tab → 13.

### 2.9 Transaction detail

**Figma frame:** [08 · Transaction detail](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=34-349). **Purpose:** one transaction in full, with edit and delete.

- **DET-1.** Breadcrumb "All transactions" returns to Transactions - List (06).
- **DET-2.** Header: merchant as title ("Whole Foods"), caption "Oct 8, 2025 · 2:32 PM ·" plus a green category chip ("Groceries"). Buttons: "Edit" (opens 11) and "Delete" (danger style, opens 12).
- **DET-3.** Card "Amount": "-$62.40" with caption "Debited from Everyday account". The account name appears only here and is never captured (assumption A20).
- **DET-4.** Card "Groceries this month": amber chip "79% used", progress bar, "$397 spent" left, "$103 left of $500" right. This proves per-category monthly caps exist ($500 for Groceries) and percent-used math (397/500 rounds to 79%).
- **DET-5.** List "Recent in Groceries": Whole Foods (Groceries · Oct 8, -$62.40), Trader Joe's (Groceries · Oct 3, -$44.10), Costco (Groceries · Sep 28, -$128.90). Sep 28 crosses the month boundary, so this list is the latest in the category regardless of month (assumption A22).
- **DET-6.** Details card, six label-value rows: "Merchant - Whole Foods", "Category - Groceries", "Date - Oct 8, 2025", "Time - 2:32 PM", "Payment - Visa ····4021", "Status - Cleared".
- **DET-7.** Card "Note" with the transaction's note text ("Weekly groceries run - produce, pantry staples and household supplies. Split with flatmate (their half already settled).").
- **DET-8.** Data gap to resolve: time, payment method, and status appear here but are never captured in Add or Edit (09, 11). Treat them as display-only fields that stay empty or default for user-created transactions until the designer answers (assumption A20).

States: default only. No variant is designed for a transaction without a note (hide the Note card, assumption A21) or for a category without a cap.

Navigation: entry from a list row (TRN-7). Exits: breadcrumb → 06, "Edit" → 11, "Delete" → 12.

### 2.10 Add transaction (modal)

**Figma frame:** [09 · Add transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=28-135). **Purpose:** log an expense manually.

- **ADD-1.** Modal over the current page (mocked over Transactions - List, background dimmed) titled "Add transaction" with an X close button.
- **ADD-2.** Fields, top to bottom: "Amount" ("$" prefix, numeric, shown focused with value "24.00"), "Category" (select, "Groceries", options are the user's categories), "Date" (select-style field, "Oct 8, 2025"), "Merchant" (text, "Whole Foods"), "Note (optional)" (text, "Weekly groceries").
- **ADD-3.** Buttons: "Cancel" (closes without saving) and primary "Add transaction" (creates the expense, closes the modal, refreshes the underlying page and the tab badge).
- **ADD-4.** Amounts are entered as positive numbers and rendered as negative expenses everywhere else (assumption A13). There is no income concept.

Validation implied by the design:

- **ADD-5.** "Note (optional)" is the only field marked optional, so Amount, Category, Date, and Merchant read as required (assumption A12). No error states are designed (assumption A29).
- **ADD-6.** Amount is numeric with two decimals shown ("24.00") and the currency prefix. Must be greater than 0.
- **ADD-7.** The date field looks like a closed select; no calendar control is drawn. Use a standard date picker and confirm the pattern with the designer (assumption A14).

States: default, plus the designed focused-input style on Amount.

Navigation: opens from Dashboard (DSH-2, DSH-9 empty), Transactions (TRN-1, TRN-9), and AI Insights empty state (INS-7). Closes via Cancel, X, or "Add transaction".

Edge cases: saving a transaction dated in a past month must land in that month's totals, chart bars, and category cards, not the current month's (implied by month-based aggregates on 04/13).

### 2.11 Edit transaction (modal)

**Figma frame:** [11 · Edit transaction](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=29-196). **Purpose:** correct an existing expense.

- **EDT-1.** Same form as Add transaction, titled "Edit transaction", prefilled with the transaction's values (mock: "24.00", "Groceries", "Oct 8, 2025", "Whole Foods", "Weekly groceries").
- **EDT-2.** Footer right: "Cancel" and primary "Save changes" (persists edits, closes, refreshes list, detail, dashboard, and category cards, assumption A18).
- **EDT-3.** Footer left: "Delete transaction" red text button with trash icon, opening Delete confirmation (12).
- **EDT-4.** All Add transaction validation rules apply (ADD-5 to ADD-7).

Navigation: opens from the Row menu (10) and from Transaction detail "Edit" (DET-2).

### 2.12 Row menu

**Figma frame:** [10 · Row menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=30-257). **Purpose:** quick actions on one transaction without opening it.

- **MNU-1.** The kebab button on a list row opens a small menu anchored to the row (mocked on the Uber row) with two items: "Edit" (pencil icon) and "Delete" (trash icon, red/danger color).
- **MNU-2.** "Edit" opens the Edit transaction modal (11) for that row. "Delete" opens Delete confirmation (12). Clicking elsewhere closes the menu (standard behavior, assumption A19).

### 2.13 Delete confirmation

**Figma frame:** [12 · Delete confirmation](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=31-302). **Purpose:** prevent accidental permanent deletion.

- **DEL-1.** Centered dialog with a red trash icon in a tinted circle, title "Delete this transaction?", and body copy interpolating the target: "This permanently removes 'Whole Foods - $62.40' (Oct 8) from your records. This can't be undone."
- **DEL-2.** Buttons: "Cancel" (closes, nothing happens) and danger primary "Delete" (deletes the transaction, closes, refreshes the list and badge).
- **DEL-3.** "Permanently" and "can't be undone" rule out an undo or trash feature. Deletion must also recompute every derived view: dashboard cards, chart, donut, and category cards (assumption A18).

Navigation: opens from the Row menu (10 via MNU-2), Transaction detail "Delete" (DET-2), and "Delete transaction" in the edit modal (EDT-3). After deleting from detail, land back on Transactions - List (assumption A18).

### 2.14 Categories

**Figma frame:** [13 · Categories](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=36-423). **Purpose:** per-category budgets and month status; the second tab of Transactions.

- **CTG-1.** Tabs: "All transactions 128" and active "Categories 8" (badge = category count). The header's primary button changes to "Add category", and the search input is not shown on this tab. "Add category" opens the Add category modal (19), specified in 2.15.
- **CTG-2.** Summary block "Budget allocation": "$1,800 allocated of $2,000 monthly budget", green chip "$200 unallocated", progress bar. Note: the eight card caps below add up to $2,970, which contradicts $1,800. Mock numbers are illustrative; compute allocation from real category caps (assumption A25).
- **CTG-3.** Grid of category cards (2 columns, 8 cards). Each card: category icon tile + name; kebab menu opening the category row menu (18, see 2.15); "{spent} of {cap}"; status chip; progress bar; footer left "{amount} left" (or "{amount} over" in red); footer right "{n} transactions".
- **CTG-4.** Card data in the mock: Groceries $397 of $500, chip "Near", "$103 left", 24 transactions; Dining out $312 of $300, chip "Over", "$12 over" in red, 18; Transport $223 of $350, "On track", "$127 left", 12; Shopping $174 of $250, "On track", "$76 left", 8; Housing $1100 of $1100, chip "Full", "$0 over" in red, 1; Health $88 of $150, "On track", "$62 left", 5; Entertainment $63 of $120, "On track", "$57 left", 9; Other $148 of $200, "On track", "$52 left", 6.
- **CTG-5.** Chip tones observed: "On track" green, "Near" amber, "Full" amber, "Over" red. The visible examples give: 74% and below = On track, 79% = Near, exactly 100% = Full, above 100% = Over. Working thresholds: On track below 75%, Near 75 to 99%, Full at 100%, Over above 100%; confirm with the designer (assumption A23).
- **CTG-6.** Copy details to build correctly: pluralize "{n} transaction(s)" (the Housing card's "1 transactions" is treated as a mock typo, assumption A28), and show "$0 over" only at exactly 100% per the Housing card.

States: filled only; no empty categories state is designed.

Navigation: entry via the Categories tab on 06/07 and from Settings "Manage" (SET-4). Exits: "All transactions" tab, sidebar, "Add category" → 19, card kebab → 18.

Edge cases: a category over its cap shows a red bar, red "over" amount, and red chip (Dining out); a category exactly at its cap shows "Full" with "$0 over" (Housing).

### 2.15 Category management (row menu, add, edit, delete)

**Figma frames:** [18 · Categories - Row menu](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=75-806), [19 · Add category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-878), [21 · Edit category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=116-1040), [20 · Delete confirmation for category](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=102-1078). **Purpose:** create, rename, re-cap, and remove categories. This is the category editor the rest of the file promises.

Row menu (18):

- **CED-1.** The kebab on a category card opens a small menu anchored to that card (mocked on Groceries) with two items: "Edit" (pencil icon) and "Delete" (trash icon, red/danger color). Clicking elsewhere closes it (assumption A19).
- **CED-2.** "Edit" opens Edit category (21) for that card. "Delete" opens Delete confirmation for category (20).

Add category (19):

- **CED-3.** Modal over the Categories tab, background dimmed, titled "Add category" with an X close button. Opens from the header's "Add category" button (CTG-1).
- **CED-4.** Fields, top to bottom: "Name" (text, "Subscriptions"), "Monthly budget" ("$" prefix, numeric, shown focused with value "250.00"), then "Color" and "Icon" as two selects side by side ("Violet", "Repeat"), then "Note (optional)" (text, "Streaming, apps & memberships").
- **CED-5.** Buttons: "Cancel" (closes without saving) and primary "Add category" (creates the category, closes the modal, and refreshes the card grid, the "Categories" tab badge, the allocation summary, and the Settings categories line).
- **CED-6.** Neither option list is drawn open. Treat "Color" as the eight Category color tokens from Foundations and confirm the "Icon" set with the designer (assumption A40). "Note (optional)" is captured but appears on no screen (assumption A42).
  > **Amended by PET-64 (2026-08-07).** Both option lists are answered - see A40 - and come from `GET /api/templates/palette` rather than from a frontend constant. A42 also stopped being quite true: `note` still appears on no screen, but it is no longer empty on a fresh account, because each seeded category is given its template's description as its note. Nothing renders it yet, so do not read a blank Categories screen as a failed seed.

Edit category (21):

- **CED-7.** The same form, titled "Edit category" and prefilled with the category's values (mock repeats "Subscriptions", "250.00", "Violet", "Repeat", "Streaming, apps & memberships"). Footer right: "Cancel" and primary "Save changes". Footer left: red "Delete category" text button with a trash icon, opening 20.
- **CED-8.** Saving a changed cap recomputes that card's percent, status chip, and remaining amount, plus "Budget allocation" (CTG-2) and the Settings categories line (SET-4). Renaming updates every screen that prints the category name (06, 08, 13, donut legend on 04).

Delete confirmation (20):

- **CED-9.** Centered dialog with a red trash icon in a tinted circle, title "Delete this category?", and body copy interpolating the target and its transaction count: "This permanently removes 'Groceries' from your categories. Its 24 transactions will be moved to Other. This can't be undone." Buttons: "Cancel" and danger primary "Delete". The reassignment to "Other" is a designed data rule, not a suggestion, so "Other" must always exist and cannot itself be deleted (assumption A41).

Validation implied by the design: Name and Monthly budget are required ("Note (optional)" is the only field marked optional), budget numeric and greater than zero (same rules as BUD-6). No error states are designed (assumption A29).

States: default, plus the designed focused-input style on Monthly budget. No loading or error variant is designed.

Navigation: entry from the Categories tab (CTG-1, CTG-3). Exits: Cancel, X, or save closes back to 13; "Delete category" (CED-7) → 20; after deleting, back to 13 with the grid recomputed.

Edge cases: raising caps so allocation exceeds the monthly budget has no designed error, and CTG-2 only ever shows an unallocated chip (assumption A43); deleting a category changes historical months too, because transactions move rather than disappear.

### 2.16 AI Insights (ready, generating, empty)

**Figma frames:** [14 · AI Insights](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=38-495), [15 · AI Insights - Generating](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=39-540), [16 · AI Insights - Empty](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=39-665). **Purpose:** turn transaction history into a monthly summary and insight cards.

Header:

- **INS-1.** Overline "Your money assistant", title "AI Insights", and a secondary "Regenerate" button. The button reads "Generating..." while a run is in flight (15) and is absent in the empty state (16).

Ready state (14):

- **INS-2.** Dark summary banner: overline "✦ OCTOBER SUMMARY", headline "You're on track to finish October about $20 under budget.", body "You've spent $1,240 of $2,000 with 8 days left. Dining out is your only category over its limit - everything else is comfortably within range."
- **INS-3.** Four insight cards in a 2x2 grid, each with a toned icon, bold title, and body:
  1. Warning (red): "Dining out is over budget" - "$312 of $300 - $12 over. It's your only category above its limit this month."
  2. Positive (green): "Transport is down 22%" - "You spent $63 less than September - fewer rideshares, more walking. Keep it up."
  3. Info (blue): "On track to finish under budget" - "At your current pace you'll land around $1,980 - just under your $2,000 target."
  4. Neutral (amber): "3 recurring subscriptions" - "Netflix, Spotify and iCloud total $37/mo. Worth a review to trim any you don't use."
- **INS-4.** The cards demonstrate the generator's content capabilities: over-cap detection, month-over-month comparison, end-of-month projection, and recurring-merchant detection. These are content rules for the generation service, not separate UI.

Generating state (15):

- **INS-5.** The banner switches to the overline "✦ ANALYZING YOUR SPENDING..." with three skeleton bars, and the four cards become skeleton cards (gray circle plus bars). No cancel control exists.
- **INS-6.** When generation finishes, show the new set (14). Generation is asynchronous. Failure isn't designed: keep showing the previous set on failure (assumption A26).

Empty state (16):

- **INS-7.** Centered empty state: sparkle icon, heading "Insights unlock after your first expense", body "Once you log a few transactions, I'll analyze your spending, flag anomalies and suggest ways to stay on budget.", primary button "Add your first transaction" → Add transaction modal (09).

Navigation: entry from sidebar "Insights" and dashboard "Open insights". Exits: "Regenerate" → 15 → 14, "Add your first transaction" → 09, sidebar.

Edge cases: what triggers the very first generation isn't designed; the empty-state copy implies logging expenses does (assumption A27).

### 2.17 Settings

**Figma frame:** [17 · Settings](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=40-630). **Purpose:** edit the profile and preferences; reach category management.

- **SET-1.** Header: overline "Manage your account", title "Settings".
- **SET-2.** Card "Profile": avatar tile with initials "MK", label "Your avatar", caption "Your initials are used across Spendifico." (initials derive from the name, no upload exists). Inputs: "First name" ("Marko"), "Last name" ("Kovač"), "Email" ("marko@email.com"), the same three fields captured at registration (REG-2). Email is also the login identifier, and changing it changes where future login links are sent; no re-verification step is designed (assumption A39).
- **SET-3.** Card "Preferences": select "Currency" ("USD - $"), input "Monthly budget" ("$2,000", the same value onboarding set), select "Month starts on" ("1st of the month"). "Month starts on" defines the period used by "This month" filters and "days left" math (assumption A9).
- **SET-4.** Card "Categories": text "8 categories · $1,800 allocated of $2,000" and a secondary "Manage" button. No prototype link is drawn, but the category editor now exists, so "Manage" opens the Categories tab (13) rather than a settings-local editor (assumption A24).
- **SET-5.** Primary button "Save changes" persists everything on the page. No success, error, or unsaved-changes state is designed (assumption A29).
- **SET-6.** Changing names must update the sidebar footer and avatar initials everywhere (DSH-1). Changing the budget or month start changes dashboard and filter math from then on; the design gives no migration rule for past months (assumption A25 treats displayed numbers as computed).

Validation implied: email format; budget numeric (same rules as BUD-6).

States: default only.

Navigation: entry from sidebar "Settings". Exits via sidebar or "Manage" → 13 (A24). No logout control exists anywhere in the file, including here, even though sessions now do (assumption A39).

## 3. Data model

Entities and fields implied by the screens. Names are suggestions, fields are evidence-based.

**Profile** (implied by 17, 22, sidebar on 04-17, onboarding 02)

| Field | Type | Evidence |
|---|---|---|
| firstName | string | 22 and 17 "First name", initials "MK" |
| lastName | string | 22 and 17 "Last name", "Marko K." sidebar footer |
| email | string, unique, the login identifier | 22 and 17 "Email", 23 "Email", sidebar footer |
| currency | code from a closed list | "USD - $" selects (02, 17) |
| monthlyBudget | number | "$2,000" (02, 04, 13, 17) |
| monthStartDay | enum/day | "Month starts on - 1st of the month" (17) |
| avatarInitials | derived from names | "Your initials are used across Spendifico." (17) |

**LoginLink** (implied by 22, 23, 24; no frame shows it directly)

| Field | Type | Evidence |
|---|---|---|
| token | opaque, single use | "a secure login link" (23), "Resend link" replaces it (24) |
| email or profileId | reference | the link is requested per email address (23) |
| expiresAt | timestamp | not designed; working decision in assumption A34 |
| usedAt | timestamp, nullable | "single use" is a working decision, not a designed rule (A34) |

A session is needed too, so that opening a link once keeps the user signed in (A34). Neither the session nor a logout control has a frame (A39).

**Category** (implied by 03, 06, 08, 13, 19, 21)

| Field | Type | Evidence |
|---|---|---|
| name | string | chips (03), CATEGORY column (06), cards (13), "Name" input (19, 21) |
| color | token from a closed list | "Color" select showing "Violet" (19, 21); colored dots and tiles (03, 06, 08, 13) |
| icon | token from a closed list | "Icon" select showing "Repeat" (19, 21); "category tile colour swappable" (Components page) |
| monthlyCap | number | "Monthly budget" input (19, 21); "$397 of $500" (13), "$103 left of $500" (08) |
| note | string, optional | "Note (optional)" (19, 21); displayed on no screen (A42) |
| active | boolean | chip toggle state (03) |
| isFallback | boolean | deleting a category moves its transactions to "Other" (20), so one category must be undeletable (A41) |

Derived per category per month (not stored): spent, remaining or over amount, percent used, status chip, transaction count. All visible on 13; percent and remaining also on 08 (DET-4).

**Transaction** (implied by 06, 08, 09, 11)

| Field | Type | Evidence |
|---|---|---|
| merchant | string | 09 "Merchant", MERCHANT column (06), title (08) |
| categoryId | reference | 09 "Category", CATEGORY column (06) |
| amount | positive number, rendered negative | 09 "24.00" vs "-$62.40" (06, 08) |
| date | date | 09 "Date", DATE column (06), "Oct 8, 2025" (08) |
| time | shown only on 08 ("2:32 PM"), no input | display-only, assumption A20 |
| note | string, optional | 09 "Note (optional)", Note card (08) |
| paymentMethod | shown only on 08 ("Visa ····4021"), no input | display-only, assumption A20 |
| status | shown only on 08 ("Cleared"), no input | display-only, assumption A20 |
| account | shown only on 08 ("Everyday account"), no input | display-only, assumption A20 |

**InsightSet** (implied by 14, 15, 16, teaser on 04/05)

| Field | Type | Evidence |
|---|---|---|
| monthLabel | string | "OCTOBER SUMMARY" (14) |
| summaryHeadline, summaryBody | string | banner (14) |
| state | enum: empty, generating, ready | frames 16, 15, 14 |
| insights[] | list of {tone, title, body} | four cards (14); tones warning/positive/info/neutral match the Tag/Status palette |
| generatedAt | timestamp | implied by regeneration (14 → 15 → 14) |

Aggregates (all derived from transactions): monthly total spent, average per day, top category, weekly buckets for the trend chart, per-category totals for the donut and cards, allocation totals, and days left in the period (04, 05, 13). Never stored as mock constants (assumption A25).

## 4. API surface

Functional operations each screen needs. Not final API design; names are placeholders for whatever protocol the team picks.

| Operation | Kind | Used by |
|---|---|---|
| register(firstName, lastName, email, currency, monthlyBudget, categorySelection) | create, then send link | 22 "Finish setup"; carries the values held from 02 and 03 (A32) |
| requestLoginLink(email) | create, sends email | 23 "Log in", 24 "Resend link" |
| verifyLoginLink(token) | create session | opening the emailed link; no frame (A33, A38) |
| getProfile() | read | shell (DSH-1), 17 |
| updateProfileAndPreferences(fields) | update | 17 "Save changes" |
| getDashboardSummary(month) | read | 04, 05 (budget progress, stats, weekly series, donut data, 3 recent transactions, insight teaser) |
| listTransactions(search, categoryId, period, sort) | read (with total count) | 06, 07 (badge via count) |
| createTransaction(amount, categoryId, date, merchant, note?) | create | 09 |
| getTransaction(id) | read (with category month context and recent-in-category) | 08 |
| updateTransaction(id, fields) | update | 11 |
| deleteTransaction(id) | delete | 12 (reached from 08, 10, 11) |
| listCategoriesWithStats(month) | read | 13 cards, 03 chips, 09/11 category options |
| createCategory(name, monthlyCap, color, icon, note?) | create | 19 |
| updateCategory(id, fields) | update | 21 |
| deleteCategory(id) | delete, reassigns transactions to Other | 20 (reached from 18 and 21) |
| getAllocationSummary(month) | read | 13 (CTG-2), 17 categories line (SET-4) |
| getInsightSet() | read (state + summary + cards) | 14, 15, 16, teaser on 04/05 |
| generateInsights() | async create | 14 "Regenerate" → 15 → 14 |

Every operation below `verifyLoginLink` requires a session, because every frame that uses them sits behind the app shell. There is still no logout operation, because no frame offers one (assumption A39). Derived views recompute whenever createTransaction, updateTransaction, deleteTransaction, createCategory, updateCategory, or deleteCategory succeed (assumptions A18, CED-8).

## 5. Non-functional notes

Only what the design implies:

- **Localization:** English only, one language across all frames. US date formats ("Oct 8, 2025", "2:32 PM"). Currency is a preference, but only USD is shown (A6). Copy mixes UK and US spelling ("categorised" on 07, "colour" on the Components page, "analyze" on 16); implement the Figma text as designed and run a copy pass with the designer (assumption A30).
- **Access and security:** access is passwordless, so there is no password policy, strength meter, or reset flow to build, and none is designed. What the design does imply is email delivery on the critical path (22, 23, 24): a registration or log in that cannot send mail leaves the user stuck on 24 with only "Resend link". Login links must be single use with a short expiry and must not be guessable (A34), and 23 must not reveal whether an email has an account (A35, LOG-6). Rate limiting for "Resend link" is undesigned but needed (A36).
- **Async and loading:** the only designed loading state is insight generation (15, skeletons). Sending a login link and creating an account are network round trips with no designed pending state (REG-4, LOG-3). No spinners, offline, or error states exist anywhere else (assumptions A19, A29).
- **Accessibility observations:** statuses are never color-only (chips carry text: "On track", "Near", "Over"; the donut has a text legend; category dots pair with names). Input focus styles are designed (02, 09, 19). Small gray caption text on white cards should be contrast-checked. Modal keyboard behavior (focus trap, Escape) isn't specified and must follow standard practice.
- **Responsiveness:** all frames are fixed 1440x1024 desktop, light mode only. No breakpoints designed.
- **Visual system:** the Foundations and Components pages (linked in 5.1) define the tokens and a component library (Button with Primary/Secondary/Danger variants, Tag/Status in five tones, Section header, Input/Field, Select/Field, Stat, List row/Transaction with swappable category tile, Progress bar, Sidebar with four active-item variants). Build these as shared components, they repeat across every screen.

### 5.1 Design tokens

**Source pages in Figma.** Two pages sit beside "Screens" and are the authority for everything
in this section:

| Page | What it defines |
|---|---|
| [Foundations](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=5-2) | **Colour** (Brand, Surface, Text, Border, Status, Category), **typography** (19 named styles across Plus Jakarta Sans and Inter), **spacing** (4px base scale, `Space/2` to `Space/64`) and **radius** (`Radius/SM` to `Radius/Full`). Backed by Figma variables |
| [Components](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=5-3) | The **component library** built on those tokens, each with its props: Button (Primary / Secondary / Danger), Tag / Status (Neutral, Green, Amber, Red, Indigo), Section header, Input / Field, Select / Field, Stat, Progress bar, List row / Transaction with a swappable category tile, and Sidebar with its four active-item variants |

The tables below are a transcription of Foundations for convenience. Where the two disagree,
Foundations wins. One known gap: the type list is shorter than the 19 styles on the page, since
`Display/XXL` (64 / -3%) and `Display/L` (32 / -2%) are not described below; read those off
Foundations directly.

Read from the Figma variables attached to the frames, not eyedropped. Use these as the values behind your theme; do not introduce new greens, ambers, or reds alongside the Status tones.

| Group | Token | Value |
|---|---|---|
| Brand | Accent, Accent Pressed, Accent Soft | `#4F46E5`, `#3F37C9`, `#ECEBFD` |
| Surface | Canvas, Card, Muted | `#F5F7F8`, `#FFFFFF`, `#EDEFF2` |
| Surface (dark) | Ink, Ink Raised, Ink Elevated | `#101720`, `#18202B`, `#232C38` |
| Text | Primary, Secondary, Tertiary | `#131820`, `#566072`, `#98A0AE` |
| Text on dark | On Dark, On Dark Muted, On Dark Subtle | `#FFFFFF`, `#B4BCC9`, `#7C8698` |
| Text on accent | On Accent | `#FFFFFF` (label colour on Accent fills, e.g. primary button text) |
| Border | Subtle, Default, Strong | `#EFF1F3`, `#E5E8EB`, `#D4D9DE` |
| Status success | Success, Success Text, Success Soft | `#16A34A`, `#15803D`, `#E6F4EA` |
| Status warning | Warning, Warning Text, Warning Soft | `#E0A020`, `#B4820E`, `#FBF0D9` |
| Status danger | Danger, Danger Text, Danger Soft | `#DC2626`, `#B91C1C`, `#FBE9E9` |
| Category | 1 Coral to 8 Pink | `#EF6F6C`, `#F29A3D`, `#E7C24A`, `#57B368`, `#34B9AE`, `#3F8EE6`, `#8A79F1`, `#CE6FB8` |

Two typefaces. **Plus Jakarta Sans** carries the brand and headings: Wordmark 19/700, Display XL 44/800, Display M 26/700, Display S 22/700, Heading L 18/700, Heading M 16/600, all on tight negative tracking (-1 to -2.5). **Inter** carries everything else: Body L 15/400 (line height 1.55), Body M 14/400, Body S 13/400, Strong L/M/S at 15/14/13 weight 600, Label L/M/S at 14/13/12 weight 500, Caption 11.5/400, and Overline 11/500 with `letter-spacing: 6`, which is what makes "STEP 1 OF 3" and "OCTOBER SUMMARY" read as overlines.

The eight Category colors are the closed list the "Color" select on 19 and 21 should offer (assumption A40).

> **Amended by PET-64 (2026-08-07).** The Category row above, and this sentence, describe the retired token layer; PET-57 replaced the hand-rolled palette with stock daisyUI, and PET-64 made the consequence explicit in the data model. `categories.color` stores a **daisyUI semantic token** - one of seventeen - rather than a hex, because `primary` is valued differently per light and dark, so several categories have no single hex value at all and a stored one would paint the wrong half the time. The closed list the "Color" select offers is served by `GET /api/templates/palette` with a human label per token, and an admin controls which are enabled - so it can be a strict subset of the seventeen the API accepts. This **settles A40's colour half**; see the icon note on A40 itself.

**Spacing.** A 4px base scale, used for padding, gaps and layout. Eleven steps, each named for
its value:

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `Space/2` | 2 px | | `Space/24` | 24 px |
| `Space/4` | 4 px | | `Space/32` | 32 px |
| `Space/8` | 8 px | | `Space/40` | 40 px |
| `Space/12` | 12 px | | `Space/48` | 48 px |
| `Space/16` | 16 px | | `Space/64` | 64 px |
| `Space/20` | 20 px | | | |

**Radius.** Corner radii for cards, inputs, buttons and pills:

| Token | Value |
|---|---|
| `Radius/SM` | 8 px |
| `Radius/MD` | 12 px |
| `Radius/LG` | 16 px |
| `Radius/XL` | 20 px |
| `Radius/Full` | 999 px (pill) |

## 6. Assumptions log

Numbered so teachers can review each one. Where the design is ambiguous, the assumption records the working decision.

- **A1.** "Get started" (01) opens Setup step 1 (02). Inferred from the step numbering; no prototype link exists.
- **A2.** "I already have an account" (01) opens Log in (23). Inferred: 23 is the only returning-user entry in the file and 01 is the only screen that links out to one. (Revised: earlier versions of this spec predate 23 and called the link non-functional.)
- **A3.** "Back" on 03 returns to 02 with values kept, and "Back" on 22 returns to 03 the same way. Onboarding now ends on 22, not 03: "Continue" on 03 opens Register (22), and a new user reaches Dashboard - Empty (05) because they have zero transactions.
- **A4.** Onboarding enforces no minimum category selection (03 shows no error or disabled state). Confirm whether zero selections should be allowed.
- **A5.** Monthly budget (02, 17) is required, numeric, greater than zero, with thousands formatting. Exact bounds aren't designed.
- **A6.** The Currency select shows only "USD - $"; the option list is unknown. Ship with USD until specified.
- **A7.** The onboarding chip set (03: includes Bills and Subscriptions) conflicts with the app's category set (13: eight categories including Health and Other, no Bills or Subscriptions). Each screen follows its own mock until the designer resolves it.
  > **Resolved by PET-64 (2026-08-07), by replacing both lists rather than choosing between them.** The starter categories are twelve admin-managed rows in `central.category_templates`, seeded as Groceries, Dining out, Transportation, Utilities, Healthcare, Entertainment, Education, Travel, Personal care, Gifts, Family & pets and Loans & debt - plus `Uncategorized`, which is seeded for everybody and offered to nobody. Bills, Subscriptions, Housing, Shopping and Other are all gone, so the seam this assumption describes has no names left on it. Onboarding and every later screen now read the same set, and it is editable without a deploy.
- **A8.** The Dashboard month select (04/05) shows only "October". It renders the current period and stays non-functional until month navigation is designed.
- **A9.** "This month" (06) and all "days left" math (04, 14) use the "Month starts on" preference (17) as the period start.
- **A10.** Clicking a transactions row opens Transaction detail (08), inferred from 08's "All transactions" breadcrumb.
- **A11.** The transactions table scrolls vertically with no pagination (badge 128 vs 10 visible rows).
- **A12.** In Add and Edit transaction, all fields except Note are required ("Note (optional)" is the only field marked optional).
- **A13.** Amounts are entered positive (09 "24.00") and displayed negative ("-$62.40"); the product records expenses only.
- **A14.** The Date field (09, 11) is drawn as a closed select; use a standard date picker and confirm the pattern with the designer.
- **A15.** A search or filter no-results state isn't designed. Show the 07-style "No transactions yet" message without hiding the controls until a designed variant exists.
- **A16.** The sort select offers at least "Newest first"; the open dropdown is never shown, so other options are unknown.
- **A17.** The "All transactions" tab badge (128 on 06, 0 on 07) shows the total transaction count.
- **A18.** After add (09), save (11), or delete (12), the app returns to the underlying page and refreshes every derived view: list, badge, dashboard cards, chart, donut, and category cards. Deleting from detail returns to the list. No success toasts are designed.
- **A19.** Screens other than AI Insights have no designed loading states; render data directly or add skeletons consistent with 15. Menus and modals close on outside click or Escape, standard behavior the design doesn't draw.
- **A20.** Time ("2:32 PM"), payment ("Visa ····4021"), status ("Cleared"), and account ("Everyday account") appear only on 08 and are never captured in any form. They are display-only and stay empty or default for user-created transactions until the designer answers how they're set.
- **A21.** A transaction without a note shows no Note card on 08. Not designed.
- **A22.** "Recent in {category}" (08) lists the latest transactions in that category regardless of month (the mock includes Sep 28).
- **A23.** Category status chip thresholds aren't stated. Working decision from the visible examples (74% On track, 79% Near, 100% Full, 104% Over): On track below 75%, Near 75 to 99%, Full at exactly 100%, Over above 100%. Confirm with the designer.
- **A24.** "Add category" (13) opens 19 and the category card kebab (13) opens 18, both designed. "Manage" (17) still has no drawn link; it opens the Categories tab (13), since that is where management lives. (Revised: earlier versions of this spec predate frames 18 to 21 and called all three non-functional.)
- **A25.** Mock numbers conflict across screens: allocation "$1,800 of $2,000" vs card caps summing $2,970 (13); Dining out $298 (04) vs $312 (13, 14); total spent $1,240 (04, 14) vs cards summing $2,505 (13); Whole Foods -$24.00 (04, 09) vs -$62.40 (06, 08). All displayed numbers are computed from real data; where screens conflict, each follows its own mock until the designer resolves the sample data.
- **A26.** "Regenerate" is disabled while generating (label "Generating...", 15). Generation failure isn't designed: on failure, keep showing the previous insight set.
- **A27.** The Dashboard AI teaser (04) shows content from the latest generated insight set, and the first generation is triggered by logging expenses (implied by the empty-state copy on 16).
- **A28.** Pluralize "{n} transaction(s)" correctly; the Housing card's "1 transactions" (13) is treated as a mock typo to confirm with the designer.
- **A29.** No form error or validation visuals exist anywhere in the file. Use simple inline messages and confirm the pattern with the designer.
- **A30.** Copy mixes UK and US spelling ("categorised" on 07, "colour" on the Components page, "analyze" on 16). Implement the Figma text layers as designed and schedule a copy pass.

Assumptions A31 to A44 cover the access screens (22, 23, 24) and the category editor (18 to 21), which arrived after A1 to A30 were written.

- **A31.** Access is passwordless. No password, confirm-password, or reset field exists on any frame, and both entry points end at "Check your email" (24), so login links are the only credential.
- **A32.** Currency, monthly budget, and starter categories (02, 03) are collected before the account exists, so they are held client side and persisted by the same request that creates the account (REG-4). Nothing on 02 or 03 can be saved server side before then.
- **A33.** "Finish setup" (22) opens 24, and the Dashboard is reached only by opening the emailed link. Registration is therefore verified the same way log in is. The alternative reading, that 22 lands straight on 05, was considered and rejected for this build; confirm with the designer.
- **A34.** Login link and session rules are not designed. Working decision: single-use token, short expiry (minutes, not days), invalidated when a new link is requested, and a normal persistent session afterwards so the flow is not repeated on every visit.
- **A35.** Neither an unknown email on 23 nor an already-registered email on 22 has a designed response. Both land on 24 with the same copy, so the screens never disclose whether an account exists; 22 sends a login link instead of creating a duplicate.
- **A36.** "Resend link" (24) has no designed cooldown, attempt counter, or confirmation. Add a simple cooldown and server-side rate limit, and confirm the visual treatment with the designer.
- **A37.** ~~"Back" (24) returns to whichever screen opened it, 22 or 23. Not drawn.~~ **Revised by PET-11: there is no "Back" on 24.** The assumption was never drawn, and building it turned out to contradict something that is: clearing the onboarding draft on a successful register (REG-4) leaves nothing for 22 to reopen with. So 24 offers only "Resend link", and PET-12 builds it that way. Note what removing the control does not remove - the browser's own Back button still reaches 22, which renders empty. Accepted rather than worked around: nothing is lost because the account exists and the link is sent, an accidental empty re-submit produces inline required-field messages rather than a bad request, and a deliberate re-submit of the same address is explicitly safe because 22 sends a fresh link instead of duplicating (REG-6, A35).
- **A38.** Nothing is designed for opening the link itself: no success landing, expired-link, already-used-link, or wrong-device screen. Handle these with plain messages and a way to request a new link.
- **A39.** No logout control exists on any frame, including Settings, even though the build now has sessions. Changing the email on 17 also has no re-verification step designed. Both need a designer answer before shipping.
- **A40.** The "Color" and "Icon" selects (19, 21) are never shown open. Color is assumed to be the eight Category tokens from Foundations (see 5.1); the icon set is unknown beyond the single example "Repeat".
  > **Settled by PET-64 (2026-08-07).** Both halves now have an answer, and neither needed the designer. Color is the seventeen daisyUI semantic tokens, offered through `GET /api/templates/palette` (see the amendment under 5.1). The icon set is a closed list of lucide names, served by the same endpoint with a label each. It is a code-side allowlist rather than free text for a reason that is not taste: `lucide-react` imports by name at build time, so a runtime string cannot become a component without a static map, and the same allowlist is what lets the API publish a real enum. "Repeat" is not among them; nothing in the app draws a recurring-transaction mark yet.
  >
  > **Amended by PET-65 (2026-08-08).** The set is **sixty-four** names, not the thirteen PET-64 shipped, and this note used to enumerate them - which is why the count is now stated without the list. Thirteen was exactly what the twelve seeded categories plus the `Uncategorized` fallback carry and nothing else, so the first category a user invented had to reuse a glyph a seeded one already had; the other fifty-one exist so it does not. `ICON_NAMES` in `backend/src/database/central/template-tokens.ts` is the authority for the names and their order, and `docs/explainers/category-icon-set-preview.html` draws the whole set at the size the app paints it. Nothing about the colour half of this note changed.
- **A41.** Deleting a category moves its transactions to "Other" (20, designed copy). "Other" must therefore always exist and cannot be deleted, and no frame shows what deleting "Other" would do.
- **A42.** Category "Note (optional)" (19, 21) is captured but appears on no other screen. Store it and confirm where it is meant to surface.
- **A43.** Nothing prevents category caps from exceeding the monthly budget. CTG-2 only ever shows an unallocated chip, and no over-allocation state is designed.
- **A44.** The category counts and totals on 13 and 17 must recompute after any category is added, edited, or deleted; the mock values ("8 categories", "$1,800 allocated") are illustrative, as A25 already requires for every other number.
