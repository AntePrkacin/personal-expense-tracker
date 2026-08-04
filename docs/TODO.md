# TODO

Running list of work that is known, deliberately deferred, or unverified. Not a backlog of
ideas: everything here has a concrete reason to exist and enough detail to act on without
rediscovering the context.

Add an item when you defer something, and delete it when it lands. Items that grow past a
paragraph or two probably deserve their own plan in this directory.

---

## Deferred by design

These were decided against deliberately. Reasons are recorded so the decision is not
relitigated by accident.

### The frontend half of verification: the verify page, the cookie, the dashboard

The backend is done: `POST /api/auth/verify` spends a link, provisions the account and
returns a session, and `GET /api/auth/session` answers who the bearer is. Nothing on the
frontend calls either yet - there is no verify page and no session cookie. There _is_ now a
dashboard to land on: PET-19 built the `(app)` shell and the four routed views. The
session-scoped read that replaces the deleted proof-of-stack `GET /api/users/:id` also
exists now: PET-45 shipped `GET /api/profile` and `PATCH /api/profile`. What is left here is
entirely the frontend's half.

**The frontend no longer calls the backend at all.** PET-19 replaced the scaffold greeting
page with a `redirect('/dashboard')`, and its `GET /api/hello` fetch was the only wire between
the two apps. `BACKEND_URL` is consequently read by nothing, and no frontend test exercises
the generated contract. The drift gates still run, so `api.d.ts` cannot rot silently, but the
end-to-end proof is gone until this item lands. **This is the first thing the work here
restores.**

**Three things in the shell are stubs waiting on this, all deliberate and all loud.**

`frontend/src/lib/session.ts` holds `requireSession()`, called once by `app/(app)/layout.tsx`
and currently letting every request through - which is PET-19's explicit deferral of its own
AC5. Its doc comment is the specification: read the cookie, lift it into
`Authorization: Bearer <token>`, call `GET /api/auth/session`, redirect to the access flow on
401 or absence. **The cookie's name is still undecided and this work picks it**; PET-19
deliberately did not, so as not to hand over a contract it had not chosen.

The same file now holds a second seam, `hasSession()`, called once by `app/page.tsx` and
currently answering `false` for everybody - PET-8's equivalent deferral. `/` is the app's
front door and branches on it: no session renders 01 Welcome, a live session redirects to
`/dashboard`. Until this work lands, that means **every visitor lands on Welcome and
`/dashboard` is reached by typed URL only**. The two functions are separate because the
shell wants "let me through or send me away" while the root route wants a fact it can branch
on, but they want the same underlying read, so give them a shared helper rather than two
fetches. The redirect target `requireSession()` needs is no longer unnamed either: `ACCESS_ROUTES`
in `frontend/src/lib/routes.ts` declares `/login`, and Welcome is at `/`.

`PLACEHOLDER_PROFILE` in `app/(app)/layout.tsx` feeds the sidebar footer Figma's own sample
data. It cannot be fixed without both halves: names live in the per-user `profile` row and the
email on the central `users` row, which is exactly what `GET /api/profile` stitches together -
so the endpoint is no longer the blocker, only the cookie above is.
`ui/Sidebar` itself is clean - its test pins that those sample strings appear nowhere in the
component - so this is one constant in one file.

Three constraints that work inherits.

The token travels in a **query string**, so it lands in browser history and potentially a
`Referer` header - the accepted norm for magic links, bounded by the short single-use
window, but it means the verify page must load no third-party resources and must consume
the token immediately. (It no longer reaches backend access logs: verify takes the token in
a POST body.)

A failed send leaves the user with **zero** live links rather than the one they had, because
`issue()` supersedes the previous link before sending; "Resend link" (VER-2) is the only
recovery, and it is the design's own answer (A36).

**The wait behind the verify click is undesigned on purpose, and blank until measured.**
A33/A19 design no loading state, and verify is one blocking POST: on a first verify the
user who clicked the email link sits on a blank tab with only the browser's own loading
affordances while provisioning runs (estimated seconds; a returning user's verify is
effectively instant). A blank-and-brief wait after clicking a link is the normalized
OAuth/SSO-redirect experience and needs no design if the number stays small. The frontend
branch's first job is therefore to measure real cloud-mode provisioning latency, then
choose: keep the plain page-load wait, or take a designed waiting state to the designer.
A streamed "Signing you in..." shell is technically cheap (Suspense), but it is an
in-page loading state, exactly what the design deliberately lacks, so that path is a
design conversation before it is code.

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

