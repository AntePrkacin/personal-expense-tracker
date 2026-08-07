# TODO

Running list of work that is known, deliberately deferred, or unverified. Not a backlog of
ideas: everything here has a concrete reason to exist and enough detail to act on without
rediscovering the context.

Add an item when you defer something, and delete it when it lands. Items that grow past a
paragraph or two probably deserve their own plan in this directory.

---

## Post-Jira Cleanup Tasks
- **Fix oversized CLAUDE.md files:** `backend/CLAUDE.md` (>700 lines) and `frontend/src/app/CLAUDE.md` (>1000 lines) need to be restructured and moved into feature subdirectories according to conventions.
- **Fix JSDOM Version Mismatch:** `docs/CONTRIBUTING.md` and `jest.setup.ts` comments mention `jsdom 26.1.0`, while `frontend/package.json` depends on `jest-environment-jsdom: ^30.4.1`. Update the comments to reflect the actual installed version.

---

## Deferred by design

These were decided against deliberately. Reasons are recorded so the decision is not
relitigated by accident.

### The verify page's inherited constraints, now that it exists

PET-52 built the frontend half: `app/auth/verify/route.ts` spends the emailed link,
`spendifico.session` carries the result, and `lib/session.ts` plus `lib/profile.ts` are the
app's first two reads. Four things that ticket could not close, and one it deliberately did
not.

**The live token reaches the frontend's own access log.** The backend moved verify's token
into a POST body precisely so a live credential never hit *its* logs, and the handler puts it
straight into Next's request log and anything upstream - the same class of leak PET-12 removed
when it replaced `/check-email?email=`. Not fixable here: the URL is chosen by
`backend/src/mail/login-link.template.ts` and the token has to arrive somehow. What bounds it
is that the token is single-use and is consumed by the very request that logged it, so the
line is dead before anyone reads it, and the handler always answers a redirect so it leaves
the address bar on the first paint. This is the same accepted exposure as browser history and
the `Referer` header, one door further along.

**The route path is declared in two apps and nothing checks they agree.**
`login-link.template.ts` builds `/auth/verify` and `app/auth/verify/route.ts` answers it.
Change either and every login email in production points at a 404, with no gate failing and no
test noticing. `routes.test.ts` pins the frontend's half against the literal string, which is
as far as one repo half can reach. Same shape as the `LOGIN_LINK_TTL_M` coupling below.

**Verify's per-IP throttler now sees one address for the whole deployment.** The handler POSTs
from the frontend server, so every verify in the application lands in one bucket - 15 per 15
minutes on the deployed values. The third route to inherit this, after register and
login-link, and the reason the failure screen has a `busy` reason at all. The fix is the same
two-sided one described under "The auth throttler is in-memory", and neither half works alone.

**A stale session cookie survives a manual revocation.** Nothing on the read path can clear
it: the gate runs in a Server Component, where the cookie jar is read-only and `.delete()`
throws `ReadonlyRequestCookiesError` at runtime with nothing in the types to warn you. This amends the stub's own step 4, which said "clear the cookie and redirect", and
`layout.test.tsx` pins that no delete is attempted so nobody "completes" the spec and breaks
the shell. It costs almost nothing, because the cookie's `Max-Age` is derived from the
session's own `expiresAt`, so an *expired* session's cookie is gone from the browser before
the backend would reject it. Only a hand-written tombstone reaches the state, and only until
the cookie expires.

**The shell makes one backend request per render, and briefly made two - which had a loop in
it.** Review of the PR caught it before merge; recorded because the shape is easy to
reintroduce. With a session gate *and* a profile read, the layout treated any absent profile as
"not signed in" and redirected to `/login` - which sends a signed-in visitor to `/dashboard`,
whose layout bounced straight back. A live session whose profile read failed for any reason (the
broken-invariant 500, a timeout, a restart mid-render) therefore made **the whole app
unreachable, including the login screen**, until the backend settled.

Two things fixed it, and both are worth keeping. `GET /api/profile` is guarded, so one call
answers "is this a live session" on its way to answering "whose" - there is no second read to
disagree with the first, and the layout carries no branch of its own. And `lib/profile.ts`
separates **"not signed in" from "could not ask"**: only a 401 or a missing cookie redirects,
while an unavailable backend throws so Next's error boundary renders something a reload retries.
`profile.test.ts` pins that an unavailable backend never redirects.

**The rule to carry forward: never answer "the backend did not respond" with a redirect into the
access flow.** Any route that both gates and reads has the same trap available to it.

The residue is that the design draws no error screen anywhere (A19, A29), so what a reader sees
when the throw fires is Next's own. A custom `error.tsx` is a designer conversation rather than
a gap PET-52 could close.

**The wait behind the verify click was measured on 2026-08-05, and the blank page stands.**
This was the open question A33/A19 left: verify is one blocking POST with no loading state
designed, so the number decided whether a waiting state had to go to the designer. Measured
in cloud mode against Turso (group `decode-pet`, `aws-eu-west-1`), with a throwaway central
database so nothing touched the real directory:

- **First verification, which provisions:** 2.10s and 1.83s across two accounts. That covers
  creating the Turso database, minting its token, persisting the pointer, opening and
  migrating it, inserting the profile and seeding the categories.
- **Returning verification:** 4.1ms, 4.3ms and 4.8ms across three links for one account.
  Effectively instant, as the design assumed.
- `POST /api/auth/register` answers in 14ms, because it floats the token issue and the mail
  send rather than awaiting them.

**So no designed waiting state is needed.** Roughly two seconds of blank tab after clicking a
link in an email is the normalized OAuth and SSO redirect experience, and it happens once per
account, ever. A streamed "Signing you in..." shell remains technically cheap but is an
in-page loading state, which is exactly what the design deliberately lacks - so it stays a
design conversation rather than a gap.

Two honesty notes on the number. It is the **backend POST alone**, timed from the same
machine as the server, so it excludes the browser's own navigation, the frontend route
handler's overhead and the redirected Dashboard render; the figure a user experiences is
larger by whatever the network adds. And it was taken against a group that had already been
used that session - `TursoPlatformService` warns in its own comment that creating a database
is slower on a cold group, so treat 2s as a floor for the provisioning case rather than a
worst case.

### `/check-email` is the one access route with no session gate

PET-52 gated `/setup` and `/login`, which `docs/TODO.md` had asked it to answer in the same
breath, and deliberately left this one alone. Its entire premise is that no session exists
yet - it is the screen a user sits on while waiting for mail - so a gate would add a round
trip to the pre-session wait to defend against a state nobody reaches by accident. The way to
reach it signed in is to verify in a second tab and come back, at which point the screen says
something true and harmless.

Recorded so the asymmetry reads as a decision rather than an oversight. If it ever needs
answering differently, it is the same three-line `hasSession()` branch the other three carry.

### Handing a browser a token to sync with directly

`TursoPlatformService` documents but does not implement `mintUserDbToken(dbName, expiry)`,
the short-expiry variant of `mintDbToken` needed to let a client sync against its own Turso
database instead of going through this backend. Nothing needs it today - the access flow is
finished and never wanted it, because every read is served with the user's server-side
token - so it stays a documented signature until a client actually syncs.

### Sliding session expiry, as an explicit extension endpoint

Sessions fix their expiry at `SESSION_TTL_D` (30 days) and a unit test pins "validate
performs no UPDATE", so the whoami path stays one indexed read. Sliding
expiry inside `validate()` was rejected deliberately: it turns every authenticated read
into a central-database write (sync and `updated_at` churn, contention on the in-process
transaction chain), and it silently desyncs from the frontend's future cookie, whose
Max-Age would still die at the original 30 days however far the row was extended.

If monthly re-login ever becomes a real complaint, the design to reach for is an explicit
`POST /api/auth/session/extend` behind `SessionGuard`, called by the frontend on its own
policy - it already knows `expiresAt` from `GET /api/auth/session` - and answering with
the new `expiresAt` so the caller re-sets the cookie's Max-Age in the same round trip;
the two lifetimes then stay in sync by construction. The backend still enforces pacing
server-side with one conditional `UPDATE ... RETURNING` (extend only when, say, under 25
of the 30 days remain, so a hammering client produces zero-row updates rather than
churn), plus an absolute cap keyed on the existing `created_at` (never past creation +
90 days) so an extendable stolen token stays bounded. Rotating the token on extend is
the stricter variant if that ever matters. Purely additive: same table, same token, same
guard, no schema change.

### Insights are generated by rules, not an LLM

`RuleBasedInsightGenerator` produces the summary and the four cards from deterministic detectors
over the user's own data - over-cap, month-over-month, end-of-month projection and
recurring-merchant - filling templated copy. Rules were chosen over an LLM deliberately: no API
key, no per-run cost, no non-determinism, and specs that assert AC-exact strings, while the
epic's "AI" stays honest branding of what the cards say. The seam is real rather than
aspirational: `InsightGenerator` is bound through the `INSIGHT_GENERATOR` token in
`InsightsModule`, so a future `LlmInsightGenerator` is a one-line provider swap with storage, the
read, the `POST /api/insights/generate` trigger and the frontend untouched. The card wording and
the three-month recurrence threshold are the parts most likely to be tuned first.

### The rest of the data model

`users`, `login_links` and `sessions` (central) and `profile`, `categories`,
`transactions` and the insights tables (per user) exist. PET-41 added `insight_sets` and
`insights` under `backend/drizzle/user/` with the read; PET-40 added rule-based generation and
PET-56 hardened its lifecycle, so the insights feature is complete on the backend. So are
`categories` (list, create, update, delete, per-category month stats and the allocation summary)
and `transactions` (the three writes from PET-27 plus the list and the detail read).

Everything month-scoped stays computed on read: no table carries a month column or a stored
aggregate, on purpose, so nothing can go stale, and a backdated row or a changed `monthStartDay`
re-buckets history for free. `src/common/month-window.ts` resolves every period and nothing else
computes one. Both indexes the transaction reads want (`date`, `category_id`) ship in the first
migration. The one deliberate exception is insight content, which is stored as rendered prose
because a persisted generation is a snapshot rather than a derived view - see `backend/CLAUDE.md`.

Starter category colors were read per chip from the design's variable bindings in Figma frame
03 (node 43:705); PET-57 then remapped each colour word onto its nearest daisyUI theme colour
(`frontend/src/components/ui/categoryColour.ts`), so the words stay the stored identity while
the rendered hue follows the active theme - the mapping is nearest-match and lossy on purpose,
and which words collide is `frontend/CLAUDE.md`'s to state. Two open design
questions remain, both for the designer rather than for code:

- **The palette has eight colors for ten chips**, so Subscriptions reuses Transport's blue
  and Other reuses Bills' orange. Colour therefore cannot identify a category on its own,
  which constrains any later legend, chart or filter that wants to key on it.
- **A7's conflict sits on the same seam.** The starter set includes Bills and
  Subscriptions, which never reappear, while later screens show Health and Other - and the
  duplicated colors are exactly on those chips. All ten are seeded until it is resolved.

Both questions stopped being theoretical when PET-10 shipped Setup step 2: all ten chips are
now on screen, so the two repeated colours are visible side by side and Bills and Subscriptions
are offered to every new account. Neither is a blocker, and neither should be answered in code.

### The transaction detail fields no form captures (A20)

The transaction detail mock (DET-8) shows **time, payment method, status and account**
alongside the fields that are really stored. No form anywhere in the design captures any of
them, and no screen lets a user set one, so PET-27 gave them no columns and
`CreateTransactionDto` no properties.

The consequence is deliberate and worth knowing before building the reads: because
`forbidNonWhitelisted` is on, sending one of those keys is a **400**, not a silently dropped
field. That is the safer direction - a dropped field would let a frontend believe it saved
something - but it does mean a client that codes from the detail mock rather than from the
generated types will get a rejection.

**PET-28 and PET-34 must answer them as empty or defaulted rather than hunting for a
column.** Two ways out when the designer is available: either the mock's values are
illustrative and the detail view drops them, or a form has to capture them and they earn
columns in a later migration. Until then A20 stands, and nothing should infer a payment
method from anything.

