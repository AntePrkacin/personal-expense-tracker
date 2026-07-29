# Personal Expense Tracker: tech spec

This spec turns the Figma design into buildable requirements. Every requirement references the screen it comes from. If a requirement has no screen behind it, it doesn't belong here.

> **Source:** Figma file [Personal Expense Tracker](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=1-4), page "Screens" (17 frames). Frame names and UI copy are quoted as designed, except that long dashes are written as hyphens per DECODE writing rules.
>
> **How to read requirement IDs:** each screen has a code (WEL, BUD, CAT, DSH, TRN, DET, ADD, EDT, MNU, DEL, CTG, INS, SET). "TRN-3" means requirement 3 of the Transactions screens. Use these IDs when you write Jira tasks so every task traces back here.
>
> **For students:** read the brief first, then work through this spec screen by screen. Every bolded ID is one requirement your Jira tasks must reference. Section 6 records working decisions where the design is ambiguous: challenge an assumption with your teacher if you disagree, don't silently change it. When the design and your instinct conflict, the design wins.

## 1. Overview

**Platform:** desktop web app. Every frame is 1440x1024 with a fixed left sidebar, which is a desktop-first web layout. No mobile or tablet frames exist, and only light mode is designed.

**Suggested architecture:** a single-page web app with four routed views (Dashboard, Transactions, AI Insights, Settings) behind a shared app shell, plus modals for transaction create, edit, and delete. Data is a small store of profile, preferences, categories, and transactions, sensibly kept in a relational database behind a thin backend. The AI Insights section needs one asynchronous "generate insights" operation with a visible loading state (15) that produces stored, re-readable text.

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

## 2. Functional requirements per screen

### 2.1 Welcome

**Figma frame:** [01 · Welcome](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=41-696). **Purpose:** entry point; pitch the product and route new vs. returning users.

UI elements and behavior:

- **WEL-1.** Show the Expensa logo (top left), the overline "PERSONAL FINANCE, SIMPLIFIED", the heading "Take control of your money.", the intro "Track every expense, set budgets by category, and get AI insights that keep you on plan - all in one calm, focused space.", and the footer microcopy "Made for mindful spending."
- **WEL-2.** Primary button "Get started" opens Setup - Currency & budget (02) (assumption A1).
- **WEL-3.** Text link "I already have an account". No destination is designed; it stays non-functional in the first build (assumption A2). No login screens may be invented from this link.
- **WEL-4.** Right half: a dark decorative panel with a sample budget card ("October budget", "$1,240 of $2,000", green "On track" chip, "$760 left · 8 days to go") and two floating chips ("Dining $298", "Transport $223"). Display only, no interactions.

Validation: none (no inputs).

States: default only. No loading, error, or filled variants are designed.

Navigation: entry point is first app launch. Exit: "Get started" → 02.

Edge cases: none visible.

### 2.2 Setup - Currency & budget

**Figma frame:** [02 · Setup - Currency & budget](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=42-700). **Purpose:** step 1 of 2; set the currency and the monthly budget the whole app tracks against.

UI elements and behavior:

- **BUD-1.** Centered Expensa logo, a step indicator (two dots, first active), and a card with overline "STEP 1 OF 2", heading "Set your monthly budget", and supporting copy "How much do you plan to spend each month? You can change this anytime in Settings." (which proves the value is editable on 17).
- **BUD-2.** Select "Currency" showing "USD - $". Only USD appears in the file; the option list is unknown (assumption A6).
- **BUD-3.** Input "Monthly budget" with a "$" prefix and value "2,000". The frame shows its focused state (highlighted border), so a designed focus style exists.
- **BUD-4.** Text button "Back" returns to Welcome (01).
- **BUD-5.** Primary button "Continue" saves both values and opens Setup - Starter categories (03).

Validation implied by the design:

- **BUD-6.** Budget is numeric, displayed with thousands separators and the currency prefix. No minimum, maximum, or error state is designed (assumption A5).

States: default, plus the designed focused-input style.

Navigation: entry from 01. Exits: "Back" → 01, "Continue" → 03.