### The rest of the data model

`users`, `login_links` and `sessions` (central) and `profile`, `categories` and
`transactions` (per user) exist. `insights` arrives with its own feature as an ordinary
migration under `backend/drizzle/user/`. `categories` has its table and a
`STARTER_CATEGORIES` constant but no CRUD, no per-category stats and no allocation summary.

`transactions` has its three write endpoints (PET-27) and **no reads whatsoever**. The list,
the month windows, the trend buckets, the donut and every card are PET-28's and the
dashboard tickets', and all of them are computed on read - the table carries no month column
and no stored aggregate on purpose, so nothing can go stale. A read implementing them needs
the profile's `monthStartDay` to attribute a `date` to a month; both indexes it will want
(`date`, `category_id`) already ship in the first migration.

Starter category colors are the real ones, read per chip from the design's variable
bindings in Figma frame 03 (node 43:705) and checked against a render. Two open design
questions remain, both for the designer rather than for code:

- **The palette has eight colors for ten chips**, so Subscriptions reuses Transport's blue
  and Other reuses Bills' orange. Colour therefore cannot identify a category on its own,
  which constrains any later legend, chart or filter that wants to key on it.
- **A7's conflict sits on the same seam.** The starter set includes Bills and
  Subscriptions, which never reappear, while later screens show Health and Other - and the
  duplicated colors are exactly on those chips. All ten are seeded until it is resolved.

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
named one. That window is closed the moment PET-52 lets a real account verify. `userDbName(id)`
derives the name and `users.db_name` persists it, so a second rename would strand every
existing account silently - `getUserDb` creates a fresh empty file instead of opening the
synced one, and `deleteUserDb`, which derives the name from the id on purpose because its
caller may have no row to read, targets a database that is not there. Doing it then means
`db_name` first becoming the source of truth wherever a name is needed, with the constant
applying to new users only, which costs `deleteUserDb` that no-row compensation path. That is
a real change to `UserDatabaseService` rather than a rename, and infrastructure naming no user
ever sees does not need to follow the brand a second time.

### The logo tile and nav pills use radii that are not on the scale

Figma bound the logo tile and the four nav pills to a raw **10px** corner rather than to a
radius variable, and Foundations offers only `Radius/SM` (8) and `Radius/MD` (12).
`ui/Sidebar.tsx` therefore uses a literal `rounded-[10px]`, which matches the design exactly
and is registered in `utilities.test.ts` so it is findable.

Worth a designer answer: either 10 joins the scale as a token, or these two corners snap to
8 or 12. Nothing breaks either way, since a literal compiles without a token lookup, so this
is a consistency question rather than a bug.

The **two header pills** (the month select and the search field) bind the same raw 10px, so
`app/(app)/dashboard/MonthPill.tsx` and `transactions/SearchPill.tsx` carry the literal too.

**PET-8 found a third value, which is what turns this from a nit into an answerable
question.** The access screens draw the same logo lockup at 38px instead of the sidebar's
34px, and Figma binds that larger tile to a raw **11px** - so `components/LogoLockup.tsx`
carries `rounded-[11px]`. One lockup at two sizes with two different off-scale radii is much
more readily a pair of slips than a designed progression, which makes "snap both to 12" the
likely answer. Whatever the designer decides covers all five places at once.

### The page header's two inert controls

The month select (04, node 21:61) and the search field (06, node 26:142) are drawn but do
nothing. They are plain `div`s rather than a `<select>` and an `<input>`, so neither announces
itself as operable, and `app/(app)/pages.test.tsx` pins that: `queryByRole('combobox')` and
`queryByRole('textbox')` both have to stay empty.

Each is waiting on something different, which is why they are one item and not two.

The **month select** is inert by the design's own decision. A8 says only October exists in the
file, so it renders the current period and stays non-functional until month navigation is
designed. Making it real needs a designed control first, not just code.