### The Figma file still says Expensa

The product became **Spendifico** on 2026-08-02 and PET-51 finished the rename: the login
email, the OpenAPI document title, the docs, every internal identifier, and the per-user
database prefix, on top of the wordmark and `<title>` PET-18 had already taken. The only
places left that say Expensa are the ones naming this divergence, plus `docs/plans/` and
`docs/reviews/`, which are dated records. The plan is
`docs/plans/2026-08-02_PET-51_spendifico-rename.md`.

The design file is the one holdout: it still draws the old logo and wordmark, and swapping
the asset is the designer's call. Until it happens, `ui/Sidebar.tsx` renders "Spendifico"
against the design on purpose, `Sidebar.test.tsx` pins that so it cannot be half-reverted,
and `02-tech-spec-personal-expense-tracker.md` records the departure beside its **Source:**
note.

**One constraint the rename leaves behind.** `USER_DB_NAME_PREFIX` was renamed while it was
still free, verified against live Turso: no per-user database existed and no `users` row
named one. **That window is now shut**: PET-52 shipped the verify page, so a real account can
verify and the first per-user database can exist. `userDbName(id)`
derives the name and `users.db_name` persists it, so a second rename would strand every
existing account silently - `getUserDb` creates a fresh empty file instead of opening the
synced one, and `deleteUserDb`, which derives the name from the id on purpose because its
caller may have no row to read, targets a database that is not there. Doing it then means
`db_name` first becoming the source of truth wherever a name is needed, with the constant
applying to new users only, which costs `deleteUserDb` that no-row compensation path. That is
a real change to `UserDatabaseService` rather than a rename, and infrastructure naming no user
ever sees does not need to follow the brand a second time.

### The page header's inert month select

The month select (04, node 21:61) is drawn but does nothing. It is a plain `div` rather than a `<select>`, so it does not announce itself as operable, and `app/(app)/pages.test.tsx` pins that: `queryByRole('combobox')` has to stay empty.

The **month select** is inert by the design's own decision. A8 says only October exists in the file, so it renders the current period and stays non-functional until month navigation is designed. Making it real needs a designed control first, not just code.

### A15's no-results state is amended, and its copy is ours until a variant is designed

A15 said: no search-or-filter no-results state is designed, so show frame 07's "No transactions
yet" message without hiding the controls until a designed variant exists. PET-30 kept the second
half and **amended the first**, which also amends its own AC5.

The reason is that the placeholder is not merely thin, it is wrong. Frame 07's body reads "Log
your first expense and it'll show up here, sorted and categorised automatically." Shown to
somebody with a hundred transactions whose search matched nothing, that reports the account as
empty when it is full, and the button it offers does not address what went wrong. A15 was a
default for an undesigned state rather than a decision about this one, so the two strings changed:
the no-results state reads **"No matching transactions"** over **"Try a different search term,
category or period."** Everything else - the card, the glyph, the "Add transaction" button - is
identical, and the controls stay on screen exactly as A15 asked.

**What is owed.** A designed no-results variant, at which point these two strings are replaced
rather than kept. Until then they join the list under A29's item above: copy that ships, was not
read off a frame, and needs a designer's sign-off. `Screens/07 Transactions — No results` is the
quickest thing to put in front of them, next to the `Empty` story it should be diffed against.
The designed state keeps Figma's UK "categorised" untouched, which is A30's copy pass and not
this.

### Telling an empty account from an empty filter costs a second request

`GET /api/transactions` returns `total` **after** filters and no account-wide count beside it -
PET-28 considered the second count and dropped it, because no frame draws two numbers. Combined
with `period` defaulting to `current`, that leaves a `total` of 0 meaning any of three things: the
account is empty, a filter matched nothing, or the account's transactions are all in an earlier
month.

The third is the one that forces a decision rather than a preference. Treating it as the first
renders "Log your first expense" over a real history and, because TRN-3 removes the filter bar in
that state, leaves no control on screen that could change the period to go and find it - the user
is told they have no data and given no way to disagree. Inferring the state from whether a filter
looks active gets exactly that case wrong, because that case has no active filter.

So `lib/transactions.ts` reads a second time when the first read returns zero: `period=all`, no
other filter, and only then. Every page load with data on it still costs one request, and the
extra round trip is spent only on the state that has nothing to render. **What would remove it is
a count the API does not publish** - an unfiltered total beside the filtered one, which is a
backend change reversing a recorded PET-28 decision, so it wants a real reason rather than tidiness.
One reason may arrive on its own: if the period select ever offers "All time" (A16 leaves its
options unknown), a caller already asking for `period=all` pays one redundant request in the empty
case, and `readTransactionsView` should short-circuit rather than probe.

**Amended 2026-08-05 by PET-29: that reason arrived, and the short-circuit is in.** The period
select offers "All time", so `period=all` with no search and no category is now one click away,
and its first read already *is* the probe - answering zero to it means the account is empty and
there is nothing left to ask. `readTransactionsView` returns `empty` directly in that one case.
The condition is "these filters already are the probe" rather than "the period is all": an
all-time read narrowed by a search or a category still leaves the two states apart, so it still
probes. The second request is otherwise unchanged, and so is the argument for eventually
replacing it with a count the API publishes.

**One cost of the search field is worth naming here**, because it multiplies against this. A
search matching nothing costs two requests rather than one, so a navigation per keystroke would
be two round trips per keystroke - which is why the 300ms debounce in
`app/(app)/transactions/TransactionSearch.tsx` is load-bearing rather than a nicety.

### The filter bar's pending state is a browser check, not a jsdom one

`app/(app)/transactions/FilterNavigation.tsx` dims the table and sets `aria-busy` while a filter
change is in flight, and the moment it turns true cannot be asserted under Jest. A transition
stays pending only while something inside it suspends; in the running app that is
`router.replace` suspending on the RSC payload, and a mocked router resolves immediately, so the
callback completes synchronously and `isPending` is false again before an assertion can run.

Rewriting `navigate` into an async transition purely so a test could observe it would be
contorting the component to suit the harness, which is the call `(app)/Modal.tsx` already makes
about Escape and its focus trap. So the suite pins everything either side - that the region is
mounted around the table, that it is silent at rest, that the controls reach the provider at all -
and the busy state itself is eyeballed.

The near miss is worth recording, because it is what the region exists to prevent: an earlier
version of this ticket gave `TransactionsTable` a `pending` prop that **no caller could pass**,
and its tests set the prop by hand, so they were green against a feature wired to nothing. If a
future change breaks the wiring again, the assertion that catches it is the one in
`TransactionsScreen.test.tsx` that the table sits inside the region, not anything about the class.

### The row menu's open, close and Escape are browser checks, and jsdom is not being polyfilled

`app/(app)/transactions/TransactionRowMenu.tsx` is daisyUI's popover dropdown, so AC1's "clicking
elsewhere or pressing Escape closes it" is light dismiss and the Escape default action rather
than anything this repo wrote. **jsdom 26.1.0 implements none of the Popover API** - verified
directly: `showPopover` is `undefined` and `popoverTargetElement` is not on
`HTMLButtonElement` - so none of that is observable under Jest.

`jest.setup.ts` polyfills `<dialog>` and deliberately does **not** polyfill this, which is the
decision worth recording rather than the gap. Faking `showPopover`, light dismiss and Escape
would turn AC1 into a test of those few lines: it would pass just as happily with `popover`
deleted from the markup, which is exactly the failure the dialog polyfill's own comment refuses
for Escape. The consequence is that under Jest the menu never hides, so both items are always
queryable - and no assertion in `TransactionRowMenu.test.tsx` should be read as proving the menu
opened. What that suite pins is the wiring the browser needs: the trigger's accessible name, the
`popovertarget`-to-`id` pairing, the `anchor-name`-to-`position-anchor` pairing, that two rows
get two ids, and what Delete hands the provider.

The check that is not automated anywhere is therefore opening `Screens/06 Transactions — List`
and using it. The day jsdom ships the real API this evaporates on its own, the way the dialog
polyfill's `typeof` guard is written to.

### The row menu is unanchored in Firefox, and daisyUI's own fallback is what ships

daisyUI positions `.dropdown[popover]` with CSS anchor positioning (`position-area` against a
`position-anchor`), which Firefox does not support. Its stylesheet carries an
`@supports not (position-area: bottom)` branch that centres the popover and draws a dimmed
`::backdrop` instead, so the menu opens and works - it simply appears in the middle of the
viewport rather than under the kebab that opened it.

Accepted rather than fixed. The alternatives are hand-rolling positioning (a resize and scroll
listener plus a collision strategy, which is the kind of code the popover was chosen to avoid) or
pulling in a positioning library for one engine and one control. Both cost more than the
degradation, and the fallback is a coherent design rather than a broken one. Worth revisiting
when Firefox ships anchor positioning, at which point the fix is deleting nothing.

### The icon set is lucide's now, and three marks are near-misses the designer has not seen

PET-33 added `lucide-react` and migrated all thirteen hand-traced glyphs onto it, so there is one
icon idiom and no traced SVG left in `frontend/src` outside the tests, `app/icon.svg` and the
wordmark. What did **not** come with it is a designer's sign-off, and three specifics are worth
naming rather than leaving to be re-discovered by whoever next opens the design file.

**The sidebar changed weight.** Its four glyphs were the only *filled* marks in the app; lucide is
uniformly stroke-based, so the navigation reads a shade lighter than Figma draws it. Taken
deliberately - four solid glyphs beside an already-stroked hamburger, chevron and magnifier was
the larger inconsistency - but it is a visible deviation from the frames rather than a swap, and
it is the one an eye lands on first.

**Two of the four are approximations.** `AlignLeft` (Transactions) draws four ragged lines where
the trace drew three, and `SlidersHorizontal` (Settings) draws three rows where the trace drew
two. Both keep the property that made the original readable - the short last line is what stops
Transactions reading as a second hamburger, and the offset knobs are what say "adjustable" rather
than "toggled" - so neither is wrong, but neither is the drawn mark either. `Sparkle` is the one
to leave alone: it is exactly the single four-pointed concave star the design uses for AI, and
"correcting" it to `Sparkles` would add two smaller stars the frames do not have.

The cheap resolution is a designer confirming the set against frames 04 to 17, which folds into
whatever pass A29 eventually gets for the undesigned states. The expensive one, if the filled
sidebar turns out to be load-bearing, is a per-icon `fill` override, which fights the library.

**This item replaces three that the migration answered**, and one fact from them is worth keeping
rather than losing with the entry: the design file draws the category tile's placeholder shopping
bag **twice**, and differently - node 15:13 puts the handle left of centre over a bag spanning
3..17, node 27:149 centres it. That was actionable while the code traced one of them and would
have had to pick when a second surface drew the tile (the dashboard's recent list, DSH-7, is
next). It is not any more: both surfaces get lucide's `ShoppingBag`, so the discrepancy is now
the design file's alone. Worth mentioning in the same conversation as the sign-off above, and
worth nobody re-tracing either node to "match Figma".

### The transactions page re-reads the categories on every filter change

`app/(app)/transactions/page.tsx` runs `readTransactionsView` and `readCategoryLabels` in
`Promise.all`, and both re-run on every navigation - so each debounced keystroke, each category
change and each sort change fetches a category list that cannot have changed. With the probe
above, a search matching nothing costs **three** backend requests where one would do.

Deliberate for now rather than overlooked. The obvious fix is caching the category read, and the
invalidation story is the part that makes it a decision rather than a tidy-up: a category created
in the Add transaction modal has to appear in the filter select, and the modal already re-reads
on every open with `cache: 'no-store'` for exactly that reason. Ten categories is also a cheap
query against a per-user SQLite database, so the win is small today.

What would change the calculus is the account-wide count discussed above landing, or a user with
enough categories that the join stops being trivial. Whoever picks it up should look at the two
reads together rather than only this one.

### The header period ignores the profile's month start day

