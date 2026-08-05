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

### The rest of the data model

`users`, `login_links` and `sessions` (central) and `profile`, `categories`,
`transactions` and the insights tables (per user) exist. PET-41 added `insight_sets` and
`insights` under `backend/drizzle/user/`; writing a set is PET-40. `categories` has its table
and a `STARTER_CATEGORIES` constant but no CRUD, no per-category stats and no allocation summary.

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

`ui/Field`'s red-border-plus-one-line treatment shipped with PET-17 but nothing rendered it in
a real flow - only `Input.stories.tsx`'s `WithError` story. PET-9's budget validation is the
first live use, with the string `Enter an amount greater than 0.` taken verbatim from that
story and from `Field`'s own doc comment rather than invented.

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
message, which `ui/Field` has no concept of.** Field owns per-field messages and deliberately
carries no `role="alert"`; a failed request belongs to no field and arrives after a network round
trip with nothing else on screen changing, so PET-11's line sits above the footer row in Field's
own treatment *with* `role="alert"`. If a second form ever needs one, that is the moment it
belongs in `ui/` rather than in a screen.

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