The **search field** is inert because there is nothing to filter. TRN-1 _does_ describe a real
search input, so this one is a chosen behaviour rather than a read one: a box that accepts
typing and filters nothing is a worse lie than one that plainly does nothing. PET-28's
transaction list is what turns it into an `<input>` plus the state that owns the query.

### The header period ignores the profile's month start day

`monthOverline()` and `monthLabel()` in `lib/format.ts` format the **calendar** month, and
A9 says the profile's `monthStartDay` is what defines the period used by "This month" filters
and "days left" math. The display is correct for the default of 1 and wrong for any other
value, which no user can set yet.

Fixing it is not just threading a number through: with `monthStartDay = 15`, the period
spanning 15 Aug to 14 Sep has no single month name, and the design draws no label for that
case. So this needs a designer answer alongside PET-45's read, not only the value.

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

### The Welcome panel's circles are filled with an unbound hex

Figma fills both decorative circles on frame 01 (nodes 41:712 and 41:713) with `#4F45E6` at
28% and 18% opacity, bound to no variable. That is one hex digit off `--color-brand-accent`
(`#4F46E5`), which makes it a slip rather than a decision.

`DecorativePanel.tsx` ships `bg-brand-accent` under those opacities instead. Hard-coding
`bg-[#4F45E6]` would be the first raw colour in the entire frontend and would defeat the
point of clearing Tailwind's palette, and the difference is one unit of green seen through
28% opacity over `#101720`.

Recorded so the designer can confirm and bind the layer, and so nobody later "corrects" the
code back to the raw hex from a screenshot. The exported SVGs were inspected while
implementing: plain solid circles, no blur and no gradient, which is why they are `div`s with
a background rather than assets - worth knowing before somebody reaches for `blur-*`.

### The design shows whole dollars and `formatCurrency` always emits cents

`formatCurrency(1240)` returns `"$1,240.00"`, pinned in `frontend/src/lib/format.test.ts`,
while frame 01's sample card and frame 04's real budget card both draw `"$1,240"`. So the
shared formatter cannot produce the string the design asks for.

Welcome sidesteps it: its figures are permanent marketing copy, so `SAMPLE_BUDGET` holds
literal strings and `ui/Stat.stories.tsx` already hard-codes `'$1,240'` for the same reason.
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

### The frontend is desktop-only, and Welcome is the first genuinely public page

There is not one responsive utility in `frontend/src` - no `sm:`, `md:` or `lg:` anywhere -
which is a consistent decision for an app behind a login, drawn at 1440x1024.

Welcome is the one screen a stranger might open on a phone. Its 560px fixed panel plus 80px
gutters squeezes badly below roughly 900px, and the panel's contents are absolutely
positioned so they clip rather than reflow. Staying consistent with the repo was the right
call for PET-8 and this is out of its scope, but the gap is recorded here so it is known
rather than discovered by a visitor. The cheapest first move, if it matters, is hiding the
decorative panel below a breakpoint - it carries no information the left column lacks, which
is also why it is `aria-hidden`.

### Figma's page header is 2px shorter on two of the four screens

Bottom padding is 20px on 04 Dashboard and 14 AI Insights, and 18px on 06 Transactions and 17
Settings. `PageHeader` uses 20px everywhere, on the reading that this is a Figma inconsistency
rather than a designed distinction - nothing else about the four headers differs, and no
plausible reason for the two screens to be shorter exists.

Cheap to confirm and cheap to change if the answer is no; recorded so nobody re-derives it
from a screenshot.

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

**Nothing clears the draft.** Back must not, because AC5 forbids it, and no reset control is
designed anywhere. So an abandoned onboarding shows stale values in that tab until it closes.
PET-11 should clear it on a successful register, which is the only natural moment.

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

### `/setup` is not gated on a session

`/` sends a signed-in visitor to the Dashboard and the `(app)` shell gates itself, but `/setup`
deliberately does neither. PET-9 had no session to read - both `lib/session.ts` seams are still
stubs - and a third call site would have been a claim it could not test.