`monthOverline()` and `monthLabel()` in `lib/format.ts` format the **calendar** month, and
A9 says the profile's `monthStartDay` is what defines the period used by "This month" filters
and "days left" math. The display is correct for the default of 1 and wrong for any other
value, which no user can set yet.

Fixing it is not just threading a number through: with `monthStartDay = 15`, the period
spanning 15 Aug to 14 Sep has no single month name, and the design draws no label for that
case. So this needs a designer answer alongside PET-45's read, not only the value.

**Proposed fix:** When `monthStartDay` is > 1, the frontend appearance should be updated to show both months (e.g., instead of "October", it writes "October / November").

**PET-30 gave the mismatch a visible symptom rather than only a wrong label.** The transactions
header formats the calendar month while the list read's `period=current` resolves against
`monthStartDay`, so for any value other than 1 the two disagree about which window the page is
showing. A transaction dated inside the calendar month but outside the budgeting period is then
absent from a page whose overline names that month - and if it is the only one, the page reports
no matching transactions under a heading that says otherwise. Nothing new is broken here; what
changed is that the disagreement now has rows to hide.

The same two functions also hard-code the `en-US` locale, matching `formatCurrency`. When
onboarding's chosen currency is finally threaded through, the locale should follow it. PET-9
added a third consumer of that decision: `formatAmountInput` hard-codes the comma as its group
separator, and `Input variant="currency"` hard-codes the `$`. All of them move together or not
at all, and the visible symptom today is that a European-formatted paste (`2.000,50`) reads as
`2.00` in the budget field - pinned in `format.test.ts` rather than fixed, because fixing it
means knowing the user's locale.

**They also read the server's timezone, not the reader's.** The pages call `new Date()` in a
Server Component, so on the first or last day of a month a server in UTC and a user in UTC-5
disagree about which month it is, and the overline names the wrong one for that user. There is
nowhere to fix it today: no user timezone is stored, and the design has no field for one, which
is why this sits here with the two above rather than in a code comment. The three are one
change when somebody makes it, since all three want the same missing profile data.

Note the tests are not exposed to this. `format.test.ts` builds every fixture with the
local-time `Date` constructor rather than an ISO string, and says why: `new Date('2025-10-08')`
parses as UTC, so west of Greenwich a date on the 1st formats as the month before.

### The design shows whole dollars and `formatCurrency` always emits cents

`formatCurrency(1240)` returns `"$1,240.00"`, pinned in `frontend/src/lib/format.test.ts`,
while frame 01's sample card and frame 04's real budget card both draw `"$1,240"`. So the
shared formatter cannot produce the string the design asks for.

Welcome sidesteps it: its figures are permanent marketing copy, so `SAMPLE_BUDGET` holds
literal strings.
**The dashboard's budget card cannot sidestep it**, because its numbers are real. That ticket
needs either a no-cents variant beside `formatCurrency` or a designer answer on whether the
app shows cents at all - and the answer probably differs by context, since a transaction of
$24.50 clearly needs them while a $2,000 budget clearly does not. Recorded now because it is
cheap to note and annoying to rediscover mid-ticket.

**PET-9 did not resolve this**, and it is worth being clear why, because it added a function
that looks like it might have. `formatAmountInput` is the budget field as it is being typed
into: it truncates rather than rounds, keeps a trailing `.` so a half-typed value survives, and
emits no symbol at all. So the two still disagree - the field shows `2,000` while
`formatCurrency(2000)` is `$2,000.00` - and the dashboard's budget card still needs the answer
above.

### A visible theme toggle is deferred, and adding one costs the automatic behaviour

PET-57 ships daisyUI's built-in `light` / `dark` pair selected by `prefers-color-scheme`, with
no manual toggle anywhere. That is not an oversight: daisyUI's own rule is that a toggle and
automatic prefers-dark selection must not coexist, because a browser already in dark mode makes
the control switch dark to dark. Whoever adds a toggle removes `--prefersdark` from
`frontend/src/app/globals.css` in the same change and decides where the preference is stored.

### The onboarding draft is per tab, and four things follow from that

PET-9 holds the draft in sessionStorage under one key, read through `useSyncExternalStore`.
Four consequences, none of them bugs, all of them things a reader would otherwise discover:

A **new tab** at `/setup` starts empty, because sessionStorage is per tab. That is the point -
a shared machine must not offer the next person a half-finished registration carrying somebody
else's name and email - but it does mean "open in new tab" loses the draft.

A **hard refresh keeps it**, which is more than PET-9 AC5 asks for and is a side effect rather
than a designed behaviour. Nothing depends on it.

The write is **best effort**: a `QuotaExceededError` or Safari's historical private-mode throw
is swallowed, and the in-memory cache is updated before the write is attempted, so the field
still shows what was typed. Persisting degrades; the form does not.

**A successful register clears it, and nothing else does.** Back must not, because every step's
AC5 forbids it, and no reset control is designed anywhere - so an *abandoned* onboarding still
shows stale values in that tab until it closes. PET-11 took the one natural moment: `clearDraft`
runs after the 202, which is when the values have a real account behind them.

That leaves one accepted consequence, recorded here because it looks like a bug and is a
decision. **The browser's own Back button from screen 24 reaches an empty Register.** PET-11
deleted screen 24's own "Back" control for this reason - amending A37, VER-3 and PET-12's AC6 -
but deleting a control does not delete the history entry, and the draft is gone by then. Accepted
on three grounds: the account exists and the login link is sent, so nothing is lost; the form's
own validation turns an accidental empty re-submit into three inline messages rather than a bad
request; and a deliberate re-submit of the same address is explicitly safe, because the backend
sends a fresh link instead of duplicating (REG-6, A35). Both alternatives are worse - keeping the
draft alive defeats the clearing, and suppressing the history entry means `router.replace` on the
way to screen 24, which would also swallow the legitimate Back from Register to step 2.

### The budget field's caret has two rough edges, and jsdom cannot see either

Both are pinned by tests in `frontend/src/lib/format.test.ts` so they are documented rather
than rediscovered, and both need a deliberate keystroke sequence.

Typing a leading `0` in front of an existing number drops the zero correctly but advances the
caret past the first digit. And erasing the leading digit of `2,000` yields `0` rather than
`000`, because the leading-zero collapse fires on the cleaned string - numerically right, and
startling enough to read as "one backspace cleared the field". Backspacing a separator is the
mildest of the three: the formatter reinstates it, so only the caret moves. The fix for all
three is a separator-aware `keydown` handler, which was out of PET-9's scope.