Edge cases: an empty or zero budget makes dashboard copy like "$2,000 left" meaningless; treat the field as required (assumption A5).

### 2.3 Setup - Starter categories

**Figma frame:** [03 · Setup - Starter categories](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=43-705). **Purpose:** step 2 of 2; choose starter categories to track.

UI elements and behavior:

- **CAT-1.** Step indicator (second dot active) and a card with overline "STEP 2 OF 2", heading "Pick your categories", and copy "Choose what you'd like to track. Tap to toggle - you can always add or edit categories later."
- **CAT-2.** Ten toggle chips, each with a colored dot and name. Selected chips show a checkmark and tinted border. Selected in the mock: Groceries, Dining out, Transport, Shopping, Housing, Entertainment, Bills (7). Unselected: Health, Subscriptions, Other.
- **CAT-3.** Text button "Back" returns to 02 with entered values kept (assumption A3).
- **CAT-4.** Primary button "Finish setup" stores the selection and opens Dashboard - Empty (05) (assumption A3).

Validation implied: none designed. No minimum selection is enforced anywhere in the file (assumption A4).

States: chip selected and unselected (both designed).

Navigation: entry from 02. Exits: "Back" → 02, "Finish setup" → 05.

Edge cases: the onboarding chip set conflicts with the categories the app screens actually show (no Bills or Subscriptions ever again; Health and Other appear active on 13 despite being unselected here). Each screen follows its own mock until the designer resolves it (assumption A7). The "add or edit categories later" promise has no designed screen (assumption A24).

### 2.4 Dashboard (filled and empty)

**Figma frames:** [04 · Dashboard](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=21-4), [05 · Dashboard - Empty](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=44-706). **Purpose:** show the month at a glance and route the user to logging, the list, and insights.

Shared shell (also applies to Transactions, AI Insights, Settings):

- **DSH-1.** Fixed dark sidebar: Expensa logo; section "MENU" with "Dashboard" and "Transactions"; section "ASSISTANT" with "Insights"; section "ACCOUNT" with "Settings". The active item is highlighted (Sidebar component variants). Footer shows avatar initials ("MK"), name "Marko K." and email "marko@email.com" from the profile.
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

Navigation: entry after onboarding (03 → 05) and from the sidebar. Exits: "Add transaction" → 09, "View all" → 06, "Open insights" → 14, sidebar → 06/14/17.

Edge cases visible or implied: "8 days left in October" and "Full month ahead" require day math against the configured month start (17, assumption A9); the dash placeholder when no top category exists; the current week highlighted in the trend chart; every displayed number must come from the transactions store, not the mock values (assumption A25).

### 2.5 Transactions - List and empty state

**Figma frames:** [06 · Transactions - List](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=26-90), [07 · Transactions - Empty](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=45-752). **Purpose:** the full expense log with search, filters, and sort.

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

### 2.6 Transaction detail

**Figma frame:** [08 · Transaction detail](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=34-349). **Purpose:** one transaction in full, with edit and delete.

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

### 2.7 Add transaction (modal)

**Figma frame:** [09 · Add transaction](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=28-135). **Purpose:** log an expense manually.

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

### 2.8 Edit transaction (modal)

**Figma frame:** [11 · Edit transaction](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=29-196). **Purpose:** correct an existing expense.

- **EDT-1.** Same form as Add transaction, titled "Edit transaction", prefilled with the transaction's values (mock: "24.00", "Groceries", "Oct 8, 2025", "Whole Foods", "Weekly groceries").
- **EDT-2.** Footer right: "Cancel" and primary "Save changes" (persists edits, closes, refreshes list, detail, dashboard, and category cards, assumption A18).
- **EDT-3.** Footer left: "Delete transaction" red text button with trash icon, opening Delete confirmation (12).
- **EDT-4.** All Add transaction validation rules apply (ADD-5 to ADD-7).

Navigation: opens from the Row menu (10) and from Transaction detail "Edit" (DET-2).

### 2.9 Row menu