So a signed-in user can reach onboarding by typed URL and re-run it. Harmless today, because
nothing is persisted until step 3 and the account already exists; worth a decision when PET-52
makes a session readable. The cheapest answer is the same `hasSession()` branch `app/page.tsx`
already uses.

### The currency select has one option, and two things wait on A6

`frontend/src/app/setup/BudgetForm.tsx` renders `CURRENCY_OPTIONS` with the single
`USD - $` the design file contains. Two consequences, both of which resolve themselves the
day A6 is answered and a second currency appears:

Its `onChange` **cannot fire**, so `patchDraft({ currency })` is unreachable from the UI and
untested through it. The merge semantics that handler relies on are covered directly in
`app/setup/layout.test.tsx` instead, which is the part PET-10 actually depends on.

And a stored `currency` is not checked against the option list. `parseDraft` canonicalises
the budget but only type-checks the currency, so a draft carrying `EUR` - devtools, or a
build that offered more options - lands on a `<select>` with nothing matching. The browser
then shows the first option while the draft still says `EUR`, and step 3 would post it.
Harmless while one option exists; the fix, when the list grows, is for `parseDraft` to fall
back to `DEFAULT_CURRENCY` for a code it does not recognise, which means the allowlist has
to move out of the form and into `draft.ts` beside the rest of the shape.

### A29's inline error pattern is now live rather than illustrative

`ui/Field`'s red-border-plus-one-line treatment shipped with PET-17 but nothing rendered it in
a real flow - only `Input.stories.tsx`'s `WithError` story. PET-9's budget validation is the
first live use, with the string `Enter an amount greater than 0.` taken verbatim from that
story and from `Field`'s own doc comment rather than invented.

That raises the priority of the designer sign-off A29 already owed. The pattern is now what
users see, and every remaining form ticket (PET-10 through PET-12, Settings, the transaction
forms) will copy it.

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

### The auth throttler is in-memory, and blind behind a proxy

`@nestjs/throttler` uses its default in-memory storage, so the limit is **per backend
instance**: two instances give an attacker twice the budget. Same single-instance
assumption as the migration lock below.

Separately, the per-IP limiter (and the fallback key for bodies with no usable address)
keys on `req.ip`, which behind a reverse proxy or load balancer is the proxy's address
unless Express `trust proxy` is set. Every caller would then share one per-IP bucket, which
throttles everybody at once and protects nobody in particular; the per-email limiter is
unaffected either way. Set it when the deployment topology is known, not before - trusting
the header without a proxy in front lets a client spoof its own key.

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

### Deployment must ship `backend/drizzle/`

Migration folders are resolved from `process.cwd()`, because `nest build` emits only
JavaScript into `dist/` and leaves the SQL behind. Any future Dockerfile has to `COPY` the
`drizzle/` directory next to `dist/`, or the app boots and fails to migrate.

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
- **Offline conflict policy is undecided.** The schema is shaped for last-write-wins
  (UUIDv7 keys, epoch-ms timestamps, tombstones), but no client syncs yet and clock skew is
  unaddressed.

---

## Housekeeping

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
- **The Storybook story smoke harness is now duplicated four times.** The same ~30 lines of
  story discovery and `renders without throwing` live in
  `frontend/src/components/ui/ui.stories.test.tsx`, `src/app/(app)/shell.stories.test.tsx`,
  `src/stories/foundations/foundations.stories.test.tsx` and, since PET-8,
  `src/app/screens.stories.test.tsx`. Each exists because it asserts its own section's title
  prefix - `/^Components\//`, `/^Shell\//`, `/^Foundations\//`, `/^Screens\//` - and that
  assertion is the one thing each is there to make unambiguous. Four copies is past the rule
  `utilities.test.ts` sets for its own harness ("if a third consumer appears, lift it into a
  helper then"). The shape: one exported function taking the `MODULES` array and a
  title-prefix `RegExp`, returning nothing and registering the three `describe` blocks, so each
  suite shrinks to an import, a `MODULES` literal and one call. Lifting three existing suites
  was out of scope for the ticket that added the fourth; do it before a fifth section appears,
  which PET-9 onward will not need but a future "Modals" section would. Still four after PET-9,
  as predicted: it added a module to `screens.stories.test.tsx` rather than a section. Whoever
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