Sharper than any of them, for whoever changes this code: **the caret's final position is not
observable under jsdom.** React saves and restores a selection around its own controlled-input
commit, and `user-event` keeps its own cursor bookkeeping on top, so an assertion on
`selectionStart` passes identically with the restore deleted from `BudgetForm` - which an
earlier version of that test did. The suite therefore asserts that `setSelectionRange` was
called with the computed offset, and the visible behaviour is a Storybook or manual check. A
real browser test (Playwright, or Storybook's own test runner) is what would close this
properly, and nothing in the repo runs one yet.

**PET-31 made that missing browser test matter more, and one of the gaps it named turned out to be
a bug.** `(app)/Modal.tsx` is built on the native `<dialog>`, and jsdom 26.1.0 implements almost
none of it - `HTMLDialogElement.prototype` carries exactly `constructor` and `open`. So
`jest.setup.ts` fakes `showModal()` and `close()` and **deliberately stops there**, leaving two
things unassertable: **Escape** (in a browser the UA fires `cancel`, whose default action closes the
dialog) and the **focus trap**. Faking Escape was the obvious next step and is the wrong one: AC7's
"Escape closes the modal" would then be a test of fifteen lines of polyfill, passing just as
happily with the real behaviour deleted.

The amount field's caret is the third, since the modal reuses `BudgetForm`'s handler verbatim. All
three are checked by hand against `Shell/Modal`'s `FromTrigger` story and
`Screens/09 Add transaction`, in both Chrome and Firefox, because every one of them is the
browser's behaviour rather than ours. One real browser test would close the whole set at once,
which is the strongest argument yet for adding the runner.


### The currency select has one option, and two things wait on A6

`frontend/src/app/setup/BudgetForm.tsx` renders `CURRENCY_OPTIONS` with the single
`USD - $` the design file contains. Two consequences, both of which resolve themselves the
day A6 is answered and a second currency appears:

Its `onChange` **cannot fire**, so `patchDraft({ currency })` is unreachable from the UI and
untested through it. The merge semantics that handler relies on are covered directly in
`app/setup/layout.test.tsx` instead, which is the part PET-10 actually depended on - and step
2's chips now exercise the same merge through a real interaction, since toggling one has to
leave step 1's budget alone.

And a stored `currency` is not checked against the option list. `parseDraft` canonicalises
the budget but only type-checks the currency, so a draft carrying `EUR` - devtools, or a
build that offered more options - lands on a `<select>` with nothing matching. The browser
then shows the first option while the draft still says `EUR`, and step 3 **does** post it -
`toRegisterBody` passes the stored code straight through, and the DTO's
`@IsISO4217CurrencyCode()` accepts `EUR`, so the account would be created in a currency nobody
picked. Still harmless while one option exists, since nothing can put a second code in there
except devtools; the fix, when the list grows, is for `parseDraft` to fall back to
`DEFAULT_CURRENCY` for a code it does not recognise, which means the allowlist has to move out of
the form and into `draft.ts` beside the rest of the shape.

### A29's inline error pattern is now live rather than illustrative

The inline error treatment (an error-state control plus one line of copy beneath, owned by
`ui/Field` until PET-57 folded it into `ui/Input` and `ui/Select` over `ui/FieldShell`) shipped with PET-17 but
nothing rendered it in a real flow - only `Input.stories.tsx`'s `WithError` story. PET-9's
budget validation is the first live use, with the string `Enter an amount greater than 0.`
taken verbatim from that story rather than invented.

That raises the priority of the designer sign-off A29 already owed. The pattern is now what
users see, and every remaining form ticket (PET-11, PET-12, Settings, the transaction forms)
will copy it. PET-10 did not: A4 enforces no minimum selection, so step 2 has nothing to
validate and deliberately ships no error state at all.

**PET-11 raised it again, with five strings and a second shape.** Step 3 is the first screen with
more than one thing to validate, so it needed copy the design file does not contain: `Enter your
first name.`, `Enter your last name.`, `Enter your email address.`, `Enter a valid email
address.`, and for a failed request `We couldn't create your account. Please try again.` All five
follow the shape of the one live message rather than inventing a voice, but none was read off a
frame. The `Screens/22 Register` story's `WithMessages` case renders all of them at once, which is
the quickest thing to put in front of the designer.

The second shape is the one that needs an actual decision rather than a sign-off: **a form-level
message, which the field components have no concept of.** A field's inline line is per-field and
deliberately carries no `role="alert"`; a failed request belongs to no field and arrives after a
network round trip with nothing else on screen changing, so PET-11's line sits above the footer
row in the same `text-error` treatment *with* `role="alert"`. If a second form ever needs one,
that is the moment it belongs in `ui/` rather than in a screen.

Two things the same screen does not validate, both deliberate. `@MaxLength(100)` on the two names
is **not** mirrored client-side: no `maxlength` is drawn in the frame, so a longer name gets a 400
rendered as the generic form-level message rather than an inline one. And `isEmailValid` is looser
than the DTO's `@IsEmail()`, which is validator.js, so a handful of addresses pass here and come
back a 400 the same way - `lib/email.test.ts` pins `marko@email.com.` as the example. Closing either
gap means shipping a validation dependency for one field, or copying validator.js's expression
into the frontend where it would rot silently.

**PET-12 raised it a third time, with five more strings and one that is a decision rather than a
sign-off.** Screen 23's failure line is `We couldn't send your login link. Please try again.`,
shaped like PET-11's. Screen 24's four are all A36's, which says outright that no cooldown, counter
or confirmation is designed for "Resend link": `A new link is on its way.` after a success,
`We couldn't send a new link. Please try again.` after a failure,
`Too many requests. Please wait a few minutes and try again.` for a 429, and
`This page has been open too long to resend.` when the address cookie has expired. The
`Screens/24 Check your email` stories reach all four by clicking the button - the last one through
its own `ResendAfterExpiry` story, because fifteen minutes of waiting is not something a
click-through finds.

Two decisions inside that worth a designer's eye rather than a rubber stamp. **A resend now confirms
itself**, which A36 says nothing is designed for - and the alternative is worse rather than
cheaper: with no confirmation a click has no observable effect at all, so a user cannot tell whether
it worked and clicks until the backend's five-per-address limiter answers 429, which without the
third string would also render as nothing. **And there is deliberately no cooldown**, which A36 does
mention. The backend's per-address throttler is the real limit and a client-side timer would be a
second, weaker authority that a reload defeats, so the 429 message replaces it. If the designer
wants a visible cooldown, it belongs on top of that message rather than instead of it.

**One accepted a11y consequence of the expiry state.** When the resend reports an expired address,
the button the user just pressed is replaced by the "Log in again" link, so keyboard focus falls back
to the document rather than following to the new control. The message carries `role="alert"` partly
for that reason - it announces what replaced the button - but a user tabbing from where they were will
re-enter the card from the top. Moving focus deliberately needs a focus-management pattern this repo
does not have yet, and inventing one for a single control is the wrong first mover; the day a second
screen swaps a control in place, it belongs in `ui/`.

**PET-52 raised it a fourth time, with eight more strings and a whole screen behind them.** A38 says
outright that nothing is designed for opening the link - "no success landing, expired-link,
already-used-link, or wrong-device screen" - only that these should be handled "with plain messages
and a way to request a new link". So `/auth/verify/failed` is the one screen in the app with no Figma
frame at all, and its four headings and four body lines are ours:

- `This link no longer works` / `Login links can only be used once and expire after a short time.
  Send yourself a new one.` for a 401 or a 400.
- `A newer link was sent` / `This link was replaced when a newer one was requested. Open the most
  recent email to sign in.` for the 409.
- `Too many attempts` / `Please wait a few minutes and then request a new link.` for a 429.
- `We couldn't sign you in` / `Something went wrong on our end. Please try again.` for a fault, an
  unreachable backend, or a reason the URL claims that does not exist.

Four rather than one generic apology, because three of the four would be misleading if collapsed: a
replaced link wants the newest email, a throttled one wants waiting, and a fault leaves the link
itself still live. The `Screens/Verify link failed` stories reach all four, and they carry **no frame
number** because there is no frame - which also makes opening them the only review this screen can
get. The card and both controls are screen 24's, so what actually needs the designer's eye is the
copy rather than the layout.

**PET-30 raised it a fifth time, with two strings, and this pair is different from the twelve
above.** Every earlier addition filled a state the design simply never drew. These two *replace* a
string the design does draw: A15 instructed the no-results state to reuse frame 07's "No
transactions yet" copy, and PET-30 shipped **"No matching transactions"** over **"Try a different
search term, category or period."** instead. So the sign-off asked for here is not "is this
acceptable copy for a gap" but "was overriding your instruction right" - the argument being that
frame 07's body tells a user with a full history to log their first expense. The reasoning is under
A15's own item above, and `Screens/07 Transactions — No results` sits beside the `Empty` story it
should be compared against. If the answer is no, reverting is two strings in
`TransactionsEmpty.tsx` and the assertions naming them.

**PET-31 raised it a sixth time, with nine strings, and it is the first form with more than one way
to fail.** Four are field messages - `Choose a category.`, `Choose a date.`, `Enter a merchant.`,
and `Enter an amount greater than 0.` reused verbatim from the budget field. Four are the
form-level line with `role="alert"`, in the treatment `components/FormError.tsx` owns since the
PET-57 review extracted it - `ui/Field` held it when this item was written - one per way the write
can be refused: `We couldn't add this transaction. Please check the values and try again.` for a 400,
`That category no longer exists. Pick another one.` for a 404, `Your session has expired. Log in
again to save this.` for a 401, and `We couldn't add this transaction. Please try again.` for
everything else. The ninth covers the categories read failing:
`We couldn't load your categories. Please close this and try again.`

Two things in that set are decisions rather than sign-offs. **The amount message covers both AC3's
"missing" and AC4's "zero or negative"**, because it states the rule rather than the symptom and is
therefore true of an empty field and a typed `0` alike - the ticket carries an amendment saying so,
so QA does not read AC4 as requiring a second string. And **four failure lines rather than one
apology**, because collapsing them would make two actively wrong: a 400 told to "try again" loops
forever on a body the DTO will always reject, and a 404 has an obvious next move that a generic line
hides. `Screens/09 Add transaction`'s `WithMessages` story renders the four field messages at once,
and `CategoriesUnavailable` shows the ninth.

**PET-32 raised it a seventh time, with four new strings over six reused ones.** Its modal holds ten
messages: **six are frame 09's verbatim** - the four field messages, the 401 and the categories-read
line - and **four are new**. Each field message states a rule rather than an operation, so "Enter an
amount greater than 0." is as true of an edit as of a create, and a second wording of one rule a
modal apart would be the defect rather than the consistency; the 401 and the categories line say
nothing about which operation was attempted. The four new ones are:
`We couldn't save this transaction. Please check the values and try again.` for a 400,
`This transaction no longer exists. Close this and refresh the list.` for a 404 on a patch that did
not touch the category, `This transaction or that category no longer exists. Close this and try
again.` for a 404 on one that did, and
`We couldn't save this transaction. Please try again.` for everything else.

The decision inside that set rather than the sign-off is **two lines for one status**. The backend
answers 404 for a missing transaction and for a missing category and distinguishes them only in its
own message text, so the frontend narrows it from the body it sent: with no `categoryId` in the patch
the row is the only thing that can be missing, and that is the overwhelmingly common case, since
nothing in this frontend can delete a category yet while deleting a *transaction* is a button on
every row. One combined line was the alternative and would tell somebody whose row was deleted in
another tab that "this transaction or that category" is missing, on the path users actually reach.
`Screens/11 Edit transaction`'s `WithMessages` story renders the field messages over a **prefilled**
form, which is the only way a user reaches validation in an edit, and its `Saving` and
`CategoriesUnavailable` stories cover the two undesigned states around them.

**PET-34 raised it an eighth time, with five new strings and no reused ones**, because a read
screen shares no failure vocabulary with a form. They are `{over} over {cap}` on the budget bar for
a category past its cap, `Nothing else in {category} yet.` where the recent list would be, and the
not-found boundary's three: `That transaction is gone`, `It may have been deleted. Everything else
is still on your transactions list.` and `Back to transactions`.

Two things about that set are worth the designer's eye more than the wording is. **The largest
undesigned surface here is the one with no string at all**: an uncapped category renders no chip,
no bar and no remaining line, and the deliberate choice was absence rather than an explanation of
absence - no "No cap set" placeholder. That is the *common* case, since caps are optional and the
preselected fallback ships without one, so the frame draws the rarer state and
`Screens/08 Transaction detail`'s `Uncapped` story is the one to review. And **the not-found copy
claims a cause it cannot verify** - "It may have been deleted" - which is hedged deliberately: the
backend answers one 404 for an unknown id, another user's id and a tombstoned row alike, so
anything more definite would be invented. `OverBudget`, `WithoutANote` and `NoRecent` cover the
other three undrawn states on the same story module.

### The Add transaction modal's date picker has no Figma counterpart at all

ADD-7 draws the Date field as a **closed select** showing "Oct 8, 2025", and assumption A14 says to
"use a standard date picker and confirm the pattern with the designer". Frame 09 never opens it, and
no frame anywhere in the file contains a calendar - so PET-31 built one and every part of it inside
the trigger is invented.

What the design does fix, and what PET-31 matched exactly: the resting field is `ui/Select`'s box,
padding and chevron, so it is pixel-identical to the Category select above it. What is ours: a 280px
popover; a **six-row** grid, fixed so paging cannot change the popover's height under the user's
cursor; **Monday-first** single-letter column headings; the three day-cell states (selected, today,
default), none of which the file colours; the two month chevrons, which are `ui/Select`'s own leaf
rotated a quarter turn; and the whole keyboard model - arrows by day and week, PageUp and PageDown
by month with the day clamped rather than rolled, Enter to pick.

Two consequences worth the designer's attention rather than just a nod. There is **no year
control**: paging December forward reaches January, which makes the two chevrons sufficient but
makes a date two years back twenty-four clicks away. And the trigger is a `<button>` rather than a
`<select>`, which is what makes the popover possible at all and is the reason
`(app)/DateField.tsx` carries three ARIA decisions the two real fields beside it do not need.

**The week starts on Monday, which is a product decision and not the app's locale.** Every other
formatter in the frontend is pinned to `en-US`, where the week starts on Sunday - so this one
deliberately disagrees with its neighbours, on the grounds that a spending week reads better ending
at the weekend. Two things follow that are easy to get wrong later. `leadingBlanks` in
`lib/calendar.ts` is the **only** place `getDay()`'s Sunday-first numbering is converted, and its
suite pins that the two schemes coincide on no day of the week at all - so a stray `getDay()` used
as a column index is always wrong rather than occasionally right. And the grid's worst case moved
with the first day: it is now a 31-day month starting on **Sunday** (37 cells) where it used to be
one starting on Saturday. If the locale work `lib/format.ts` defers ever arrives, this is a
deliberate exception to it rather than an oversight to sweep up.

**The popover is `position: fixed` and that is not cosmetic.** A modal `<dialog>` gets
`overflow: auto` and a `max-height` from the user agent, so an `absolute` popover anchored to the
field is inside that scroll box: opening it grew the dialog's `scrollHeight` from 532 to 663, put a
scrollbar down the side of the modal, and clipped 131px of the calendar - all measured in Chrome.
`fixed` escapes both, because the dialog sets no `transform`, `filter` or `contain` and so
establishes no containing block, while the popover stays a DOM child of the dialog and therefore
still paints inside its top layer. The cost is that the coordinates are computed on open rather
than declared, which brings two small limits with it: the flip-above decision reads a
`POPOVER_HEIGHT` constant that is only correct because `monthMatrix` fixes the grid at six rows,
and a window resize **closes** the popover rather than repositioning it. Both are cheap to revisit
if a second popover ever appears; a shared positioning helper is what that would want.

### A created transaction can legitimately fail to appear, and two smaller edges around it

`GET /api/transactions` defaults to `period=current`, so a transaction dated into an earlier month
is created successfully and then shows up in neither the list nor the count badge. To the user the
modal closes and nothing happens, which reads exactly like a failed save. Backdating is not an edge
case the backend tolerates but a documented feature of it - `CreateTransactionDto` says so, and the
date is stored verbatim precisely to support it.

PET-31 deliberately neither fixed nor prevented this. All three candidate fixes are owned
elsewhere: switching the list's period to the new transaction's month is filter state **PET-29**
owns; a confirmation naming the month ("Added to September") is new copy plus a state A19 and A29
design nothing for; and bounding the date field to the current period contradicts the DTO. The near
neighbour is worth knowing too - a **future** date inside the current month does appear, and one in
the next month does not.

**Amended 2026-08-06 by PET-32: an edit can do it too, and the same three fixes are still the
candidates.** Changing a transaction's date into another month makes the row leave a
`period=current` list exactly as a backdated create never joins it, and the modal closes on a
save that looks like it did nothing. Verified rather than prevented, for the reasons below plus one
of its own: the date field is prefilled with the row's own date, so the user who moves it out of the
period did so deliberately, which is a weaker case for a confirmation than the create's and the same
case for not bounding the field.

**Amended 2026-08-05 by PET-29: there is a way to go and find it now, and nothing automatic.**
The period select offers "Last month" and "All time", so a backdated transaction is two clicks
from being visible instead of being unreachable - which is the part that made this a defect
rather than a quirk. What PET-29 did **not** do is switch the period for you after a save. That
would mean the modal reaching into the list's filter state to move it somewhere the user did not
ask to go, and the honest fix is still the one A19 and A29 owe copy for: a confirmation naming
the month it landed in. The count badge remains the only immediate feedback, and it still does
not tick for a backdated row.

Two smaller edges from the same ticket. A successful save from an **empty state** destroys the
button that opened the modal, because the empty card is replaced by the (currently blank) table -
so the browser's focus restore has nowhere to return to and focus falls back to the document. That
is the same class of problem as screen 24's expiry swap above, and the same answer applies: it wants
a focus-management pattern this repo does not have, and a single control is the wrong first mover.
And **background scroll behind an open modal is unhandled**: `showModal()` does not lock it, three
of four `<main>` elements are still empty so there is nothing to scroll yet, and the fix if it ever
matters is an `overflow-hidden` toggle plus `scrollbar-gutter: stable` - both undesigned, and
neither observable in jsdom.

**The first of those two is live now.** PET-29 filled the table, so a save from the empty state
replaces the card with real rows rather than with a blank slot - which means the focus restore
lands on a document that has visibly changed under it. Still the same fix and still nobody's
single control to invent.

**PET-33 puts the same gap on a path users take far more often, which is the argument for finally
fixing it.** Deleting a row destroys the kebab that opened the confirmation dialog, so `Modal`'s
`isConnected` guard finds nothing connected and focus lands on `<body>`. Saving from the empty
state happens once per account; deleting a transaction happens whenever somebody tidies their
log, and every one of them leaves the next Tab starting from the top of the page. It is still the
same fix - a focus-management pattern this repo does not have - and it is still wrong to invent
one for a single control, but the frequency has changed enough that whoever builds PET-34's
detail page should look at it: deleting from there navigates, which sidesteps the problem for
that entry point and leaves the row menu as the only one with it.

**A code review then found this was wider than described, and the wider half is fixed.** It was
not only the delete path: `Modal` captures `document.activeElement` on mount, React flushes the
menu item's click synchronously, and `popovertargetaction="hide"` then hides that item - so the
captured element was a button inside a closed popover, still `isConnected` and no longer
focusable. **Cancel** therefore dropped focus to `<body>` too, on a path where nothing had been
destroyed and the restore should simply have worked. `TransactionRowMenu` now focuses the kebab
before opening the dialog, so the captured element is the right one. What survives is only the
original case: a successful delete removes the row and its kebab with it, and there is genuinely
nothing left to focus.

**PET-32 adds a third route to the same surviving case, and it is the longest chain of the three.**
Deleting from *inside* the edit modal unwinds two dialogs: the confirmation restores focus to the
modal's own "Delete transaction" button, which is still attached and correct, and then that modal
unmounts and restores focus onward to the kebab - which died with its row. So focus lands on `<body>`
for the same single reason as before, through one more hop. The ordering that makes the first hop
work is deliberate and pinned (`DeleteTransactionDialog` calls `onDeleted` **after** its own
`close()`); what is unfixed is unchanged, and this is not a second entry.

**PET-34 was asked to look at this and adds no fourth route, which is the useful result.** The
paragraph above predicted that "whoever builds PET-34's detail page should look at it: deleting
from there navigates, which sidesteps the problem for that entry point". That held exactly:
`TransactionDetailActions` passes an `onDeleted` that calls `router.replace`, so the page the
focus would have been restored *into* is gone before the question arises, and there is nothing
here to restore onto. So the count of routes to the surviving case stays at three and the row
menu is still the one that reaches it. **The fix has not become cheaper and has not become
likelier** - what changed is only that the app's newest delete entry point does not need it,
which is worth knowing before somebody reads the absence as the gap having been closed.

### A delete cannot be cancelled once it is sent, and Cancel no longer implies otherwise

A code review asked for an `AbortController` behind the confirmation dialog's Cancel, because
clicking it mid-request closes the box while the delete carries on and the row disappears
anyway. The request is real: AC5 says Cancel leaves the transaction unchanged, and the comment
there presented it as the way out of a hung request.

**An abort was rejected, and the reason is that it would lie.** Aborting the client-to-Server-
Action RPC does not un-delete anything - by the time the user reaches for Cancel the server may
already have removed the row - so the dialog would report a cancellation that did not happen and
then show a list with the row gone. That is strictly worse than the honest version. What shipped
instead is the honesty: Cancel promises only what it can do before Delete is pressed, the
comment says so, and the refresh deliberately outlives the component so the list still agrees
with the database.

A real cancel needs the operation to be cancellable, not the request: a soft delete with an undo
window is the usual shape, and DEL-3's copy ("permanently", "can't be undone") rules it out at
the design level before the engineering starts. Note the backend already tombstones rather than
hard-deleting, so the capability is closer than the copy suggests - which makes this a question
for the designer rather than a limitation to route around.

### A category colour outside the eight renders grey, and nothing can produce one yet

`CategoryResponseDto.color` is a hex string and `CreateCategoryDto` validates it with
`/^#[0-9A-Fa-f]{6}$/` - any well-formed hex, not one of the palette's eight. The frontend's only
colour vocabulary is Tailwind class names, and a class cannot be built from a hex at runtime
without Tailwind's scanner failing to find it, so `components/ui/categoryColour.ts` maps the eight
known hexes and falls back to `bg-text-tertiary` for anything else.

That fallback is **correct rather than lossy today**, and for a reason worth writing down: the only
colour outside the eight that a real account holds is `FALLBACK_CATEGORY.color`, `#98A0AE`, which
*is* `--color-text-tertiary`. So "Uncategorized" gets the grey the design gives it, and nothing
else can reach the branch - no screen can create a category yet.

The day category writes ship (PET-37 and friends), that stops being true, and whoever builds them
has to choose: a colour picker restricted to the eight, which is what frame 19's "Color" select
implies and what `ui/Select.tsx` already records it cannot render; or a rendering path that does
not go through a class map, which means an inline `style` and a deliberate exception to the
literal-class rule. Note the second also affects the 8px category dot, not only the tile.

### An unknown category id in the URL shows no-results with the select reading "All categories"

`parseTransactionFilters` checks that `?categoryId=` is a well-formed UUID and deliberately does
**not** check that it is one of the account's categories. The two reads run in `Promise.all`, so
the category list is not available before the list request goes out, and serialising them would add
a round trip to every load of the app's busiest screen to fix a state only a stale bookmark or a
hand-edited URL reaches.

The outcome is coherent enough: the API filters everything out rather than 404ing, so the screen
shows the no-results card, whose copy already reads "Try a different search term, category or
period". The incoherence is one line of display - the category select falls back to
"All categories" while the URL is filtered by something else, so the bar disagrees with the list
until the next interaction, which heals it.

The fix, if it is ever worth the round trip, is one line between two awaits: drop `categoryId` when
no category matches it. The alternative that costs nothing is to render the unknown id as a
disabled option reading something like "Unknown category", which is new copy A29 would owe.

`isBudgetValid` in `app/setup/draft.ts` and `isAmountValid` in `app/(app)/transactionForm.ts` are
the same one-line rule, `parseAmountInput(value) > 0`, copied rather than shared. Each names the
other in a comment.

The copy is deliberate for now, and the reason is layering rather than laziness: importing would
point the signed-in shell at onboarding, which is the inversion that moved `resendLoginLink` out of
`app/check-email/` into `lib/`. It is also the call `LoginForm` already made about its two field
messages - "copied rather than shared: there is no copy module in this repo and two overlapping
strings are the wrong reason to invent one."

PET-32's Edit transaction modal validates the same field and would make it a third copy, which is
the point at which a shared `lib/amount.ts` earns its place. Whoever writes that should take
`isMerchantValid` and `isNameValid` with it - they are the same pair of twins.

**PET-32 shipped and did not make it a third copy, so the trigger has not fired.** The edit modal
reuses `app/(app)/transactionForm.ts` wholesale - `invalidFields` and all four predicates - rather
than restating the rule, which is what the rule of three is supposed to produce and is why nothing
was lifted. The count is still two. The trigger to watch for is now a third *form* that validates an
amount without going through that module, and the prediction above is left standing rather than
deleted because the reasoning for the lift is unchanged when it does arrive.

### Screen 24's no-address arrival is new copy and a reworded AC

`/check-email` shows the address the user submitted, and PET-12 carries it in a fifteen-minute
cookie rather than a query string. So there is a real state where the screen has no address: the
cookie expired, the screen was opened in a second browser, or its value was not something the field
could have produced. AC7 asked for copy that "still reads correctly rather than leaving an empty gap
or the literal placeholder" and noted A29 designs none, so the sentence drops the address clause
entirely - `We've sent you a secure login link. Open the link on this device to access your
account.` - chosen over filling the slot with a generic phrase.

**The control in that state is `Log in again`, and that amends AC6's wording.** AC6 requires "Resend
link" to be the only action, and with no address there is nothing to resend. A disabled button
satisfies the letter of it and leaves a screen with no Back, no working control and no way out,
which a reload twenty minutes later reaches - and a permanently disabled button announces as
"Resend link, dimmed" with no reason given. What AC6 defends is that there is no way *backwards*
into a form the user has already completed, and a link forward to Log in does not touch that. The
Jira ticket records the amendment; the alternative is recorded here so nobody re-proposes it.

### The pending-address cookie's lifetime is coupled to a backend variable it cannot read

`lib/pendingEmail.ts` expires its cookie after fifteen minutes to mirror the login link's own
lifetime, which the backend takes from `LOGIN_LINK_TTL_M` (see `docs/guides/configuration.md`). The
frontend has no channel to that value, so the two can drift: raise it and a still-valid link gets
the no-address fallback, lower it and the cookie outlives the link it describes. Both degrade to
copy that reads correctly rather than to anything misleading, which is why the duplication was
accepted rather than fixed. Closing it properly means either publishing the value in the API or
giving the frontend its own environment variable, and neither is worth it for a display string.

### The starter category list exists in two files, linked only by a generated type

The names are single-sourced and the colours are not. `backend/src/database/user/starter-categories.ts`
owns both; `frontend/src/app/setup/starterCategories.ts` reads the **names** out of
`frontend/src/types/api.d.ts`, because `@IsIn` on the DTO publishes an OpenAPI `enum` and
`openapi-typescript` turns it into a literal union, so `npm run build` fails if the two lists
disagree about a name. Nothing does that for a colour: the API publishes names only, so the
frontend's ten `CategoryColour` keys are a hand-kept mirror of the backend's ten hex values, and
a colour changed on one side is a silent divergence. `starterCategories.test.ts` pins the
frontend's order and its two repeated colours, which catches an accidental edit but cannot see
the other file.

**The preferred fix is a public endpoint serving the starter list**, which would delete the
frontend copy outright. It needs its own ticket, and one constraint has to be in it: during
onboarding there is no account and no per-user database, so such an endpoint cannot read *the
user's* categories - it serves the constant, and it has to be `@Public()` like the other four
pre-session routes. The per-user read that lists a real account's categories is a different
endpoint and belongs with the category CRUD that "The rest of the data model" above still
records as missing.

### Step 2 starts with nothing selected, where frame 03 shows seven

The mock has Groceries, Dining out, Transport, Shopping, Housing, Entertainment and Bills
selected. PET-10 treats that as an illustration of the selected state rather than as a default,
by product decision: the user picks. So a first visit renders ten unselected chips and a diff
against the frame shows seven differences, every one of them intended.

Worth a designer answer, because the two readings are genuinely different products - a curated
starter set somebody can pare down, or an empty sheet. If the answer is the mock, the change is
one line in `EMPTY_DRAFT` and **not** in the screen: `parseDraft` preserves an explicitly stored
empty array, so a default in the draft still lets a user deselect everything, while a default
applied in the picker would be re-imposed on every return from step 1 and would leave step 3
submitting something step 2 never showed.

### The category chip's border is 1.5px in both states

Frame 03 draws the unselected chip at 1px and the selected one at 1.5px. `CategoryChip` uses
1.5px for both and changes only the colour, because the chip is auto-sized rather than
full-width: a border that thickened on selection would make it a pixel wider and taller and
nudge, or rewrap, the whole row under the pointer. Half a pixel of border is invisible; a row
that jumps when clicked is not.

The related fact worth knowing before touching that layout: the three rows Figma draws are
`flex-wrap` inside the 600px card, not a grid, and **the browser does not reproduce them.**
Measured in Chrome at 1440x1024: with nothing selected the chips wrap 4 / 4 / 2, because an
unselected chip is about 17px narrower than the same chip with its checkmark; with the mock's
own seven selected they wrap 3 / 3 / 3 / 1, because that third row measures 523px against 520px
of content box. Figma has the same row at 513px, so every chip renders 2 to 3.5px wider here
than the design file measures it.

Two things follow. The 1.5px border on unselected chips is **not** what causes it: at 1px that
row would still come to 521px and still wrap, so reverting the deviation would buy nothing.
And nothing should be done about the rows themselves - CAT-2 and AC1 ask for the ten chips in
the designed **order**, which wrapping preserves. Forcing the picture would mean either a grid,
which breaks at the first long category name, or shaving the designed 10px gap to 8px to win a
coincidence back. Worth a designer glance so the difference is known rather than discovered.

### The budgeting period resolves against one server timezone, not the user's

Every month-scoped figure in the app - the transaction list's period, per-category month
stats, the dashboard's buckets and its days-left tile - is derived by reading a
`YYYY-MM-DD` date against the profile's `monthStartDay`. That needs to know what day it is
now, and PET-35 decided that "now" comes from a single configured `APP_TIMEZONE`
(`Europe/Zagreb`) rather than from UTC or from the user.

UTC was the first instinct and it is wrong for everybody: on the period boundary a
transaction logged just after local midnight falls into the previous period, so the whole
dashboard shows the wrong month for a few hours, twice a month. One configured zone is
right for every user this project actually has, and honest about not solving the general
case.

**The eventual fix is a timezone on the profile, one per user.** It needs a column in the
user scope, a Settings field, and a decision about what to do for accounts that predate it.
None of that exists: no Figma frame collects a timezone, so there is nothing to build
against yet. Until it lands, a user outside the configured zone sees the boundary skew
described above, and the further from `Europe/Zagreb` they are the worse it gets.

Note the config value fails silently when wrong, the same failure class as `use_tursodb` in
`backend/src/database/CLAUDE.md`: nothing crashes, the months are just quietly off.

### Transaction search is case-insensitive for ASCII only

`GET /api/transactions?search=` is a `LIKE '%term%'` on `transactions.merchant`. SQLite's `LIKE`
folds case for ASCII and **only** for ASCII, so `konzum` finds `Konzum` while `kovačić` does not
find `Kovačić`. That is not an exotic edge here: this project's persona is Croatian and its own
example data carries diacritics, so the first realistic search that fails is a plausible one.

**The fix is a normalized search column, which is why it is not in PET-28.** SQLite ships no
`unaccent`, and `PRAGMA case_sensitive_like` would not help - the problem is folding, not
sensitivity. Doing it properly means a `merchant_normalized` column written on every insert and
update, a user-scope migration to add and backfill it, and the search predicate moved onto it.
That is a schema change in a ticket whose whole point was that it stores nothing, and it would
have to be kept in step with `merchant` at three write sites.

Two cheaper things were considered and rejected. Normalizing in JS and comparing in JS means
loading every row to filter it, which is the one thing the index is for. An `ICU` extension is a
native build per platform, and `test-e2e` runs against the embedded driver on a CI runner.

Until then the DTO's own description says so, which is at least honest to a frontend developer
reading the generated types.

**PET-30 is what makes this reachable by a user rather than by a caller.** The transactions page
now renders a no-results state, so a search for `kovačić` against a merchant stored as `Kovačić`
produces a screen saying there are no matching transactions - which is, from the reader's side,
indistinguishable from having none. The copy that ships tells them to try a different search term,
which happens to be correct advice for the wrong reason. Worth revisiting together with the
normalized column rather than separately.

### The Fly MCP server is declined; the flyctl workflow becomes a repo skill instead

`flyctl` ships an experimental MCP server behind `fly mcp server --claude`, evaluated on
2026-08-04 while PET-53 was being set up. Probed over stdio it identifies as `FlyMCP 🚀 0.4.77`
and exposes 60 tools: `fly-apps-*`, `fly-machine-*` (19 of them), `fly-volumes-*`,
`fly-secrets-*`, `fly-certs-*`, `fly-ips-*`, `fly-orgs-*`, `fly-platform-*`, plus `fly-status`
and `fly-logs`.

Declined, for three reasons. It has no `fly deploy` and no `fly launch` tool, so the deploy
itself goes through `flyctl` in a shell either way, and `scale`, `config`, `proxy`, `ssh` and
`mpg` are absent too. Sixty tool schemas would enter every request's context to buy only the
reads that remain. And it flattens the permission surface: `fly-apps-destroy`,
`fly-orgs-delete` and `fly-volumes-destroy` arrive as ordinary tool calls, whereas
`Bash(flyctl status:*)` in `.claude/settings.json` can allowlist the safe reads on their own.

This is the exact inverse of the Turso CLI entry under `## Operational`, and worth holding both
in mind together: there the CLI is broken and the MCP server is the way through, here the CLI is
complete and the MCP server is the partial one. "Is there an MCP server" is not the question;
"which of the two is whole" is. Fly publishes no official skill either, and the `flyio-pack`
results that surface in a search are third-party and unvetted.

**Queued:** a repo skill wrapping `flyctl` via Bash, written once PET-53's deploy actually works
and there is a real sequence to encode. Writing it earlier would invent the workflow rather than
record it.

---

- **A generated HTTP client is not decided.** Types are shared and that part is settled:
  response shapes come out of `backend/openapi.json`, so a caller derives its type rather than
  restating it. What is open is whether the calls themselves get wrapped. A generated client
  would fight Next.js caching, because a Server Component passes `cache` and `next` options
  straight to `fetch`; `openapi-fetch` is the upgrade worth considering, because it delegates to
  global `fetch` and passes `RequestInit` through untouched. Recorded here because the old
  README was its only home outside a frozen plan file.

## Operational

### Unverified registrations accumulate, and hold their address

Registering no longer costs a database, but it still writes a central row that holds the
email against the partial unique index. Nobody has to prove the address is theirs to do it,
so anyone can register an address they do not own and rows pile up for accounts that will
never be verified. The squatting itself is self-healing - a genuine owner's registration
overwrites the stashed payload, and only they can click the link - but the rows are not.
Give unverified rows an expiry and a sweep before this is deployed anywhere public.

### Gmail still threads the login emails

Observed on 2026-08-02 against a real inbox: four links to the same address collapsed into
one Gmail thread, because every message has an identical sender and subject. The user
therefore opens one conversation holding several indistinguishable emails, of which exactly
one works. That is the invalidation behaving as specified, and the sharp edge is now
answerable rather than a dead end: verify returns **409** for a superseded link, distinct
from the 401 every other dead token gets, so the verify page can say "this link was replaced
by a newer one, open the most recent email". If inbox confusion persists anyway, varying the
subject - appending a short local time is the usual trick - remains available, and costs
only a slightly uglier subject line.

### A real send can land in spam, despite correct DKIM

Observed on 2026-08-05: a login email delivered to the project inbox (`spendifico@gmail.com`)
landed in the inbox, the same email to a personal Gmail address landed in spam. Checked at the
DNS level rather than by header, since the Gmail API this project can reach exposes no
`Authentication-Results`: `ohmysmtp._domainkey.spendifico.eu` carries a real DKIM public key -
MailPace's engine descends from OhMySMTP, hence the selector name - so DKIM is correctly
configured and `docs/guides/email.md` step 1 is genuinely done. SPF
(`v=spf1 include:_spf.porkbun.com ~all`) does not authorize MailPace, which is not a gap: without
MailPace's "Advanced Verification" CNAME, sends carry a `Return-Path` on MailPace's own domain, so
SPF authenticates there instead - and DMARC needs only one of SPF or DKIM aligned with the visible
`From:`, which DKIM already satisfies (`d=spendifico.eu`). `_dmarc.spendifico.eu` is
`v=DMARC1; p=none; sp=none;`, monitor-only.

So authentication is not the cause. The likely one is plain sender reputation on a domain that has
sent a handful of emails ever, which is largely orthogonal to DNS and improves with real volume
over time - not something a repo config fixes. Worth knowing before reading a spam-foldered smoke
test as a broken setup.

### In cloud mode the remote is a schema behind, briefly

Observed on 2026-08-03 while smoke-testing verification against Turso Cloud: reading the
central database remotely moments after boot failed with `no such column:
onboarding_payload`, then succeeded a minute later with no intervening deploy.

That is the embedded replica working as designed rather than a migration failure.
Migrations are applied to the **local** replica at boot, and `turso-client.factory.ts`
pushes on the `TURSO_SYNC_INTERVAL_S` beat (60s by default), so for up to one interval the
cloud copy legitimately lacks both the new DDL and any rows written since. The app is
unaffected - it reads and writes its own replica - but anything looking at the remote is:
the Turso MCP, the CLI, Studio, and any dashboard. Worth knowing before someone debugs a
phantom "migration did not run" for a minute, and worth remembering when a deploy is
verified by querying the cloud database directly.

### Revoking a session is a manual tombstone

A39 designs no logout, so there is no endpoint that ends a session. A stolen or unwanted
bearer lives until its `expires_at`, and the only way to kill it sooner is to set
`sessions.deleted_at` by hand - `validate()` filters on it, so the next request with that
token answers 401. `sessions_user_id_idx` exists to make "revoke everything this person
has" one statement. Write the tooling before an incident needs it, not during one.

### A verify that fails twice can orphan a cloud database

Verification creates the user's database and persists the pointer to it inside one
compensated block: if either step fails, it deletes the database and rethrows. If that
delete _also_ fails, a cloud database exists that no row points at, the central row's
`db_url` stays NULL, and every later verification of that account 500s on the name
collision. The failure is logged in full by `VerificationService`, naming the database.

The fix is manual and one step: delete `spendifico-user-<id>` through the Turso MCP server or
the Platform API - never the CLI, for the name-cache reason below. The next resent link then
provisions cleanly.

### Two verifies of one account can overlap, across a resend

`consume()` makes each _link_ single-use, but nothing serializes verification per
_account_: while a first verify is still provisioning (a window of seconds), a resend plus
a click on the new link starts a second verify against the same half-built account. In
cloud mode the second create then collides on the database name and its compensation
deletes the database out from under the first; in local mode both can pass the seed's
empty check and duplicate the starter categories. Reaching it takes a user who resends and
clicks while the first click has not answered yet, so it is accepted at this scale - the
same single-instance reasoning as the throttler and the migration lock. If it ever bites,
the shape of the fix is a per-user in-process queue around provisioning, which is the
`issueQueue` pattern `LoginTokenService` already uses.

### The auth throttler is in-memory

`@nestjs/throttler` uses its default in-memory storage, so the limit is **per backend
instance**: two instances give an attacker twice the budget. Same single-instance
assumption as the migration lock below, and one more reason the deployment runs exactly one
machine.

The proxy half of this entry is resolved, but not on the first try: `TRUST_PROXY_HOPS` shipped
as `1`, and a phone-tether check against an exhausted bucket got 429 - proof every caller was
still landing in one shared bucket. Fly's real topology puts two hops in front of the app for a
direct client (the real address, then the app's own IP, appended by Fly's internal routing
before the request reaches the machine), confirmed by capturing the raw header through a
throwaway diagnostic route and replaying it offline against the same Express stack. The value is
now `2`, and it is exact rather than a safe margin: replaying a client-forged prefix through the
same stack showed 2 correctly ignores it while 3 or higher trusts it, so raising this number
"to be safe" does the opposite. See `backend/CLAUDE.md` for why it is a hop count rather than a
boolean and the full replay methodology, `backend/fly.toml`'s comment for the value, and
`docs/guides/deployment.md`'s per-IP check for how to catch a regression here.

**PET-11 made that second half real, and it is no longer a deployment-time worry.** The
register call goes through a Next Server Action, so the backend sees the *frontend server's*
address on every registration and there is exactly one per-IP bucket for the whole
application. At the default of 30 per 15 minutes, thirty registrations from anywhere lock
out everybody; as an abuse control it now does nothing at all. PET-12's login-link actions
inherit the same shape. The per-email limiter still works correctly, and it is the one that
actually protects this flow, which is why this is degraded rather than broken.

The fix is two-sided and neither half works alone: the frontend has to forward the real
client address, and the backend has to be told how many hops to trust. **Do not bolt on
either half in isolation.** Forwarding a client-supplied `X-Forwarded-For` and then trusting
it makes the limiter *spoofable*, which is worse than blind - and the backend is publicly
reachable, so a custom header like `X-Client-IP` is no better without authentication between
the two apps, which does not exist. Getting this right means deciding the hop count against
the real topology (PET-53's Fly.io deploy, plus whatever sits in front) and probably
authenticating the frontend to the backend. That is its own ticket, not a line in a form.

### Token rotation is manual

By MVP decision every Turso token is created with **Expires: NEVER**: the control-plane
token, the central database token, and every per-user token minted at registration. There
is no refresh logic anywhere, which is the point. The cost is that a leaked token never
dies on its own.

Rotation is a deliberate ops action:

```bash
turso db tokens invalidate spendifico-app        # central database
turso auth api-tokens revoke spendifico-backend  # control plane
```

Per-user tokens live in the central `users.db_auth_token` column, so rotating those means
re-minting and updating the rows. No tooling exists for that yet; write it before it is
needed urgently rather than during an incident.

### The Turso CLI has a stale name cache, and it bites this project constantly

With CLI v1.0.31, `turso db shell spendifico-user-<uuid>` reports "database not found" and
`turso db destroy spendifico-user-<uuid> --yes` exits 0 having done nothing, while `turso db
show` and `turso db list` handle the identical name perfectly.

**Cause, confirmed on 2026-08-01.** The CLI caches the organization's database names in
`~/.config/turso/settings.json` under `cache.database_names`, with a short TTL. `db shell`
and `db destroy` resolve the name against that cache instead of the API. Any database
created by something other than this CLI is therefore invisible to them until the cache
expires. That is _every_ per-user database, since the backend creates them through the
Platform API, which is why `spendifico-app` and `jura` work (both created via the CLI) and
`spendifico-user-*` never does. Nothing to do with the name being long, which was the first
guess.

Note that `turso db list` does **not** refresh the cache, so the error message's advice to
"List known databases using turso db list" does not help.

Three ways around it, best first:

1. **Use the Turso MCP server.** It goes straight to the API and has no cache.
   `read_database`, `evolve_schema` and `delete_database` all worked on a
   freshly-created `spendifico-user-<uuid>` in the same session where the CLI refused.
2. **Expire the cache**, after which the CLI falls back to the API and works:
   ```bash
   python3 -c "import json;p='$HOME/.config/turso/settings.json';d=json.load(open(p));d['cache']['database_names']['expiration']=0;json.dump(d,open(p,'w'))"
   ```
3. **Use the Platform REST API directly**, which is what the backend does:
   ```bash
   TOKEN=$(grep '^TURSO_ORG_TOKEN=' backend/.env | cut -d= -f2-)
   curl -X DELETE "https://api.turso.tech/v1/organizations/<org>/databases/<name>" \
     -H "Authorization: Bearer $TOKEN"
   ```

Worth retesting after a CLI upgrade; this looks like a plain bug rather than a design
decision. Inspecting the central directory is unaffected either way:
`turso db shell spendifico-app "select id, email from users;"`.

### Text primary keys are nullable at the database level

SQLite's historic quirk lets a non-INTEGER primary key hold NULL, and the Turso engine
inherits it (verified with a direct insert). Both `id` columns carry `.notNull()` in the
Drizzle schemas, but drizzle-kit's sqlite DDL generator emits no `NOT NULL` for a
primary-key column, so the constraint exists only app-side: every id comes from `newId()`.
Two limitations were confirmed in `drizzle-kit@1.0.0-rc.4` while trying to fix this
properly:

- the sqlite **differ only sees created and dropped entities**, so any in-place change to
  an existing index or column (a new `where` clause, a new `NOT NULL`) generates
  `no_changes`. The partial email index worked around it by renaming the index;
- the sqlite **DDL generator drops `notNull` on primary-key columns** entirely, so even a
  rename-style workaround cannot produce the constraint.

The `.notNull()` stays in the schemas so a future drizzle-kit that fixes the generator
picks it up on the next diff. If that lands, expect a table-recreate migration for both
scopes; review it rather than being surprised by it.

### Changing an email address leaves three loose ends, all accepted

`PATCH /api/profile` moves the login identifier, and PET-45 took three residuals knowingly
rather than by omission.

**The uniqueness pre-check can lose a race.** The update reads `users` for the requested
address and answers 409 before writing anything, but two concurrent PATCHes claiming one new
address both pass that read. The loser then violates the partial unique index _after_ its
profile fields have already persisted, and answers a logged 500 rather than a 409. It is
retry-safe - the retry gets an honest 409, or succeeds - and it needs two people racing for
one address in the same instant. Closing it means sniffing a driver-specific constraint error
and translating it, which is worth doing the day this backend runs more than one instance,
since the same window is what `sessions` and `login_links` already tolerate.

**Login links already in flight keep working, and they point at the old address.** A link is
a row keyed to a user id, not to an email, so one issued before the change still verifies
afterwards - it just arrived in an inbox the account no longer answers to. That is in spec
rather than a bug: AC6 governs where _subsequent_ links are sent, and the window is bounded
by `LOGIN_LINK_TTL_M`. Standard account-takeover hygiene would supersede every live link on
an address change, which is one `UPDATE` in `LoginTokenService` whenever it is wanted.

**Nothing tells the old address it lost the account.** The usual defence against a hijacked
session quietly moving the login identifier is a notification to the previous address, and
there is none: the change answers 200 and only the new address ever hears about it. A39
designs no logout and no security-alert mail, so adding one is a product decision before it
is a code one.

### Autostop is available as a cost lever, and was measured before being rejected

`auto_stop_machines = "stop"` would take the machine charge from roughly $3.32/month to near
zero, leaving only the $0.15 volume. It was configured, deployed and measured on 2026-08-05,
then reverted, and the numbers are recorded so nobody has to repeat the experiment.

It works correctly. The proxy logs `has excess capacity, autostopping machine`, sends the
configured `kill_signal`, and the shutdown flush completes - both bracket lines were observed.
The 30s health check does not keep the machine alive. It does not breach the single-instance
rule either, since autostart starts *the* machine rather than adding one.

Three reasons it was rejected. The resume costs about **15 seconds** to serve the first request
after idling, against ~200ms warm. Fly exposes **no way to tune the idle delay** - the stop loop
runs on its own schedule and decides on excess capacity, and `idle_timeout` is an HTTP
connection setting rather than this one. And `register` floats its token issue and mail send
while `onApplicationShutdown` does not await that promise, so a stop landing in that window
answers 202 and never sends the email, recoverable only through "Resend link".

Reconsider it if the bill matters more than a first impression, or pair it with a scheduled
warm-up ping during the hours that matter.

### The Swagger UI is public on the deployed API

`SwaggerModule.setup` registers its routes on the HTTP adapter rather than as Nest controllers,
so the global `SessionGuard` never sees them and `/api/docs` needs no bearer. That was harmless
while the only reader was a developer on localhost; it is a deliberate exposure now that
`https://spendifico-api.fly.dev/api/docs` answers 200 to anyone. It leaks no data, only the shape
of the API, and it is genuinely useful to the frontend - but it should be a decision rather than
something discovered. Gating it would mean serving the document behind a route that the guard does
cover, or not serving it in production at all.

### `/api/hello` stands in for a real health check

`.github/workflows/deploy.yml`'s post-deploy assertion curls `/api/hello` because it was already
the one public, DB-free route - not because anyone designed it as a health check. It only proves
the process answers HTTP; it says nothing about DB reachability, migration state or which commit
is actually running, so a deploy can go green while the database connection is broken. A real
`/api/status` endpoint (DB ping plus the deployed commit SHA or version, still unauthenticated so
the assertion needs no token) should replace it in both `deploy.yml`'s assertion step and
`docs/guides/deployment.md`'s verification section.

### A reclaimed insight run can still overlap the run that replaced it

PET-56 made an abandoned `generating` row self-heal after `GENERATING_STALE_AFTER_MS`, and every
write in `runGeneration` is conditional on the row still being `generating`, so a reclaimed run
cannot resurrect its own row, stamp a stale `generated_at` over the newest set, or leave cards
hanging off a `failed` one. What the guard does **not** do is stop the two runs existing at once:
past the cutoff a new run starts while the old one may still be working, and the embedded driver
refuses overlapping transactions rather than queueing them, so one of the two completion
transactions can simply fail and mark its run `failed`. The user sees a regenerate that did not
take and retries; nothing is corrupted.

Unreachable while generation is rule-based, because a run settles in well under a second and
nothing can be five minutes stale while alive. It becomes reachable the moment a slow
`LlmInsightGenerator` lands behind the `INSIGHT_GENERATOR` seam, which is the case the cutoff was
sized for in the first place. The shape of the fix is the same one the overlapping-verify entry
above names: a per-user in-process queue around the run, the `issueQueue` pattern
`LoginTokenService` already uses. Reaching for a heartbeat column instead - a run proving liveness
so the cutoff never fires on a live one - is the alternative, and the more invasive of the two.

### The insights single-run index ignores tombstones, so a soft-deleted run would wedge it

`insight_sets_generating_idx` is partial on `status = 'generating'` and says nothing about
`deleted_at`, while every query around it filters `deleted_at IS NULL`: both `hasRunInFlight` and
the stale-run reclaim in `generate()` would skip a tombstoned `generating` row, but the index would
still be holding it. A soft-deleted run in that state therefore 409s every future `POST
/api/insights/generate` with no API path to clear it, which is exactly the wedge PET-56 removed for
the un-tombstoned case.

Unreachable today: nothing anywhere soft-deletes an insight set, and the only writer of that column
would be code that does not exist. It is recorded rather than fixed because
`categories_fallback_idx` has the identical asymmetry (partial on `is_fallback = 1`, while
`fallbackId` filters `deleted_at IS NULL`), so changing one and not the other would be worse than
leaving both consistent. If either is ever fixed, fix both, and the fix is to put the tombstone in
the index predicate rather than to take it out of the queries. Manual recovery in the meantime is
one statement: clear the row's `deleted_at`, or set its `status` to `failed`.

### Insight sets accumulate, and nothing prunes them

Every run leaves a row behind for good: `ready` sets are superseded by `generated_at DESC` rather
than removed (AC5), and `failed` rows are now written by both a genuinely failed run and PET-56's
stale-run reclaim. Only the empty-account placeholder is ever deleted. So a user who regenerates
daily accrues a row and a card set per run, and the read pays for it in an `ORDER BY generated_at`
over an unindexed column plus a `deleted_at IS NULL` scan.

Nothing to do at this scale - a set is a handful of short rows, and the screen offers one
regenerate button - and it is in this section rather than under Scaling because the shape of the
answer is a policy decision, not a capacity one: keep the last N sets, or keep a window of history,
or keep everything and index `generated_at`. Worth settling before any automatic or scheduled
regeneration, which is what would turn a slow accrual into an unbounded one.

---

## Scaling, when it is actually needed

None of these matter at current scale. They are recorded so the limits are known rather
than discovered.

- **Connection cache is unbounded.** `UserDatabaseService` keeps every opened user database
  in a `Map` with no eviction. An LRU with an idle timeout is the obvious next step.
- **No cross-process migration lock.** A single backend instance is assumed. Two instances
  opening the same user database for the first time could both run its migrations.
- **Enumeration resistance is argued, not measured.** With the mail send floated off the
  request, every path through the two auth routes answers after at most one indexed read
  and one write into the local central database, so the timing difference should be
  negligible. The weakest spot is `register` against a verified account, which answers
  after the read alone - the only path that skips the write entirely, and therefore the
  most distinguishable one. Nobody has profiled the residual. If this ever has to be more
  than best-effort, it needs a measurement rather than an argument.
- **Login links and sessions are never purged.** Used, superseded and expired rows
  accumulate in `login_links` forever, and so do expired and revoked rows in `sessions` -
  one per login per device, none of which anything removes. Harmless at this scale, and the
  same purge policy that covers tombstones can cover both.
- **The embedded driver cannot overlap transactions.** One connection per database, and a
  second `db.transaction()` while one is open fails with "cannot start a transaction
  within a transaction" rather than queueing. `LoginTokenService.issue()` chains its own
  transactions in-process; a second transactional call site would need the same care, or
  a shared queue pushed down into the database layer.
- **Soft deletes are never purged.** Every table carries `deleted_at` for future sync, and
  reads filter it, but nothing removes tombstones. A purge policy is deferred until the
  sync design needs one. `transactions` is the first table a user can actually delete from
  through the API, so it is where this stops being theoretical: `DELETE
/api/transactions/:id` answers 204 and the row stays. PET-27's AC3 said "no soft-delete
  record"; that wording was re-derived from the delete dialog's copy without the sync
  consideration, and a hard delete risks row resurrection under delete-update conflicts once
  devices hold replicas. The tombstone is invisible through every endpoint, which is what
  "permanently" means to a client.
- **`toCents()` and `fromCents()` assume two-decimal currencies.** `src/common/money.ts` is
  `Math.round(v * 100)` and `v / 100`: fine for USD and EUR, wrong for JPY (zero decimals)
  and KWD (three). The API accepts any ISO 4217 code, so fixing it means a per-currency
  exponent table rather than a change at those two call sites. Note the blast radius grew
  with PET-27: it was one profile field written once at verification, and it is now every
  transaction amount in both directions, so a wrong exponent would misreport every number
  the dashboard shows rather than just a budget. PET-45 added a second dimension to it:
  `PATCH /api/profile` lets a user change `currency` at will, while nothing rescales the
  cents already stored under the old one. Switching EUR to JPY today keeps every stored
  integer and simply relabels it, which is arguably the least surprising behaviour but is a
  decision nobody made - whatever the exponent table does, it also has to say what a
  currency change means for existing rows.
- **The transaction list is unbounded, by design and only for now.** `GET /api/transactions`
  returns every match in one response, because A11 and TRN-6 record that the design has no
  pager anywhere and the table simply scrolls. Fine at a few hundred rows a month and not fine
  forever: nothing caps the response, so a long-lived account eventually serializes its whole
  history on every page load. The natural next step is a `limit` with a `hasMore` flag, and
  `total` already exists as its own field precisely so that day does not silently turn TRN-2's
  badge into a page count - a frontend reading `transactions.length` would do exactly that.
  Whoever adds it also has to decide what the period filter's default means for a first page.
- **Offline conflict policy is undecided.** The schema is shaped for last-write-wins
  (UUIDv7 keys, epoch-ms timestamps, tombstones), but no client syncs yet and clock skew is
  unaddressed.

---

## Housekeeping

- **`docs:check` cannot see a shorthand path, so a citation of a deleted file survives it.**
  Check 4 resolves every backticked *repo-root-relative* path, which is the convention
  `docs/agents/conventions.md` sets - but the agent files are full of deliberate shorthand
  (`ui/Button`, `lib/format.ts`, `app/setup/draft.ts`), and the regex never looks at those. PET-57
  deleted six components and the code review that followed found five citations of them left in
  permanent docs and comments, none of them mechanically catchable: `frontend/src/app/CLAUDE.md`
  wrote `ui/ListRow.tsx`, and two were inside `.ts` comments, which the script does not read at
  all. All five are fixed; the gap that let them through is not. The fix is a check that tries a
  shorthand path against a small set of known bases (`frontend/src/`, `backend/src/`) and fails
  only when it looks like a file - contains a `/` and an extension - and resolves under none of
  them. Deliberately not done in the review commit: a first run would have to be triaged across
  several hundred references, and getting that wrong turns the one check that keeps these files
  honest into a step people learn to skip. Extending it to comments in `frontend/src/**` and
  `backend/src/**` is the same shape and doubles the value.
- **The month window is reached through `CategoriesService`, and now has three callers who
  should promote it.** `currentWindow`, `previousWindow` and `monthStatsFor` are public on that
  service so the transaction reads and PET-20's dashboard compose one aggregation instead of
  writing three - the right outcome, reached by the slightly wrong route, since both a
  transaction read and the dashboard read now inject a categories service to learn what month
  it is, and the dashboard reads the profile row up to three times in one request for it (see
  `backend/CLAUDE.md`, Dashboard). The tidy end state is a small `PeriodService` under
  `src/common/` owning the profile read and the two windows, with `CategoriesService` keeping
  only `withSpend` and the status bands. It was not done in PET-28 or PET-20 because both sit in
  a three-branch stack on top of the branch that had just landed the code, and moving `period()`
  would have dragged the churn through however many rebases were still ahead to buy a seam
  nothing yet measurably needed. The third caller the previous note was waiting for has now
  landed; what is left is the stack merging so the refactor has no rebase left to pay for.
- **Repo-wide `prettier --check` is commented out in CI.** 55 files predate the Prettier
  config and the step would fail on a fresh clone. To enable: run `npx prettier --write .`
  once, commit that, then uncomment the step in `.github/workflows/ci.yml`. Note that
  `.lintstagedrc.js` only formats files under `backend/` and `frontend/`, so root-level
  Markdown such as this file is not covered by the pre-commit hook and has to be formatted
  by hand.
- **The swagger plugin renders `@IsPositive()` as `minimum: 1`.** Right for an integer,
  wrong for anything with decimals, and it publishes a constraint the API does not
  actually enforce. `RegisterDto.monthlyBudget` carries an explicit
  `@ApiProperty({ minimum: 0, exclusiveMinimum: true })` to correct it, and PET-27 added the
  second and third compliant fields, `amount` on both `CreateTransactionDto` and
  `UpdateTransactionDto`, PET-45 a fourth in `UpdateProfileDto.monthlyBudget`; any future
  money field needs the same line, and
  `test/openapi.e2e-spec.ts` now pins every one of them against a regression. Check the generated `backend/openapi.json` when adding a DTO
  rather than assuming the derived constraints are faithful - `@ArrayMaxSize` is simply
  dropped, for instance, which is a smaller version of the same thing. Two more gaps of the
  same permissive shape were closed by PET-45, which had to publish the same two fields a
  second time on `UpdateProfileDto` and would have shipped both defects twice:
  `currency` now carries `pattern: '^[A-Za-z]{3}$'` with the ISO 4217 list named in its
  description rather than a 180-entry enum that drifts the moment the standard does, and it
  is case-insensitive because the DTO uppercases before validating; `monthStartDay` now
  carries `@ApiPropertyOptional({ type: 'integer' })`, with the derived `minimum`/`maximum`
  merging in beside it. The two DTOs are written byte-identically and an
  `it.each(['RegisterDto', 'UpdateProfileDto'])` pins both, because one schema drifting from
  the other is exactly how a shared field goes wrong. A third gap is cosmetic
  rather than permissive: `TransactionResponseDto.createdAt`/`updatedAt` are ISO 8601
  instants but publish as bare `type: string` with no `format: 'date-time'`, because the
  plugin cannot read that out of a doc comment. Harmless today - the generated TypeScript
  type is `string` either way - but if PET-28's read DTOs want the published contract to
  say what the string is, each instant field needs an explicit
  `@ApiProperty({ format: 'date-time' })`.
- **The Storybook story smoke harness is duplicated three times** (down from four: PET-57
  deleted the Foundations copy with its section). The same ~30 lines of
  story discovery and `renders without throwing` live in
  `frontend/src/components/ui/ui.stories.test.tsx`, `src/app/(app)/shell.stories.test.tsx`
  and, since PET-8, `src/app/screens.stories.test.tsx`. Each exists because it asserts its own
  section's title prefix - `/^Components\//`, `/^Shell\//`, `/^Screens\//` - and that
  assertion is the one thing each is there to make unambiguous. Three copies is at the
  lift-it-into-a-helper threshold. The shape: one exported function taking the `MODULES` array and a
  title-prefix `RegExp`, returning nothing and registering the three `describe` blocks, so each
  suite shrinks to an import, a `MODULES` literal and one call. Lifting three existing suites
  was out of scope for the ticket that added the fourth; do it before a fifth section appears,
  which PET-9 onward will not need but a future "Modals" section would. PET-9 added a module to
  `screens.stories.test.tsx` rather than a section, as predicted. Whoever
  lifts the helper should carry over two behaviours that copy has now had to document - it
  applies no `decorators`, so anything a story needs must live in its `render`, and a screen
  reaching `useRouter` needs `next/navigation` mocked in the suite.
- **The `@/` alias does not work inside `jest.mock()`, and it is not the route group's
  parentheses.** `jest.mock('@/lib/session')` fails with "Cannot find module" from anywhere,
  which PET-8 reproduced from `src/app/` and `src/lib/` with no parentheses in the path. The
  resolved Jest config carries no `moduleNameMapper` entry for `@/*` and a null `modulePaths`,
  so the alias is simply unresolvable at runtime; plain `import`s work because SWC rewrites
  aliased specifiers at transform time from tsconfig `paths`, while `jest.mock`'s argument is a
  string the resolver sees verbatim. Use a relative specifier, and name the same specifier in
  the accompanying `import` so the pair reads as one thing. `app/(app)/layout.test.tsx` used to
  blame the parentheses and now records the real cause; CLAUDE.md's "Two Jest traps come from
  the parentheses" note was corrected to one. Adding
  `moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }` to `jest.config.ts` would fix it
  repo-wide and is worth doing next time somebody is in that file.
- **`created_at` and `updated_at` can differ by a millisecond on insert.** Every table
  defaults the two from independent `$defaultFn(() => new Date())` calls, so an insert that
  straddles a millisecond boundary writes two different values - observed on a local
  transaction create as `.824Z` against `.825Z`. Harmless in itself, but it means
  `updatedAt === createdAt` is **not** a sound test for "never edited", and any code or test
  tempted to use it needs a tolerance instead. PET-27's e2e originally asserted equality and
  passed only by luck; it now asserts a sub-50ms window. Making them genuinely identical
  would mean the service passing one timestamp explicitly into both columns, which fights
  `$onUpdateFn` and deviates from the schema-level default every other table uses - not worth
  it unless something real needs exact equality.
- **No operation documents a 500, deliberately.** Resolved with PET-14: every route can 500
  through `AllExceptionsFilter`, so per-operation documentation restated the same
  non-actionable fact everywhere and widened every generated response union. The document
  description says it once instead, and `test/openapi.e2e-spec.ts` pins that no operation
  declares a 500. Keep new endpoints consistent with that.
- **Nothing stops one `DATABASE_DIR` from serving both persistence modes, and the failure is
  silent.** Both modes use the same paths, `app.db` and `users/<db-name>.db`, but cloud mode
  opens them as sync replicas and local mode as plain files. Rows written while the file was a
  plain local file are not in the sync engine's change log when it later adopts that file, so
  `push()` never sends them, while every later write pushes normally - the replica syncs, those
  rows do not. PET-60 hit it: a local seed run put `dummy@spendifico.eu` in the central replica,
  a later cloud run pushed everything except that row, and the deployed backend could not find
  the account, answering the usual empty 202 and mailing nothing. Diagnosing it took comparing
  the local replica against Turso row by row, because every local check looked healthy. The
  repair is to delete the central replica and let it re-bootstrap; `docs/guides/seeding-dummy-data.md`
  and `backend/src/database/CLAUDE.md` both carry that now. A guard would be better than a
  warning - refusing to open a plain local `app.db` as a replica, most likely by checking for the
  engine's `-info` sibling before `connectSync`, or by giving the two modes different filenames -
  but it belongs in `UserDatabaseService`/`turso-client.factory.ts` rather than in the seed script
  that happened to expose it, so it is recorded here rather than fixed on a tooling ticket.