**Figma frame:** [10 · Row menu](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=30-257). **Purpose:** quick actions on one transaction without opening it.

- **MNU-1.** The kebab button on a list row opens a small menu anchored to the row (mocked on the Uber row) with two items: "Edit" (pencil icon) and "Delete" (trash icon, red/danger color).
- **MNU-2.** "Edit" opens the Edit transaction modal (11) for that row. "Delete" opens Delete confirmation (12). Clicking elsewhere closes the menu (standard behavior, assumption A19).

### 2.10 Delete confirmation

**Figma frame:** [12 · Delete confirmation](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=31-302). **Purpose:** prevent accidental permanent deletion.

- **DEL-1.** Centered dialog with a red trash icon in a tinted circle, title "Delete this transaction?", and body copy interpolating the target: "This permanently removes 'Whole Foods - $62.40' (Oct 8) from your records. This can't be undone."
- **DEL-2.** Buttons: "Cancel" (closes, nothing happens) and danger primary "Delete" (deletes the transaction, closes, refreshes the list and badge).
- **DEL-3.** "Permanently" and "can't be undone" rule out an undo or trash feature. Deletion must also recompute every derived view: dashboard cards, chart, donut, and category cards (assumption A18).

Navigation: opens from the Row menu (10 via MNU-2), Transaction detail "Delete" (DET-2), and "Delete transaction" in the edit modal (EDT-3). After deleting from detail, land back on Transactions - List (assumption A18).

### 2.11 Categories

**Figma frame:** [13 · Categories](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=36-423). **Purpose:** per-category budgets and month status; the second tab of Transactions.

