# PET-24 — Recent transactions card with relative dates

[PET-24](https://decode.atlassian.net/browse/PET-24) — `[FE] Build recent transactions card with
relative dates`. Figma: [04
Dashboard](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=21-4).

Base branch is `feat/PET-23-spending-by-category-donut`, so this is a stacked branch and its PR
targets that branch rather than `main`. Position 4 of 6 in the Dashboard stack.

## Why

The fourth slot in PET-21's grid. DSH-7: a "Recent transactions" section header with a "View all"
action, then three rows for the three most recent transactions - a category-coloured icon tile, the
merchant, a caption of `{category} · {date}` and a negative amount. `Whole Foods, Groceries ·
Today, -$24.00`; `Uber, Transport · Yesterday, -$18.50`; `Netflix, Entertainment · Oct 3, -$15.99`.

The mock's "Today" and "Yesterday" are not sample data, they are the specification: they exist to
prove relative formatting for recent days with short dates beyond that.

## Decisions

**The category join costs no request, and that is worth arguing rather than assuming.** A row in
`recentTransactions` is a `TransactionResponseDto` and carries only `categoryId` - no name, no
colour. The transactions table has the same problem and solves it with a second read
(`readCategoryLabels()` in a `Promise.all`), which `docs/TODO.md` records as costing that screen a
redundant request on every keystroke. Copying that here would be the obvious move and it is the
wrong one.

The same dashboard response already carries what is needed. `categories` publishes `id`, `name` and
`color` for every category with `spent > 0` this period; `amount` is validated `@IsPositive()`, so
no live transaction contributes zero; and `recentTransactions` is documented as up to three live
transactions **in the current period**. So every recent row's category necessarily has nonzero spend
this period and necessarily appears in `categories`. The join is a lookup over data already in hand,
and **this card adds no request to the page**.

**It still falls back rather than trusting that.** The invariant above is implied by the contract
rather than stated by it, and it would be quietly broken by any future change to what `categories`
includes. So an unresolved `categoryId` renders the neutral tile `categoryTileClass()` already
returns for an unknown colour and **drops the name from the caption**, leaving the date - rather than
rendering `undefined ·` or throwing. Cheap, and it fails legibly instead of visibly.

**The relative date formatter belongs in `lib/format.ts`, as the third of a family.** That file
already owns `formatIsoDate` ("Oct 8, 2025") and PET-29's `formatIsoDayMonth` ("Oct 8"), and
`frontend/CLAUDE.md` documents both under Formatting and dates. `formatRelativeDate(iso)` answers
"Today", "Yesterday", or `formatIsoDayMonth(iso)` beyond that - which is where the mock's "Oct 3"
comes from, so the short form is reused rather than a third date shape invented.

**It must go through `lib/date.ts` and it must take today as an argument.** Two separate traps:

- `new Date(iso)` parses a date-only string as **UTC midnight**, so any zone behind UTC formats it
  as the day before - which would put every "Today" a day out for part of the day. Both
  `lib/format.ts` and `lib/date.ts` record this in both directions, and `format.test.ts` builds its
  fixtures with the local-time `Date` constructor for exactly this reason.
- A formatter that reads the clock itself cannot be tested without faking time, and "Yesterday"
  is the one case where a test that quietly passes at midnight is worse than no test. So today is
  a parameter with a default, the same shape `lib/date.ts`'s own helpers take.

**Whose "today" it is is a third trap, and this card cannot close it.** The default for that
parameter is `todayIsoDate()`, which formats the **Node process's** own local zone. Every other
figure on this screen is scoped to a period the backend resolved through `todayIn(APP_TIMEZONE)`,
and `backend/.env.example` sets `APP_TIMEZONE=Europe/Zagreb`. The frontend has no equivalent
setting at all: a sweep reaching dotfiles -
`rg -in --hidden 'APP_TIMEZONE|process.env.TZ|timeZone' frontend/src frontend/.env.example -g '!node_modules'` -
finds only the two test files that set `TZ` on themselves.

So on a host running UTC, in the hour between midnight in Zagreb and midnight UTC, the two disagree
by a day: a transaction the backend counts as today's is `iso > today` to this card, falls through
the branch below, and reads "Oct 9" where the design says "Today". This is the same failure
`backend/CLAUDE.md` describes under Backend conventions and closed there with one configured zone,
and it is **pre-existing on this side** rather than introduced here - `monthOverline` and
`monthLabel` already read the server clock the same way on every screen that has a header. What is
new is that this is the first place it renders as a wrong *word* instead of a plausible one, which
is the only reason it is worth writing down at all.

**Not fixed here, and deliberately not.** The honest fix is a zone the frontend reads too, which
touches every date this app formats and belongs beside `docs/TODO.md`'s existing per-user timezone
item rather than inside one card. Guessing at it here - reading `TZ`, or hard-coding Zagreb next to
a formatter - would put a second, quieter copy of the app's timezone policy in `lib/format.ts`. So
it goes in the register, and the verification below is explicit about which of the two traps it
actually covers.

**A future date is not a case this handles specially.** The Add transaction modal's date field
allows one, so `iso > today` is reachable, and it falls through to the short date - "Oct 9" for
tomorrow. "Tomorrow" is not in the design and inventing it would put a fourth string in a formatter
whose whole job is the two the mock draws.

**The rows are not links and the card is not a table.** This is the one place the dashboard could
plausibly copy the transactions table's markup and should not: `frontend/src/app/CLAUDE.md` records
at length that a link wrapping a whole row takes its accessible name from everything inside it, so
each row would announce as "Whole Foods Groceries Today −$24.00". That argument is about the
transactions table's rows and PET-34's detail page; here there is no detail route to link to at all,
so the rows are plain markup and the one navigation on the card is "View all". Nothing on the rows
is interactive, which also means the card cannot inherit the row-click ambiguity that screen has.

**"View all" is a real link and reads its href from `SIDEBAR_HREFS`.** That constant in
`ui/Sidebar.tsx` is the single declaration of the four app routes, and `SidebarNav.test.tsx` checks
with `fs` that each has a `page.tsx` behind it. Writing `/transactions` out here would be a fifth
hand-written copy of the string those tests exist to prevent. It is a `next/link`, or `ui/Button`
with an `href` - which renders one and whose exclusive union makes `href` plus `disabled`
unrepresentable.

**Amounts keep their cents, and this is where PET-21's split pays off.** `formatNegative` is the
existing formatter: it draws U+2212 MINUS SIGN rather than the hyphen `Intl` emits, matching the
design, and returns an unsigned zero because a negative zero reads as a bug. So `−$24.00`, not
`−$24`, and not `formatWhole`. Every aggregate on this screen is whole dollars and every
per-transaction amount on it has cents, which is the rule PET-21's plan states and this card is the
only consumer of the second half.

**Fewer than three rows needs no code.** The contract returns "up to 3", so a shorter array renders
shorter, which is AC6 exactly - and AC6's real content is the prohibition on placeholder rows, which
is satisfied by not writing any. Zero rows is PET-26's designed empty treatment and this card
renders nothing for it, the same division PET-22 and PET-23 both take.

**The icon is `lucide-react`'s `ShoppingBag` for every row.** There is no per-category glyph in the
contract - a category carries a name and a colour and nothing else - so the tile's identity is its
colour, which is what `CATEGORY_TILE` is for. `docs/TODO.md` already records that this surface was
the next one to draw that tile and that both surfaces now take lucide's glyph rather than either of
the two conflicting Figma nodes. It gets `aria-hidden="true"` **explicitly**, because lucide renders
a bare `<svg>` with no ARIA of its own.

## Shape

`lib/format.ts` - `formatRelativeDate(iso, today?)`, with its cases in `format.test.ts`.

`(app)/dashboard/RecentTransactionsCard.tsx` - the section header, the "View all" link and the
rows, taking `recentTransactions` and `categories` off one summary. A Server Component.

`(app)/dashboard/page.tsx` - one line, the fourth slot filled.

## Tasks

- [ ] Commit this plan alone and open the draft PR against
      `feat/PET-23-spending-by-category-donut`
- [ ] `lib/format.ts`: `formatRelativeDate`, with cases for today, yesterday, older, a future date
      and a zone behind UTC
- [ ] `(app)/dashboard/RecentTransactionsCard.tsx` and its suite: three rows newest first, the
      relative captions, the coloured tile, the right-aligned negative amount, the "View all" href,
      one and two rows, an unresolvable category
- [ ] `(app)/dashboard/page.tsx`: fill the recent slot
- [ ] Stories: `Shell/Recent transactions` with the mock's three rows plus a one-row variant;
      re-check `Screens/04 Dashboard` against node `21:4`
- [ ] Docs: `frontend/CLAUDE.md` (the third date formatter, under Formatting and dates),
      `frontend/src/app/CLAUDE.md` (the free join, and why the rows are not links), root
      `CLAUDE.md`, `docs/TODO.md` (the server zone against `APP_TIMEZONE`, beside the per-user
      timezone item)
- [ ] Comment on PET-24 with the no-extra-read finding, the formatter's placement, and the zone gap
      this card surfaces without closing

No `npm run api:sync`: nothing here changes a request or response body.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo
root: `npm run docs:check`.

Then the app itself, signed in, in **Chrome**, with at least four transactions this period:

1. The three newest appear, newest first, and the fourth does not (AC1)
2. A transaction dated today reads "Today" and one dated yesterday reads "Yesterday" (AC2)
3. One dated three days ago reads its short date (AC3)
4. Each tile takes its category's colour and each amount is right-aligned and negative (AC4)
5. "View all" opens the transactions list (AC5)
6. With one transaction in the period, one row renders and no placeholders (AC6)

**Confirm the request count rather than trusting the argument above.** Open DevTools' network
panel on the server side - or read the backend's own request log - and check that loading
`/dashboard` makes exactly one `GET /api/dashboard` and **no** `GET /api/categories`. That is the
claim this ticket's main decision rests on, and it is the one thing a passing test suite would not
notice going wrong.

Then the boundary case a fixture cannot reach honestly: with a transaction dated today, check the
caption still reads "Today" from a machine in a zone behind UTC (or with `TZ` set to one), which is
the failure mode `lib/date.ts` exists to prevent.

**That check covers the parse trap, not the zone-mismatch one, and the difference matters when
reading a green result.** It proves this card does not re-introduce `new Date(iso)`'s UTC-midnight
shift. It says nothing about the server's zone disagreeing with `APP_TIMEZONE`, which no local run
reproduces unless the host clock is actually inside that window. So the second trap is confirmed
only as a reasoned gap in `docs/TODO.md`, not as something this ticket verified - and it should not
be reported as verified.

Then `Shell/Recent transactions` and `Screens/04 Dashboard` in Storybook.