- **CTG-1.** Tabs: "All transactions 128" and active "Categories 8" (badge = category count). The header's primary button changes to "Add category", and the search input is not shown on this tab. "Add category" has no designed destination and stays non-functional until the category editor is designed (assumption A24).
- **CTG-2.** Summary block "Budget allocation": "$1,800 allocated of $2,000 monthly budget", green chip "$200 unallocated", progress bar. Note: the eight card caps below add up to $2,970, which contradicts $1,800. Mock numbers are illustrative; compute allocation from real category caps (assumption A25).
- **CTG-3.** Grid of category cards (2 columns, 8 cards). Each card: category icon tile + name; kebab menu (contents not designed, assumption A24); "{spent} of {cap}"; status chip; progress bar; footer left "{amount} left" (or "{amount} over" in red); footer right "{n} transactions".
- **CTG-4.** Card data in the mock: Groceries $397 of $500, chip "Near", "$103 left", 24 transactions; Dining out $312 of $300, chip "Over", "$12 over" in red, 18; Transport $223 of $350, "On track", "$127 left", 12; Shopping $174 of $250, "On track", "$76 left", 8; Housing $1100 of $1100, chip "Full", "$0 over" in red, 1; Health $88 of $150, "On track", "$62 left", 5; Entertainment $63 of $120, "On track", "$57 left", 9; Other $148 of $200, "On track", "$52 left", 6.
- **CTG-5.** Chip tones observed: "On track" green, "Near" amber, "Full" amber, "Over" red. The visible examples give: 74% and below = On track, 79% = Near, exactly 100% = Full, above 100% = Over. Working thresholds: On track below 75%, Near 75 to 99%, Full at 100%, Over above 100%; confirm with the designer (assumption A23).
- **CTG-6.** Copy details to build correctly: pluralize "{n} transaction(s)" (the Housing card's "1 transactions" is treated as a mock typo, assumption A28), and show "$0 over" only at exactly 100% per the Housing card.

States: filled only; no empty categories state is designed.

Navigation: entry via the Categories tab on 06/07. Exits: "All transactions" tab, sidebar.

Edge cases: a category over its cap shows a red bar, red "over" amount, and red chip (Dining out); a category exactly at its cap shows "Full" with "$0 over" (Housing).

### 2.12 AI Insights (ready, generating, empty)

**Figma frames:** [14 · AI Insights](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=38-495), [15 · AI Insights - Generating](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=39-540), [16 · AI Insights - Empty](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=39-665). **Purpose:** turn transaction history into a monthly summary and insight cards.

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

### 2.13 Settings

**Figma frame:** [17 · Settings](https://www.figma.com/design/h4ZIgwn11Y0SBSLJbvw5gC/Personal-Expense-Tracker?node-id=40-630). **Purpose:** edit the profile and preferences; reach category management.

- **SET-1.** Header: overline "Manage your account", title "Settings".
- **SET-2.** Card "Profile": avatar tile with initials "MK", label "Your avatar", caption "Your initials are used across Expensa." (initials derive from the name, no upload exists). Inputs: "First name" ("Marko"), "Last name" ("Kovač"), "Email" ("marko@email.com").
- **SET-3.** Card "Preferences": select "Currency" ("USD - $"), input "Monthly budget" ("$2,000", the same value onboarding set), select "Month starts on" ("1st of the month"). "Month starts on" defines the period used by "This month" filters and "days left" math (assumption A9).
- **SET-4.** Card "Categories": text "8 categories · $1,800 allocated of $2,000" and a secondary "Manage" button. "Manage" has no designed destination and stays non-functional until the category editor is designed (assumption A24).
- **SET-5.** Primary button "Save changes" persists everything on the page. No success, error, or unsaved-changes state is designed (assumption A29).
- **SET-6.** Changing names must update the sidebar footer and avatar initials everywhere (DSH-1). Changing the budget or month start changes dashboard and filter math from then on; the design gives no migration rule for past months (assumption A25 treats displayed numbers as computed).

Validation implied: email format; budget numeric (same rules as BUD-6).

States: default only.

Navigation: entry from sidebar "Settings". Exits via sidebar or "Manage" (non-functional, A24).

## 3. Data model

Entities and fields implied by the screens. Names are suggestions, fields are evidence-based.

**Profile** (implied by 17, sidebar on 04-17, onboarding 02)

| Field | Type | Evidence |
|---|---|---|
| firstName | string | 17 "First name", initials "MK" |
| lastName | string | 17 "Last name", "Marko K." sidebar footer |
| email | string | 17 "Email", sidebar footer |
| currency | code from a closed list | "USD - $" selects (02, 17) |
| monthlyBudget | number | "$2,000" (02, 04, 13, 17) |
| monthStartDay | enum/day | "Month starts on - 1st of the month" (17) |
| avatarInitials | derived from names | "Your initials are used across Expensa." (17) |

**Category** (implied by 03, 06, 08, 13)

| Field | Type | Evidence |
|---|---|---|
| name | string | chips (03), CATEGORY column (06), cards (13) |
| colorTone + icon | token | colored dots and tiles (03, 06, 08, 13); "category tile colour swappable" (Components page) |
| monthlyCap | number | "$397 of $500" (13), "$103 left of $500" (08) |
| active | boolean | chip toggle state (03) |

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
| saveOnboarding(currency, monthlyBudget) | create/update | 02 |
| saveStarterCategories(selection) | create | 03 |
| getProfile() | read | shell (DSH-1), 17 |
| updateProfileAndPreferences(fields) | update | 17 "Save changes" |
| getDashboardSummary(month) | read | 04, 05 (budget progress, stats, weekly series, donut data, 3 recent transactions, insight teaser) |
| listTransactions(search, categoryId, period, sort) | read (with total count) | 06, 07 (badge via count) |
| createTransaction(amount, categoryId, date, merchant, note?) | create | 09 |
| getTransaction(id) | read (with category month context and recent-in-category) | 08 |
| updateTransaction(id, fields) | update | 11 |
| deleteTransaction(id) | delete | 12 (reached from 08, 10, 11) |
| listCategoriesWithStats(month) | read | 13 cards, 03 chips, 09/11 category options |
| getAllocationSummary(month) | read | 13 (CTG-2), 17 categories line (SET-4) |
| getInsightSet() | read (state + summary + cards) | 14, 15, 16, teaser on 04/05 |
| generateInsights() | async create | 14 "Regenerate" → 15 → 14 |

No authentication operations exist because no auth screen is designed (WEL-3, assumption A2). No category create/update/delete operations are specified because "Add category", the card kebab, and "Manage" have no designed destinations (CTG-1, CTG-3, SET-4, assumption A24). Derived views recompute whenever createTransaction, updateTransaction, or deleteTransaction succeed (assumption A18).

## 5. Non-functional notes

Only what the design implies:

- **Localization:** English only, one language across all frames. US date formats ("Oct 8, 2025", "2:32 PM"). Currency is a preference, but only USD is shown (A6). Copy mixes UK and US spelling ("categorised" on 07, "colour" on the Components page, "analyze" on 16); implement the Figma text as designed and run a copy pass with the designer (assumption A30).
- **Async and loading:** the only designed loading state is insight generation (15, skeletons). No spinners, offline, or error states exist anywhere else (assumptions A19, A29).
- **Accessibility observations:** statuses are never color-only (chips carry text: "On track", "Near", "Over"; the donut has a text legend; category dots pair with names). Input focus styles are designed (02, 09). Small gray caption text on white cards should be contrast-checked. Modal keyboard behavior (focus trap, Escape) isn't specified and must follow standard practice.
- **Responsiveness:** all frames are fixed 1440x1024 desktop, light mode only. No breakpoints designed.
- **Visual system:** Foundations and Components pages define the tokens and a component library (Button with Primary/Secondary/Danger variants, Tag/Status in five tones, Section header, Input/Field, Select/Field, Stat, List row/Transaction with swappable category tile, Progress bar, Sidebar with four active-item variants). Build these as shared components, they repeat across every screen.

## 6. Assumptions log

Numbered so teachers can review each one. Where the design is ambiguous, the assumption records the working decision.

- **A1.** "Get started" (01) opens Setup step 1 (02). Inferred from the step numbering; no prototype link exists.
- **A2.** "I already have an account" (01) has no designed destination and stays non-functional in the first build. No login screens may be invented.
- **A3.** "Back" on 03 returns to 02 with values kept; "Finish setup" lands on Dashboard - Empty (05) because a new user has zero transactions.
- **A4.** Onboarding enforces no minimum category selection (03 shows no error or disabled state). Confirm whether zero selections should be allowed.
- **A5.** Monthly budget (02, 17) is required, numeric, greater than zero, with thousands formatting. Exact bounds aren't designed.
- **A6.** The Currency select shows only "USD - $"; the option list is unknown. Ship with USD until specified.
- **A7.** The onboarding chip set (03: includes Bills and Subscriptions) conflicts with the app's category set (13: eight categories including Health and Other, no Bills or Subscriptions). Each screen follows its own mock until the designer resolves it.
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
- **A24.** "Add category" (13), the category card kebab (13), and "Manage" (17) have no designed destinations. They stay non-functional until the category editor is designed, and no category-editing screens may be invented.
- **A25.** Mock numbers conflict across screens: allocation "$1,800 of $2,000" vs card caps summing $2,970 (13); Dining out $298 (04) vs $312 (13, 14); total spent $1,240 (04, 14) vs cards summing $2,505 (13); Whole Foods -$24.00 (04, 09) vs -$62.40 (06, 08). All displayed numbers are computed from real data; where screens conflict, each follows its own mock until the designer resolves the sample data.
- **A26.** "Regenerate" is disabled while generating (label "Generating...", 15). Generation failure isn't designed: on failure, keep showing the previous insight set.
- **A27.** The Dashboard AI teaser (04) shows content from the latest generated insight set, and the first generation is triggered by logging expenses (implied by the empty-state copy on 16).
- **A28.** Pluralize "{n} transaction(s)" correctly; the Housing card's "1 transactions" (13) is treated as a mock typo to confirm with the designer.
- **A29.** No form error or validation visuals exist anywhere in the file. Use simple inline messages and confirm the pattern with the designer.
- **A30.** Copy mixes UK and US spelling ("categorised" on 07, "colour" on the Components page, "analyze" on 16). Implement the Figma text layers as designed and schedule a copy pass.
