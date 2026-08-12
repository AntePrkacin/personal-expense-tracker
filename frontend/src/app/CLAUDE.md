# frontend/src/app/CLAUDE.md

Guidance for Claude Code inside `frontend/src/app/`: the routed screens themselves. This file
is the authority for the signed-in shell and for the access screens outside it.

It does not repeat the design system. `frontend/CLAUDE.md` owns the daisyUI theme, the Figma
boundary and the cascade traps, and it loads alongside this file, so read it before writing
any class: theme-aware colour is daisyUI semantic colour only, and Tailwind's full palette is
back as of PET-57, so a raw `text-red-600` compiles and quietly bypasses the theme. The `ui/`
primitives and their conventions are `frontend/src/components/CLAUDE.md`'s, which does **not**
load in a route - read it when a screen's change reaches into a shared component.

This file exists because `frontend/CLAUDE.md` passed 400 lines when PET-8 landed, which is the
promotion trigger `docs/agents/conventions.md` sets. It is one directory deeper, so it loads
only when the work is actually in a route.

## The app shell

`frontend/src/app/(app)/` is the shell every signed-in screen renders inside: the fixed
sidebar beside a content column, with the four routed views `/dashboard`, `/transactions`,
`/insights` and `/settings` under it. (The sidebar was the Figma frames' dark ink panel until
PET-74's addendum restyled it to Claude Design's card-coloured one; `ui/Sidebar.tsx` carries
the account.) A **route group**, so the paths stay exactly the hrefs
`ui/Sidebar` declares while sharing one layout; the access screens (01, 02, 03, 22, 23, 24)
sit outside it and inherit none of it.

**`PageHeader` and `SidebarNav` live here rather than in `components/ui/`, deliberately.**
`ui/` mirrors the tiles on the Figma Components page and is complete, and neither of
these is a tile - they are the shell's own. The visible consequence is that `PageHeader`'s
stories are filed under **Shell**, not **Components**, so they cannot join
`ui.stories.test.tsx` (which asserts every module's title starts with `Components/`);
`(app)/shell.stories.test.tsx` is one copy of that smoke test for them. The compile harness
that used to guard their hard-coded classes went with the token system in PET-57; classes are
stock daisyUI plus Tailwind defaults now, and review is what guards them.

**`SidebarNav` is the shell's only `'use client'` file, and it owns both of the shell's
reactions to a navigation.** `Sidebar` takes `active` as a prop so it can stay a Server
Component, and an App Router layout cannot read the pathname on the server, so something has to
call `usePathname()`. It matches by **prefix with a trailing-slash boundary**, so
`/transactions/abc` keeps Transactions lit while `/settings-import` does not light Settings.
The same pathname read closes the off-canvas drawer: the drawer's checkbox is uncontrolled and
the layout - checkbox included - persists across a soft navigation, so without that effect
following a sidebar link below `lg` left the drawer and its overlay open over the new page.

Two details of it are testability decisions rather than style, and both were review findings:

- **`matchItem()` returns `SidebarItem | undefined` and the caller supplies the fallback.**
  With `?? 'dashboard'` inside the function, `matchItem('/dashboard') === 'dashboard'` could
  not fail - a completely broken lookup returns `'dashboard'` too - so the app's landing route
  was the one case with no real coverage. The fallback now lives in `SidebarNav`, where a
  separate test covers it.
- **`SIDEBAR_HREFS` in `ui/Sidebar.tsx` is the single declaration of the four routes.** It is
  exported for the same reason `SIDEBAR_ITEMS` is. Those hrefs previously existed as four
  hand-written copies (the component, its test, `SidebarNav`, its test), each asserting itself
  against itself, so none could notice a divergence. The fifth copy is the one code cannot
  hold: the route directories on disk. `SidebarNav.test.tsx` therefore checks with `fs` that
  every href has a `page.tsx` behind it, because renaming a folder is otherwise invisible to
  the whole suite while the link 404s.

**The header owns the overline, the title and a slot - nothing else.** Each route passes its
own action, because all four differ: Dashboard a month select plus primary "Add transaction",
Transactions a **search field** plus the same button, AI Insights a **secondary**
"Regenerate", and Settings nothing at all. Two consequences worth knowing. The tickets that
eventually make those controls work never touch `PageHeader`. And CTG-1's "Add category",
which swaps in on the Categories tab, needs no header change either.

Two things about that list contradict PET-19's own acceptance criteria, and the design won
both times: **AC3 claimed the month select appears on Transactions too** (TRN-1 and node
`26:137` draw a search field there instead), and **the ticket never mentioned "Regenerate"**
(INS-1 and node `38:542` both do). The Jira description was corrected rather than the code.

**The month select is an inert `div`, not a control - and the search field stopped being one in
PET-29.** A8 says the select renders the current period and does nothing until month navigation
is designed, so on the Dashboard it is not a `<select>` or `<button>` and does not announce
itself as operable; `(app)/pages.test.tsx` pins that `queryByRole('combobox')` stays empty on
that page. The Transactions search is a real `<input>` now (`TransactionSearch` owns it, under
The access screens' sibling section below), so the old "both stay empty" pin narrowed to the
page that still means it.

**PET-72 makes it a real control, so the paragraph above is history and the pin inverted.** A8 was
waiting for month navigation to be designed; this is that ticket. `(app)/PeriodSelect.tsx` replaces
`dashboard/MonthPill.tsx`, which is **deleted** - that file's own TODO predicted the diff exactly ("the
ticket that designs month navigation turns this into a real Select and gives it the surrounding period
state; nothing else has to move"), and the prediction held: the state is `?period=` in the URL, and the
two screens' headers each changed by one line. Five things about it are decisions.

It is a **native `<select>`**, not a sixth custom picker. The five this app draws exist because a
designed popup could not be reproduced with a native control - swatches in `ColourSelect`, a 64-glyph
grid in `IconSelect`, a 28-row capped list in `MonthStartField`; a period is a line of text, the list is
as long as the account's own history, and `TransactionFilterBar`'s navigating pills are the same control
doing the same job on the sibling screen. It lives at the **`(app)` root** rather than under
`dashboard/`, because two routes draw it - the same reason `PageHeader` sits there. It **replaces**
rather than pushes, `TransactionFilterBar`'s recorded call for the identical reason: twelve periods
browsed should not be twelve entries to back out of. Its `selected` comes from the **response** rather
than the URL, which is what makes it show a value on a bare `/dashboard` instead of an empty box - the
sparse-URL trap `transactions/filters.ts` records for its own pills. And every option's text is the
**backend's own label**, never derived here: a period a pay-day change stretched spans two calendar
months, so month arithmetic on this side would print the wrong thing exactly when it matters.

**The `?period=` state is the absent key for the current period**, which is `filters.ts`'s rule again:
one view has one URL, and a dashboard linking to `?period=2026-03-01` would go stale the moment that
period rolled over. `lib/periodParams.ts` owns `periodParam`, `periodHref` and `parsePeriodParam` -
separate from `lib/periods.ts`'s read because a Client Component importing anything from a module that
reaches `next/headers` is something `next build` refuses. `parsePeriodParam` **validates and does not
canonicalise**, so a malformed value is dropped here while a well-formed but unknown one is still
forwarded: this app cannot know which dates start a period without asking, and the backend's 400 is the
honest answer to a link naming a period the account does not have.

**Two of the four headers now read their period off the screen's own response, and two do not read a
clock at all.** `/dashboard` and `/transactions/categories` take `period` and `periods` as props and
draw the select; `/transactions` takes its label off the list read, printing "All time" for the one
filter whose response carries no period; `/insights` asks `GET /api/periods` and takes the entry flagged
current, because `GET /api/insights` publishes no period and its `monthLabel` names the period a set was
generated _in_. `lib/format.ts`'s `periodOverline` and `periodLabel` are deleted with the derivation
they were - `frontend/CLAUDE.md` carries that argument in full.

**PET-76 makes that three headers rather than four, and the clause about `/insights` is history.**
Both assistant routes draw the fixed overline "Your very own personal" over the title "AI Assistant"
and read no period at all. The paragraph above is the argument for why that one was different, and it
is also the argument against it: `/insights` was the only header whose label rode on **neither** its
own response nor a clock, so `GET /api/periods` was requested for a string and nothing else - one
request per view on each of the two routes, naming a period over a conversation that belongs to none.
`lib/periods.ts`'s `currentPeriod` went with them, having had exactly those two callers, and its
absence is the thing to know before writing a fourth header: a screen that needs the current period
takes it off the read whose figures it is labelling, which is what the other three do. What stays
true is the rule the deletion of `periodOverline` established - **no period name is ever derived on
this side** - reached here by not naming one.

**PET-67 makes `/transactions` the third screen to _draw_ the select, which is a different count from
the one those two paragraphs keep.** Three headers read their period off their own response and that
is unchanged; what changed is that all three of them now put a `PeriodSelect` in the header rather
than two, because that screen's period pill moved up out of the filter bar. Its overline is still the
list read's own label and still prints "All time" for the one filter whose response carries no period,
so the sentence above describing `/transactions` is intact - the screen simply has a control beside
the label now. It reaches that select through `TransactionPeriodSelect` rather than rendering
`PeriodSelect` directly, and the paragraph under The transactions screen carries why.

**`export const dynamic = 'force-dynamic'` was on the layout and is deliberately gone.** It
existed because the pages read `new Date()` for the overline, and without it Next prerendered
them and every screen showed whatever month the build ran in - a bug that only appears a month
after deploying. PET-52's `cookies()` read makes the segment dynamic on its own, which is the
condition this paragraph already set for deleting the line rather than leaving it as a claim
about nothing.

`(app)/layout.test.tsx` now asserts the _absence_ of that export rather than its value, so
nobody restores it, plus that `requireProfile()` is called exactly once and that the footer
shows the read profile rather than sample data. The gate call was the sharper assertion while it
was a documented no-op; it still earns its place, because the gate is one line whose deletion no
rendering assertion would notice - and the call _count_ now matters too, since two reads is the
shape the loop came from.

**`jest.mock()` cannot resolve the `@/` alias, anywhere.** `jest.mock('@/lib/session')` fails
with `Cannot find module` from any directory - PET-8 reproduced it from `src/app/` and
`src/lib/`, so the earlier explanation blaming `(app)`'s parentheses was wrong. The resolved
Jest config carries no `moduleNameMapper` entry for `@/*` and a null `modulePaths`, so the
alias is unresolvable at runtime; plain `import`s work because SWC rewrites aliased specifiers
at transform time from tsconfig `paths`, while `jest.mock`'s argument is a string the resolver
sees verbatim. Use a relative specifier, and have the accompanying `import` name the same one.
(The parentheses _did_ break the pre-commit hook, which is a real and separate trap; see
`docs/CONTRIBUTING.md`.)

**`/` branches on a session**, and the rule lives in `app/page.tsx` rather than in a
middleware matcher so it has one home. VER-4 lands both a new and a returning account on the
Dashboard, and a signed-out visitor belongs in the access flow. The full description is under
The access screens below, which is where the screen it renders is documented. (This paragraph
used to say `/` was a bare `redirect('/dashboard')`, which was PET-19's version of the route
and stopped being true when PET-8 put Welcome behind the gate.)

**`lib/session.ts` held two stubs for four tickets, and PET-52 resolved both - one by filling
it in, one by deleting it.** `hasSession()` is real and is called by `app/page.tsx`,
`app/login/page.tsx` and `app/setup/layout.tsx`, which want a fact to branch on because both of
their destinations are legitimate. `requireSession()` is **gone**: it was the `(app)` shell's
gate, and the shell also needed the profile, so it made two guarded requests where the second
already implied the first's answer. `lib/profile.ts`'s `requireProfile()` does both in one call,
and nothing else ever called `requireSession()`.

**That collapse fixed a redirect loop, which is the reason to know about it.** With two reads the
layout treated any absent profile as "not signed in" and sent the user to `/login` - which
redirects a signed-in visitor to `/dashboard`, which bounced again. A live session whose profile
read failed for any reason (the broken-invariant 500, a timeout, a restart mid-render) therefore
made **the whole app unreachable**, including the login screen. `lib/profile.ts` now separates
"not signed in" from "could not ask": only a 401 or a missing cookie redirects, and an
unavailable backend throws so Next's error boundary renders something a reload can retry. Its
suite pins that an `unavailable` backend never redirects, which is the regression that matters.

The full account of the cookie, the derived lifetime and the un-clearable stale cookie is under
The access screens below, next to the handler that writes it.

**The sidebar footer's profile is real as of PET-52.** `PLACEHOLDER_PROFILE` in
`(app)/layout.tsx` was Figma's own sample data ("Marko", "Kovač", "marko@email.com") for three
tickets, so the shell diffed against the design rather than against invented copy - which also
meant it looked entirely real in a screenshot, and is why the constant was named that loudly.
`lib/profile.ts` replaced it: names live in the per-user database's `profile` row and the email
on the central `users` row, and `GET /api/profile` is what stitches them. `ui/Sidebar` itself
always stayed clean; its test pins that those three strings appear nowhere in the component, and
`layout.test.tsx` now asserts a _different_ person's name so the placeholder cannot creep back.

**PET-84 puts a logout control in that footer, and it is the shell's first write.** The footer had
held the account's identity and no way to leave it since PET-18: `ui/Sidebar.tsx` reserved the slot
with a comment saying so, `Sidebar.test.tsx` pinned the absence as AC5, and `AuthController`
published no operation that ends a session. **A39 is overruled by the product owner rather than
answered by the designer**, so the glyph, the label, the placement and the absence of a
confirmation dialog are invented and join what A29 owes; `docs/TODO.md` carries that and the
argument for why the control is not on Settings. Four things about it reach past `ui/Sidebar.tsx`'s
own comment.

**The action is threaded from `(app)/layout.tsx` through `SidebarNav` rather than imported by the
panel**, which is this repo's rule for every Server Action and the one it has had to fix after the
fact twice. `SidebarNav` is the shell's only client component and so is also the boundary the
action crosses, which it may: an action is serializable as a prop, unlike the `onNavigate`
callback beside it. The panel's prop is **required**, so a control cannot ship wired to nothing -
the `pending` prop this file records as shipping unreachable is the failure that argues for it.

**It must be a Server Action rather than anything a Server Component can do**, and that is a
constraint rather than a preference: a Server Component's cookie jar is read-only and `.delete()`
throws `ReadonlyRequestCookiesError` at runtime, which is the trap `lib/pendingEmail.ts` records
for `.set` and the reason this file already says nothing clears a stale cookie on a 401. It is not
a route handler either, unlike `/auth/verify` and the assistant's send: nothing navigates to it and
nothing needs cancelling.

**`lib/logOut.ts` is the app's one write with no failure taxonomy**, and the reasoning is worth
reading before adding a message to it. It clears the cookie whichever way the API answers, because
clearing it only on a 2xx leaves a user unable to sign out of their own browser during an outage;
there is nothing a caller would do differently per reason and nowhere to say it, since the surface
is being navigated away from and a toast cannot survive the redirect. That is PET-77's own rule -
`failed` and `unauthenticated` leave the form because they name nothing actionable - reached from a
direction where **every** reason is one of those. The cost is stated in that file and in
`docs/TODO.md`: during an outage the token stays live while the browser says it left.

**It redirects to `/login` rather than `/`**, and there is no loop, because the cookie is gone
before that route's own `hasSession()` gate runs. Both destinations are legitimate for a
signed-out visitor and `/login` is the one with a control on it.

**Three suites cover three different things, which is worth knowing before adding a fourth.**
`Sidebar.test.tsx` renders the panel with a stub and covers the control's name, role and form;
`layout.test.tsx` covers the **threading**, because a prop dropped in the middle typechecks
nowhere and is invisible to every other assertion in that file; and `lib/logOut.test.ts` covers
the cookie on every arm through the real `authorizedPost`. What none of them can cover is the
press: jsdom does not run React's form action, so that is a browser check, and the walk measured it
along with the two things `ui/Sidebar.tsx` could otherwise only claim - that the control is
`visibility: visible` at 1440px and hidden with the panel below `lg`.

## The access screens

The six frames outside the shell (01 Welcome, 02 and 03 Setup, 22 Register, 23 Log in, 24
Check your email). **All six are built** as of PET-12: Welcome at `/`, the three onboarding steps
at `/setup`, `/setup/categories` and `/setup/register`, then `/login` and `/check-email`. PET-52
closed the flow with the two routes the design draws no frames for at all: `/auth/verify`, which
consumes the emailed link, and `/auth/verify/failed`, which says why one did not work.

**`/` is the front door and its one job is choosing which door.** `app/page.tsx` awaits
`hasSession()`; a signed-out visitor gets `<WelcomeScreen />` and a signed-in one is redirected
to `/dashboard`, because VER-4 lands both a new and a returning account there. The rule is here
rather than in a middleware matcher so it has one home. PET-52 made `hasSession()` real, so that
branch actually fires now; before it, every visitor landed on Welcome and `/dashboard` was
reached by typed URL only.

Two consequences of that gate being async. The screen is a **separate component**
(`app/WelcomeScreen.tsx`) rather than inlined, because Storybook cannot render an async Server
Component that awaits a session, and it keeps the screen's own test free of mocks. And `/`
prerendered **static** while nothing in the path read a request; PET-52's `cookies()` read opts
it out on its own, so no `export const dynamic` belongs there - which is now true of every
route in the app, `(app)/layout.tsx` included, since its `force-dynamic` went with the same
change.

**`lib/routes.ts` declares where the access screens live**, including the two Welcome links
out to: `/setup` and `/login`. Same single-declaration reasoning as `SIDEBAR_HREFS`, and the
two sets must not restate each other - app routes stay in `ui/Sidebar.tsx`, access routes here.
Welcome is deliberately absent, because it is served at `/` and there is no path to declare.
Every key now answers, and for four tickets some did not: a declared-but-unbuilt route was as far
as a frontend-only ticket reached, because the href is the contract its criterion describes and an
inert control would fail that criterion outright while hiding it. `lib/routes.test.ts` asserts with
`fs` that every built route has a `page.tsx` behind it, the way `SidebarNav.test.tsx` does for
the four app routes; it classifies each key rather than sweeping them all, so adding a route
forces a decision instead of silently escaping the check. **Its `PENDING` list is
empty now and stays**, because a blanket sweep would pass today and then quietly accept the next
unbuilt route - which is the state `/login` and `/check-email` were in the whole time. PET-52
added a third list, `HANDLERS`, for the one route answered by a `route.ts` rather than a
`page.tsx`; a filename exemption inside `BUILT` is exactly the sort of exception that quietly
becomes "this one is unchecked", and this is the route whose path a login email depends on.

**There is no `(access)` route group, and Welcome is still the odd one out.** It is a
two-column split with a left-aligned logo, where the other five are centred cards, so a group
whose one member shares nothing with the rest would carry no decision.

**PET-9 answered the shared-layout question, and the answer is "yes, but not as a layout".**
Frames 02, 03 and 22 draw identical chrome - the centred column, the lockup, the three-dot
indicator, the card - varying only in which dot is filled and the column width (520 / 600 /
520). That chrome is a Server Component taking `step`, **not** a
route layout: the active step differs per route, and an App Router layout cannot read the
pathname on the server, which is the same trap `ui/Sidebar`'s `active` prop was built around.
A layout would have to become a client component just to know which dot to fill.

**PET-12 then split that component in two, and the split is along "is this onboarding?".** Frames
23 and 24 draw the same 520px card box with **no indicator and no overline**, so the column, the
lockup and the box moved to `components/AccessCard.tsx` - beside `LogoLockup`, for the reason that
file gives, now that five frames share them - while `app/setup/SetupShell.tsx` kept `SETUP_STEPS`,
`STEP_DOT`, `STEP_WIDTH` and the indicator itself and renders `AccessCard` with them. `AccessCard`
takes the indicator through an `aboveCard` slot named for its position rather than its contents,
and an omitted node renders nothing, so the column's two `gap-6` gaps collapse to one with no
conditional anywhere. One thing to know before touching it. **The step's width classes have to stay on the element
carrying `card`**, because `SetupShell.test.tsx` locates the card by those width classes and
asserts the children land inside it - moving the width to a wrapper is the one change that
breaks the suite. (It located the card by `shadow-card` until PET-57 deleted that token.)

**The right half of Welcome is `aria-hidden`, and that is load-bearing.**
`app/DecorativePanel.tsx` is a dark panel with two accent washes, a sample budget card and two
floating chips - WEL-4's "display only", every figure fabricated and permanently so. It is
hidden because its native `<progress>` publishes `role="progressbar"`, so unhidden it announces
a real progressbar reporting a budget that is not the reader's, and its badge announces "On
track" as if it described their finances. (PET-57 inlined daisyUI `progress` and `badge` where
`ui/ProgressBar` and `ui/Tag` used to render; the reasoning did not move.) Two notes: `aria-hidden`
does **not** remove focusable descendants from the tab order, so the screen's test pins that
the subtree contains none; and it is a plain `div`, never an `<aside>`, because an
`aria-hidden` landmark is self-contradictory.
The panel also pins `data-theme="expensa-light"` on itself, daisyUI's own mechanism for a subtree
that must not follow the page: the art is a bright `base-100` card on a `neutral` panel, a pairing
only the light theme's values keep legible, and every figure in it is fabricated, so there is
nothing for the reader's theme to adapt. The value has to be a **registered** theme's name: it said
`light`, and when PET-74 replaced the stock pair the pin silently stopped matching anything and the
panel followed the page theme, with every gate green - the file's own comment carries the account.

**Onboarding is three nested routes under one layout**: `/setup` (02, step 1),
`/setup/categories` (03, step 2) and `/setup/register` (22, step 3, PET-11). PET-9
settled that. The alternative - one route rendering all three steps from client state - is
simpler and keeps the draft inside one component, but the browser's own Back button then
exits onboarding and discards everything typed, and you cannot fix that without pushing
history entries by hand. All three tickets carry an explicit "Back keeps my values" criterion
(PET-9 AC5, PET-10 AC4, PET-11 AC5), so back-navigation is a first-class path here rather than
an edge case.

**`app/setup/layout.tsx`'s only job is holding the draft**, and it stays a Server Component:
`SetupDraftProvider` carries the `'use client'` boundary, so the layout and all three step
pages stay off the client bundle. React preserves the provider element across navigation
between a layout's own children either way, so nothing about AC5 depends on which file holds
the directive. Same rule as `SidebarNav` - push the boundary into the smallest wrapper.

**The draft lives in sessionStorage, read through `useSyncExternalStore`.** Per tab, cleared
when the tab closes, and it never leaves the browser, so A32 (nothing persisted server side
until "Finish setup") holds literally. Three things about it are load-bearing. It is
sessionStorage rather than layout state because AC5's round trip out to Welcome and back
**unmounts the layout**, so no in-memory option can satisfy it. It is `useSyncExternalStore`
rather than a mount effect for two reasons: `react-hooks/set-state-in-effect` rejects the
effect version and this repo carries no eslint-disable comments, and the hook is
hydration-correct by construction where a `typeof window` guard in a `useState` initialiser
would make the client's first render disagree with the server HTML about a controlled input's
value. And the snapshot is the raw JSON **string**, not the parsed draft, because an uncached
snapshot that parsed JSON would return a fresh object on every call and re-render forever.

`app/setup/draft.ts` holds the shape and is deliberately React-free, so PET-11 can build the
register body without a client boundary. Two details it records: `budget` is the **display**
string (`'2,000'`), because AC5 needs the field to come back showing what was typed and no
number represents `'2000.'` mid-type - the conversion happens once, at the boundary, when step
3 builds its request. And `parseDraft` is **total**, because sessionStorage is writable from
that tab's devtools console and a throw in the read would white-screen onboarding.

**`parseDraft` also re-canonicalises the budget rather than trusting it**, which is not
belt-and-braces. Returning the stored string verbatim let a value no field could have produced
render straight into a controlled input and pass `isBudgetValid`: a stored `'2.000,50'` - a
European paste, or an older formatter - read back as `2.0005`, four decimals, which
`RegisterDto`'s `@IsNumber({ maxDecimalPlaces: 2 })` rejects. The screen would have shown a
plausible number, validated it, and handed step 3 a guaranteed 400 with no error state designed
for that (A29). Running the value through `formatAmountInput` on read means everything this
module hands out is something the field could have produced, and idempotence is what makes that
free for the normal case. The currency is only type-checked, not checked against the option
list, which `docs/TODO.md` records as A6's to settle.

**This is the repo's first stateful form, so its conventions are new.** `app/setup/BudgetForm.tsx`
is a real `<form noValidate onSubmit>` with a `type="submit"` button, not an `onClick`: Enter in
the budget field has to submit, and an `onClick`-only button leaves it dead on a two-field card.
Three details of that fail silently if missed - `preventDefault()` (a form with no `action` GETs
the current URL and reloads, and because the draft is in sessionStorage it comes back filled in,
so the defect reads as a flicker), `noValidate` (without it the browser's own bubble fires and
the designed inline message never renders), and `required` kept on both fields for the semantics
with no asterisk, per A12. Validation runs on submit only and clears on the next change to the
field.

**Continue is a `<button>` and Back is a `<Link>`, which is deliberately the opposite of
Welcome's rule** that both exits are links because both change the page location. Continue
cannot be one: its navigation is conditional on validation, and an anchor cannot be blocked.
That single fact is the only reason `BudgetForm` is a client component. Back uses a literal
`href="/"`, because `ACCESS_ROUTES` declares no entry for Welcome by design.

**The budget field's caret is restored by hand, and `ui/Input` needed no new prop for it.**
`onChange`'s `event.currentTarget` is already the node, so the handler writes the formatted
value and the caret onto it directly. Two things are worth knowing before touching it. It works
only because `formatAmountInput` is idempotent - `lib/format.test.ts` pins that property for
exactly this reason. And React _does_ restore a selection around its own controlled-input
commit, so this is not the difference between "caret preserved" and "caret at the end": React
restores the raw offset, which is wrong precisely when the reformat inserts a separator to the
left of the caret, leaving `2,00|0` instead of `2,000|`. **jsdom cannot observe the outcome
either way** - React's restore plus user-event's own cursor bookkeeping make a `selectionStart`
assertion pass with the restore deleted, which an earlier version of the test did. The suite
therefore asserts that `setSelectionRange` was called with the computed offset, and the visible
behaviour is a Storybook or manual check. docs/TODO.md records the gap.

**That handler is no longer written by hand here, or in any of the other three forms that copied
it.** It was seven identical lines in `app/setup/BudgetForm.tsx`, `(app)/AddTransactionModal.tsx`,
`(app)/EditTransactionModal.tsx` and `(app)/transactions/categories/AddCategoryModal.tsx` - one
past the rule of three, with a fix to the call order owing four edits and three chances to be
missed. `lib/amountField.ts`'s `reformatAmountInput` is the owner now, and `frontend/CLAUDE.md`
carries what belongs to that module; every call site is one line, and every paragraph above still
describes what it does.

**The step indicator is `aria-hidden`.** The card's own overline states "STEP 1 OF 3" in text,
so three unlabelled shapes carry nothing a reader is missing - unhidden they announce as three
empty generics. Same call `ui/Input` makes on its `$` prefix. `SetupShell.tsx` records the two
rejected alternatives so nobody "improves" it into one: a second `role="progressbar"`
(restating the overline, and Welcome's decorative `<progress>` is the repo's only one), and an `<ol>` with
`aria-current="step"` (the textbook pattern, but it invents list semantics and three step names
the design never draws). The `aria-hidden` footgun applies here as it does on Welcome, so the
test pins that the subtree contains nothing focusable.

**`/setup` is gated on a session as of PET-52, and the gate sits on its layout.** It was ungated
because PET-9 had no session to read and a third call into the `lib/session.ts` stubs would have
been a claim it could not test; that reason went away with the stubs. One call site on
`app/setup/layout.tsx` covers all three steps, which is three fewer places to forget one.

**Storybook gains a third section, `Screens/`.** Named after the Figma page the frames live on,
exactly as `Components` is. It needs its own story smoke test
(`app/screens.stories.test.tsx`) because each of those suites asserts its own title prefix,
which is the one thing each exists to make unambiguous - each section's suite carries a copy of
the same harness (PET-57 deleted the Foundations copy with its section), and docs/TODO.md owns
the count and records the helper it should become. PET-9 added a module to it rather than a fifth section, exactly as
that item predicted.

Two things about that harness bite anyone adding a screen story. **It builds each story from
`render` or `meta.component` and never applies the meta's `decorators`**, so a provider in a
decorator works in Storybook and throws under Jest - which is how `Screens/02 Setup` first
failed. Keep whatever the screen needs inside `render`. And a screen that reaches `useRouter`
needs `next/navigation` mocked in that suite, which is the **opposite** call
`(app)/shell.stories.test.tsx` records for `SidebarNav`: that one must not get a story at all,
because it is a wrapper whose only job is reading the pathname, while 02 Setup is a whole frame
worth diffing against Figma. The two notes are halves of one decision.

**A story whose screen calls a router hook also needs
`parameters: { nextjs: { appDirectory: true } }`, and no gate in CI will tell you.**
`next/navigation` throws `invariant expected app router to be mounted` outside a router, and
that parameter is what makes `@storybook/nextjs-vite` mount its mock one. Both gates miss it
from opposite directions: `build-storybook` bundles stories without ever running one, and
`screens.stories.test.tsx` renders the module under Jest with `next/navigation` already mocked.
So the story threw in the browser with a green suite and a green build, and only opening
Storybook found it. **Open the story after adding one** - that is what the Verification section
of every plan means by eyeballing it.

The compile guard that used to cover `app/WelcomeScreen.tsx`, `app/DecorativePanel.tsx`,
`app/setup/` and `components/LogoLockup.tsx` is gone as of PET-57, along with the token
shadows it had just learned to check. Classes are stock daisyUI plus Tailwind defaults, and
the trap inverted: a wrong class now compiles instead of compiling to nothing, so review is
what holds the semantic-colours-only line.

**Step 2 has no `<form>`, and both of its exits are links.** That is deliberately the opposite
of step 1, and the reasoning is the same rule applied to a different fact: an exit that always
navigates is a link, which is Welcome's rule, and Continue on step 2 always navigates because
A4 enforces no minimum selection. Step 1 is the exception rather than the pattern - `BudgetForm`
is a real form with a submit button only because its navigation is conditional on validation,
and an anchor cannot be blocked. Copying step 1's shape onto step 2 would invent a validation
seam the design does not have, so `SetupCategoriesScreen.test.tsx` asserts two links and ten
buttons, the inverted mirror of step 1's one and one, and that no `form` element exists at all.

**The chip is the repo's first toggle control, and it is a `<button aria-pressed>`.** There was
no `aria-pressed`, `aria-checked` or `type="checkbox"` anywhere in `frontend/src` before it, so
`app/setup/categories/CategoryChip.tsx` sets the precedent the later category screens inherit.
The ARIA toggle-button pattern, which is also what the design draws: a chip that presses. Space
and Enter both activate it, each chip is one ordinary tab stop, and the colour dot and the
checkmark are both `aria-hidden` because `aria-pressed` already carries the state - the same
call the Welcome panel's chip dots and `ui/Input`'s `$` prefix make. That file records the rejected
`<input type="checkbox">` alternative; PET-57 rebuilt the chip on daisyUI's `btn` (soft primary
when pressed, outline at rest) with the checkmark stroked `currentColor`, so its states come
from the theme rather than from appearance decisions of its own.

**The three onboarding cards differ only in width, and `STEP_WIDTH` is where that lives.** Frame
03 is 600px against 02's and 22's 520. PET-9 hard-coded `w-130` with a note saying PET-10 either
changes it or lifts it to a prop; a second width appeared, so `SetupShell` now holds a
`Record<SetupStep, string>` beside `STEP_DOT`. No prop, every class still a complete literal
string for Tailwind's scanner - and as of PET-57 the widths are `w-full` plus `max-w-*`
ceilings, so the cards shrink on a small screen instead of overflowing it.

**The draft's third field is `categories`, and it holds names.** `RegisterDto.categories` is
`@IsIn(STARTER_CATEGORY_NAMES)`, so names are what cross the wire and an id would be a
translation layer with nothing behind it. `parseDraft` canonicalises the array exactly as it
canonicalises the budget, and for the same reason rather than out of caution: the DTO also
carries `@ArrayUnique` and `@ArrayMaxSize`, so a stored array holding an unknown name, a
duplicate or a non-string is a guaranteed 400 with no error state designed for it (A29).
`readCategories` filters the canonical list rather than the stored one, which drops the unknown,
collapses the duplicated and returns the survivors in the designed order in one pass - so two
identical selections serialize to identical strings whatever order the chips were clicked. An
explicitly stored empty array is preserved, because deselecting everything is a valid choice
(A4) and a default applied on read would silently undo it.

**It holds `category_templates` ids as of PET-64, and there is now something behind the
translation layer that sentence said had nothing behind it.** The offered list is admin-managed
data in central, so a name is no longer a stable key anything can validate against and
`RegisterDto.categories` takes ids. Two consequences, and the second is a real loss rather than
a rewording. `readCategories` **cannot filter a canonical list any more**, because there is no
canonical list in a React-free module that fetches nothing - duplicating the fetched one here
would be a second authority that goes stale. So it dedupes and caps and nothing else, membership
becomes the server's to reject (a 400 from `AuthService`), and the stored order is the click
order rather than the designed one.

**"Membership becomes the server's to reject" was not a sufficient answer, and the review of
PET-64 is where that came out.** The server does reject it, and the rejection is unrecoverable:
`RegisterForm` renders a 400 as its generic failure line, a rejected submit leaves the draft
untouched, so every retry sends the same dead id - and the one control that could clear it is a
chip step 2 no longer draws. The user cannot leave onboarding without emptying sessionStorage by
hand. Three ordinary ways in: an admin disables a template between two visits, a tab sits open
across a deploy, or the value came from that tab's devtools console. So the filter is restored
in **`CategoryPicker`**, the one place holding both the stored pick and the offered list, as a
mount effect guarded on "would this change anything" - an effect rather than a render-phase
adjustment because it writes to sessionStorage and notifies a store, which is a side effect that
does not belong in render. Two things about it not to undo. `toggle`'s own rebuild is **not** a
substitute, because it fires only if the user touches a chip and the broken case is the user who
clicks straight through. And it **never reconciles against an empty list**: `readCategoryTemplates`
degrades to `[]` rather than throwing, so an empty list is a failed read as much as it is an
empty palette, and treating it as authoritative would delete a correct selection over a
momentary outage - the worse of the two failures, on the likelier of the two causes. Nothing depends on that order: the seed writes categories in
the template's own `sort_order` backend-side. The cap is a literal matching `RegisterDto`'s own,
which is the half of the old guarantee that survives - it is what keeps a devtools-written draft
inside `@ArrayMaxSize`.

**`patchDraft` takes either a patch or an updater, and step 2 is why.** A plain
`patchDraft({ budget })` replaces one field with a keystroke's own value and cannot go stale, but
the chips compute `categories` _from_ the current selection, so a value read during render is
wrong the moment two toggles land in one tick: both start from the same pre-change draft and the
second overwrites the first. One click is one event, so a re-render lands in between and no real
user reaches it - which is exactly what makes it worth removing rather than relying on, since
nothing about the screen says its correctness depends on render timing. Both forms merge over
what is in storage rather than over the closed-over draft, `layout.test.tsx` pins the same-tick
case directly, and `SetupCategoriesScreen.test.tsx` pins it through the chips. Reach for the
updater whenever the next value is a function of the current one.

**Frame 03 draws seven chips selected and a first visit selects none**, by product decision:
the mock illustrates the selected state rather than setting a default. Where that default would
have to live is `EMPTY_DRAFT`, not the screen, or step 3 would submit something step 2 never
displayed - `draft.test.ts` pins it there for exactly that reason. `docs/TODO.md` records the
designer answer it owes.

**`app/setup/starterCategories.ts` is the frontend's first consumer of `types/api.d.ts`, and it
is type-only.** The ten names are read out of
`components['schemas']['RegisterDto']['categories'][number]`, which is a real literal union
because `@IsIn` publishes an OpenAPI `enum`, so the list `satisfies` the contract instead of
restating it - the rule `docs/agents/api-contract.md` sets for every caller. An exported
`AssertNever<Exclude<...>>` alias then fails `npm run build` if the backend ever accepts a name
this screen does not offer. Nothing fetches and no request shape changes, so this needs no
`api:sync`. The colours cannot come from the same place, because the backend publishes names
only: they are `CategoryColour` keys, so no hex value enters the frontend.

**That file is deleted, and the compile guard with it (PET-64).** Read the paragraph above as
history: it describes a mechanism that no longer exists, and it is worth keeping because the
guarantee it names is the one that was consciously traded away. The chips are admin-managed rows
in central now, so `RegisterDto.categories` publishes no enum, there is no literal union to read
out of the contract, and `AssertNever<Exclude<...>>` has nothing to assert. What replaces the
proof is weaker and sound: the ids the screen offers come from the same endpoint registration
validates them against, so the two cannot disagree by construction.

**Step 2 fetches, and the split that forces is the one this file already prescribed.**
`lib/categoryTemplates.ts` calls the `@Public()` `GET /api/templates/categories` -
unauthenticated, because no account exists at step 2 - and `page.tsx` is async, awaits it, and
hands the result to a synchronous `SetupCategoriesScreen` as a required prop, which threads it
to `CategoryPicker` as a prop too. That is the shape `/transactions` set and this file calls
"the one the other three should copy", and here it is a **requirement rather than a preference**:
Storybook cannot render an async Server Component, and the story harness builds each story from
`render` or `meta.component` while never applying the meta's decorators - so a screen that
fetched for itself could not have a story at all. `SetupCategoriesScreen.stories.tsx` and
`.test.tsx` hand in stand-in data, and every count in that suite is derived from it rather than
written out: "ten chips" and "the other nine" were facts about a constant the screen no longer
owns.

**An empty chip list is a real state, not a hypothetical one.** `readCategoryTemplates` degrades
to `[]` rather than throwing, because Continue is unconditional (A4) and an account seeded with
just the fallback is something the flow already handles - replacing all of onboarding with an
error page, on the one screen with no session to recover from, is the worse trade. So an
unreachable backend renders the card, the copy and both exits with nothing to pick.
`Screens/03 Setup`'s `NoTemplates` story is that state, and the copy it owes A29 is in
`docs/TODO.md`.

**Step 3's two name fields are a `grid`, not a flex row, and the 214px in the frame is a
consequence rather than a measurement.** Frame 22 draws them at 214px each with a 12px gutter
inside the card's 440px content box, and `(440 - 12) / 2` is exactly 214 - so `grid grid-cols-2
gap-3` reproduces the design without restating any of its numbers. A flex row would not: the field
components are `w-full`, which spans a grid cell correctly and overflows a flex row, so the fix there would
have been a `flex-1` on each child to re-derive what the grid already gives. The email field is a
sibling of the grid rather than a third cell, which is what makes it full width.

**The draft now carries all six values, and step 3's three are the reason it was always going to.**
`draft.ts` said from the start that it held "everything screens 02, 03 and 22 collect", and its
choice of sessionStorage is justified in that file by not offering the next person on a shared
machine a half-finished registration carrying somebody's name and email. The three are stored
**untrimmed**, unlike the budget, which `parseDraft` re-canonicalises: trimming on read would
delete the space the moment somebody typed one between two words. Trimming happens once, in
`toRegisterBody`, which is also where `budget` stops being the display string `'2,000'` and becomes
`monthlyBudget: 2000`. That function is the only boundary, and it deliberately does **not**
lowercase the email, because `RegisterDto` carries `@Transform(normalizeEmail)` and a second
normaliser is one that can drift from the first.

**`clearDraft` is a third member of the context, and it could not have been anything else.** Step 3
calls it once, after a 202. `SetupDraftProvider`'s snapshot cache is invalidated only by a write
through the provider, so a bare `sessionStorage.removeItem` at the call site would empty storage
while every field kept rendering the values it had cached - and the next `patchDraft` would merge
onto the stale snapshot and bring the cleared draft back. `layout.test.tsx` pins both halves.
`docs/TODO.md` records what clearing costs: the browser's own Back button still reaches
`/setup/register`, so it renders empty, which is accepted because the account exists by then.

**The register call is a Server Action, and `RegisterForm` takes it as a prop.** The mechanism and
the reasoning belong to `docs/agents/api-contract.md`, which now covers writes. What belongs here is
the prop: `SetupRegisterScreen` imports `registerAccount` and passes it down, which is the ordinary
way a Server Component hands an action to a client component, and it means `RegisterForm.test.tsx`
injects a `jest.fn()` and needs no module mock at all - so the alias trap above never comes up.
`SetupRegisterScreen.test.tsx` does mock `./actions`, with a relative specifier, purely so no
assertion about the card can reach a real `fetch`.

**Step 3 adds two states the design does not draw, and they are the fifth and sixth of their kind.**
A19 designs no pending state and A29 no error surface - the spec says outright that a failed
account creation has none - so both are ours, alongside the details `frontend/CLAUDE.md` lists for
`ui/`. The submit button is `disabled` while the request is out, because a double submit spends one
of the five per-address attempts the backend's throttler allows and the second comes back a 429. And
one failure message sits above the footer row in the same `text-error` treatment the field
components use, with **`role="alert"`, which their inline error line deliberately omits**: a field's
message appears synchronously beside the field the user just left, while this one appears after a
network round trip with nothing else on screen changing, so nothing else would tell a screen reader
the submit failed. Five new strings come with it, and `docs/TODO.md` adds them to what A29 owes.

**Step 3 validates step 1's budget too, and the redirect is the error message.** The form owns
three fields and submits six values, so checking only its own would let a draft with no budget
through: `parseAmountInput('')` is `NaN`, `JSON.stringify` writes that as `null`, and
`RegisterDto`'s `@IsNumber` answers 400 - surfaced as the generic failure line, on a screen with
no control that could fix a budget. Not a hypothetical path, and not a bug anywhere else: the
draft is per tab and `/setup/register` is not gated, so opening it in a new tab starts empty.
An invalid budget pushes to `/setup` rather than rendering a message, because the design has no
copy for a budget that went missing and step 1 is where it is set; the draft survives the trip,
so the three fields are still filled on the way back. The categories need no such check - an
empty selection is legal (A4). This screen's own three fields are checked **first**, so an empty
form says what is wrong here instead of silently bouncing.

**The card freezes its values on the way out, and `pending` stays true after a success.**
`clearDraft()` re-renders this form synchronously while the `router.push` it precedes takes a
moment, so the three fields would visibly empty themselves before the next screen arrived. The
form snapshots them into state first and renders that snapshot instead. Two things fall out of
it: `change()` early-returns once frozen, because the draft is gone and a keystroke would write a
fresh one holding a single field, and the submit button is deliberately never re-enabled on
success - the account exists by then, so offering a second registration of the same address
would be wrong even though the backend would handle it (REG-6).

**Onboarding runs to the end now, and the flow closes.** Step 3's "Finish
setup" creates a real account and pushes to `/check-email`, which PET-12 built. Screen 24 is
deliberately **not** nested under `/setup`: LOG-3 reaches it from Log in
too, so it does not belong to onboarding and must not sit inside the draft provider. And it gets
**no "Back" button**, which amends A37, VER-3 and PET-12's AC6 - by the time it renders the account
exists and the link is sent, so there is nowhere backwards to go.

**The submitted address reaches screen 24 in a short-lived httpOnly cookie, and the reason is the
access log.** PET-11 pushed `/check-email?email=<encoded>`, and Next's own request log plus any
proxy or CDN in front of it record the full path including the query string - so every registration
wrote a user's email address into logs on the host and everywhere upstream. That is the argument,
not the address bar, and it is why `history.replaceState` was rejected outright: the value is
already logged by the time the page could strip it. `lib/pendingEmail.ts` owns the cookie end to
end, both entry points' actions stash into it, and `/check-email` reads it with `cookies()` and so
**stays a Server Component** - nothing about the address touches client-side JavaScript. A
sessionStorage handoff would have kept it out of the logs equally well and was rejected for a
different reason: it does not exist on the server, so the interpolated address would force a client
boundary plus the `useSyncExternalStore` hydration dance `SetupDraftProvider` documents.

Four things about that cookie are decisions rather than defaults. **The action stashes and does not
`redirect()`**: a redirect from inside an action does carry the cookie, but it throws, so
`await register(body)` would never resolve and `clearDraft()` would never run. **The read
validates**, because httpOnly stops script and not devtools, and the value is both interpolated
into copy and POSTed as the resend address - the same call `parseDraft` makes about sessionStorage.
**`sameSite: 'lax'` is what PET-52 needs too**, since the emailed verify link arrives as a
cross-site top-level GET that `strict` withholds cookies from. And it is **not** the session
cookie, which is still unnamed anywhere in the repo.

**Screen 24's `page.tsx` owns every server-only import, which is deliberately not PET-11's
precedent.** It reads the cookie and passes both `email` and the resend action down, so
`CheckEmailScreen` imports nothing reaching `next/headers` - which is what lets Storybook render it
and its suite mount it with no mocks and no request scope. PET-11 had `SetupRegisterScreen` import
its own action, and that precedent is exactly what dragged `next/headers` into the Storybook bundle
once `registerAccount` started setting a cookie. `.storybook/main.ts` now aliases `next/headers` to
the framework's browser-safe mock for that reason, and both halves are worth keeping: the alias
covers screens that already do it, and prop-drilling keeps new ones from needing it.

**Screen 24's footer is `justify-end`, and it is the only access footer that is.** Every other one
has two children and takes `justify-between`; with Back deleted this one has a single control that
the frame puts flush right, and `justify-between` puts a lone child at the _start_. A one-class
difference that looks like an inconsistency and is not.

**Screen 24 adds the seventh and eighth details with no Figma counterpart, and both are A36's.**
That assumption says outright that no cooldown, counter or success confirmation is designed for
"Resend link" - so a click had no observable effect whatsoever, and repeat clicks would spend the
backend's five-per-address budget and surface the 429 as nothing at all. `ResendLink.tsx` is
therefore the screen's one client boundary: the button disables while the request is out, a
confirmation line follows a success with `role="status"` where the failures use `role="alert"` (the
difference between polite and assertive), and **a 429 gets its own line telling the user to wait**
rather than the generic "please try again", which would be actively wrong advice. There is
deliberately **no client-side cooldown**, which A36 does mention: the backend's throttler is the
real limit and a timer here would be a second, weaker authority that a reload defeats.

**The no-address arrival is real copy and a real exit, and it amends AC6's wording.** With no cookie
the body drops the address clause instead of leaving "...login link to . Open the link" or a literal
placeholder, and the control becomes a secondary "Log in again". AC6 asks for Resend to be the only
action; a disabled Resend would satisfy that literally and leave a screen with no Back, no working
control and no way out, reachable by nothing worse than a reload twenty minutes later. What AC6
defends is that there is no way _backwards_ into a form the user already completed, and that still
holds - this goes forward.

**That state is reached two ways, and the second one is why `resendLoginLink` has three outcomes.**
The screen can render without an address, and the address can expire _while the screen is open_ -
which is the likelier of the two, because a fifteen-minute cookie sits on the one screen a user
leaves open watching for mail. Reported as an ordinary failure it produced advice that could never
work: "please try again", forever, on a screen with no other exit. So the action answers
`{ ok: false, reason: 'expired' }` and `ResendLink` swaps the button for the same `LogInAgain`
control the server-rendered branch uses. Two details of that are deliberate. It is a `reason` rather
than a fabricated 410, because `lib/backend.ts` documents an absent status as "the request never
completed" and nothing was asked of the backend at all. And the message takes the quiet treatment
rather than the danger one, because a cookie reaching its own expiry is not a fault - the control
underneath it is the fix. `docs/TODO.md` records the focus consequence of swapping a control in
place.

**`CheckEmailScreen`'s props are an exclusive union**, the same `never` technique `ui/Button` uses
for `href` versus `onClick`: `resend` is required with an address and rejected without one, because
there is nothing to send to without one. `page.tsx` therefore narrows before rendering rather than
spreading one object. Worth knowing that **`npm run build` does not enforce this in the suites** -
see the CI note in `frontend/CLAUDE.md` - so `npx tsc --noEmit` is what catches a test that
constructs the impossible combination by hand.

**`/login` is gated too, and PET-52 answered it in the same breath as `/setup`**, which is what
`docs/TODO.md` asked for. It was ungated because a fourth call into the `lib/session.ts` stubs
would have been a claim nothing could test, and because LOG-5 makes Welcome's "I already have an
account" the only designed entry - but a signed-in visitor could still reach it by typed URL and
request a link they did not need. `/check-email` keeps no gate, deliberately: its entire premise
is that no session exists yet. Note `npm run build` used to report `/login` static and
`/check-email` dynamic, and now reports **every route dynamic**, with **not one
`export const dynamic` anywhere** - the cookie read opts each route out on its own, exactly as
`lib/session.ts` predicted for `/`.

**`LoginForm` holds its value in `useState`, not in the onboarding draft.** `/login` is outside
`app/setup/layout.tsx`, so `useSetupDraft` would throw, and a returning user's address has nothing
to do with a half-finished onboarding payload. Nothing needs to survive a round trip either: LOG-4's
Back goes to Welcome, which is a way out rather than a step to come back from. Its two field
messages are the same strings `RegisterForm` uses, copied rather than shared - there is no copy
module in this repo and two overlapping strings are the wrong reason to invent one.

**The emailed link lands on `app/auth/verify/route.ts`, and the navigation is what makes it a
route handler.** A Server Action sets a cookie perfectly well - `registerAccount` does - but the
browser _arrives at_ this URL by following a link, and an action cannot answer a GET navigation.
A page could not do it either: a Server Component cannot write a cookie, and POSTing the token
from a client component would drag a live credential into client-side JavaScript. It is the
repo's first route handler, so it is the shape to copy. **The path is not ours**:
`backend/src/mail/login-link.template.ts` builds `${FRONTEND_URL}/auth/verify?token=<raw>`, so
this folder's name is a contract with another application, and nothing checks the two agree -
`routes.test.ts` pins our half and `docs/TODO.md` records the rest.

The handler spends the token immediately and always answers a redirect, so the token leaves the
address bar on the first paint. A 200 sets the session cookie, deletes the pending-address cookie

- which nothing did before, and which `docs/TODO.md` asked this ticket for - and goes to
  `/dashboard` (VER-4, which lands a new and a returning account in the same place). Everything
  else goes to `/auth/verify/failed` with a `?reason=`: 401 and 400 are `invalid`, 409 is
  `superseded`, 429 is `busy`, and a fault or an unreachable backend is `failed`. 400 folds in with
  401 because a malformed token is indistinguishable from a dead link to the person holding the
  email.

**A query parameter is safe there in a way it was not on `/check-email`.** What drove the address
into a cookie was this server's own request log; `?reason=superseded` is not personal data and
identifies nobody. It is still validated on the way back out, in
`app/auth/verify/failed/reason.ts`, because the value is typed by whoever holds the address bar
and lands in a heading - the same call `parseDraft` makes about sessionStorage. An unrecognised
value falls back to `failed`, deliberately the copy that claims the least.

**The verify failure screen is the one screen in the app with no Figma frame behind it.** The
Screens page holds exactly 24 and none of them is this: A38 says nothing is designed for opening
the link, only that it should be handled "with plain messages and a way to request a new link".
So its four headings and four body lines are ours and owe A29 sign-off with the rest, and its
`Screens/Verify link failed` stories carry **no frame number** because there is no frame - which
also makes opening them the only review available. It borrows screen 24's card through
`AccessCard`, and its control is `ResendLink` or `LogInAgain` exactly as screen 24's is, which is
what keeps a screen the designer never drew looking like the flow it interrupts.

**`ResendLink`, `LogInAgain` and `resendLoginLink` moved out of `app/check-email/` for that
screen.** The two components went to `components/`, beside `AccessCard` and for the reason that
file gives. The action went to `lib/resend.ts`, which breaks this repo's actions-live-in-
`actions.ts` habit on purpose: left where it was, `components/ResendLink.tsx` would have had to
import `ResendResult` from a route, pointing a shared component at `app/` - the layering
inversion the move exists to remove. The objection `lib/backend.ts` raises against `'use server'`
does not apply to it, because that one takes a `path` and this one takes nothing and hits one
fixed endpoint.

**`lib/session.ts` is no longer stubs, and the cookie is `spendifico.session`.** One private
`readSession()` reads the cookie and calls `GET /api/auth/session` with the value lifted into
`Authorization: Bearer <token>`, because the backend reads no cookies at all, and `hasSession()`
answers it as a boolean. `sameSite: 'lax'` is required rather than chosen, for the reason
`lib/pendingEmail.ts` gives. **The cookie's `Max-Age` is derived from the verify response's
`expiresAt`** rather than mirroring `SESSION_TTL_D`, which is the one place this improves on the
cookie beside it - there is nothing to drift. `__Host-` was rejected because it demands `Secure`
unconditionally and would silently fail to set under `npm run dev`.

**Nothing clears a stale cookie on a 401, which amends the spec the stub shipped with.** Step 4
of `requireSession()`'s doc comment said "clear the cookie and redirect"; no Server Component can,
because its cookie jar is read-only and `.delete()` throws `ReadonlyRequestCookiesError` at
runtime with nothing in the types to warn you - the trap `lib/pendingEmail.ts` records for `.set`.
It costs almost nothing, since the cookie's own `Max-Age` now tracks the session's expiry, so the
only state that leaves a live cookie holding a dead token is a manual revocation tombstone.

**`/setup` and `/login` are gated now, and `/check-email` deliberately is not.** Both were
ungated only because a third and fourth call into the stubs would have been claims nothing could
test, and `docs/TODO.md` asked for them to be answered in the same breath - they were, with the
same `hasSession()` branch `app/page.tsx` uses. `/setup`'s gate sits on its layout, so one call
site covers all three steps. `/check-email` keeps none because its entire premise is that no
session exists yet, and gating it would add a round trip to the pre-session wait for a state
nobody reaches by accident. **Every route in the app is dynamic now** and **not one carries an
`export const dynamic`**: the cookie read opts each one out on its own, exactly as
`lib/session.ts` predicted for `/`.

**`export const dynamic = 'force-dynamic'` is gone from `(app)/layout.tsx`.** It existed so the
pages' `new Date()` was not frozen at build time; the `cookies()` read behind the gate now does
that, at which point the export became a claim about nothing rather than a safeguard - which is
the condition this file already set for deleting it. `layout.test.tsx` inverted its assertion
rather than dropping it, so nobody restores it.

**`/transactions` is the first screen with content under its header, and the shape it uses is
the one the other three should copy.** `page.tsx` is async, awaits `readTransactionsView()` and
hands the result to `TransactionsScreen`, which is synchronous and takes the whole state as one
prop. The split is not stylistic: Storybook cannot render an async Server Component that reads
cookies, which is the same reason `WelcomeScreen` and `CheckEmailScreen` are their own files, and
it is what lets both empty states be diffed against Figma with no request scope and no mocks. It
also means `(app)/pages.test.tsx` now renders every page through `await Page()` - awaiting a
synchronous component's return value is a no-op, so one call site covers all four - and mocks
`../../lib/transactions` for the one that fetches.

**The screen has three states, and the API cannot tell them apart on its own.** `total` is the
count _after_ filters and `period` defaults to `current`, and PET-28 deliberately publishes no
account-wide count, so a `total` of 0 means one of: the account is empty, a filter matched
nothing, or the account's transactions are all in an earlier month. The third is the one that
forces the design: treating it as the first renders "Log your first expense" over a real history
_and_, because TRN-3 removes the filter bar in that state, leaves no control on screen that could
change the period to go and find it. So `lib/transactions.ts` resolves the ambiguity with a
second read - `period=all`, no other filter, fired **only** when the first read returns zero -
rather than inferring from whether a filter looks active, which gets that third case wrong by
construction because that case _has_ no active filter. Every page load with data on it still
costs exactly one request.

**`TransactionsScreen` owns the `filterBar` conditional, and that is why it was built before the
filter bar.** TRN-3 says the bar is deliberately absent in the empty state, which is a statement
about a conditional rather than about a component - so the slot and its test exist now, and PET-29
fills something that already knows when to disappear. Built the other way round, nothing would
have failed if the bar rendered unconditionally. `table` is the same shape for the populated
branch.

**PET-29 filled both, and they stayed slots.** `page.tsx` builds a `TransactionFilterBar` and a
`TransactionsTable` and passes them down, rather than the screen importing either: both need the
category read the screen deliberately does not make, and Storybook has to be able to hand it
stand-ins. The screen's own new prop is `filters`, and it is a **prop rather than a third slot**
because the search field has no conditional - all three states draw it - so an omitted node would
silently delete a control instead of expressing a choice. It is required rather than defaulted for
the reason `frontend/CLAUDE.md` gives about the typecheck: `npm run build` never reads
`*.test.tsx`, so a default of `{}` would let a call site quietly test a screen with no filters.

**The search field must stay in the header, outside the state conditional, and that is a
correctness requirement.** It keeps its focus and its caret across a filter change only because
its position in the tree is identical in all three states, so React reconciles it instead of
remounting it. Move it under `<main>` - into the branch that swaps between the table and the
empty card - or key the screen on anything, and every keystroke loses focus once the debounce
lands. `TransactionsScreen.test.tsx` pins that it is inside `<header>` and not inside `<main>`,
because the failure is invisible in a diff.

**PET-67 moved it under `<main>` anyway, and the paragraph above is worth keeping because every
sentence in it is still true of the mechanism and the conclusion no longer follows.** The product
owner asked for the search field and the period control to swap places, so the field now sits in
`TransactionFilterBar` between the category and sort pills, and the header draws the account's real
period history through `(app)/transactions/TransactionPeriodSelect.tsx`. What makes that safe is a
fact about the states rather than about the tree: the bar is dropped in the `empty` state alone, and
**no keystroke can reach that state.** `lib/transactions.ts` decides `empty` from an account-wide
`period=all` probe, so it means "this account has never logged anything" where a filter that matched
nothing is `noResults`, which keeps the bar. A user who can type is therefore never in the state that
removes the field, and the field's position is identical across every state a keystroke can move
between - which is the whole of what reconciliation needs. Read the old paragraph as the reason the
field cannot live inside a conditional that a _filter change_ can flip, which is still the rule.

Four consequences worth knowing before touching either screen. **The designed empty state now draws
no search box at all**, which is defensible (nothing to search) and which neither TRN-3 nor A15 says
anything about. **`PeriodSelect` grew an exclusive-union navigation arm** rather than a wider href
builder, and the reason is a hard constraint rather than taste: a period change here has to preserve
the other three filters, so `periodHref` (which rebuilds the query string from scratch) is wrong, and
an `hrefFor` prop is impossible because `TransactionsScreen` is a **Server Component** and a function
prop cannot cross into a Client Component. So the arm is `onSelect`, and
`TransactionPeriodSelect` is the client component in between that supplies it - which then earns its
keep twice by routing the change through `FilterNavigation`, so a period change dims the table like
every other filter on that screen where the Dashboard's own `router.replace` cannot. **`?period=all`
survives as one appended option**, because it is the single filter whose response carries
`period: null` and so the one value `GET /api/periods` cannot supply; `previous` becomes URL-only,
reachable from a link and from no control. And **`PERIOD_OPTIONS` in `filters.ts` changed job** from
the pill's option list to `isPeriod`'s parse allowlist, which is why all three entries have to stay
even though two are no longer picked by name.

**It also reinstates PET-19's AC3, which this file records as having lost twice.** The paragraph
under The app shell says AC3 "claimed the month select appears on Transactions too" and that TRN-1
and node `26:137` won; that is what has been overridden, so the two paragraphs saying the design won
are history on the period specifically. The rest of that note stands: Figma still draws a search
field there, and the deviation is a product decision rather than a reading of the frame.

**The filters live in `searchParams`, which is the choice PET-30 left open, and
`app/(app)/transactions/filters.ts` is where the decision is written down.** Three things about
it are worth knowing before touching that page. The URL keys are the backend's own parameter
names, so `filterHref` and the API request are built by one function and cannot drift. A default
is written as the **absent key** rather than `?period=current`, so one view has one URL - which
means the parsed filters are sparse while every select needs a resolved value, and a pill reading
blank on a bare `/transactions` is that mistake. And parsing is **load-bearing rather than
defensive**: every one of those four keys is validated by the backend and answers 400, which
`authorizedGet` reports as `unavailable` and `readTransactions` throws on - so `?sort=lol` is not
an ignored filter, it is the whole screen replaced by the error boundary. That sentence used to
end "and there is no `error.tsx` anywhere in this app", which was true and is not: PET-21 added
one at `app/error.tsx`, so what a junk parameter now costs is our screen rather than Next's.

**`TransactionSearch` is the smallest client boundary on the screen, and its state machine is not
optional.** A plain `value={filters.search}` fails twice over: without a debounce React re-renders
with the old prop before the server answers and typed characters visibly disappear; with one, the
prop lands mid-word and React's controlled-input commit collapses the caret to the end. So the
value is local state, the URL is write-mostly, and the field re-reads the URL only when the prop
_changed_ **and** the change was not its own echo. Both halves of that condition are load-bearing:
comparing against the last write alone reads the component's own pending navigation as somebody
else's and empties the box. It is written as a render-phase state adjustment because
`react-hooks/set-state-in-effect` rejects the effect version and `react-hooks/refs` rejects doing
it with a ref, which is why the echo is state rather than the `useRef` it obviously wants to be.

**`FilterNavigation.tsx` owns the screen's one transition, and it exists because a pending
state has nowhere else to live.** The search field and the three selects are separate client
components on opposite sides of the `<main>` boundary, and the thing that should dim is the
table, which is a Server Component between them. The first version of this ticket gave
`TransactionsTable` a `pending` prop and shipped with nothing able to pass it: the affordance
existed in a file, had tests that set the prop by hand, and was wired to nothing - which is the
exact failure mode `frontend/CLAUDE.md` warns about for a class map, arrived at from a different
direction. So the `useTransition` is hoisted to a provider wrapping the whole screen, both
controls navigate through it, and `PendingRegion` wraps the table and reads it. `useFilterNavigation`
throws outside the provider rather than returning a no-op, the call `AddTransactionProvider`
makes: a control that quietly stops navigating is a bug that looks like a slow network.

Two consequences. The provider has to wrap the **header** as well as `<main>`, or the search
field throws. And `isPending` turning true is **not assertable in jsdom** - a transition stays
pending only while something inside it suspends, which in the real app is `router.replace`
suspending on the RSC payload, and a mocked router resolves immediately. That is the same class
of gap `Modal` records for Escape and its focus trap, and the same answer applies: the tests pin
that the region is mounted and silent at rest, and the busy state itself is a browser check.

**The table is a real `<table>`, and PET-57 deleted every number this paragraph used to carry.**
It said the column widths were the designed ones plus 16, because a table has no `gap` and
Figma's 16px between columns had to be absorbed by each declared width - `w-[166px]` for a 150px
CATEGORY column - and it named three token-era classes for the card. **All of that is gone and
none of those classes exists**: daisyUI's `table` puts `padding-inline` on every cell, so nothing
is `table-fixed` and the browser measures the columns from their content, and the box is the
stock `overflow-x-auto rounded-box border-base-300 bg-base-100 border` div the component ships
with. `shadow-card`, `border-subtle` and `border-default` were tokens the 26-line `globals.css`
no longer defines, so writing one now compiles to nothing at all - the silent-failure mode this
migration inverted, arrived at from the documentation rather than from the code. The card's
radius and border colour and the rules between rows are the theme's, and `AccessCard`'s box is
`card bg-base-100 shadow-sm`, which is what to compare against if a second card ever needs to
match this one.

**A row is not a link and the kebab is not a button.** Frame 08 is PET-34's and frame 10 is
PET-33's, and neither exists, so AC7 is drawn and deliberately not wired - the same call the two
tabs, the month pill and the search pill before it all made. `pages.test.tsx` still pins
`queryByRole('link')` empty on this page, and it now holds **by decision** rather than by absence
of features, which is worth knowing before somebody deletes it as stale. PET-33's diff is a span
becoming a `<button>` plus an `sr-only` label on the header's deliberately empty fifth cell;
PET-34's link belongs on the **merchant cell** rather than the row, and the argument is worth
restating here because the file that used to hold it is gone: a link wrapping the whole row takes
its accessible name from everything inside it, so every row would announce as "Whole Foods
Groceries Oct 8 −$86.40" - the merchant is the only cell that names the thing being opened. (This
cited `ui/ListRow.tsx`, which PET-57 deleted, leaving the one recorded reason unreachable.)

**PET-33 landed the kebab half of that, and the prediction above was right about the diff and
wrong about the boundary.** The span is a `btn btn-ghost btn-square btn-sm` and the fifth header
cell is named, exactly as written. What it did not anticipate is that
`transactions/TransactionRowMenu.tsx` needs **no state at all**: the menu is daisyUI's popover
dropdown, so `popovertarget` opens it and `popovertargetaction="hide"` closes it, and the
`'use client'` is there only because Delete calls into a context. `TransactionRow.tsx` was split
out of the table in anticipation of holding that state and **stays a Server Component** anyway.
The row's own half is unchanged: a click still opens nothing, and `queryByRole('link')` still
holds.

**The menu is a popover rather than React state, and the argument is the one this file makes
twice already.** AC1 asks for "clicking elsewhere or pressing Escape closes it", which is light
dismiss and the Escape default action - the platform gives both plus the top layer, so nothing
picks a z-index and nothing listens on `document`. daisyUI 5 requires it independently: its
`dropdown` rules forbid the legacy `tabindex`, `<details>` and focus-based forms. Two costs, both
recorded rather than fought. **jsdom 26.1.0 implements none of the Popover API** and
`jest.setup.ts` deliberately polyfills none of it, unlike `<dialog>` - faking light dismiss would
turn AC1 into a test of the fake - so under Jest the menu is permanently open, the suites assert
the wiring, and opening and closing are Chrome and Storybook checks. And **Firefox does not
support CSS anchor positioning**, where daisyUI's own `@supports` fallback centres the menu
behind a dimmed backdrop instead of anchoring it.

**"Edit" in that menu is `menu-disabled`, and it is a different kind of dead control from the
ones above it.** The month pill, the search pill and both tabs are things that look operable and
are not; this one announces `aria-disabled` and says so. PET-32's edit modal does not exist, and
the alternatives were a live item that does nothing - the failure every inert control on this
screen exists to avoid - or dropping the item, which makes frame 10 a different design. It
amends AC2, and PET-33's Jira ticket carries the note.

**PET-32 made it live, and both attributes are gone.** It is an ordinary `<button>` now, shaped
exactly like the Delete beside it - `popovertargetaction="hide"` on the way out, and
`triggerRef.current?.focus()` before opening, because `Modal` captures `document.activeElement` on
mount and React flushes the click synchronously, so without it the captured element is a menu item
about to be hidden inside a closed popover. What it hands over is deliberately **wider** than
Delete's four fields: the whole transaction, because a row already carries `note` and `categoryId`
and those are exactly the two a prefilled form cannot do without and a confirmation has no business
reading. That is what makes AC1's "every field is prefilled" cost no request. The paragraph above
is left standing rather than rewritten, because the reasoning for shipping it disabled is still the
right call for the next control in that position.

**Both tabs are inert, and "Categories" specifically must not become a link.** It opens frame 13,
which is PET-36's route and has no `page.tsx` behind it, and `lib/routes.test.ts` asserts with
`fs` that every declared route does - its `PENDING` list is empty and stays. So a link here would
either 404 or force exactly the kind of exemption that turns that check into a lie. Neither label
is a `<button>`, `<a>` or `role="tab"`, matching the month and search pills, and both
`pages.test.tsx` and `TransactionsScreen.test.tsx` pin it. Making them real controls is PET-29's
AC2. The count badge beside "All transactions" is the one real thing in the bar, and it reads
`total` rather than `transactions.length` because the contract says to: a future page size must
not silently turn TRN-2's badge into a page count.

**PET-29 did not make them real, and that amends AC2.** Everything else on the page became
operable in that ticket and these two deliberately did not, because the reason above has not
changed: frame 13 is still PET-36's and `routes.test.ts` still keeps an empty `PENDING` list. AC2's
first half - the badge showing the real total - shipped in PET-30 and is untouched. So the
inertness here is now a recorded decision rather than a screen nobody has got to yet, and the
assertions pinning it should be read that way.

**The no-results copy is ours, and it amends A15 and PET-30's AC5.** Both said to reuse frame
07's message until a variant is designed. That message reads "Log your first expense and it'll
show up here" - shown to somebody with a hundred transactions whose search matched nothing, that
is not thin copy but wrong copy, reporting the account as empty when it is full. So the
no-results state keeps the card, the glyph and the button and changes the two strings, and
`docs/TODO.md` records the amendment plus these two strings joining what A29 owes a designer.
The designed state keeps Figma's UK "categorised" (A30). `TransactionsEmpty.tsx` exports both
copy objects so no test or story restates a shipped string.

**`PLACEHOLDER_PROFILE` is gone too, and the shell makes exactly one read.** `requireProfile()`
in `lib/profile.ts` calls `GET /api/profile`, which stitches the names from the per-user
`profile` row together with the email from the central `users` row - the seam that made the
footer unfixable by the session read alone. Because that route is guarded, the same call answers
"is this a live session" on its way to answering "whose", so the layout has nothing left to
decide and deliberately carries no branch of its own. A second opinion is exactly what produced
the loop described under The app shell.

**`(app)/Modal.tsx` is built on the native `<dialog>` with `showModal()`, and that buys four
things nobody had to write.** The top layer, so no z-index is chosen anywhere and the box paints
over `SidebarNav`'s `sticky top-0` with no stacking context to arrange - verified in Chrome
against a sticky element at `z-index: 9999`, which the dialog still covers; focus containment;
and Escape, which the user agent turns into a `cancel` whose default action closes the dialog.
`ui/Select.tsx` makes the same argument about native controls
generally, and it is the reason the alternative - a `fixed inset-0` div with `role="dialog"`, a
hand-rolled focus trap and a chosen z-index - was rejected: it trades three browser guarantees
for three green tests over our own approximations of them. It lives beside the layout rather than
in `components/ui/` because that folder mirrors the Figma Components page and this is not a tile,
and not in `components/` because `AccessCard`'s reason for being there is spanning route segments
in _different_ trees, whereas frames 09, 11, 19, 21 and both delete confirmations all sit inside
this group.

**Its chrome is daisyUI's `modal` / `modal-box` / `modal-action`, and the plumbing that used to
be hand-held is the plugin's now.** The first version of this file documented `m-auto` (preflight
kills the UA's `dialog { margin: auto }`) and `open:flex` (a bare `flex` would outrank
`dialog:not([open]) { display: none }` and flash the box before `showModal()`); daisyUI's
`.modal` owns centring, the closed state (`visibility: hidden; pointer-events: none`) and the
dimmed backdrop, so none of that is written here any more and none of it should come back. The
box's radius, shadow, padding and max-height are `modal-box`'s, which also means a short
viewport scrolls the box instead of losing its footer. One pair of utilities on the box is
load-bearing: `translate-none scale-none`. daisyUI animates `modal-box` open through the
`scale` property, and any non-`none` `scale` makes the box the containing block for
`position: fixed` descendants - so DateField's calendar popover laid out inside the box and was
scrolled by its `overflow-y: auto` instead of overlaying the modal, which a Chrome walk of
PET-31's flow caught after every Jest suite passed. The entrance animation is the price, paid
deliberately; `Modal.tsx` carries the full account.

**Every close affordance funnels through one exit**, and `ref.close()` is a way _in_ to it rather
than a second way out. Cancel, the X and a backdrop click all call `close()`, whose `close` event
is `onClose`; Escape reaches the same place through the UA's default action, so the component
carries no keydown handler at all. The backdrop test is `event.target === dialogRef.current`,
which works because daisyUI dims the dialog element itself and the padding lives on `modal-box`,
a child - so a click anywhere outside the box, padding included, reports the dialog while any
click inside reports a descendant. The `ref` handle exists so a successful
save closes the dialog rather than merely unmounting it, which keeps every exit on the one path the
owner listens to - the `close` event.

**Two of the modal's behaviours are unassertable in Jest, and `jest.setup.ts` deliberately does
not fake them.** jsdom 26.1.0's `HTMLDialogElement.prototype` carries exactly `constructor` and
`open`, so the polyfill supplies `showModal()` and `close()` and stops there: Escape and the focus
trap are Storybook and manual checks. Faking Escape would turn AC7 into a test of the polyfill,
passing just as happily with the real handler deleted - the same call `BudgetForm`'s caret restore
already lives with. `docs/TODO.md` records the gap.

**It was three, and the third turned into a bug worth knowing about.** The platform restores focus
to whatever opened a dialog, so `Modal` originally wrote no code for it and the behaviour was
listed as another manual check. Walking it in Chrome showed focus landing on `<body>` instead: the
`close` event fires, `onClose` is where the owner stops rendering the modal, React does that
**synchronously inside the event dispatch**, and the dialog therefore detaches before the
browser's restore step completes - so the next Tab started from the top of the page. `Modal` now
captures `document.activeElement` on open and refocuses it on unmount, which covers every exit
including Escape, and which - because it is our code rather than the platform's - is asserted in
`Modal.test.tsx` rather than eyeballed. The lesson generalises past this component: **a platform
guarantee that fires during an event React unmounts inside is not a guarantee.**

**A fourth behaviour was found the same way, and it is the one that bites a `Modal` rendered inside
another `Modal`.** PET-48's Manage categories modal is the first place in this app where that
happens - the two category modals it opens are React descendants of it, where every other pair in
the app is a pair of siblings mounted by two providers - and pressing Cancel in the sub-modal closed
**both** dialogs. **React propagates `close` and `cancel` through the component tree even though
neither event bubbles in the DOM**, so the outer `Modal`'s `onClose` ran off the inner dialog's
event and its owner unmounted it. The walk caught it as an outer `<dialog>` still carrying `open`
and no longer in the document, having received no native `close` at all - which is what says React
rather than the platform did it.

`Modal` guards both handlers on `event.target === dialogRef.current` now, which is the test
`onDialogClick` had always made for the backdrop, applied to the two events that were missing it.
**jsdom cannot reproduce this and the suite says so**: `jest.setup.ts` dispatches a faithful
non-bubbling `close` that only React's element-level listener sees, so the case models React's
propagation with a bubbling dispatch instead - and it was watched failing with the guard reverted
before it was trusted. Read that as the same lesson one level up: **an event that does not bubble in
the DOM may still bubble in React**, and a component that assumes otherwise is correct exactly until
somebody nests it.

**PET-33 gave `Modal` a second shape rather than a second component.** Frame 12 is a centred icon
circle over a centred title with no X, so `align` and `icon` arrived: `align="center"` centres
the header, renders the icon in a tinted circle, splits the footer into two equal buttons and
**drops the X**. That last part is the half worth knowing - frame 12's dismissal is Cancel, which
is already on screen and named, and Escape and the backdrop still reach the same single exit, so
a confirmation with three ways to say no and one to say yes was the wrong shape. The alternative,
a `ConfirmDialog` of its own, would have duplicated the single-exit `close()`, the focus capture
and restore, and the backdrop target test - the three least obvious things in that file.

**The delete confirmation is mounted once on the layout too, and here the argument is sharper
than the Add transaction one.** `DeleteTransactionProvider` holds it and
`useDeleteTransaction().open(target)` is the seam. Add transaction has five entry points, two of
which happen to share a page; this one has a trigger **per row**, so a dialog owned by the row
menu would mount one `<dialog>` per transaction, each with its own focus trap and heading id.
Two of DEL-1's three entry points do not exist yet, and each is two lines when it does. **AC7's
"deleting from the detail page lands back on the list" is deliberately not designed in**: it
looks like an `onDeleted` on `open()`, and a callback nothing passes is precisely the shape
PET-29 shipped once as `TransactionsTable`'s `pending` prop and had to take back out. The ticket
with the caller adds the parameter.

**PET-32 was that ticket, and `open(target, { onDeleted })` is what it added.** The edit modal opens
this confirmation over itself, so a delete that really removed the row has to take that modal down
too - a caller rather than a forecast, which is the whole distinction the paragraph above draws.
Three details of it are decisions. It fires on **success only**, including not on a 404: that arm's
copy asks the user to close the dialog and see the current list, so dismissing whatever is behind it
would be a dismissal caused by a failure. It fires **after** `router.refresh()` and after the
confirmation's own `close()`, so the two dialogs unwind top-first and the focus restore aims at an
element still attached - reversed, it would detach the edit modal's Delete button before the
browser handed focus back to it. And it lives in the provider's **one state object** beside the
target, not in a ref, so a cancelled open cannot leave a callback behind to fire for somebody else's
delete. PET-34's redirect now needs no new parameter: its detail page passes an `onDeleted` that
navigates.

**The edit modal is mounted once too, and its provider is the first that consumes another.**
`EditTransactionProvider` holds it, `useEditTransaction().open(transaction)` is the seam, and it
sits **inside** `DeleteTransactionProvider` on the layout because it calls `useDeleteTransaction()`
in its own body - so the nesting order, which PET-33 could still say carried nothing, is now
load-bearing: reversed, it throws while rendering every page rather than on the first Edit click.
`(app)/layout.test.tsx` pins it with a child that opens the modal, since every other assertion in
that file would fail for the same reason and none of them would say why. Its trigger is per row like
the confirmation's, so the one-instance argument is that one's rather than Add transaction's.

**It takes a whole `Transaction` where the confirmation takes four fields, and that asymmetry is
the design.** `TransactionResponseDto` carries every field the form draws, so a caller that rendered
the row already holds everything AC1 needs and the modal fetches nothing to prefill - only the
picker's _options_ need the network, which is why every other field is right before that read lands.
The confirmation stays narrow for the opposite reason: it would otherwise be able to read a note it
has no business rendering.

**Frame 11's footer is `Modal`'s `footerStart`, and it is a slot rather than an alignment prop.**
This file used to predict "a Record keyed by alignment" for it; the prediction was right about the
class - `modal-action justify-between` - and wrong about the shape, because the third layout is not
a third _alignment_ but the presence of a left-hand control. So the caller passes the control and
the alignment follows, which makes the two impossible to disagree; the right-hand pair gets its own
`flex gap-2` box, or `justify-between` would strand Cancel in the middle of the row. It is on the
`align: 'start'` arm of `ModalShape` only, with `footerStart?: never` on the centred one, for the
reason that union already existed: frame 12 has nowhere to put one, and a prop that typechecks and
then renders nothing is exactly what the `never` on `icon` was added to stop.

**The edit form sends only what changed, and an unchanged form sends nothing at all.**
`(app)/transactionForm.ts` gained the two boundaries - `toTransactionFormValues` in, and
`toUpdateTransactionBody` out - and three of their rules matter outside that file. A blank Note over
a stored one becomes `null`, which is the only way to clear a note; a blank Note over an absent one
contributes no key at all; and an empty diff means the modal **closes without a request**, because
`PATCH /api/transactions/:id` answers 400 to an empty body and that is a correct answer to a
question the user did not ask. The amount is compared as a number, so retyping `24.00` over `24` is
not an edit.

**The categories read is shared now, in `(app)/useCategoryOptions.ts`.** Both transaction modals
need the identical fetch-on-open, and it was lifted rather than duplicated - a deliberate exception
to the rule of three, because what is in it is a generation guard against a late response and a path
string that is one half of a contract with `app/api/categories/route.ts`. Its `read()` is called
from the opener rather than from an effect, and that is not a simplification: resetting the previous
open's state is a synchronous `setState`, which `react-hooks/set-state-in-effect` rejects inside an
effect body, so the effect version needed two seams to express one event.

**The Add transaction modal is mounted once, on the layout, and that is a correctness requirement
rather than a tidiness one.** `AddTransactionProvider` holds it, `AddTransactionButton` is the
trigger every entry point renders, and `useAddTransaction()` throws outside the provider rather
than returning a no-op. Four triggers exist - the Dashboard header, the Dashboard insight teaser's
empty state, the Transactions header and the Transactions empty card - and the last two are on
**one page**: a component owning its own
modal would mount two `<dialog>` elements there, with two focus traps and two copies of every
field id, which `ui/FieldShell` requires as a literal prop precisely because `useId` would force
`'use client'` onto the field layer. Duplicate ids make `getByLabelText` ambiguous, which is the
failure PET-30's own `pages.test.tsx` comment already names. The payoff is that PET-25's DSH-9
teaser added its trigger in two lines with no prop threading through `<main>` - the unlock state's
`AddTransactionButton`, its "Add transaction →" the one label variant this component ever needed,
exactly as predicted here before it landed. **PET-42-43-44 paid the same two lines for INS-7**, the
AI Insights empty state, which is the fifth trigger and the last one ADD-1 names - so that sentence
is settled rather than owed, and the prediction held a third time.

**A closed modal renders nothing, and the reason is text queries rather than role queries.** A
closed `<dialog>` is `display: none`, so `queryByRole` cannot see inside it - but
`queryAllByText` and `queryAllByLabelText` **can**, so an always-mounted modal would put a
combobox, a textbox and five labels into every screen's tree forever. `(app)/pages.test.tsx`
depends on this in two places: its inert-control assertions would break for reasons having
nothing to do with the header pills they are about, which is why that file now also asserts the
absence of a dialog directly.

**The categories are read on open, through the frontend's own route handler.** Not in each
`page.tsx`, which would pay for the request on every load whether or not anybody opens the modal
and make three otherwise-synchronous pages async; and not on the layout, which would put a second
guarded read into the shell - the shape the `/dashboard` to `/login` loop came out of. The
provider re-reads on **every** open with `cache: 'no-store'`, so a category created in another
tab appears, and it guards against a read landing after the modal was closed and reopened. The
one string that must not drift is the fetch path, which exists in `app/api/categories/route.ts`
and in the provider; the provider's suite asserts it exactly, because `lib/routes.ts` deliberately
does not declare it.

**`(app)/DateField.tsx` is the one place in this feature where Escape needs code.** ADD-7 draws
the Date field as a closed select and Figma opens it nowhere, so the trigger is read off the
design and the mini-calendar is entirely ours (A14 owes it a confirmation, and `lib/calendar.ts`
records what "ours" covers). It is a `<button>` wearing daisyUI's `select` class - the box,
padding and chevron all come with it - because a native `<select>` cannot host a popover; and
the popover's keydown handler must
`preventDefault()` the Escape, or the surrounding `<dialog>` treats it as a close request and
shuts the whole modal, discarding everything typed. First Escape closes the popover, second
closes the modal.

Three smaller decisions in that field are worth not re-litigating. Its trigger is named by
`aria-labelledby` pointing at `ui/FieldShell`'s label **and a value span inside the button**,
because HTML-AAM computes a button's name from its own subtree and would ignore the `<label for>`
entirely - which is why the shell puts an id on its label. `aria-selected` sits on the `gridcell`
rather than on the day button, since the `button` role does not support it, and today is marked
with `aria-current="date"` instead. And it sets **no `aria-invalid`**, unlike `Input` and
`Select`: those are real form controls whose roles support it, a button's does not, and this repo
keeps no eslint-disable comments - so `select-error`'s border and `aria-describedby` carry the
state.

**PET-59 gave the modal a sixth prop, `scan`, following `create`'s own reasoning exactly.** It is
injected rather than imported, so the suite passes a `jest.fn()` and the `@/` alias trap never
comes up; `AddTransactionProvider` wires the real `lib/scanReceipt.ts` action, matching
`create`'s wiring line for line. The two file inputs sit in their own tinted panel above Amount -
`pointer-fine:hidden` on the camera one, so a desktop never sees a control that opens the
identical file picker under a second label - and both carry `btn-outline btn-primary`: peers, not
a primary and a secondary, so no `btn` style modifier has to vary by viewport (a paired _style_
modifier, unlike a paired colour one, is resolved by daisyUI's emission order rather than by the
attribute - see `frontend/CLAUDE.md`, Where daisyUI and Tailwind fight). The loading overlay is
`absolute inset-0` over a `relative` wrapper around the scan panel and every field, not over the
whole `modal-box`: `Modal.tsx` owns the header and footer as separate props from `children`, so a
full-box overlay would need a slot that component does not have, and the header's Close and the
footer's Cancel staying reachable underneath the overlay is an acceptable substitute for the
preview's fully-covering plate.

**The merge tracks touched fields, not empty ones, and `set()` is the one function that marks a
field touched.** `values.date` starts as `todayIsoDate()`, so an emptiness test would refuse to
ever overwrite it; `mergeScannedFields` in `(app)/transactionForm.ts` instead takes a
`ReadonlySet<keyof TransactionFormValues>` built only by real edits, which is what lets a scan
fill the receipt's actual date on an untouched form and leaves a typed field - blank or not -
alone. The set is local `useState`, never derived from `values`, precisely so the merge itself
never marks anything touched.

**The review of PET-59 changed both halves of that sentence, and the paragraph above is dated to
before it.** The set is a **ref**, not `useState`, and the merge **does** add to it. Take them in
turn, because each fixes a defect rather than tidying a shape. As state it was read from the
render closure that started the scan, and `handleFiles` reads it across two awaits - so a field
typed into while the receipt was still compressing was silently overwritten by the result, which
is the exact case the set exists to prevent. Nothing renders from it, so a ref is not merely
adequate, it is the only spelling that reads the value at the moment of the merge. And a scan's
own fields have to join it, or "Add pages" is not what the label says: that control sends only
the newly picked file, the model reads that page alone, and page 2's guess at the merchant would
replace page 1's correct one. So the set is now every field somebody decided on - typed or
scanned - and `(app)/transactionForm.ts` calls it `locked` rather than `touched` for that reason.
The one thing it deliberately still never tracks is emptiness, which is the half of the paragraph
above that stands unchanged and is the whole reason `date` is overwritable at all.

**Two mechanical consequences worth not undoing.** The ref is **replaced, never mutated**:
`setValues` takes a functional updater that React runs later, so widening the set in place would
hand the deferred merge a set already claiming every field it was about to fill, and it would fill
nothing. And the caller needs the filled list _before_ the merge runs, which no updater can hand
back, so `scannedFieldsToFill` is exported beside `mergeScannedFields` and the merge is written in
terms of it - one authority, two entry points. The list is needed twice: to widen the lock, and to
clear those fields' validation messages, because the merge is the one write to `values` that does
not go through `set()`, which is otherwise the only thing that clears one.

**The overlay covers compression, and the scan call is wrapped in a `try`.** Both were review
findings on the same handler. `setScanning(true)` fires before `compressReceiptFiles`, not after:
four 12MP photos take seconds, and until the overlay appears there is no spinner, both file inputs
are enabled and the click reads as ignored - so a user re-picks and starts a second `handleFiles`
that silently invalidates the first through `scanTokenRef`. And a Server Action call can **reject**
rather than resolving to `{ ok: false }` - a body over `next.config.ts`'s `bodySizeLimit`, a
connection dropped mid-action - which, uncaught, skipped every `setScanning(false)` and left the
overlay up forever with nothing on it but Cancel. Both onChange handlers invoke this as
`void handleFiles(...)`, so there is no caller to catch it either. There is also now one
client-side size check, and it is **PDFs only**: an image is compressed toward 0.75MB first so its
prior size says nothing, while a PDF is passed through untouched and is the single file that can
reach the action over the body limit.

**There is no client-side abort for a scan in flight, only a soft one.** Unlike `authorizedPost`'s
plain `fetch`, calling a Server Action exposes no `AbortController` a client component can reach
into - so the overlay's "Cancel scan" invalidates a ref-held generation counter instead: the
request may finish server-side, but its result is discarded if the token it captured no longer
matches. The backend's own `RECEIPT_SCAN_TIMEOUT_MS` is what actually bounds the call; this only
bounds how long the UI waits on it.

**`/transactions/[id]` is the app's first dynamic route, and PET-34's detail page fills it.** Same
split as `/transactions`: `page.tsx` is async and fetches, `TransactionDetailScreen` is
synchronous and takes the resolved response, which is what lets `Screens/08 Transaction detail`
render five states with no request scope. **One read serves the whole frame** -
`GET /api/transactions/:id` answers the transaction, its category with that category's month
stats, and up to five siblings - so nothing here calls `lib/categories.ts`, and `SIDEBAR_HREFS`
gains no entry: it declares the four sidebar destinations, and `SidebarNav` already matches by
prefix with a trailing-slash boundary, which is why `/transactions/abc` keeps Transactions lit.

**It brings the app's first `not-found.tsx`, scoped to that segment rather than the root.** Placed
here it renders inside the shell, so a stale link keeps the sidebar and a way back; at the root it
would replace the page and leave the reader nowhere. A backend that cannot answer still throws.
What changed is that "deleted" and "unreachable" stopped being the same answer: `authorizedGet`
grew a `missing` arm for a 404, and `readTransactionDetail` turns it into `notFound()`. A
**non-UUID** id is a 400, not a 404, so it still reaches the error boundary - the two mean
genuinely different things, and `?sort=lol` on the list is the existing precedent for the second.
(This paragraph used to add "there is still **no `error.tsx` anywhere** and this does not change
that", which was true when PET-34 landed and stopped being true one ticket later: the paragraph
below is where PET-21 adds it.)

**`PageHeader` has a second shape, and it is the same call PET-33 made for `Modal`.** Frame 08
draws a breadcrumb where the four routed views draw an overline, plus a caption row under the
title, so `PageHeaderShape` is an exclusive union with `never` on the opposite arm - the technique
`ui/Button`, `Modal` and `CheckEmailScreen` already use. A second component would have duplicated
the one thing that must not exist twice: the page's `h1`. The paragraph above saying the header
"owns the overline, the title and a slot - nothing else" is still the rule for the four screens;
this is a second shape rather than a fourth slot on the first.

**The list's filters round-trip through the URL, and that is what the merchant link carries.**
`TransactionsTable` builds `toQuery(filters)` once for the table, each row appends it to
`/transactions/{id}`, and the detail page parses it back with `parseTransactionFilters` and
rebuilds the target with `filterHref` - so the breadcrumb and Delete both return the user to the
list they were actually looking at. Two things not to re-derive. The parser **validates and does
not canonicalise**, so `?period=current` survives the trip rather than being tidied to nothing;
the "a default is the absent key" rule belongs to the filter controls, which reset by passing
`undefined`. And the detail page drops an invalid value rather than forwarding it, so a
hand-edited `?sort=lol` costs the user their sort here where on the list it 400s the whole screen.

**Deleting from the detail page navigates, and that is the caller `onDeleted` was added for.**
`TransactionDetailActions` is the page's one client boundary and passes
`router.replace(backHref)` - **replace**, not push, because this page is about to describe a
transaction that no longer exists and Back would land on its 404. It is also why this entry point
sidesteps the focus-restore gap rather than adding a fourth route to it: the whole page goes away.

**A navigating caller must also say so, and a code review is why `navigates` exists.** The
confirmation's success path refreshes before calling `onDeleted`, which re-runs the route the user
is **currently** on - right for the list, and actively wrong here: it re-reads the transaction just
deleted, gets a 404 and renders the not-found boundary, racing the navigation. So
`useDeleteTransaction().open()` takes `navigates`, and the dialog skips its refresh when it is set.
Nothing goes stale, because every route in this app is dynamic and Next holds dynamic segments in
the client cache for zero time, so the navigation refetches.

**The same options go to `useEditTransaction().open()`, because the modal is a second delete entry
point on the same screen.** Its "Delete transaction" opens the same confirmation, so passing the
redirect to only the header button made one screen do two different things one click apart - and
the modal path left the user on the not-found card for the row they had just deleted. The opener's
options now compose in front of the provider's own `setRequest(null)`, and they live in the same
state object as the row so a cancelled open cannot leave a redirect behind for somebody else's
edit. `EmptyState` also gained `headingLevel={1}` for that boundary, which was shipping with an
`h2` as the topmost heading on the one screen in the shell with no `PageHeader` above it.

**`app/error.tsx` is the app's error boundary, and it is the file four `lib/` modules already
assumed existed.** `lib/profile.ts`, `lib/transactions.ts`, `lib/categories.ts` and
`lib/dashboard.ts` each end their failure policy on "so Next's error boundary renders something a
reload retries", and until PET-21 there was no `error.tsx` under `src/app` at all - so what that
sentence actually described was Next's built-in "Application error: a server-side exception has
occurred", with no chrome and no control. PET-21 forced it rather than introduced it, because
`/dashboard` is where `/auth/verify` lands after a login. Three things about it are decisions.
**One boundary at the root, not one per segment**: `app/error.tsx` wraps everything below the root
layout, `(app)/layout.tsx` included, so a `requireProfile()` that throws lands there too - which a
boundary inside the shell could not catch - and the price is that the sidebar goes with it.
**`ErrorScreen.tsx` is a separate file** for the reason `WelcomeScreen` and `CheckEmailScreen` are:
a boundary is a fixed Next contract, and the screen beside it is something Storybook can render and
a suite can mount. And it is the **second screen in this app with no Figma frame behind it**, so it
borrows `VerifyFailedScreen`'s answer - `AccessCard`, one heading, one line, one control - and its
strings join what A29 owes a designer. It shows `error.digest` and never `error.message`, because
production redacts the message to a generic string and the digest is the half that ties the screen
to a server log line.

**PET-36 built `/transactions/categories`, and every paragraph above saying the two tabs are inert
is history now.** Read them as dated: "Categories" opened frame 13, that frame had no `page.tsx`,
and `lib/routes.test.ts` keeps an empty `PENDING` list - so a link would have 404ed or forced an
exemption into the one check that catches a renamed route. The route exists, so both labels are
real `next/link`s and the reasoning has expired rather than been overturned.

**It is a nested route rather than a top-level `/categories`, and the sidebar is the whole reason.**
`SidebarNav.matchItem()` maps a pathname to one of the four sidebar items by prefix with a
trailing-slash boundary and returns `undefined` for a miss, which the caller turns into
`FALLBACK_ITEM`, `'dashboard'`. A sibling path would therefore have lit **Dashboard** while the tab
bar on that very page said Transactions, and frame 13 draws Transactions lit. Nested, it needs no
change to that file at all - the same free ride `/transactions/[id]` already takes. It is also a
static segment beside a dynamic one, which Next resolves first, so no transaction id can shadow it.

**The tab bar is a `<nav>` of links and deliberately not a tablist, which corrects what this file
predicted.** The old paragraph said making the tabs real was "two `next/link`s plus `aria-current`,
or a full tablist if the Categories view ends up client-side" - the second half is wrong for a
reason that has nothing to do with where the view renders. The ARIA tab pattern describes one
container swapping panels in place, with `aria-controls` pointing at a `role="tabpanel"` in the
same document; these two navigate to separate routes and replace the whole page. So `role="tab"`
would promise a relationship that does not exist, and both `pages.test.tsx` and
`TransactionTabs.test.tsx` pin its absence.

**The bar uses no daisyUI `tab` or `tabs` class at all, and this paragraph said otherwise until a
review caught it.** It described a version built on stock `tabs tabs-border`, where
`[aria-current=page]` drew the underline through the plugin's own active-state selector and the
inactive label was dimmed by its `:not()` rule. That version was replaced before merge, because
`tabs-border` draws a **3px `currentColor`** underline **inset by the tab's inline padding**
where the design draws a **2px accent** rule spanning the **full tab** - and neither is reachable
from outside, since `--tab-border-color` and `--tab-p` are both set at a specificity of (0,3,0)
against a utility's (0,1,0). So `TransactionTabs.tsx` is plain utilities: `LABEL_CLASS` writes the
`text-base-content/50` dimming out by hand, and the underline is an `aria-hidden` span carrying
`bg-primary absolute inset-x-0 -bottom-px h-0.5`. **Neither is a plugin-supplied duplicate and
deleting either leaves the bar with no visible current-page indicator**, which every test would
survive - the suites assert `aria-current`, not the paint. That is what the browser walk is for,
and it measures the rule's height, span, position and colour in both themes.

**`TAB_HREFS` in `TransactionTabs.tsx` is the third route declaration in this app, and it had to
be.** `SIDEBAR_HREFS` declares the four the sidebar renders and `lib/routes.ts` declares the six
access screens, and that file says outright the two sets must not restate each other.
`/transactions/categories` is neither: an app route that is not a sidebar destination. It is
declared once beside the component that links to it, built from `SIDEBAR_HREFS.transactions` so the
nesting cannot drift, and `TransactionTabs.test.tsx` asserts with `fs` that both hrefs have a
`page.tsx` - the same check `SidebarNav.test.tsx` and `lib/routes.test.ts` run for their own sets,
and one this route would otherwise escape entirely.

**Two controls on that screen ship inert and say so, which is PET-33's precedent rather than the
month pill's.** The card kebab is PET-39's - its AC1 describes the same menu - and the header's
"Add category" is PET-37's, so both render as real `<button aria-disabled>` rather than as enabled
controls that do nothing or as inert `div`s announcing nothing. **`aria-disabled` rather than
`disabled`** throughout, including the two banner actions: `disabled` removes a control from the
tab order, so the screen's most prominent action would be unreachable by keyboard and unannounced.
That also means `ui/Button` was **not** widened to carry the state - it offers `disabled` only, and
a local `<button>` wearing the same `btn btn-primary` literal is what PET-37 replaces with a
provider-backed trigger.

**The uncapped card is the state frame 13 does not draw, and it is the common case.** A cap is
optional and the preselected `Uncategorized` fallback ships without one, so `status: "uncapped"` is
what the one category every account has reports. `CategoryCard` therefore has two shapes, and the
guard tests `monthlyCap` as well as `status` because the contract types every derived field as
nullable independently - a card built on `status` alone can still print "of null". Same answer
PET-34 gave for the same gap on the detail page: draw none of the budget furniture rather than
explain its absence.

**PET-37 made "Add category" real, and the paragraph above is now history in one respect: the
provider it predicted does not exist.** `AddCategoryButton` owns its own open state and renders the
modal itself. `AddTransactionProvider`'s one-instance-per-shell rule is not a style to copy - it
exists because ADD-1 lists five triggers across three routes and two of them sit on one page, which
would mount two `<dialog>` elements with two focus traps and two copies of every field id, the ids
`ui/FieldShell` requires as literal props precisely because `useId` would force `'use client'` onto
the field layer. One trigger on one route has none of that, and a context with a single consumer
expresses no choice. PET-38's Edit modal does not change it either: a per-card kebab is a different
trigger carrying different state, not a second way into this one. The card kebab is still PET-39's
and still `aria-disabled`.

**The palette is a prop threaded from `page.tsx`, not a fetch on open, and the two shapes are not
interchangeable.** `transactions/categories/page.tsx` reads `GET /api/templates/palette` as a third
entry in the `Promise.all` it already had, and `CategoriesScreen` passes it through. That costs one
request per view of the tab for a modal that usually does not open - `docs/TODO.md` records the
price - and it buys away a route handler, a hook, and the null-versus-failed-versus-loading triple
`AddTransactionModal` has to model. The read is server-side, so the token never leaves the server and
Storybook can render the whole screen from a literal. **Do not give the palette read the categories
read's failure policy**: a failed palette is `null` and a degraded modal, never a throw and never a
redirect, because only the categories read decides whether the session is alive - two opinions about
that on one page is the shape the `/dashboard` to `/login` loop came out of.

**The budget field is optional and its label is the only thing that says so**, which is the one place
this app's UI states a rule instead of enforcing it silently. `CreateCategoryDto` accepts an absent
`monthlyCap` and rejects `0`, so `categoryForm.ts`'s `isCapValid` returns **true for `''`** - and the
whole decision lives in that one line, deliberately, so it is testable without a DOM. Two
consequences worth carrying: an untouched form produces **one** message rather than two, because only
the name is wrong; and the budget's message has to name blank as a valid choice ("or leave it blank
for no limit"), because the field looks required and nothing else on screen says otherwise. A19 and
A29 still owe the treatment a sign-off, which `Screens/19 Add category`'s `WithMessages` story exists
to collect.

**The Color field is `ColourSelect`, a control of our own, and the Icon field beside it is still
`ui/Select`.** That asymmetry is deliberate and the reason is worth knowing before anyone "fixes" it. A
native `<option>` cannot contain markup in any browser that matters and its tick is drawn by the
operating system, so a swatch-and-tick list is unreachable from a native control; Chromium's
`appearance: base-select` would give both, but daisyUI ships nothing for it, so opting in means
hand-written CSS re-creating what daisyUI already provides, in one browser only. **Three rules carry
over from elsewhere and must not be undone.** The popover is the platform's, exactly as in
`(app)/transactions/TransactionRowMenu.tsx` - `popovertarget` opens it, `popovertargetaction="hide"`
closes it, and the only React state is the one `aria-expanded` needs, fed by the popover's own `toggle`
so it cannot disagree with a light dismiss. There is **no `role="listbox"` and no `role="option"`**,
because those promise a keyboard contract this does not implement; `aria-current` names the chosen row
instead, which is the third time this app has declined a roles-plus-keyboard promise. And the trigger
wears `select`'s own class string, byte-identical to `(app)/DateField.tsx`'s, so the two fields are one
box when closed and differ only when opened. The costs - no arrow keys, no native mobile picker, no
anchoring in Firefox, and a panel Figma never drew - are all in `docs/TODO.md`.

**The Icon field is `IconSelect`, and the sentence that used to end the paragraph above - that Icon
stays native because 64 options want a grid - was answered in the same PR rather than deferred.** It is
the same trigger and the same platform popover, holding a **search box over a six-across scrolling
grid**; the shapes differ because sixteen colours read as words and 64 glyphs are looked for by shape.
So this modal imports `ui/Select` nowhere, and the two fields differ from each other only in what the
panel contains. Three things in it are load-bearing. **Enter in the search box is intercepted**, because
`(app)/Modal.tsx` wraps the body in a real form so Enter submits it - correct for every other field, and
it would create the category from two letters of a search here. **The search matches the lucide name as
well as the label**, because "Television" is `tv` and nobody typing knows which vocabulary they hold.
And the cells are `w-full aspect-square p-0` rather than `btn-square`, which a browser walk forced: six
fixed cells fit the panel until the vertical scrollbar takes 15px, and `overflow-y: auto` makes
`overflow-x` compute to `auto`, so the panel grew a second scrollbar along the bottom. The search box
itself and its empty state are invented, and `docs/TODO.md` records that they owe a designer.

**Both pickers centre their chosen row when the panel opens, through `lib/pickerScroll.ts`, and
the one thing not to simplify is that it is not `scrollIntoView`.** That method scrolls _every_
scrollable ancestor, and a panel is a DOM descendant of daisyUI's `modal-box`, which is itself
`overflow-y: auto` - so centring a cell would also jog the modal behind the popover, which reads as the
page lurching. The helper writes one `scrollTop` on one element and can move nothing else. It finds the
row by `[aria-current]`, so the accessibility attribute doubles as the hook and there is no second
source of truth about which row is chosen. Lifted to one module at two consumers rather than copied,
which is `(app)/useCategoryOptions.ts`'s exception to the rule of three: a second hand-maintained copy
of a geometric formula is how one of them quietly stops matching. jsdom runs no layout, so its suite
pins the arithmetic against stubbed rects and the real behaviour is a browser check.
**It moved out of `transactions/categories/` to `lib/` at PET-47, and "two consumers" is now three.**
`settings/MonthStartField.tsx` is the third, and it is on another route - a settings component
reaching into the categories folder for a geometric formula would invert the layering rather than
share it. The path above is corrected in place rather than left dated, because a reader sent to a
file that does not exist learns nothing; `npm run docs:check` could not catch it, since it verifies
single-source assertions rather than that a backticked path resolves.

**The Note field exists in the markup and is not drawn, behind a `SHOWS_NOTE` flag.** Frame 19 draws
it and CED-4 specifies it; A42 is why it is hidden, because a note surfaces on no screen once saved,
and a field whose value nothing ever shows back is a request to write into a void. It waits for a
category detail page. **Read the flag's own comment before touching it** - the two things not to undo
are that it is a flag rather than commented-out JSX, so the markup stays typechecked and cannot rot
while hidden, and that nothing behind the field was removed: `categoryForm.ts` still trims and omits
`note`, its suite still pins that, and `CreateCategoryDto.note` and the `categories.note` column are
untouched. Flipping it to true fails exactly three cases in `AddCategoryModal.test.tsx`, which is the
cost of re-enabling, stated by the suite rather than left to be discovered. One consequence worth
knowing: with the Note gone, **the budget is the only label carrying "(optional)"**, so it now carries
A12's whole signal on its own.

**`color` and `icon` are literal unions on the wire, and a `<select>` hands back a `string`.** The
form models the gap rather than casting across it: `CategoryFormValues` types both as
`Token | ''`, and `hasChosenMarks` narrows to the shape `toCreateCategoryBody` will accept. The
empty string is not a placeholder the user can select - both selects are preselected - it is "the
palette did not arrive", which is exactly the state the submit guard refuses on.

**Neither field puts its value through the DOM at all, which is what closed that gap rather than
guarding it.** This paragraph used to end on the change handlers looking the chosen value up in the
palette to recover a typed token from a `string` - the honest answer while the fields were
`ui/Select`s, and false the moment `ColourSelect` and `IconSelect` replaced them in the same PR. Both
call `onChange` with the row's own `token` or `name`, already the contract's union, so `chooseColour`
and `chooseIcon` do a `setValues` and nothing else. **Read that as a property of these two controls,
not of the form**: a field wired to anything that hands back a bare `string` - a native `<select>`, a
URL parameter, a devtools-written value - is back to needing a real membership check before it may be
typed as a token, and a cast would be asserting what nothing checked.

**PET-39 made the card kebab real.** Every paragraph above calling it "still PET-39's" and "still
`aria-disabled`" is history now, and the whole of the change to `CategoryCard.tsx` is that one
attribute going away: `CategoryCardMenu.tsx` is the menu behind it, the card **stays a Server
Component**, and the `'use client'` lands on the menu alone because its Delete calls into a context.
The same boundary `TransactionRow` and `TransactionRowMenu` settled on, arrived at the same way - the
popover means there is no open state to hold.

**It does not empty the screen's inert list, and the first draft of this section said it did.** That
sentence read "so the Categories tab has no inert control left on it", which is false and was caught
by a code review rather than by any gate - the same shape of error this file's own "Two controls on
that screen ship inert and say so" paragraph exists to prevent. **Three remain, and all three are
PET-38's**: `CardBanner`'s "Set limit" on every uncapped card, which is every account, since the
`Uncategorized` fallback ships without a cap; the summary card's "Allocate" whenever budget is
unassigned; and the menu's own "Edit". All three carry `aria-disabled` rather than `disabled`, so
they stay focusable and announce their condition. Worth stating plainly because a gap list that
claims a screen is finished is worse than one that never mentioned it.

**The menu is the platform popover, which is now the fourth time this app makes that argument and the
third on this one screen**, after `TransactionRowMenu`, `ColourSelect` and `IconSelect`. Nothing new
is decided by it: light dismiss and Escape are the platform's, no z-index is picked, no listener is
attached to `document`, and the two costs are the inherited ones - jsdom implements none of the
Popover API so under Jest the menu is permanently open and the suites assert wiring, and Firefox
falls back to a centred popover behind a dimmed backdrop. It publishes **no `role="menu"` and no
`aria-haspopup`**, the fourth refusal of a keyboard contract this repo has not implemented.

**Its confirmation is mounted once by `CategoriesScreen`, and that is deliberately neither of the two
provider shapes already here.** Read `DeleteCategoryProvider.tsx` before copying either of them onto
a third feature, because the reasoning is what distinguishes them rather than the file layout. A
dialog owned by each card - `AddCategoryButton`'s shape, and the obvious one - sits **inside the card
being deleted**, so the success path's `router.refresh()` can unmount the dialog out from under its
own `close()`; that is this file's own rule about a platform guarantee firing during an event React
unmounts inside, reached from a new direction. A dialog on `(app)/layout.tsx` -
`DeleteTransactionProvider`'s shape - would put a category dialog on all four routes to serve one
screen, where that provider's own criterion is three entry points across three segments and
`AddTransactionProvider`'s is five triggers across three routes. Screen-scoped is the shape that fits
N triggers on one route, and PET-38's "Delete category" enters through the same seam.

**Three amendments to PET-39 are visible in the copy, and two of them are worth not "correcting"
back.** The dialog says **`Uncategorized`, not "Other"**, because that role was deliberately split
when the backend was built - "Other" is an ordinary chip anyone can rename or delete, and the row
deletions reassign to is the `isFallback` one; `CategoriesScreen` resolves the name off its own list
response so no string here claims to know the backend's name for that row. It says the count is
**this month's**, because `transactionCount` is the current period's while the delete moves every
transaction the category ever held, so the ticket's sentence understates on any account with history.
And **Delete is omitted on the fallback card** rather than offered and refused, which is AC6; the
409 is still classified in `lib/deleteCategory.ts`, because a hidden control is not an enforcement.
The consequence to know before PET-38 lands is that the fallback card's menu is a single disabled
"Edit", i.e. a menu with nothing operable in it.

**`lib/deleteCategory.ts` publishes four reasons, which is one more than either existing delete**, and
the extra arm is the 409. That is the only interesting thing about it; everything else - the id and
nothing else, the result rather than a throw, the deliberate absence of a `redirect()` - is
`lib/deleteTransaction.ts`'s and unchanged.

**Two things were lifted out of this feature after a code review, and both broke the rule of three
on purpose.** `(app)/ConfirmDeleteDialog.tsx` and `(app)/PopoverMenu.tsx` each have exactly two
consumers, where `frontend/src/components/CLAUDE.md` says to duplicate until a third appears. That
rule is right about markup and this is not markup: what moved is six behaviours that a code review
found and fixed **once each**, which PET-39 then duplicated by copy-paste into a second file where
the next such fix would not have reached them. The `try` around the client-to-Server-Action RPC, the
404 arm that still refreshes, the refresh-then-close-then-`onDeleted` ordering, Delete disabling
while Cancel deliberately does not, the `triggerRef.current?.focus()` before a dialog mounts, and
`aria-expanded` being fed by the popover's own `toggle` event. Two copies of a `<p>` is cheap; two
copies of a hard-won fix is a divergence waiting for its next reviewer.

**Both keep their wrappers, and that is what stops the shared thing learning what it serves.**
`ConfirmDeleteDialog` takes a rendered `body` string and a `remove` the caller has already bound to
its own id, so it never sees a `DeleteTarget` or a `DeleteCategoryTarget` - two shapes that share
nothing. `PopoverMenu` takes the whole popover id from its caller rather than inventing a prefix,
so `row-menu-<uuid>` and `category-menu-<uuid>` still say what they are in the DOM and in the two
suites that assert the pairing. The proof the extraction was behaviour-preserving is that **all 128
delete tests and all 44 menu tests passed unchanged**, and the browser walk re-ran green on both
screens.

**`ConfirmDeleteResult` unions `'failed'` in rather than leaving it to the caller's `R`**, which is
what removes a cast. The component must be able to produce a result itself when the RPC rejects and
can only name one reason to do it with; `'failed' as R` asserted membership nothing had checked,
which is the move `categoryForm.ts` refuses to make about colour tokens. Carried in the type, every
caller's `messages` must supply that line and the compiler says so.

**It takes no `navigates` option, unlike the transaction confirmation, and that is the same call
PET-33 made about `onDeleted`.** Every entry point this dialog has is on a route that survives the
delete, so there is no caller for the parameter; `/transactions/[id]` is what made that option
necessary next door. The one option it _does_ carry ahead of its caller is `onDeleted`, and that is a
deliberate departure worth naming: PET-38's edit modal opens this confirmation over itself and has to
come down with a successful delete, which is a caller one ticket away with a concrete job rather than
the forecast `TransactionsTable`'s unreachable `pending` prop was.

**PET-38 built that caller, and `onDeleted` is the one prediction in this file that landed exactly as
written.** `EditCategoryProvider` passes it, a delete that really removed the category takes the form
down with the confirmation, and a cancelled or failed one leaves the form exactly as it was - which
is why the callback is on the success arm rather than on `onClose`.

**The Edit modal is a second component rather than a mode on `AddCategoryModal`**, which is the call
`(app)/EditTransactionModal.tsx` made about its own pair and which holds here for the same reasons.
The fields, their order, their validation and the currency caret are all shared through
`categoryForm.ts` and the `ui/` primitives; what is not shared is the diff, the footer's third
control, the prefill, five of the messages, and the fact that submitting an unchanged form is a
legitimate no-op. A `mode` prop would carry all of that as branches inside one file.

**Its provider is `DeleteCategoryProvider`'s shape, and this is the second use of an argument that
file wrote for one consumer.** Every clause transfers unchanged - a modal owned by each card sits
inside the card being edited, where the success path's `router.refresh()` can unmount it out from
under its own `close()`, and a modal on `(app)/layout.tsx` would put a category form on all four
routes to serve one screen. What this feature adds is the evidence: that file's criterion for
screen-scoped is "N triggers on one route", and it had one kind of trigger where this has **two** - a
kebab on every non-fallback card and a "Set limit" banner on every uncapped one - so a category with
no cap draws two ways into the same modal. **The nesting order is a requirement rather than a
tidiness**: the footer's "Delete category" is a `useDeleteCategory()` call, so the edit provider sits
inside the delete one.

**`toUpdateCategoryBody` is `toUpdateTransactionBody` with two differences**, both worth knowing
before touching either. **A blank cap sends `null`**, which is the only way a capped category becomes
uncapped and the whole reason `isCapValid` accepts a blank field - note the asymmetry with
`toCreateCategoryBody`, which _omits_ a blank cap, because `CreateCategoryDto` reads absent as "no
cap" and does not accept `null` at all. The two rules look inconsistent and are one rule stated
against two DTOs. And **`color` and `icon` are skipped while they are `''`** rather than the function
taking a narrowed `ChosenCategoryValues`: `''` is reachable here, for `icon` through the ordinary
case of a stored row that carries none, since `CategoryResponseDto.icon` is nullable while
`UpdateCategoryDto.icon` documents itself as not clearable.

**A failed palette read does not block a save, and that is the one place this form must not copy
`AddCategoryModal`.** That modal guards submission on `hasChosenMarks` because a create has no colour
until the palette arrives. An edit has one, prefilled from the row, and both pickers are `disabled`
when the palette is unusable so no rejectable value can reach the body - so the name and the budget
stay saveable and the line says which two fields are affected rather than implying the modal is
broken. This is the identical finding a review made about `EditTransactionModal`'s `categoriesFailed`
guard, which returned before any state changed and made Save do nothing observable.

**The `Uncategorized` card draws no kebab and no banner, which is where AC1 and AC6 both ended up.**
Both actions behind a kebab are refused for that row - `DELETE` answers 409 because it is where every
other deletion sends its transactions, and `PATCH` answers 409 for a rename because its name is fixed

- and PET-39 had already hidden Delete, leaving a kebab holding one disabled "Edit". Offering a live
  Edit whose Name field alone was greyed out would have been a third state to explain on the one
  category nobody asked for, so nothing on that card is drawn that cannot be acted on. **The cost is
  stated rather than hidden**: `Uncategorized` can now be neither renamed nor capped from the UI, though
  the API accepts a cap on it, and `docs/TODO.md` records that. Both 409s stay classified in
  `lib/deleteCategory.ts` and `lib/updateCategory.ts`, because a control that is not drawn is not an
  enforcement. Deciding it in `CategoryCard` rather than inside the menu is what let `CategoryCardMenu`
  drop its own `isFallback` guard: a component only ever mounted for a category with both actions has
  nothing left to branch on.

**"Set limit" is live and "Allocate" is not, so the symmetry `CardBanner` shipped with is gone.**
That component grew an optional `onAction`: with a handler the button is live, without one it keeps
the `aria-disabled` treatment, and PET-39's `aria-disabled:` variants paid off exactly as their
comment promised - one prop decides both halves and the class string never moved. The handler cannot
come from `CategoryCard`, which is a Server Component, so `SetLimitBanner.tsx` is a one-purpose
client wrapper, the same smallest-wrapper rule `SidebarNav` and `TrendChart` follow. **"Allocate"
stays inert deliberately**: no frame draws where it goes, so it remains the screen's one control
announcing its own unavailability, and `frontend/CLAUDE.md`'s gap list still carries it.

**PET-70 built where it goes, so that last sentence is history and the symmetry is back.**
`AllocateBanner.tsx` is `SetLimitBanner`'s second instance, which turns that file's smallest-wrapper
argument from a one-off into a pattern - and because both callers now pass a handler,
`CardBanner`'s optional `onAction` became an exclusive union and its inert branch was deleted rather
than left as archaeology about a state nothing can reach. **The Categories tab is the first screen in
this app with no inert control on it.** Four things about the modal behind it are decisions rather
than shape.

**PET-74's third addendum broke that symmetry the other way, and the uncapped card's strip is
gone.** Claude Design's own `CategoriesTab.jsx` draws no footer banner on an uncapped card - its
comment says the call to action "rides as a chip on the spend row" - and reserves the `CardBanner`
strip for the summary card's "Allocate", which is now the app's arrangement too, by the product
owner's decision. `SetLimitBanner.tsx` is deleted; `SetLimitButton.tsx` is the same smallest client
wrapper rendering the accent pill on the spend row, same `useEditCategory().open(category,
{ focus: 'monthlyCap' })`, same composed accessible name ("Set limit for Groceries"), and the
"No limit set for this category" sentence is retired copy. `AllocateBanner` is `CardBanner`'s only
caller now, and the uncapped card is one plain `card bg-base-100 shadow-sm` box like its capped
sibling.

**It owns its open state and takes no provider**, which is `AddCategoryButton`'s criterion applied
unchanged: one trigger on one route, where `EditCategoryProvider` exists because the edit modal has a
kebab per card _and_ a "Set limit" per uncapped card. Being a large modal changes nothing about that.
**The banner could not be hoisted into `CategoriesScreen`** either, which is why
`SpendingSummaryCard` takes two props it never renders: the overlap effect needs the strip to be a
sibling of `BannerCardBody` inside that file's own `<section>`, so moving the banner up means moving
the card body with it, and a `banner` slot with one possible occupant is what that screen's own
doctrine refuses.

**All of the arithmetic is in `allocateForm.ts`, in integer cents, and the one figure worth knowing
about is the reserve.** The modal excludes `Uncategorized` while `allocation.allocated` counts it, so
the cap held by rows it does not draw is derived as `allocated - Σ visible caps` rather than read off
the fallback - exact, because every figure on the wire is a safe integer over 100, and still correct
if the row filter ever widens. Each field's ceiling is written as "the budget less everything that is
not this row", never as "the remainder plus this row's own cap": the two are equal, and only the first
keeps the displayed remainder's clamp-at-zero out of the arithmetic.

**The snap fires on keystroke rather than on blur, and blur would be a correctness bug.** `Modal`
wraps its children in a real `<form>` and Enter does not blur the focused input, so a blur-snap lets a
value past the budget submit. On the snapping keystroke the handler writes the value and collapses the
caret to the end explicitly, because the string the user was editing no longer exists - the one place
in this app that overrides `lib/amountField.ts`'s caret restore rather than relying on it.

**A ceiling of zero clears the field instead of writing `0.00`, and only a browser found it.** The
design system's own version snaps to the ceiling literally, which plants a cap of zero - rejected by
`isCapValid` and by `@IsPositive()` - so the app would invent an invalid value and then answer "Enter
an amount greater than 0" as though the user had typed it. Blank is valid _and_ true: there is nothing
left to give that category. A typed `0` still lands and is still caught on submit, which is the same
answer every other amount field here gives.

**A code review of PET-70 changed seven things about that modal, and they group into four
corrections.** Every one is a rule this app had already written down for some other screen and this
modal broke in a new place, which is the reason they are worth keeping as corrections rather than
edited away.

**Money is rounded once and the remainder derived, in the ledger as much as on the cards.**
`dashboard/BudgetCard.tsx` and `SpendingSummaryCard.tsx` both carry that rule and both say why; the
summary island rounded its three figures independently, so a budget of `$2,000.50` against a cap of
`$1,000.25` printed "Monthly budget $2,001 / Assigned $1,000 / Unassigned $1,000" - two rows summing
to $2,000 in a column drawn with a rule above the total, and reachable on a whole budget too, since a
cap may carry cents. `allocateForm.ts`'s `toAllocateTotals` owns all three now and the headline reads
the same figure as the row, so the two cannot disagree. **The row caption is the same rule from the
other end**: `formatWhole` is right for an aggregate and wrong for a **residual**, so a cap exceeded
by one cent printed "$0 over this cap" in `text-error` - a red warning asserting the row is not over -
and a fifty-cent overage printed "$1", double the real figure. The overage carries cents; the spend
beside it stays whole. That mixed precision is the call `cappedMessage` already documents.

**Nothing refreshes while the dialog is open, and the `missing` arm's re-read moved to the close its
own copy asks for.** Two defects, one fix. The route re-read can drop `unallocated` to zero, which
unmounts `AllocateBanner` through `SpendingSummaryCard`'s own gate and this dialog with it - so a
cross-tab race could take the explanation of why nothing saved, and every cap the user had typed, off
the screen at once with nothing accounting for it. And refreshing the grid _behind_ a dialog that goes
on listing the dead category fixes the half of the screen the user is not looking at: Save stayed
enabled over a draft that is read once on open and never resynced, so the retry the copy invites
re-sent the dead id and could only 404 again, the only escape being the Close that discards
everything. So a `missing` answer sets a `stale` flag that disables Save - the explanation is on screen
and no edit can make the payload acceptable - and the re-read fires from `onClose`. This is the one
place in this app where a modal's refresh is deliberately **not** on the arm that discovered the
staleness; `ConfirmDeleteDialog`'s `staleReasons` still refreshes immediately, and correctly, because
that dialog is mounted by `CategoriesScreen` rather than inside a subtree the re-read can remove - the
card it is deleting can vanish behind it and the dialog is still there. This one lives inside a banner
the same re-read can unmount, which is the whole difference.

**The cap fields freeze while the save is out, unlike Cancel beside them.** The body is serialised at
press time and the success path closes the dialog, so a keystroke landing during the round trip was
dropped in silence and the user watched the modal close on a limit that was never sent. Cancel stays
live for the reason both category modals give: no fetch in this app carries a timeout.

**Two reachable states had nothing to say, and both were the same mistake as an empty state that
lies.** An account that has deleted every other category still draws the Allocate banner - the whole
budget is unassigned - over a modal whose only row is the one it excludes, so it opened on a column
header above an empty box beside a Save that could never enable. It draws one sentence now and
suppresses the footer hint, which would be advice about fields that are not there. And a diff of more
than a hundred rows is refused here rather than sent: `@ArrayMaxSize` answers 400, which classifies as
`invalid`, whose copy asks the user to check amounts that are every one of them valid - advice that
can never work on a screen offering no way to submit a subset. `MAX_CAP_ROWS` is a literal restating
the DTO's own bound, which this repo does in exactly one other place (`CategoryPicker` against
`RegisterDto`) and for the same reason: `maxItems` reaches no generated type, so there is nothing to
read it out of.

**The snap's live region is mounted from the first render and only its text changes.** A polite region
created in the same commit as its content is generally not announced at all - assistive technology
registers regions and then watches them - so the one event the treatment exists to report was silent,
and `getByRole('status')` cannot tell that apart from a working one. It ships empty and fills, which
is why its suite asserts the region's **text** rather than its presence. The revert stays silent for
the reason the original note gives: `aria-relevant` defaults to additions and text, so emptying
announces nothing.

**Focus opens on the field the trigger implies**, which is the one thing the two entry points
disagree about. The kebab's "Edit" is an unspecific invitation and focuses Name; "Set limit" sits on
a banner reading "No limit set for this category", which is a request to type a number, so it focuses
the budget. Frame 21 draws the budget field with a focus ring and settles neither case, being a
mid-fill snapshot rather than an on-open state - the same reading `AddCategoryModal` gives frame 19.

**Two of the paragraphs above were wrong when they were written, and a code review is what found
them.** Both are worth keeping as corrections rather than quiet edits, because both were assertions
a comment made about behaviour that did not exist.

The first is the diff's `note`. That comparison trimmed the field and then measured it against the
**untrimmed** stored value, so a category stored with `"  weekly shop  "` differed from itself -
and since `SHOWS_NOTE` is false the user could neither see nor touch that field, so a rename carried
a rewritten note along with it, a note of nothing but spaces was **deleted** by a save that never
mentioned it, and Save on a wholly untouched form fired a PATCH instead of closing. The docblock
claimed the opposite in as many words. Both sides are trimmed now. **`name` deliberately keeps the
asymmetry**, which is `toUpdateTransactionBody`'s documented call about `merchant`: a stored name
with stray whitespace normalises on the first save that touches anything, and that is acceptable
precisely because the Name field is on screen with its value in it. Visibility is the whole
difference between the two rules, so when `SHOWS_NOTE` flips, that is the line to revisit.

The second is the `missing` arm. `EditTransactionModal`'s copy says "Close this **and refresh the
list**"; this modal reworded it to "Close this to see the current list" - a promise of an automatic
refresh - and did not add one, so the deleted category's card stayed in the grid, in the tab badge
and in the allocation summary, and reopening it answered 404 forever. It calls `router.refresh()` on
that one arm now, keeping the modal open so the edits and the explanation stay in front of the user.
`(app)/ConfirmDeleteDialog.tsx` carries the same rule as a `staleReasons` prop; it is inlined here
because this modal has exactly one such arm - `fallback` describes a category that is still there,
and the other three changed nothing on the server - and a second would be the signal to lift a list.
**The suite had pinned the wrong behaviour**: a blanket "never refreshes on any failure" assertion
across all five arms, which is why no gate caught either defect. That claim is now per-arm.

**All three of this screen's Server Actions are injectable now, and the third closes a gap
`docs/TODO.md` had nominated this ticket for.** Storybook's Vite build has no notion of
`'use server'`, so it bundles each action as an ordinary module and a press reaches `cookies()` from
`next/headers` in the browser. `remove` was fixed at PET-39 after a review found the seam unreachable
from the story; `update` ships with one; and `create` is threaded to `AddCategoryButton` rather than
to a provider, because that component owns its own modal. `CategoriesScreen.stories.tsx` defaults all
three in its shared `Frame`, so a story added later cannot forget one.

**PET-73 replaces `/insights` with an assistant chat and moves its cards onto the Dashboard, which
dates several paragraphs above and adds three mechanisms worth reading before touching either
screen.**

**The Dashboard's fifth slot became two, and both render nothing on a period navigated back to.**
`InsightTeaserCard` is deleted with `DashboardResponseDto.insight` - it rendered the same headline
and body from a different endpoint and linked to the page that repeated them. `InsightSummarySlot`
leads the wide column and `InsightCardsSlot` sits under the donut, both reading `GET /api/insights`
through **one** `InsightPollProvider` - `transactions/FilterNavigation.tsx`'s shape, and for
`FilterNavigation`'s own reason: two client pieces on opposite sides of a server-rendered boundary
need one owner, and two timers on one screen double the requests and can disagree about which set is
current. The whole poll relocated intact from `InsightsScreen`: the backoff, the 5.5-minute ceiling,
the `stalled` fallback, the render-phase prop adoption and the 409-as-success path are all unchanged
in substance. **`isCurrentPeriod` is the screen's second condition**, resolved once in `page.tsx`
beside `isEmpty` and threaded as a boolean - PET-26's rule - because insights are generated for the
**current period only** and `GET /api/insights` publishes no period at all. Without it, navigating
back a period puts October's analysis over September's figures on a screen where every other number
is right, which is the failure this repo has already paid for three times. The **components** decide
to render nothing rather than the slots being optional, exactly as `CategoryDonut` guards on its own
input: `DashboardScreen`'s own rule is that an optional slot would let a call site quietly test a
dashboard with a card missing.

**`SummaryBanner` absorbed the teaser's three copy states and grew an `action` slot.** On
`/insights` it only ever rendered under `state === 'ready'`, because the screen around it drew a
whole empty card for the other cases; on the Dashboard it is the topmost card _and_ carries the
primary control, so it has to say something in every state. `UNLOCK_COPY` and `PENDING_COPY` moved
with it and stay exported, so no test or story restates a shipped string. The control goes in
`card-actions` rather than directly in `card-body` - that component declares no `align-items`, so
daisyUI's default `stretch` makes a `btn` child span the whole card, which is the trap the teaser
already recorded against `frontend/node_modules/daisyui/components/card.css`.

**The assistant is two routes under one tab bar, and resuming is a query parameter.**
`insights/page.tsx` is the Chat view and `insights/history/page.tsx` the History list, both under
`InsightsTabs` - `TransactionTabs` structurally, down to the hand-written dimming and the
`aria-hidden` underline, with **no count badges** because a badge on Chat would force the bare route
to fetch a count. `INSIGHTS_TAB_HREFS` is the app's **fourth** route declaration and is built from
`SIDEBAR_HREFS.insights` so the nesting cannot drift; a sibling route would match none of the four
sidebar hrefs and light **Dashboard** while this bar said Insights. An `/insights/[sessionId]` route
was rejected because the bar would then have to decide which tab a uuid belongs to, so a conversation
is resumed with `?session=` - and an id naming nothing **drops the parameter and renders an empty
chat with a `role="status"` line** rather than `notFound()`, the call `transactions/[id]/page.tsx`
already makes about an invalid `?sort=`. The **title is "Assistant" and the sidebar label is not**:
`ui/Sidebar` renders "Insights" under a section heading "ASSISTANT", so renaming the item would
repeat that heading directly above it. That amends INS-1 again.

**That last sentence is PET-76's, reversed: both say "AI Assistant" now, and the heading above the
item says "INSIGHTS".** The reasoning it replaces was sound and cheap, and what it bought was the one
item in the navigation naming something different from the page it opens - so the sidebar moved
instead of the argument being extended, which **amends INS-1 a third time**. The item's `key` stays
`'insights'`, so `SIDEBAR_ITEMS`, `SIDEBAR_HREFS`, `INSIGHTS_TAB_HREFS` and the route folder are all
untouched and the URL is still `/insights`. Two consequences worth knowing. A section called INSIGHTS
now holds a chat while the screen that shows insights sits under MENU, which the product owner
accepted and `ui/Sidebar.tsx` records. And **"AI Assistant" names two things on one screen** - the
`h1` and every assistant chat row - so `getByText('AI Assistant')` is a trap: `pages.test.tsx` queries
the heading **by role** and `AssistantChatScreen.test.tsx` scopes the row label to the log region. No
tree holds both today, which is what keeps that a precaution rather than a fix.

**Cancellation is the reason the send is a route handler, and it travels three hops.** The composer
owns an `AbortController` and "Stop" replaces "Send" while a turn is in flight; the handler passes
`request.signal` through; the backend combines the dropped connection with its own timeout. **An
`AbortError` must be distinguished from a real failure before the taxonomy is reached**, or a
deliberate cancel renders an error message - which is the same mistake as the no-results copy
claiming an account is empty. A cancel removes the optimistic message and restores the text, exactly
as a failure does, and renders nothing. `docs/explainers/cancelling-an-ai-request.md` is the
plain-language account, and `docs/TODO.md` carries the same retrofit for the receipt scanner's
"Cancel scan", which does not cancel anything either.

**Three smaller things on those screens are decisions rather than shape.** The composer is a real
`<form noValidate onSubmit>` with a `<textarea>`, so **Enter submits and Shift+Enter inserts a
newline** - which needs an explicit keydown handler, the mirror image of `IconSelect` where `Modal`
wraps its body in a real form and Enter submitting had to be _stopped_. The typing indicator is
**mounted from the first render and only its text changes**, which is the Allocate modal's review
finding transferring verbatim: a polite live region created in the same commit as its content is
generally not announced at all, and `getByRole('status')` cannot tell that apart from a working one -
so its suite asserts the region's **text**. And the send is **injected as a prop rather than
imported**, the precedent both transaction modals set; one of the original reasons has gone away now
it is a `fetch` rather than an action, and the rest are enough on their own.

**Both screens have no Figma frame at all**, which makes them the third and fourth in the app after
the verify-failure screen and the error boundary. Every string on them is invented - both tab
labels, the composer's label and placeholder, the typing indicator, the disclosure, the truncation
notice, both empty states, the "conversation no longer available" line and each of the seven failure
arms - and all of them join what A29 owes a designer. The stories exist to put them in front of one
at once.

**A code review of PR #86 changed three things about those two screens, and the first is worth
keeping as a correction because the paragraph arguing for it is still above and was still wrong.**
It said "New chat" is "a navigation rather than state, which keeps this header on the server and
drops the `?session=` parameter for free" - every clause true and the conclusion false, because
**the conversation is client state.** `AssistantChatScreen` seeds its five pieces of state from its
props on mount only and sat at a fixed position with no `key`, so a `<Button href="/insights">`
reset nothing twice over: on a bare `/insights` the href **is** the current URL, so nothing
navigated at all and the next message was appended to the conversation the user had just asked to
leave; and from `?session=A` the navigation happened, the server handed back `conversation: null`,
and React reconciled the same component rather than remounting it, so A's messages stayed on screen
and A's id stayed on every send. **`insights/NewChat.tsx` is the answer and it is
`transactions/FilterNavigation.tsx`'s shape**: a provider wrapping the header and `<main>` both,
because the control is above the boundary and the state is below it. Three things about it not to
undo. The reset is a **`key`** rather than five setters, so the whole of "new chat" is one remount
and `AssistantChatScreen` itself is untouched. `ChatSlot` **drops the `conversation` prop as well
as the state**, keyed on a per-mount baseline, because `router.replace` is an RSC round trip away
and a remount inside that window would re-seed from the conversation being abandoned - the same
defect reached through its own fix. And `page.tsx` **keys `ChatSlot` on the requested session**,
which is the half a click cannot express: a History link to another conversation, Back, a
bookmarked `?session=`. `insights/page.test.tsx` is the route's own suite, added for that half, and
both of its reconciliation cases fail with the `key` deleted.

**The second is that a malformed `?session=` replaced the whole screen rather than dropping the
parameter**, which is what the paragraph above promises and `lib/assistant.ts`'s own docblock
claimed in as many words. `GET /api/assistant/sessions/{id}` answers a non-uuid with a **400** from
`ParseUUIDPipe`, and `authorizedGet` reports that as `unavailable` - indistinguishable from an
unreachable backend, so `readConversation` threw and `app/error.tsx` took the page. It checks the
id's **shape** before asking now, `lib/periodParams.ts`'s call applied to a second parameter:
validate and do not canonicalise, so a well-formed id the account does not have is still forwarded
and still answered by the 404 arm. The suite had pinned the throw, which is why no gate caught it.

**A second review, of the fix commit itself, found three more, and the first was introduced by the
fix above.** Worth keeping in that order, because it is the shape of mistake this file exists to
record: a correct fix reached through a mechanism with a cost nobody priced. **A remount throws away
the `AbortController` holding the turn in flight**, and `AssistantChatScreen` had no unmount cleanup

- so pressing "New chat" mid-turn left the `fetch`, the route handler and the ~40k-token Gemini call
  running to completion, persisted the reply into the conversation the user had just abandoned, and
  spent the `chat` bucket on an answer nobody would see, with the fresh mount's `pending: false`
  letting a second turn start beside it. It was **newly reachable**: before that commit "New chat"
  reconciled rather than remounted, so the controller and `pending` survived and the turn landed
  normally. The cleanup lives in `AssistantChatScreen` rather than in `start()` because navigating to
  History mid-turn abandons a turn just as completely, and cancellation is the whole reason that send
  is a route handler. The other two are smaller and of a kind. `runGeneration`'s empty-account path
  **discarded the result of its own conditional delete**, so a run reclaimed as abandoned scheduled a
  follow-up anyway - the thing `startFollowUpIfDirty`'s docblock says the unsettled paths must not do,
  and one way past the "at most two runs" bound. And the chat's `key` used **a sentinel drawn from the
  parameter's own value space**, so `?session=new` keyed identically to no parameter at all and the
  reconciliation the key exists to prevent came back for that pair; it is namespaced now. The draft is
  what makes a remount assertable in `insights/page.test.tsx` - client state survives a reconcile and
  cannot survive a remount - and both new frontend cases were seen to fail with their fix reverted.

**The third is the History caption's zone.** `lastMessageAt` is an ISO **instant** where
`RecentTransactionsCard` is handed a real `YYYY-MM-DD` column, and `slice(0, 10)` took the **UTC**
date out of it while `today` defaults to the frontend host's zone - a second zone on top of the
host-versus-`APP_TIMEZONE` gap that screen already documents, so at UTC+2 a conversation from
minutes ago read "Yesterday". Both sides are read in one zone now, which leaves only the documented
gap.

**PET-76 is eight fixups on those two screens, and what it adds to this file is one class of defect
plus one dependency.** None of it is a missing feature and not one item could fail a gate - every one
of them passed `build`, `lint` and every Jest suite on `main` - which is why they were found by using
the finished screens with real data rather than by reviewing them. Six of the eight are one-line
changes documented where they happen; three things reach past that.

**Two root causes account for five of the eight, and both are `frontend/CLAUDE.md`'s to carry rather
than this file's** - they are in its Where daisyUI and Tailwind fight list, which is the home for
exactly this shape: a class present in the markup that paints the wrong thing. In one sentence each,
because they explain why these screens specifically: the page canvas is `bg-base-200` and so is
daisyUI's fill for a **disabled `textarea`** and for a **plain `.btn`**, so the composer's message box
vanished for the whole of a turn and "New chat" had no visible box at all; and `loading-*` is SMIL
inside a `mask-image` data-URI SVG rather than CSS, so the typing indicator's 3-second cycle with only
57% of its timeline in motion could not be sped up by any class. The composer is on a
`card bg-base-100` now and the dots are real CSS animation. **The assistant composer was the app's
only form not on a card**, which is why this bit here and nowhere else, and it is the thing to check
before putting a new control directly on the canvas.

**The reply renders its markdown, which is this ticket's one substantive addition.** Gemini answered
in markdown from the day the chat shipped and the bubble printed the asterisks; the prompt had asked
for plain prose, and a model asked not to emit markup emits it anyway. So
`insights/AssistantMarkdown.tsx` renders it with **`react-markdown` + `remark-gfm`**, the app's
seventh and eighth runtime dependencies, and the backend's rule is reversed in the same change -
`backend/src/assistant/CLAUDE.md` carries that half, and the two are **one decision stated in two
apps**. Four things about it not to undo. It renders to **React elements, never through
`dangerouslySetInnerHTML`**, and with **no `rehype-raw`**: a reply is a model's output over the user's
own merchant names and is not trusted input, and without that plugin react-markdown turns raw HTML
into a **text** node, so a tag arrives as visible characters. `skipHtml` is deliberately also unset,
because that one deletes the text instead of showing it and would silently swallow part of an answer.
The class map holds **whole Tailwind literals per tag**, the `ui/categoryColour.ts` convention, since
the scanner reads source as raw text - and every tag needs one, because preflight resets heading
sizes, list markers and margins to nothing, so an unmapped `<h2>` renders as a paragraph that lost its
full stop. **A table gets an `overflow-x-auto` wrapper**, which is the one structural requirement
permitting tables creates: a `chat-bubble` is sized by its content, so a wide table would push the
chat column sideways and take the page's own horizontal scrollbar with it. And the **user's** bubble
keeps `whitespace-pre-wrap` and renders no markdown, so somebody typing `**hi**` sees their own
asterisks rather than watching them be interpreted.

**It cost a `jest.config.ts` that post-processes next/jest's own config, and the obvious version of
that fix does nothing.** The unified ecosystem behind those two packages is **85 ESM-only packages**,
which Jest's default transform never touches - so the first `import` dies on
`SyntaxError: Unexpected token 'export'`. next/jest says in a comment that custom config "can append
to transformIgnorePatterns but not modify it", and a pattern list is a set of things to **skip**, so a
permissive pattern added beside `/node_modules/` changes nothing at all: a `jest.config.ts` that only
widened the array looks like a fix and still fails. `transpilePackages` in `next.config.ts` is the
other lever next/jest reads and is the wrong one, because it makes the **application** build transpile
85 packages it already handles natively to fix a problem only Jest has. That file carries the whole
account, including why it throws when it rewrites nothing and why `escape-string-regexp` is on a list
it looks like it should not be on.

**Both assistant headers lose their period, which takes a `lib/` function with them** - see the
Two-of-the-four-headers paragraph above, where that amendment lives, since it is a claim about all
four screens rather than about these two.

**A code review of PR #88 found six things, and what they have in common is the interesting part:
five of the six are costs the markdown rendering created rather than defects in it.** Permitting
one new capability moved four separate questions from "cannot happen" to "happens on ordinary
data", and none of the six could fail a gate. Each is documented where it happens; three reach past
their own file.

**The reply's parse is memoized, and before that every keystroke re-parsed the whole conversation.**
The bubble was a bare `string` until this ticket, so a re-render of the list cost nothing;
react-markdown caches nothing at all - it builds a fresh processor and re-parses on every render -
and the composer's `draft` is state on `AssistantChatScreen`, three components above the bubbles. So
a resumed twenty-turn conversation paid twenty full unified parses **per character typed**, on the
one control the user is interacting with. `AssistantMarkdown` is wrapped in `memo` and its
`remarkPlugins` array is hoisted to module scope, which is the other half: a fresh array is a changed
prop and would have defeated the memo from inside. The general form is worth carrying, because this
app now has three components whose render is genuinely expensive: **a component whose props are one
primitive memoizes exactly, and the moment a cheap child becomes an expensive one, every ancestor's
state becomes its problem.** The assertion for it is structural - `memo`'s effect is a render that
does not happen, which no DOM query can see - so `AssistantChatScreen.test.tsx` pins the wrapper the
way `layout.test.tsx` pins the _absence_ of a `force-dynamic` export, and for the same reason.

**`img` was missing from the tag map, and it is the one element that acts before the user does.**
The file's stated rule is that a state a caller cannot produce is still a state to handle, and it
applied that to the anchor - which needs a click, so an odd one costs nothing until asked for. An
image fires a request from the user's browser the moment the bubble paints, and
`defaultUrlTransform` filters protocols while saying nothing about hosts: a
`![](https://third-party/x.png)` echoed out of a merchant name the user controls is a beacon
carrying their IP, their agent string and the fact that they are reading this screen. It renders the
**alt text** in place of the mark rather than dropping the node, which is the same argument that
refuses `skipHtml` two paragraphs up in that file - swallowing part of an answer in silence is the
worse failure. **This is the entry to read before adding a tag to that map**: the question is not
only how a tag should look, it is whether rendering it does anything.

**And the composer's send button sat on the textarea's scrollbar, which is the unfixed half of the
trap `resize-none` was added for.** That class was added because the user agent's resize handle
occupies the corner the button moved into; the **vertical scrollbar** occupies the same inline-end
edge, appears the moment a question outgrows `h-24`, and is neither optional nor something trailing
padding can move - `pe-*` insets the text and the scrollbar lives outside the content box. The
button is inset past the gutter (`end-5`, with `pe-17` keeping the same half-rem of air) rather than
being moved out of the field, which would have changed a design decision to fix a geometry one.
Measured in the walk rather than reasoned, with the old placement probed in the same run: **15px of
gutter behind a 1px border, so its inner edge is 16px from the field's outer edge; the button now
starts at 20px and `end-2` started at 8px**, i.e. 8px inside the track. The lesson is the general
one this file keeps paying for from new directions - **a control placed over a scrollable element's
corner is competing with two widgets the user agent draws there, and jsdom can see neither.**

The other three are local. A markdown table's column alignment was being discarded, which matters
because the prompt asks for a table when comparing categories or periods - so the common table here
is a money table the model right-aligns, and `th` hard-coded `text-left` while both cells dropped
every prop react-markdown passes. The `Markdown` story's own table used no alignment at all, so the
review surface could not have shown it; it right-aligns its three money columns now. The stories'
default `send` answered a constant carrying fixed message ids, so a **second** press appended ids the
list was already keyed on - `key={message.id}` collided, React logged it and reconciled the wrong
rows, in exactly the flow this ticket made pressable for the first time; it is a function of the
submitted text over a counter now. And `jest.config.ts` said the ESM closure was 84 packages where
`frontend/src/app/CLAUDE.md` said 85: it is **85 of 100**, measured against the installed tree, and
that file now records how to re-derive both figures rather than asserting a number nobody can check.
Its comment about the `.pnpm` sibling was also right about the behaviour and wrong about the reason,
which is worth fixing rather than leaving because the two reasons expire differently - see the
comment itself.

**A second round of PET-76, from using the finished screens, added three more and two of them are
features rather than fixes.** Taken in this ticket at the product owner's direction rather than filed
as their own, because it lands with the pre-launch push. The three spacing and affordance fixes are
documented where they happen; what reaches past their own files is below.

**The two spacing defects had one shape and it is worth naming: a gap that was never declared.**
`.chat` is a grid with `column-gap` and `grid-auto-rows: min-content` and **no row gap at all**, so
the row label sat flush on its bubble the moment PET-76 grew it from `text-xs` to `text-sm` - the
class that made the label legible is what made the crowding visible. And `(app)/layout.tsx`'s content
column declares no gap either, only `px-*`: `PageHeader` supplies the space above the tab bar with
its own `pb-5`, and nothing supplied the space below it, so the active tab's `-bottom-px` underline
started on the very pixel the card below began. **`TransactionTabs` escaped both by being a child of
`<main className="... gap-5">` rather than a sibling of `<main>`** - which is the general lesson:
this shell has no vertical rhythm of its own, so **every gap between two of a page's top-level
children is somebody's explicit margin**, and a component that looks spaced on one route because of
its parent will be flush on another.

**The History tab has a count badge now, which reverses a PET-73 decision rather than extending
it.** That bar shipped with none "because a badge on Chat would force the bare route to fetch a
count", and the reasoning was sound about the count that existed: the only way to get one was
`GET /api/assistant/sessions`, a whole list transferred and discarded for its length, on the route
PET-76 had just made fetch nothing at all. So the backend grew
**`GET /api/assistant/sessions/count`**, which answers `{ total }` and nothing else - and the
decision to read before copying it is that the two endpoints **share one predicate** in
`assistant.service.ts` rather than one query, because they publish the same field name and a second
hand-written `isNull(deletedAt)` is how one of them silently starts counting tombstones.
`docs/TODO.md` carries the question of whether `/transactions` should follow, and the reason it
probably should not: its categories read has another caller, where the assistant's would not have.

Two things about the badge itself. **`null` draws no badge and `0` draws a `0`**, which are different
facts: `readSessionCount` **degrades** rather than throwing - `lib/palette.ts`'s policy, not
`requireSessions`' - because a badge is chrome and a count that cannot be read must not replace a
working conversation with the error boundary. And the Chat tab carries no badge at all, because
nothing behind it is countable; a pill invented for symmetry would have to say something.

**And each chat row now carries its own timestamp, which cost a new client component for a reason
that generalises past this screen.** `MessageTime.tsx` renders the formatted time **only after
hydration**, and the version that did not is the more instructive artifact: `AssistantMessageList`
renders inside a client component, so a resumed conversation is server-rendered first, and a
locale-formatted time is computed in the **server's** zone there and the **reader's** zone on
hydration. `suppressHydrationWarning` is the obvious tool and is the wrong one - a walk with the
frontend under `TZ=UTC` against a `Europe/Zagreb` browser measured an instant of `18:36:47Z`
rendering as "6:36 PM" and **staying** so, where the reader's own clock says 8:36 PM. The attribute
silences the warning and keeps the server's text rather than correcting it, so what it buys is every
timestamp in the app quietly wrong by the reader's UTC offset, with a clean console and every gate
green. **The rule to carry: a value that depends on the viewer's locale or zone cannot be
server-rendered inside a client component at all** - render it after hydration through
`useSyncExternalStore`, which is the same hook `app/setup/SetupDraftProvider.tsx` reaches for and for
the same hydration-correctness reason, and keep the machine-readable value in the markup
(`<time dateTime>`) so only the human-readable half waits. `MessageTime.test.tsx` renders the
component through **two** renderers for that reason: a defect that is a disagreement between the
server pass and the client pass is invisible to a suite that only performs one.

Its formatter is `lib/format.ts`'s `formatMessageTimestamp`, built on **`calendarDateOfInstant`** -
which is the instant-to-calendar-date conversion `insights/AssistantHistoryScreen.tsx` held privately
after a review of PET-73 found its zone bug, lifted here at its **second** consumer rather than its
third. That is `lib/pickerScroll.ts`'s exception restated: two copies of markup are cheap, and two
copies of a _fix_ are a divergence waiting for the next reviewer who corrects only one of them.
**PET-77 gives the shell a notification region, and it is the first thing in this app that renders
outside every route's tree.** `(app)/ToastProvider.tsx` holds the queue and `(app)/ToastRegion.tsx`
the DOM, mounted once on `(app)/layout.tsx` **outermost of the five providers** - it consumes nothing,
and everything that can post is inside it, including the three dialogs the transaction providers
mount. Twelve call sites post; none owns a region. It replaces the four unrelated ways a write used to
report itself, which `docs/TODO.md` carried as its one HIGH IMPORTANCE entry until this ticket: a
modal that just closed, Settings' `role="status"` badge, the Allocate modal's snap line, and nothing
at all. Six things about it reach past those two files.

**The top layer is why it is a `popover`, and four Chrome measurements shaped the code.** `Modal`
opens with `showModal()`, so every dialog in this app is in the top layer, and daisyUI's `.toast` is
`position: fixed` and nothing more - a fixed element cannot paint over a top-layer one at any
z-index, and most toasts here are raised from inside a modal. Measured before the component was
written: a popover shown **after** a dialog paints above it, one shown **before** is painted under it
and visibly dimmed by the dialog's own `::backdrop`, its dismiss button is **inert** while the dialog
is open (`elementFromPoint` resolves to the dialog and a real click never reaches the handler), and a
popover that is a **DOM descendant** of the dialog is hit-testable. So `showPopover()` fires on
**every post** rather than once at mount - the re-show is load-bearing, not defensive - and the
dismiss control is decorative while a modal is up, with the auto-dismiss clearing it. Portalling the
region into the topmost dialog is the only fix for that and was rejected: fragility across four
providers, bought against a timer that already works.

**The announcement is two `sr-only` regions, and the visible stack carries no `aria-live` at all.**
A hidden popover is `display: none`, so React appends the toast into a hidden subtree and
`showPopover()` reveals it a tick later - and a live region whose content changed while it was hidden
is not reliably announced. That is the same silence `AllocateBudgetModal.tsx` and `SettingsForm.tsx`
each recorded for a region created with its content, reached from a new direction. The announcers are
ordinary in-flow elements that never move, mount empty, and hold the message for one second.

**They publish `aria-live` and deliberately no role**, which is a decision about the rest of the app
rather than about the region. `role="status"` and `role="alert"` are what every form-level message in
this repo already publishes - `components/FormError.tsx` is one and five screens render it - so an
always-mounted pair carrying those roles would make `getByRole('alert')` match two elements the
moment any form showed a message. Thirty-three such queries in `SettingsForm.test.tsx` alone.

**Where a failure is reported is a property of its reason, not of its surface**, and
`(app)/failureReporting.ts` owns the rule for all twelve sites. Every write here already publishes a
named taxonomy, and exactly two names are shared by all of them: `failed` and `unauthenticated` name
nothing the user can act on where they are, so they leave the form; `invalid`, `missing`, `fallback`,
`taken` and `categoryMissing` are instructions to act on the surface in front of them and keep the
inline line. That is why `FormError` survives this ticket rather than being replaced by it. **Settings
keeps one more than anyone else**: its `unauthenticated` treatment carries a "Log in again" link, the
only recovery control in the app attached to that reason, so a toast would replace something
actionable with a sentence that expires.

**Two call sites carry an arm nobody else has.** Settings' one "Save changes" is **two** writes to two
endpoints with no transaction across them, so the second can fail after the first has landed - it says
which landed rather than a bare "we couldn't save", because that would invite a retry of an applied
change. And `dashboard/InsightPoll.tsx` announces a run **only when the user pressed the button**: a
regeneration fires behind every transaction and category write, and announcing those would put a
second toast after every save. A stalled run says nothing either, because it did not finish.

**`(app)/shellRender.tsx` and `(app)/shellStory.tsx` are the two harnesses that keep this testable**,
and they are the same job for two callers that cannot share code. A suite swaps its `render` import; a
story has no render to swap, and must not use a `decorators` array, because the story smoke tests build
each story from `render` or `meta.component` and never apply one. Ten story files had a private
two-line `PreferencesProvider` wrapper and needed a second provider on the same day, which is what
earned the shared frame.

**A code review of PR #92 found five things across the Dashboard and the assistant, and four of the
five are the cost of a decision made one ticket earlier rather than a defect in the ticket under
review.** None could fail a gate. Two reach past their own file.

**The first is that two callers sharing a formatter agree about a viewer-dependent value only if they
also share the viewer**, which is the rule to carry and which this file had already half-written.
`formatMessageTimestamp`'s docblock said a chat row and the History caption "cannot disagree about
which day an instant fell on", because PET-76 had lifted `calendarDateOfInstant` so both read the
_instant_ the same way - and that settled the instant and said nothing about whose `today` it was
measured against. PET-76 made the chat row client-only for exactly the zone reason `MessageTime.tsx`
records; the History caption stayed server-rendered inside a Server Component, so its `today` was the
frontend host's. Measured: with the frontend at `TZ=UTC` and the reader in `Europe/Zagreb`, a message
at `2026-08-12T23:00:00Z` read at `01:00Z` is "Today, 1:00 AM" on its own row and "Last active
Yesterday" in the list - one fact, two answers, two screens of one feature. `insights/LastActiveTime.tsx`
is the caption's own client component and `insights/useHydrated.ts` is the seam both now share, lifted
at its **second** consumer on `lib/pickerScroll.ts`'s exception rather than the rule of three. Two
things about it worth knowing before writing another server-rendered date. **The wrong zone is the
same defect whether or not anything hydrates**: `MessageTime`'s version was a hydration mismatch React
could see, and this one had no client pass at all, so the server's zone was simply the answer with
nothing to warn about it. And the screen **stays a Server Component** - the boundary is on the one
element that needs it, `SidebarNav`'s and `TrendChart`'s rule, which is also why the words "Last
active" stay in the screen and only the day moved.

**The second is that an exclusion belonging to the account cannot be written as a term on one state.**
`InsightSummarySlot`'s Regenerate condition was `stalled || (displayState === 'empty' && !isEmpty)`,
and its own docblock said `isEmpty` is "excluded on purpose" because an account with nothing logged has
nothing to analyse. That reasoning is about the account, so binding it inside one arm left the other
arm open: an account that created and then deleted its only transaction, whose triggered run then
stalled, drew the unlock copy with **both** "Add transaction →" and "Regenerate" on it - the exact pair
another case in the same suite asserts must not happen, reached through the term that case does not
touch. It reads `!isEmpty && (...)` now. The same review found the condition missing a **fourth** dead
end where the docblock enumerates three: a run that fails _after_ a previously successful set, where
the read skips the `failed` row, `displayState` is `ready`, the card looks healthy, and the prose on it
predates the write that triggered the run. `InsightPoll` exposes `runFailed` for it, derived from
`generatedAt` not moving across a settle because the contract publishes no failure at all - and the
same signal fixed a lie beside it, since a manual run that changed nothing was posting "Insights
updated.". **What that flag cannot see is a run that failed before the mount existed**, which needs a
field on the DTO and is `docs/TODO.md`'s.

The other three are local and documented where they happen: the chat's `role="log"` now sets
`aria-relevant="additions"`, because the default `additions text` made twenty timestamps filling in
just after hydration into twenty announcements before the reader had reached a message; and
`AssistantMarkdown`'s table drops `table-zebra`, whose stripe a walk measured as invisible in light and
visible in dark - `frontend/CLAUDE.md`'s trap list owns that one, including the comment whose wrong
token let it through.

## Not built here

`frontend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in a route: the `/api/chat` route handler, the
shell's content, and every read a screen needs for its own data. That list is the
single home, so nothing is restated here.

The one trap to carry into every file in this directory: **the session is real now, and three of
the four screens behind it are still empty.** `requireProfile()` and `hasSession()` both do what
they say as of PET-52, so a route that reads as authenticated is, and the sidebar footer shows a
real person. PET-30 then filled one `<main>`: `/transactions` reads its own data and renders it.
The Dashboard, AI Insights and Settings `<main>` elements are still empty and still fetch nothing.
A screen that renders is not evidence that its data path exists - `/transactions` is now the only
one where it does, and it is the file to copy rather than the new normal.

**PET-21 filled a second `<main>`, and its shape is the one to copy for Dashboard's own remaining
cards.** `/dashboard/page.tsx` is now async and awaits `lib/dashboard.ts`'s `readDashboard()`,
the same two-branch failure policy as `/transactions` and the profile read behind the shell's own
gate - deliberately identical, since this read sits inside the shell that already read the
profile a moment earlier. Unlike `/transactions`, there is no second, probing request: the
endpoint takes no filters at all, so there is no ambiguous-empty case for one to resolve.
`DashboardScreen.tsx` takes the five cards as required `React.ReactNode` slots rather than
importing them, the same reason `TransactionsScreen`'s two are slots - both need reads or state
the screen itself cannot supply, and Storybook has to be able to hand it stand-ins - and this
ticket ships one of the five, `BudgetCard`, built from the read at the call site; the other four
were placeholder `<div />`s naming the ticket that fills them. AI Insights and Settings are the
two screens whose `<main>` is still empty and still fetches nothing.

**That card reads no clock at all, and its "days left" caption names no month, which amends node
22:55.** The frame draws "8 days left in October" and the review of PET-21 found the two halves of
that sentence come from different periods: `daysLeft` is counted backend-side against the profile's
`monthStartDay`, while a month name in the frontend can only be the host's calendar month. At
`monthStartDay: 15` on 20 October the window is Oct 15 to Nov 15 and the card would have read
"26 days left in October"; even at the default of 1 the two clocks disagree for an hour twice a
month, because the backend formats its period against `APP_TIMEZONE` and `new Date()` here reads
whatever zone the frontend runs in. Nothing on the dashboard response names the period, so the
caption drops the month rather than guessing at one - the header's overline and month pill keep
theirs, because those are labels for the calendar month and nothing composes them with a
window-derived count. Two smaller consequences: the day count is pluralized, since `daysLeft` is 1
on the last day of every period, and the card's whole-dollar figures are **rounded once and the
remainder derived from the rounded pair**, so "$1,241 of $2,000" can never sit beside a "left"
figure that fails to add up to the budget. Giving the period a real name is a backend field
(`docs/TODO.md` records it), not a second guess here.

**PET-22 filled the second slot, `TrendCard`, and it inherits both of PET-21's review lessons
before shipping rather than after.** The card is DSH-6's weekly bars, drawn with **Recharts** -
the same branch first shipped them as self-scaled `<div>`s and argued at length for no charting
library at all, and that decision was reversed before PET-23 was built rather than left to make
this card the odd one out. The argument was sound for one chart and wrong about its own scope:
the epic does not stop at two, and PET-23's donut plus everything after it would each have
hand-rolled their own geometry. What survives the reversal is the colour rule, reached through
`var(--color-*)` on an SVG `fill` rather than through a class, because a class string is not a
valid value for a presentation attribute. `frontend/CLAUDE.md`'s The chart library is the
authority for every rule that governs a new one, including the Recharts default that has to be
turned off and the reason no Jest suite may measure a chart. Its
caption reads "Weekly" with **no month name**, for the identical reason `BudgetCard`'s stopped
naming one: the bars are anchored to `weeklyBuckets`, which shares `daysLeft`'s
`monthWindow(monthStartDay, today)`, so a window spanning two calendar months has no single name
and the plan that first drafted this card caught itself repeating the mistake before writing the
component. **The card reads no clock at all, and the version that did was worse than it claimed.**
`weeks.ts`'s `currentWeekIndex` first took `todayIsoDate()` off the frontend host, while every
bucket boundary comes from `APP_TIMEZONE`, and both this file and `docs/TODO.md` recorded that as
"one week off for up to an hour twice a month" and as not fixable without the card reading
`monthStartDay` itself. Review of the PR found all three parts wrong: the gap is the full zone
offset rather than an hour, it straddles every bucket boundary rather than the month's, and on
the **first day of a period** the frontend's `today` falls before `buckets[0].startDate` so
`currentWeekIndex` answers `null` and **nothing at all is accented** - AC3 failing outright
rather than pointing one week off, on a UTC-deployed frontend against the default
`Europe/Zagreb`. It is fixable, and without a second read: `todayFromDaysLeft` subtracts
`daysLeft` from the final bucket's `endDate`, which **is** `monthWindow`'s exclusive `end`, so
the backend's own `today` comes back out of two fields already on the one response. That is
arithmetic over the API's answer rather than the second-guessing PET-21's `BudgetCard` avoided,
which is the distinction to carry into any card tempted to read a clock. The lesson generalises:
**a Server Component's `new Date()` is the frontend host's zone, and every period on this
dashboard belongs to the backend's.**
**The API already zero-fills a spend-free week**, so the card must not: `weeklyBucketsOf` on the
backend pushes every bucket in the period's range with `total: 0` rather than omitting it, and
its one early return - an **empty** array - is for `transactionCount === 0`, the whole period
having no spend at all. `TrendCard` draws frame 05's own bar glyph and caption for that case as of
PET-26, guarded on the shared `isEmpty` prop rather than on `weeklyBuckets` itself, so a week that
merely has not started yet still reaches the zero-filled axis above and never this treatment.

**A percentage-height bar needs a plot area that holds nothing but bars, and PET-22 shipped the
version that did not.** The bars sat directly in the `h-32` column beside their value row, their
week label and two `gap-1`s, so `height: 100%` resolved against 128px while only 88px was free -
and a bar is a shrinkable flex item, so every bucket at or above 68.75% of the maximum was
flex-shrunk to that same 88px. `$410` and `$300` drew the identical bar and AC2 was false on
screen. The chart now nests the bar in its own `h-32` box, and `TrendCard.test.tsx` carries the
structural guard: the bar's parent must contain the bar and nothing else. **This generalises to
PET-23's donut and to any chart after it**, along with the two things that let it through: an
inline `style.height` is what the component _wrote_ rather than what the browser _drew_, so a
browser walk over a chart has to measure `getBoundingClientRect()`; and jsdom runs no layout at
all, so no Jest suite can see this class of defect by construction - it belongs on the same
browser-check list as `Modal`'s Escape and `BudgetForm`'s caret restore.

**The Recharts retrofit removed that specific bug's mechanism and left both of its lessons
standing.** There is no `h-32` box and no shrinkable flex item any more: Recharts computes its
own plot area from the container height minus the margins and the axis band, so a plot area
cannot be squeezed by a sibling label row because there are no sibling label rows. The margin is
still stated explicitly rather than left to the library, on the principle that a plot area left
to a default is the same mistake with a different owner. What did **not** change is the reason
the defect survived a green suite: `jest.setup.ts` now hands the chart a fixed invented 400x300
box so it renders at all, which means every bar in a Jest run has a size that came from a
constant. So the suite asserts counts, fills and text and **never a height**, and AC2 is proven
in the walk by measuring the laid-out `<path>` elements. The retrofit's walk measures the exact
pair that collided - `$410` and `$300` - and reports them 35.41px apart.

**The chart draws three tones rather than two, and the third is a state no frame has.** Review
of PET-22 found that `weeklyBucketsOf` tiles the **whole** period regardless of where today
falls, so on the 2nd of a 31-day period a user with one transaction gets one real bar and four
`total: 0` ones - each drawn at `MIN_BAR_PERCENT` and pixel-identical to AC5's genuinely
spend-free week. That is the shape most accounts show for most of a period and node 22:55, a
completed month, answers it nowhere. So a bucket after `highlightIndex` is muted and its figure
dimmed, and `highlightIndex` of `null` mutes nothing - a window we could not place today in is
not one to guess the past out of. **Neither that state nor the accent may be carried by colour
alone**, the review's second finding: each is named by an `sr-only` line rather than by
`aria-current`, which this repo does use on `DateField`'s today but which needs the `gridcell`
under it to be conveyed reliably, where these columns are generic `div`s. Two more strings with
no frame behind them, joining A29's list.

**Those per-column `sr-only` spans are now one `sr-only` list, and the retrofit is why.** Every
figure and caption on the chart is SVG text since it moved to Recharts, and SVG text is reachable
in principle and useless in practice - a bare run of numbers with nothing tying each to its week.
So the plot is `aria-hidden` and a visually hidden `<ul>` beside it is the chart's accessible
equivalent, one `<li>` per week naming its caption, its date range, its amount and its state in a
single sentence. That is strictly **more** than the spans carried, and it is what stops the new
tooltip being a mouse-only fact. Recharts' own `accessibilityLayer` was the alternative and is
deliberately off: see the chart-library section below for what leaving it on actually did.

**The muted tone is `base-content/20` and the obvious `base-300` was wrong**, which only the
browser could say. `base-300` is the theme's own empty-surface token and computes to
`oklch(0.95 0 0)` in light - against the card's white `base-100`, a 5px bar of it is invisible,
so the state meant to fix an ambiguity would have replaced it with nothing at all. Computed
style cannot report that on its own, because the tone that fixes it carries an alpha: the walk
composites the bar over the card on a canvas and reads the painted pixel, which is 1.53:1 in
light and 1.88:1 in dark against roughly 1.09:1 for the token it replaced. **A colour check that
stops at `getComputedStyle` has not checked a translucent one.**

That tone survived the Recharts retrofit as a `fill` plus a `fillOpacity` rather than a
`bg-base-content/20` class, which is a **different compositing path to the same visual result**,
so the walk measured it again instead of inheriting the old numbers: **1.527:1 in light, 1.876:1
in dark**, and `base-300` still measures **1.115:1** through the identical harness. That last
number is the point of re-running it - a check that has never been seen to fail is not evidence,
and this one is now on record failing for the token it rejected.
**PET-74's Expensa themes re-measured both again**, because a theme change voids every recorded
figure: `base-content/20` composites to **1.532:1 light / 1.909:1 dark**, and `base-300` still
fails at **1.152:1 / 1.163:1** - the tone keeps its job and the rejected token stays rejected.

**PET-23 filled the third slot, `CategoryDonut`, and the requirement it was built to is stronger
than the one its plan was written to.** That plan designed a ring **deliberately allowed not to
close**, on the reasoning that a transaction whose category was tombstoned leaves the slices
summing to just under 100 and that a visible gap beats a shortfall hidden inside every
percentage. The product decision reversed it: the ring always closes, the centre reads the
period's total, and the percentages sum to 100. The old argument was right about the facts and
wrong that the gap had to be **shown** rather than removed.

**Three unrelated things can stop a donut closing, and the plan only knew the rarest.** Display
rounding is the one that would have shipped: five slices at 32.4 / 24.3 / 18.2 / 14.2 / 10.9 each
round correctly alone and sum to 99, on most accounts, with nothing wrong with the data. That is
`donut.ts`'s `apportionPercents`, largest-remainder, and its accepted cost is that a slice can
read a point off its own rounding - on those five the floors total 98, so two points are handed
out and the 32.4 shows 33. The underlying values were already fine. And the orphan case is
narrower than "a deleted category", because `DELETE /api/categories/:id` reassigns to the
Uncategorized fallback before tombstoning; only the check-then-write race can orphan anything.

**That last one is fixed in the backend rather than in this card**, because the money belongs to
a category the user can no longer see and that is exactly what Uncategorized is for.
`CategoriesService.withSpend` folds it in, which restores _every transaction is counted in
exactly one row_ for the categories list and the month stats too, not just here.
`docs/TODO.md` carries the VERY IMPORTANT invariant entry and the part of it the write path
still cannot guarantee.

**The ring is closed by two independent mechanisms and that is deliberate.** The arcs are driven
by `dataKey="spent"`, which Recharts normalises against the sum of the values it holds, so the
geometry closes even if a future response's percentages did not add up. A chart's correctness
should not rest on a field being well-behaved.

**`Pie` carries a second focusable default beyond `accessibilityLayer`.** Its own `rootTabIndex`
defaults to 0, so switching the accessibility layer off was not enough and the ring stayed in the
tab order inside an `aria-hidden` subtree. Both are off now. Found by the suite asserting the
negative rather than by enumerating known defaults, which is the argument for writing that
assertion on every chart.

**The donut's ring is `aria-hidden` with no `sr-only` twin, unlike the trend chart, and the
difference is the legend.** Here the legend names every slice with its amount and its percentage in
real text, so it is a strict **superset** of the hover tooltip and there is nothing to mirror.
The trend chart's tooltip carried a date range that appeared nowhere else, which is why that one
needed a list. The tooltip shows the **apportioned** integer rather than rounding again, so a
slice and its legend row cannot disagree by a point.

**That superset argument covers the slices and not the centre total, which is the review finding
it produced.** The card first put `aria-hidden` on a wrapper holding the ring _and_ the centre
readout, and no legend row states the period's total - so AC2's own figure was on no accessible
surface at all, the exact gap PET-22's chart paid for with an `sr-only` list. The fix is a second
wrapper: the attribute sits on the ring alone and the readout is ordinary announced text. Worth
knowing why the suite could not have caught it as written - **RTL queries read straight through
`aria-hidden`**, so `getByText('$1,240')` passed with the defect present and only the containment
says which. `CategoryDonut.test.tsx` asserts the containment now, and the rule generalises to
every chart on this dashboard: a text assertion is not an accessibility assertion.

**The legend's percentages are apportioned against the response's own total, not renormalised to
100, and that reverses what `donut.ts` first documented.** The first version divided each value by
the set's sum before apportioning, so a response summing to 97 still produced a legend reading
100 - defended in that file as surviving the breach of a guarantee. It is the wrong way to survive
it, because of what the guarantee is made of: `dashboard.service.ts`'s `categoriesOf` deliberately
divides by `totalCents`, the account-wide total summed from the transaction list rather than from
these rows, and both its docblock and `backend/CLAUDE.md` say the reason in as many words - a
regression in the orphan fold is then **visible** as percentages failing to reach 100 instead of
being renormalised out of sight. Scaling in the consumer disarmed that detector from the far end,
and would have shown a legend reading 100% over amounts summing to less than the figure in the
middle of the ring. So a shortfall now survives to be seen, and the ring still closes beside it
because Recharts sizes the arcs from `spent`: **the two mechanisms disagreeing is the signal**,
which is what "two independent mechanisms" above is for.

**Two review findings were about colour, and both are the kind only a browser can settle.** The
fallback slice and its legend dot were `base-300`, the token PET-22 had already measured and
rejected for the trend chart's muted bars - **1.157:1** in light and **1.115:1** in dark against
this card - and it mattered more here than there, because the backend's orphan fold routes real
money into that one slice, so drawing it invisible is the ring failing to close by another route.
It is `base-content/50` now: **3.401:1** light, **4.769:1** dark, composited and measured through
the same harness, which probed the old token in the same run and watched it fail. Under PET-74's
Expensa themes the same composite reads **3.395:1** light and **5.076:1** dark and `base-300`
still fails, so both findings survive the re-theme. And the arcs
carry a `stroke` of `base-100` where they carried none, because `CATEGORY_FILL` is lossy on
purpose - `orange` and `yellow` both resolve to `var(--color-warning)` - so two same-coloured
slices landing next to each other in the `spent`-descending sort merged into one arc, showing four
slices under a legend listing five. The seam is invisible between two differently-coloured slices,
which is what makes it free; `Shell/Spending by category`'s `SameColourNeighbours` story is the
case, and counting its arcs against its legend rows is the whole check.

**The legend's tiebreak compares with `<`, not `localeCompare`, and "the same rule as the backend"
had to mean the same collation.** `topCategoryOf` breaks its tie with `row.name < winner.name` and
`CategoriesService.withSpend` orders by SQLite's BINARY collation, both UTF-16 code units;
`localeCompare` is a different order and disagrees on ordinary data rather than exotic data - two
categories tied at $100 named `Bills` and `arcade` put `Bills` in PET-21's "Top category" stat and
`arcade` at the top of this legend, on one screen. Any accented name does it too. The nicer human
ordering is real, and it is the backend's to choose for both surfaces rather than this card's to
have an opinion about.

**PET-64 gave this card the real per-category glyph, and it is the site that ticket's own blast
radius missed.** The plan swept `main` and reported "two `<ShoppingBag />` placeholder sites, not
one" - `TransactionRow` and `[id]/CategoryContextCard`. There were **three**: this card draws the
identical `size-9 rounded-field` tile and drew the identical placeholder in it. Leaving it would
have made the dashboard the one screen where a reader still cannot tell Personal care from Gifts,
which is the whole reason the icon shipped alongside the palette rather than after it. The fix
widened `DashboardCategoryDto` with `icon` - **for this tile alone**, since the donut's slices are
bare colour and need none - so the join below still costs no request. The lesson generalises past
this card: a plan's inventory is a starting point, and `grep -rn ShoppingBag src/` is a second
later.

**PET-24 filled the fourth slot, `RecentTransactionsCard`, and its one finding worth arguing is
that the join it draws costs no request.** A row in `recentTransactions` is a
`TransactionResponseDto` and carries only a `categoryId`, no name and no colour, which looks like
the same gap `TransactionsTable` solves with a second read - `docs/TODO.md`'s redundant-request
item for that screen. The dashboard response does not have that problem: `categories` already
publishes every category with `spent > 0` this period, `amount` is validated `@IsPositive` so no
live transaction contributes zero, and `recentTransactions` is documented as up to three live
transactions **in the current period**. So every recent row's category necessarily has nonzero
spend this period and necessarily appears in `categories` already in hand, and the card's join is
a `Map` lookup over one response rather than a second fetch. It still falls back rather than
trusting that chain: an unresolved `categoryId` renders the neutral tile and drops the name from
the caption, keeping only the date, because the invariant is implied by the contract rather than
stated by it.

**The rows are not links, for the same reason PET-34's link belongs on the transactions table's
merchant cell rather than on the row.** A link wrapping a whole row takes its accessible name
from everything inside it, so a row here would announce "Whole Foods Groceries Today −$24.00" -
except this card has no detail route to link to at all, so there is no cell that could plausibly
carry it either. The rows stay plain markup and the card's one navigation is "View all", `ui/
Button`'s `href` variant reading its destination from `SIDEBAR_HREFS` rather than a sixth
hand-written copy of `/transactions`.

**Its relative caption inherits the server-zone gap every other figure on this screen already
has, and is the first place that gap renders as a wrong word instead of a plausible one.**
`formatRelativeDate` defaults its `today` to the frontend host's own local zone, while
`daysLeft`, the trend chart's highlight and the buckets themselves are all resolved backend-side
against `APP_TIMEZONE`. The window is the **full zone offset** rather than an hour, which is the
correction PET-22's review already made to `TrendCard`'s version of this paragraph above, and it
runs in both directions. A host _ahead_ of the configured zone gets the benign one: a transaction
the backend counts as today's reads its short date instead of "Today". A host _behind_ it - which
a UTC deployment against `Europe/Zagreb` is - gets the worse one, because the frontend's `today`
is then a day **earlier** than the backend's, so yesterday's transaction reads "Today" while
today's reads its short date. One row is missing a word and the other asserts something false,
which is what makes this the first figure on the dashboard whose skew is not merely plausible.
Not fixed here, deliberately: the honest fix is a zone the frontend reads too, and `docs/TODO.md`
records it beside the per-user timezone item it already owes.

**PET-25 filled the fifth and last slot, `InsightTeaserCard`, and the Dashboard grid is complete
as of this ticket.** `DashboardResponseDto.insight` widened from `string | null` to
`InsightSummaryDto | null` to carry the body AC1's frame draws alongside the headline - the one
backend change in this stack, and `backend/CLAUDE.md`'s Dashboard section is that note's only
home. The card reads no clock and composes no
window, unlike its four siblings: `insight` is either a summary or `null`, and the card's whole
job is choosing which of two static shapes to render around whichever strings it is handed.

**A null `insight` is two different accounts, and the review of this branch is what found it.**
That paragraph used to end "the condition is `insight === null`, and it needs no third state",
defended on the contract folding "nothing generated yet" and "the first run is still in flight"
into one null. Both halves of that are true and the conclusion did not follow, because **nothing
in either app generated a set** at the time: no frontend caller of `POST /api/insights/generate`,
`/insights` still an empty `<main>`, and no backend path generating on a write. (**PET-42-43-44
ended all three**, and the paragraph below records what that leaves of this one - read the present
tense here as PET-25's.) So `insight` was null
for every account there was, and the unlock copy - "Insights unlock after your first expense." over
an "Add transaction" - was the only state a running app could reach, shown to an account with two
hundred of them. The card then took `transactionCount` beside `insight` and split the null: at
zero it drew frame 44:706's designed copy, above zero it said nothing has been analysed yet and
offered the same link to Insights the ready state does. Still two shapes rather than three, still
no `generating` skeleton - that card is PET-42's, reading `GET /api/insights` directly rather than
this field - and the two new strings join what A29 owes a designer. The lesson is the one
`TransactionsScreen`'s no-results copy already paid for: **an empty state has to be honest about
which emptiness it is describing**, and the reachable state is the one to check first.
`transactionCount` is PET-26's `isEmpty` now, and the paragraph below is why.

**The AI Insights and Settings `<main>` elements are now the only two still empty and still
fetching nothing.** Every trap statement above naming "the Dashboard, AI Insights and Settings"
as the unbuilt three is dated to before this ticket; Dashboard's own `<main>` is real as of
PET-21 and complete as of this one.

**PET-42-43-44 makes a set reachable, and the teaser's `isEmpty` workaround becomes a fallback
rather than the common path.** Every transaction create, edit and delete regenerates the set
backend-side, so `insight` is non-null for any account that has logged anything and settled a run.
The `transactionCount` split above still earns its place - the window between the first save and
the first run settling is real, and so is an account whose transactions predate the trigger - but
it is no longer standing in for a capability nothing had. The third state it was invented to
paper over, "expenses exist and nothing has analysed them", is now genuinely transient.

**Settings is the last `<main>` still empty and still fetching nothing.** `/insights` is a
complete screen as of PET-42-43-44: `page.tsx` awaits `lib/insights.ts`'s `requireInsights()` and
hands the resolved set to a synchronous `InsightsScreen`, which renders frames 14, 15 and 16 off
the one `state` the read carries. Three of the four routed views fetch now. Read every trap
statement above naming "the Dashboard, AI Insights and Settings" as the unbuilt three, and the one
above naming two, as dated to before this ticket.

**PET-26 is frame 05, the Dashboard's designed empty state, and it closes the Dashboard epic.**
Five cards had each been shipping the _populated_ mock their own ticket drew, with an empty
account rendering nothing on four of them and a stand-in caption on the fifth - none of it wrong,
all of it undesigned. `docs/plans/2026-08-06_PET-26_dashboard-empty-state.md` is the plan in full;
what belongs here is the shape.

**One condition, resolved once in `page.tsx`, not five per-card guesses.** `isEmpty =
summary.transactionCount === 0`, not `spent === 0` - a period could in principle hold
transactions summing to zero, which is a different fact - and not each card reading its own
field: `weeklyBuckets.length === 0` and `recentTransactions.length === 0` are documented as
identical to the shared flag today, but a card that re-derived its own opinion from a field it
happens to hold is a sixth spelling of one decision, and the whole point of resolving it once is
that a future edit to what "empty" means in `page.tsx` cannot leave one card behind with every
gate green. So `BudgetCard`, `TrendCard`, `RecentTransactionsCard` and `InsightTeaserCard` all
take `isEmpty` as a plain boolean prop and branch on nothing else. `DashboardScreen` never sees
it, for the reason PET-21's own note above already gives: nothing on frame 05 is the screen's
decision, so the flag travels straight from the read to the card that needs it.

**`CategoryDonut` is the one deliberate exception, and it takes no `isEmpty` prop at all.** Its
guard stays `categories.length === 0`, which PET-23's own plan set out and this ticket carries
out rather than revisits: the trend and recent cards' empty arrays occur exactly when
`transactionCount === 0`, because both are derived straight from the period's transaction list,
but `categories` comes from `CategoriesService.list()` filtered on `spent > 0` and can be empty
on a populated screen through the dangling-category race `backend/src/dashboard/dashboard.service.ts`
documents. Guarding on the screen's own flag would leave that race drawing a blank card with
nothing explaining it. The donut's guard is a strict superset of the shared condition rather than
a sixth spelling of it - an empty screen always has empty `categories` - so after this ticket
there are exactly two conditions on the whole screen, not five: the shared `isEmpty` and the
donut's own input. Its centre reads `formatWhole(spent)` rather than a literal `$0` for the same
reason: the true empty account has `spent: 0` and draws frame 05 exactly, but the race can leave
real spend on the card with nowhere to draw it, and the figure must not claim there was none.

**`components/EmptyState.tsx` is the wrong component for any of the four, and this is worth
stating because it looks right.** That component is the full-card centred treatment frames 07 and
16 draw - a 72px accent-soft circle, a heading, a 440px body and a primary button, replacing the
whole card. Frame 05's four treatments are each a small glyph and a line or two _inside a card
that keeps its own header and its own footprint in the grid_ - `RecentTransactionsCard`'s empty
branch still draws "Recent transactions" above the icon, where `EmptyState` would draw nothing
above it at all. Reusing it here would change the design and break the grid's alignment, so each
card gets its own small local markup instead, scaled down from `EmptyState`'s own
`bg-primary/10 text-primary` circle treatment where a card needs a tinted glyph
(`RecentTransactionsCard`), and left a plain muted glyph where the frame draws one with no tint at
all (`TrendCard`, and the donut's ring itself).

**The review of this branch found three cards reading frame 05 as a fact about an _account_ when
`isEmpty` is a fact about a _period_, and that is the trap to carry into any empty state here.**
The frame draws a brand-new user on day one; `transactionCount === 0` is also every established
account at the start of a period and every light account that has not spent anything yet this
month. Copy true of the first is false of the other two. Three consequences, all shipped and all
now fixed. **`BudgetCard`'s caption needs a second condition**: `daysLeft >= 28` alongside
`isEmpty`, because emptiness carries no information about time remaining and the card was replacing
an accurate "4 days left" with a claim the month had not started. 28 is a derived bound rather than
an invented threshold - a period is 28 to 31 days, so at or above it at most three days have
elapsed - and below it the card draws the count it draws in every other state. **`RecentTransactionsCard`
keeps its "View all"**, which amends the plan's rule that no empty treatment carries an interactive
control: that rule is right for the three treatments with no navigation to lose, and wrong here,
where dropping the link told a returning user they had no transactions and simultaneously deleted
the one route from the card to the history they do have. **`CategoryDonut`'s ring name and caption
branch on `spent`** the way its centre figure already did: the dangling-category race renders that
ring with real money in the middle of it, and "once you start spending" beside "$124" is the card
contradicting itself - worse through a screen reader, where the ring's name is the whole of what
the region announces. The general form is the lesson `TransactionsScreen`'s no-results copy and
`InsightTeaserCard`'s third state each paid for separately: **an empty state has to be honest about
which emptiness it is describing**, and on this screen "empty" always means the period.

**Five new strings join what A29 owes**, `docs/TODO.md` is where they are logged. Unlike the
undesigned-state copy that list otherwise tracks, these five are read straight off frame 05 -
"Full month ahead", "No spending to chart yet", "No transactions yet" and its body line, and the
donut's "Your category breakdown appears here once you start spending" - so a copy review has one
place to look rather than mistaking them for invented copy.

PET-31 adds a second thing that is real and a matching trap. **The app writes now**, from any of
the three Add transaction triggers, and the write is the only one in the app. What it cannot show
you is the result: the transactions **table** is PET-29's slot, so saving from the Transactions
empty card correctly replaces the card with a blank table body - correct tabs, a badge that ticks
up, and nothing beneath. The badge moving is the visible evidence the write landed, and it is what
AC5 can honestly claim. Two consequences worth carrying: a **backdated** transaction lands outside
`period=current` and so neither appears nor counts, which is PET-29's filter to own rather than a
bug here; and a successful save from an empty state **destroys the button that opened the modal**,
so the browser's focus restore has nowhere to go. Both are in `docs/TODO.md`.

**PET-29 closes the first of those and leaves the second.** The table is real, so a save now shows
its row rather than a blank body, and a backdated one can be reached with the period select
instead of being invisible - though nothing switches the period _for_ you, which `docs/TODO.md`
records as still wanting the confirmation copy A19 and A29 owe. The focus-restore gap is unchanged
and is now slightly more visible, since the card is replaced by rows rather than by nothing.

**The trap PET-29 leaves is the opposite shape to the ones above: this screen now looks finished
and is not.** Every control on it works except the two that navigate. A row click does nothing and
the kebab does nothing, because frame 08 is PET-34's and frame 10 is PET-33's - so the one thing a
reviewer is most likely to try on a full table is the one thing that is deliberately dead. It is
also the only screen of the four with a real data path, which was true before PET-29 and is worth
restating: the Dashboard, AI Insights and Settings `<main>` elements are still empty and still
fetch nothing.

**PET-33 closes half of that trap and narrows the rest.** The kebab works: it opens a real menu
and Delete really deletes, which makes this the second write in the app and the first that
removes anything. A row click is still the dead one, and it is now the _only_ dead one on the
screen, which makes it more likely to be tried rather than less.

Three things PET-33 adds that are worth carrying into the next ticket here. **Four of its seven
acceptance criteria could not be verified in it**: AC2 needs PET-32's edit modal, AC3's other two
entry points need PET-32 and PET-34, AC6 needs a Dashboard and a Categories tab that render
anything at all, and AC7 needs PET-34 - so a reviewer should read the ticket as amended rather
than as half-done, and the Jira comment records it. **The delete is the first thing in this app
that removes data**, and `docs/TODO.md` records that the row tombstones rather than disappearing
from the database, which is invisible through every endpoint and must not be "fixed" against the
dialog's "permanently". And **deleting a row destroys the kebab that opened the dialog**, so
`Modal`'s focus restore finds nothing connected and focus lands on `<body>` - the identical gap
saving from the empty state already had, now on a path a user takes far more often.

**PET-32 closes PET-33's AC2 and leaves the row click.** The kebab's "Edit" opens frame 11 prefilled,
which makes editing the third write in the app, so **nothing in the menu is inert any anymore** and
the row click is the last dead affordance on the screen. That is worth stating plainly for the same
reason PET-29's trap was: the screen looks finished, every control in reach works, and the one thing
a reviewer will still try on a full table - clicking a row - is PET-34's.

Three things PET-32 adds that the next ticket here should know. **Two of its six acceptance criteria
are amended rather than met**: AC1 and AC3 name the transaction detail page as a second entry point
and a second surface to refresh, and PET-34 has neither a route nor a read - the modal is mounted on
the shell, so that becomes a two-line call site. AC3's dashboard and category-total halves are
`router.refresh()`'s to make true the day those screens read anything, which is the situation PET-33
recorded for its own AC6 and is still unverifiable. **The nested-dialog case is real now**, so
`Modal`'s generated heading id has stopped being a precaution: two dialogs are genuinely mounted
together, and under Jest both are reachable because jsdom has no top layer - a query for "Cancel"
with the confirmation open is ambiguous and has to say which dialog it means. And **the focus gap
gets a third route to it**: deleting from inside the edit modal unwinds two dialogs onto a kebab that
died with its row, so focus still lands on `<body>`. It joins the existing entry rather than opening
a second one.

**PET-34 closes the row click, and with it the last of that chain.** `/transactions/[id]` exists,
the merchant cell links to it, and the trap those four paragraphs kept restating is gone: there is
no drawn-but-dead control left on the transactions screen. It also closes four criteria other
tickets could not - PET-32's AC1 and AC3 (this page is the second entry point, and
`router.refresh()` re-reads this route after a save) and PET-33's AC3 and AC7 (the confirmation
opens from this header, and deleting lands back on the list). Both were two-line call sites
exactly as forecast, which is the argument for building the parameter in the ticket that has a
caller.

Three things PET-34 leaves for the next ticket here. **Three of its own acceptance criteria are
amended rather than met**, and all three shrink the frame: AC1 loses the time from the caption,
AC3 renders no chip, bar or remaining figure for an uncapped category, and AC6 is removed outright
because Time, Payment and Status are no longer on the screen to render as empty - DET-8 and A20
answered by dropping the rows rather than blanking them. **The uncapped state is the one owing a
designer's answer**: caps are optional and the preselected fallback ships without one, so it is
the _common_ case that no frame draws, and `Screens/08 Transaction detail`'s `Uncapped` story is
what to put in front of them. And **the Categories tab is still one of the two screens this
page's figures cannot be cross-checked against**, because PET-36 has no route behind it - the
same disposition PET-32 and PET-33 both recorded. The dashboard is no longer the other: PET-21 to
PET-26 closed as an epic rather than staying an open stack, so its category totals are real
figures on a real screen now, the same cross-check this page's own category cap and spend already
invite.

**PET-42-43-44 fills `/insights`, and its one genuinely new mechanism is a poll.** Same split as
the three screens before it - `page.tsx` async and fetching, a synchronous screen taking the
resolved set - with one difference that forces the rest: `InsightsScreen` is a **client component**,
because the generating state has to resolve itself without a navigation. Four things about it are
decisions rather than shape.

**Nothing fires on mount, in any state**, and that is the largest thing this ticket deleted rather
than added. The three-branch stack it replaces had the empty state POST `/api/insights/generate`
when the read returned `empty` - which made a read-only screen write to the database on every visit
and made React Strict Mode's dev double-mount issue a second POST that 409'd against the first. The
trigger lives on the **write path** now: `TransactionsService` emits and `InsightsModule` listens,
so saving, editing or deleting an expense regenerates the set. `InsightsScreen.test.tsx` pins that
nothing is POSTed on mount in either state, which is the regression test for a mechanism that no
longer exists.

**The poll goes through `app/api/insights/route.ts` and could not go anywhere else.** `lib/insights.ts`
reads the httpOnly cookie through `next/headers` and uses the server-only `BACKEND_URL`, so a
`useEffect` cannot call it; a Server Action polled from a client component is a write pretending to
be a read. That handler is the **third** in the repo and the second of the "route handler the client
fetches" shape `docs/agents/api-contract.md` records - and unlike the categories one it projects
nothing, because every field it returns is drawn. `lib/insights.ts` exports both a plain
`AuthorizedResult` read and a redirecting wrapper for the same reason `lib/categories.ts` refuses to
redirect internally: a `redirect()` answers the browser's `fetch` with an HTML login page carrying a
200, which the page would parse as a set.

**There is no poll cap, and the two-minute one the stacked plan carried was worse than none.**
`hasRunInFlight` treats a `generating` row as live until the backend's five-minute staleness cutoff,
so a click after a two-minute cap can only 409 - which this design treats as success and re-enters
polling on, putting the page back into skeletons for another two minutes. The cap added a click to
the same wait rather than shortening it. The read self-heals at the cutoff with no POST needed, so
the screen polls with a backoff, keeps the button disabled off `state === 'generating'`, and keeps
one hard ceiling just past five minutes purely so a wedged timer cannot outlive the guarantee.

**The poll starts from the `state` prop changing as well as from a click, and that third path is
the one a review caught.** `AddTransactionModal` calls `router.refresh()` on save, which re-runs
the Server Component and flips this screen's prop from `empty` to `generating` - with no click
anywhere and no action result to hang a timer off. Without adopting the changed prop, the empty
state's own "Add your first transaction" left the user looking at skeletons with no timer running,
stuck until a manual reload, on the one flow this ticket newly creates. It is a **render-phase state
adjustment** rather than an effect, the shape `TransactionSearch` already records, and it compares
`state` and `generatedAt` rather than object identity because the server hands back a fresh object
on every refresh.

Two smaller notes. **The header overline is the period, not INS-1's "Your money assistant"** - a
deliberate deviation decided at the 2026-08-08 review so the four routed views read consistently,
with the Jira ticket amended. And **the tone map inverts twice**: backend `warning` renders as
daisyUI `error` and backend `neutral` as `warning`, so a name-to-name map compiles cleanly and is
wrong in two places. `insights/insightTone.ts` holds whole class strings per key, the shape
`frontend/CLAUDE.md` names `ui/categoryColour.ts` as the pattern for, plus a fallback so an `info`
stored before the enum narrowed still renders.

**The Regenerate button is in the header in every state, which amends INS-1, and the review of
this branch is why.** The frame draws no control on frame 16 and the screen honoured that, on the
premise the paragraphs above state twice: that the write-path trigger had made `empty` mean "this
account has never logged a transaction". Two ordinary accounts reach `empty` with that premise
false. One logged its transactions **before** this branch shipped, so no `ready` set exists and
the read answers `empty` over two hundred expenses - the exact account `dashboard/InsightTeaserCard.tsx`
keeps its `transactionCount` split for, which `/insights` had no equivalent of. The other's
**first run failed**, since `runGeneration` marks the row `failed` and the read falls back here,
making a failure and a fresh account render identically. With the button hidden both were dead
ends whose only escape was creating or editing another transaction. The cost of the amendment is
that a genuinely new account carries a button that draws skeletons for a moment and settles back
to the same card, because the generator answers `null` and the placeholder run is removed. Read
the empty-state premise above as narrowed rather than deleted: it is what usually holds, and
`InsightsEmpty.tsx` no longer asserts it.

**The poll's ceiling now puts the screen into a stalled state rather than only stopping the
timer**, which is the second half of the same finding. The paragraph above is right that the
backend read self-heals at the five-minute cutoff with no POST needed - but that is the _read's_
guarantee, and the client stopped asking at the same moment. A session that died, or a backend
unreachable for the whole 5.5 minutes, left `state` on `generating` with the effect's only
dependency unable to change again: permanent skeletons under a disabled "Generating...", for the
lifetime of the mount. Giving up now flips a flag the header and the body both read, so the button
re-enables and the body falls back to the content the read carries **independently of `state`** -
the ready set when there is one, the empty card when there is not. A fresh server read clears the
flag, because it is a fact about this mount's polling rather than about the account.

**And a 401 from Regenerate refreshes the route, because a dead session is not A26's undesigned
failure.** That one is a failed _run_, which is invisible by contract and correctly leaves the
previous set on screen with the button re-enabled. A 401 is different in kind: nothing on the page
will work again, and the click was silent and stayed silent on every subsequent press. The
redirect is the server's, so `router.refresh()` puts `requireInsights()` in front of the same dead
cookie and it redirects to `/login` like every other read - which is also why
`lib/generateInsights.ts` must keep **not** redirecting from inside the action, for the reason it
records. This is the screen's only router call, and both gates were already paying for one: the
suite mocks `next/navigation` and the stories carry `nextjs: { appDirectory: true }` for the
provider subtree.

**PET-46 filled the Settings `<main>`, so every sentence above calling it "the last one still empty
and still fetching nothing" is history, and so is every trap statement naming two or three unbuilt
screens.** All four routed views render content below their header and all four fetch. Read the
paragraphs at "The AI Insights and Settings `<main>` elements are now the only two", "Settings is
the last `<main>` still empty" and the closing line of the PET-29 trap as dated in the same way the
Dashboard and Insights sentences before them already are.

**What it does not do is finish frame 17, and that distinction is the one to carry.** The frame
draws **three** cards over a single "Save changes", and only the Profile card is built. The
Preferences card and the Categories summary are PET-47's and are **not drawn at all** - deliberately
absent rather than inert, which is the opposite of every dead control this file otherwise records.
An inert control is right when the thing behind it is one ticket away and the frame's layout depends
on it being there; a card whose three fields would submit through a form that does not carry them is
not a control at all, it is a promise the form cannot keep. So Settings ships as a short page rather
than a full one with two dead cards on it.

**The `'use client'` boundary is `SettingsForm`, and both of the places it is not are decisions.**
It is not on `SettingsScreen`, because AC3's live initials and AC4's inline messages need state and
nothing above the `<form>` does - the smallest-wrapper rule `SidebarNav` and `TrendChart` follow -
and because a synchronous `SettingsScreen` is what lets Storybook render the screen at all. And it
is not per card, which is the shape that looks tidier: one page-level Save means one `<form>`
wrapping every card, because a footer button cannot read state held inside a sibling. That is what
makes PET-47 additive. `ProfileCard.tsx` is a separate file for that ticket rather than for reuse -
one consumer is normally the argument against a file, and what earns it one is that
`PreferencesCard` is a structurally identical sibling taking the same four props. Not a slot, for
`CategoriesScreen`'s reason: a slot with one possible occupant expresses no choice.

**The page reads the profile a second time, and the shell's copy is deliberately not threaded
down.** `(app)/layout.tsx` already called `requireProfile()` for the sidebar footer a moment
earlier, and an App Router layout cannot pass props to the page it wraps. The two alternatives are a
provider on all four routes to serve one screen, or this. What the second read buys beyond
simplicity is that the form's **diff baseline is the current profile**: `original` is read off the
prop on every render rather than frozen into `useState`, so after a save `router.refresh()` re-runs
both the layout and this page and a second press with no further edits has nothing to send.
`AllocateBudgetModal`'s `useState(() => ...)` baseline is the tempting shape to copy and is wrong
here - that modal reads once on open because a background refresh would rewrite fields under the
user's hands, and this form already holds `values` in state, so the protection is had for free.
`docs/TODO.md` records the request's cost.

**Three states on this screen have no frame behind them, which makes five with no frame in this
app.** SET-5 draws no success, no error and no unsaved-changes visual, so pending, failure and
confirmation are all ours. Two of them follow existing rules exactly: Save disables while the
request is out, and the four failure lines go through `components/FormError.tsx`'s `role="alert"`.
The third is new here and is the one to read the reasoning for before touching it. **The "Changes
saved" line is mounted from the first render and only its text changes**, which
`AllocateBudgetModal.tsx` records the mechanism for - a polite region created in the same commit as
its content is generally not announced at all, and `getByRole('status')` cannot tell that apart from
a working one, which is why the suite asserts the region's _text_. It is `role="status"` rather than
`FormError`'s `role="alert"` because it follows a round trip that went right, and it clears on the
next keystroke, because "Changes saved" over a form that has since been edited is the one lie this
screen could tell.

**Validation runs before the diff, and an empty diff sends nothing at all.** The order is
load-bearing rather than stylistic: blanking First name must show its message even though the diff
would be non-empty, and blanking it then restoring it must be silent. Then `PATCH /api/profile`
answers 400 to a body with no keys, so a press on an untouched form returns without a request, a
refresh or a message - `EditTransactionModal`'s call, minus the dialog it has to close, and
deliberately without a confirmation, because claiming a save that never happened is worse than
saying nothing. **Save stays enabled on a clean form**, which is the one place this departs from
`AllocateBudgetModal`'s `!isDirty`: that modal has a designed disabled state and this frame does
not, so a dead button with nothing beside it explaining itself would be the worse trade.

**The avatar is announced where `ui/Sidebar`'s identical tile is `aria-hidden`, and the divergence
is deliberate.** That one hides its initials because the full name is read out immediately after
them, so they are a repeat; here the names live in inputs, whose values a reader hears only on
focus, so "MK" is the only place a screen reader meets them on the card. `initials()` from
`lib/format.ts` is reused rather than re-derived, which that function's own docblock has named SET-6
and this card as the reason for since before either existed - the sidebar footer and this avatar
have to agree, and that is AC5.

**The caption says "Spendifico" where the frame says "Expensa"**, joining `ui/Sidebar.tsx` and
`components/LogoLockup.tsx` as the third site carrying the PET-51 rename against the design file.
`SettingsForm.test.tsx` pins the absence of the old string, as six other suites already do, so it
cannot be half-reverted by somebody working from Figma in good faith.

**The Email field carries a standing hint, and that is what widened `ui/Input`.** A39 designs no
re-verification step and no warning anywhere, so editing that field silently moves where every
future login link goes. "Login links will be sent here." states it where it happens, and it is a
`hint` prop rather than a `<p>` beside the field so the control genuinely describes it - an
unassociated caption is one a screen reader reaches only by wandering past the field. `ui/FieldShell`
gained `fieldHintId` and `fieldDescribedBy` for it, and the case that assertion exists for is a
field carrying **both**: a control naming only the error stops describing its own hint at exactly
the moment the reader most needs the whole picture. Widening a shared primitive for one caller is
what `frontend/src/components/CLAUDE.md` warns against; taken anyway, and PET-47's three Preferences
fields are the obvious second consumer.

**`(app)/pages.test.tsx`'s Settings header assertion narrowed, and the criterion it pins did not
change.** It used to sweep the whole page for buttons and links, which was the same assertion only
while the `<main>` below was empty - so the moment this screen grew a form it would have failed for
a reason having nothing to do with the header. It is scoped to `<header>` now. What AC2 says is that
the header carries no action, which is still exactly what is measured; the version that leaned on
the rest of the page being empty was measuring something stronger by accident.

**A code review of PET-46 found that the paragraph above got the profile prop half right, and the
missing half caused three defects.** Reading the diff baseline off the live prop is correct; it is
only safe if `values` follows the _same_ profile, and it did not - `values` was seeded once at
mount and never reconciled. That pairing is a **mirror** of the bug the original reasoning avoided,
and it is worth keeping as a correction rather than an edit, because the argument for it was
written down confidently and was incomplete rather than wrong.

Three things it produced, all invisible to every gate and to a single-tab browser walk. The address
kept the casing the user typed while the account held the lowercased one `normalizeEmail` stores,
on the one screen whose job is to report the login identifier. The avatar went on deriving initials
from whitespace the save had trimmed away, so it disagreed with the sidebar footer - which is AC5
itself, the criterion `initials()` is a shared function _for_. And a field another tab had changed
was picked up by the next diff and silently reverted.

**The fix is a resync armed by the save rather than by any prop change, and that distinction is the
whole of it.** A render-phase state adjustment - `TransactionSearch`'s shape, because
`react-hooks/set-state-in-effect` rejects the effect version - adopts the server's values when a
refreshed profile arrives _after this form's own save_. Adopting every field is safe there and only
there: every control is `disabled` for the whole round trip, so nothing is in flight to destroy,
and the server is authoritative about all three values. A background refresh is deliberately
ignored, because a user mid-sentence must not have their typing replaced, which is the protection
the modals buy by reading once on open. Two details not to undo. The comparison is **by value**,
since `page.tsx` builds a fresh profile object on every server render and an identity test would
fire after every refresh in the app. And **a keystroke abandons a pending resync**: `router.refresh()`
resolves asynchronously while `setPending(false)` re-enables the fields immediately, so there is a
window where typing and adoption race, and the keystrokes win - the same call `AddTransactionModal`'s
scan merge already makes.

**Two accessibility defects came out of the same review, and both are about a control that stops
being focusable.** Disabling every field plus the Save button for the round trip blurs whichever
one the user was standing on, and the platform restores nothing because nothing unmounted - so a
keyboard user's next Tab restarted at the top of the page, on the path taken by _every_ save. The
form captures `document.activeElement` before `setPending(true)` and restores it in an effect keyed
on `pending` falling, which covers the success arm, both failure arms and the rejected RPC. And a
refused submit was **silent**: the inline messages are ordinary paragraphs reached through
`aria-describedby`, which announces on focus and at no other time, and unlike the form-level
failures they do not go through `FormError`'s `role="alert"`. Focus now moves to the first invalid
field in draw order, which announces the field, its label and its message together and leaves the
caret where the work is - chosen over a second live region because it is actionable rather than
merely audible. `FIELD_ID` in `settings/settingsForm.ts` is what makes that call possible: the ids
`ui/Input` requires as literal props are declared once beside the field union, so the focus target
and the markup cannot drift.

**PET-47 built the Preferences card, so "only the Profile card is built" and "two dead cards"
above are dated - and the distinction that paragraph draws is the one that survived.** Frame 17's
third card, the Categories summary with its "Manage", is still not drawn and is still absent
rather than inert, for exactly the reason given there. What changed is that the second card is
real: `components/BudgetField.tsx` over `settings/MonthStartField.tsx`, both writing into the same
`values` the Profile card does.

**AC6 is a property of the form rather than a feature of the card, and that is why the card is a
literal sibling and not a slot.** One `<form>` wraps both, both call the same `change`, and
`toUpdateProfileBody` diffs the whole profile once - so a single "Save changes" sends a single
PATCH carrying whatever moved on either card. Nothing implements that; it falls out of PET-46's
page-level form, which is what that shape was chosen for.

**`change` became generic over the field, which is the one prediction that did not hold exactly.**
`ProfileCard`'s three values are all typed text, so `(field, value: string)` served it; two of the
Preferences card's three are not - `monthStartDay` is a number and `currency` an ISO code from a
closed list, neither of which round-trips through the DOM as text. A string-only signature would
force a cast at exactly the point those controls exist to avoid one, so the handler is
`<Field extends SettingsFormField>(field: Field, value: SettingsFormValues[Field])`.

**Three of the six fields can never appear in `invalidFields`, and the suite asserts the absence.**
`currency` and `monthStartDay` are picked from closed lists of valid values, so no interaction can
put either in a state the DTO would refuse, and a message for them would be one nothing could
reach - the shape `TransactionsTable`'s `pending` prop shipped as once. The budget can be wrong and
has exactly one way to be, because `isPositiveAmount` folds blank, zero and unparseable junk onto
one comparison, which is why BUD-6 and A5 specify one message rather than two.

**The Save gate grew a third term, and without it the card shipped a dead end.** PET-46 enables
"Save changes" on `edited && the diff is non-empty`. `toUpdateProfileBody` deliberately omits an
unparseable budget - `parseAmountInput('')` is `NaN`, which `JSON.stringify` writes as a `null`
`UpdateProfileDto` refuses - so **clearing the budget produced an edited form whose diff was empty**:
a greyed-out button, no message, and nothing on screen saying why, recoverable only by guessing that
a value was required. The gate is now `edited && (hasProblems || diff is non-empty)`, which routes
that press into the validation that owns the inline message. The empty-body case the gate exists for
is untouched, because a form with no problems and no diff is still clean. Two tests written for this
card failed on it before it was found, which is the argument for writing the refusal cases first.

**The month-start hint is invented copy and owes A29 a sign-off**, like every other undesigned state
on this page. Neither authority draws a warning there, and this is the one setting on the card whose
effect is retroactive: the backend derives month attribution from the transaction date at read time,
so every figure in the app re-buckets the moment it saves. `docs/TODO.md` carries it.

**PET-72 rewrites the second half of that card, and the last paragraph above is the thing it
contradicts.** That note said the month-start setting's effect is retroactive - "every figure in the app
re-buckets the moment it saves" - and treated the missing warning as copy owed to A29. The mechanism was
right and the desirability was backwards: re-bucketing _all_ history is precisely the rewriting a budget
history exists to prevent, and no warning makes it correct. A new pay day is a fact about the periods
after it. So the budget and the pay day **leave `PATCH /api/profile` entirely** - the endpoint refuses
both now - and go through `lib/changeSchedule.ts` to `POST /api/profile/schedule`, which requires the
paycheck the change applies from.

**The single Save is intercepted rather than split**, which is the decision to read before touching this
form. `BudgetField` and `MonthStartField` stay inline in PET-47's card and AC6's one "Save changes"
stays one button; what changed is what a press does when either field moved. `SettingsForm` opens
`settings/PaycheckMonthDialog.tsx`, asks which paycheck, and only then sends - the **schedule write
first, the ordinary patch second**, because there is no transaction across two endpoints and the one the
user was asked a question about is the one that must not be skipped because an unrelated name change
failed. A press with neither field changed never shows the dialog, because a dialog over a name change
would be asking about a write that is not happening.

Four things about the dialog are decisions rather than shape. It is a **confirmation with a control in
it**, a shape this app had not drawn: `Modal`'s `'center'` frame asks a yes-or-no, and this asks a
yes-or-no _and_ a which-one, because the answer is what the write is anchored to. The select sits in
`children`, which that component has never had an opinion about. Its value is **owned by
`SettingsForm`**, every other dialog's shape, so reopening after a failed save reopens on the month the
user picked rather than silently resetting what a second press would write. Focus opens on the
**select** rather than the affirmative, because the user's first act is to read nine options.
`initialFocusId` is what `Modal` grew for it. And **Cancel disables while pending**, unlike
`ConfirmDeleteDialog`'s: there, Cancel does not claim to abort a delete already sent, where here the
affirmative is the only thing that writes, so a press during the round trip could only unmount the
dialog whose write is still landing.

**Nothing about it is designed**, so `Shell/Paycheck month`'s stories are the only review it gets - the
title, the body, the field label and the glyph are all ours and join what A29 owes. The two stories to
look at hardest are `Retroactive` and `Future`, which are the two readings of one sentence: a past
paycheck re-shapes periods that already have transactions in them, where a future one only stretches the
period the user is in.

**The window is nine months, four back and four forward around the current one**, and the shape of that
list is what makes two backend guards unreachable from here. `toChangeScheduleBody` assembles
`firstPaycheckDate` from the pay day the form already holds, so the 400 for a date not falling on
`monthStartDay` cannot be produced by this caller; and provisioning anchors the account's first rule
twelve months back, so the 400 for an anchor earlier than the earliest rule cannot be either. Both arms
are still classified, on this repo's standing rule that a control which cannot produce a state is not an
enforcement of it.

**The Profile card's two name inputs collapsed into one**, labelled "Display name" with the placeholder
"Your name, full name or nickname." - `settingsForm.ts` moves onto `fullName`, and `initials`/`shortName`
become single-argument. Nothing in the app ever used the two apart, so the second was data collected to
be thrown away; `frontend/CLAUDE.md` carries what that did to those two functions. The same collapse
reaches onboarding step 3, which asks one name and one new question: the **pay day**, as a third field on
the budget step rather than a fourth step, because it is the value the account's first `period_rules` row
is anchored to and an account with no pay schedule has no periods at all.

**A second code review of PR #84 found two defects in that dialog's plumbing, and both are worth
keeping as corrections rather than edits, because each is a sentence above that was written
confidently and was wrong.**

**The dialog opened on the current calendar month, which at any pay day above 1 is a paycheck in the
future.** `toChangeScheduleBody` completes the picked month with the pay day the form holds, so on a
pay day of 15 with today the 11th the default was five days away: the budget change applied from the
_next_ period, the current period kept the old budget, and the form said "Changes saved" over figures
that had not moved anywhere the user could see. Making it take effect now meant picking the _previous_
month, which nothing on screen says. `defaultPaycheckMonth` replaces `currentPaycheckMonth` and takes
the pay day, because a month was never the unit the question is asked in - what the dialog collects is
a **paycheck date**, and only the pay day plus today can say which one. Two arms, and the second is
not symmetry for its own sake. A **budget-only** change defaults to the paycheck the current period
opened on, the most recent occurrence at or before today - which is `mostRecentAnchor(monthStartDay,
today)`, whose own backend docblock already named that as "the anchor a schedule change uses", so this
was a frontend disagreeing with the backend's stated expectation. A **pay-day** change defaults to the
first paycheck under the _new_ schedule, the next occurrence at or after today, because the most
recent one is a paycheck that never arrived under that schedule and anchoring there removes a boundary
inside the period the user is already living in - re-shaping a span that has transactions in it, by
default, which is the silent rewriting this whole ticket exists to prevent. Note what let it ship:
every account in `backend/test/periods.e2e-spec.ts` is provisioned on `monthStartDay: 1`, where today
is never before pay day, so no suite could reach the case at all. `Shell/Paycheck month`'s
`PayDayNotYetReached` story is the state, and it is the one where the preselected month is deliberately
not the month on the calendar.

**And the resync compares by object identity now, not by value.** `SettingsForm`'s own docblock argued
for value, on the ground that `page.tsx` builds a fresh profile on every server render so an identity
test would fire after every refresh in the app - sound about identity alone, and it left out
`awaitingSaved`, which already restricts the adoption to the one refresh this form caused. What it got
wrong is a save that lands without moving the server's _configured_ values, which PET-72 makes
ordinary: `GET /api/profile` reports the **newest** row of each history, so a **retroactive** schedule
change succeeds while the profile comes back byte-identical. The value guard then short-circuited
forever - `awaitingSaved` never cleared, `values` kept the typed figure against a baseline holding the
old one, so the form stayed `edited` with Save live, and a second press re-asked the paycheck question
and appended another duplicate row. A save that had landed was indistinguishable from one that had not.
On identity the form ends every save showing what the account now holds, which after a retroactive
change is the _unchanged_ configured budget: that reads as a revert and is the truth, since what moved
is an earlier period's row. What identity gives up is stated in the code and is deliberate - a refresh
this form did not cause, landing between the write and this form's own refresh, would be adopted, and
nothing on this route calls `router.refresh()` but this form.

**Neither fix gives the screen anything to _say_, and `docs/TODO.md` is where that is now tracked.**
A retroactive save settles the field back on the configured value under a green "Changes saved", and
a future-anchored one moves no figure on any screen at all - both correct, both indistinguishable
from a save that did nothing. What closes them is one sentence naming the period the change landed
on, off the `label` the backend already publishes, which makes it the first success message in this
app carrying a variable - so it is filed against the notification system that entry marks HIGH
IMPORTANCE rather than as a fifth hand-rolled `role="status"` line on one screen.

**PET-74's addendum gives the Preferences card a third row, the Theme control, and it is
deliberately not a form field.** `settings/ThemeField.tsx` is the Claude Design system's
`ThemeSegmented` (System / Light / Dark) translated to semantic classes, and it applies
**instantly**: an explicit choice stamps `data-theme` on `<html>` and writes the
`spendifico.theme` cookie, `system` removes the attribute (which is what re-arms the automatic OS
selection - `lib/theme.ts` owns why that cannot fight the explicit choice), and the root layout
re-stamps the attribute from the cookie on every server render, so a reload arrives already
themed. Because the choice never travels in the PATCH, it joins no `SettingsFormValues`, no diff
and no `invalidFields`, and it is the one control on the page that takes no `disabled` while a
save is in flight - the Categories-summary reasoning applied to a control instead of a card.
Under the segmented skin are visually-hidden **native radios**, one tab stop with platform arrow
keys, because `role="radio"` on styled buttons - which is what the design source literally
draws - would promise a keyboard contract nothing implemented, the refusal this app has already
made four times. `settings/page.tsx` reads the cookie a second time so the control's checked
state agrees with the server HTML at hydration; `(app)/pages.test.tsx` mocks `next/headers` for
exactly that read.

**PET-48 built frame 17's third card, so "the Categories summary is still not drawn" above is
history - and it was PET-48's, not PET-47's, which two sentences in this file and two in
`frontend/CLAUDE.md` got wrong.** Settings is a complete screen: three cards over one "Save
changes", and `SettingsScreen.test.tsx` now pins exactly three `h2`s so a fourth cannot arrive
without somebody deciding it belongs.

**It is the first card on this page that reads rather than writes, and every difference from its two
siblings follows from that.** It takes one `summary` object instead of the shared `values` /
`errors` / `disabled` / `onChange`, because it has no field to carry a message or to freeze; it
touches `settingsForm.ts` nowhere, so `SettingsFormValues`, `invalidFields`, `sameSettingsValues`
and `toUpdateProfileBody` are all untouched by it; and it takes no `disabled`, so a save in flight
leaves it alone. It still sits **inside** the `<form>`, because the frame puts it above the Save row
and Save is inside the form - and it is a prop rather than a `React.ReactNode` slot on
`SettingsScreen` for the reason both siblings cite, that a slot with one possible occupant expresses
no choice. `settings/categoriesSummary.ts` is the React-free half, the same split `settingsForm.ts`
makes beside it.

**Settings is the second route in this app to read two guarded endpoints, and it copies
`transactions/categories/page.tsx`'s division of labour exactly.** `requireProfile()` decides
whether the session is alive; `readCategoriesView()` never does, **including on its own 401**, which
is the half worth stating - two opinions about the session on one page is the shape the `/dashboard`
to `/login` loop PET-52 had to unpick came out of. The other half is the opposite call that page
makes for its own list: there the response _is_ the screen, so a failure throws; here it is one
sentence on the third of three cards, so every failure degrades to `summary: null` and the card
draws an invented line saying the totals are unavailable while the two cards above it stay editable
and still save. `lib/palette.ts` is the precedent for that policy, and `(app)/pages.test.tsx` pins
both arms rather than `SettingsForm.test.tsx`, because what they pin is the decision `page.tsx`
makes.

**The card reads the _saved_ currency, not the one the Preferences card above it may be mid-edit.**
`useMoney()` comes from `(app)/PreferencesProvider`, which the layout builds from the profile it
already read - so typing `EUR` into the picker above changes that field and leaves this card in
dollars until a save lands. That is correct rather than a lag: every figure on this card is a saved
figure, and a symbol from an unsaved edit would be the one lie the card could tell. It is also why
the card can stay a plain module with no `'use client'` of its own, exactly like both siblings.

**Two things about it are product decisions that depart from what this file otherwise prescribes,
and both are on the ticket.** The count **excludes the `Uncategorized` fallback**, so Settings reads
one lower than the Transactions tab badge on the same account - measured in a browser walk at 13
against 14. Accepted, because this card is about the categories a user manages and the fallback is
the one they cannot; the seam it leaves is that `allocation.allocated` is used verbatim and would
include a cap on that row if one were ever set through the API, which no screen offers.
And **"Manage" shipped inert with no `disabled` and no `aria-disabled`**, which amended AC3 and made
it the one place this app shipped a control that looks operable and is not - the exact failure every
`aria-disabled` on the Categories tab was added to avoid, and which PET-70 had finished clearing.

**That second decision is superseded, and the paragraph above is history on its second half only.**
"Manage" opens the **Manage categories modal**, so AC3 is superseded rather than amended - the button
opens a dialog and never navigates - and this app ships no silently inert control again. The
fallback-exclusion half stands unchanged and is still the one to cite. `type="button"` also stands,
and it is _more_ load-bearing than before: it was guarding a press nobody made, and it now guards the
ordinary path a user takes to open the modal.

**Two suites and the story file changed shape for it, and the reason is `useMoney()`.**
`SettingsForm.test.tsx` and `SettingsScreen.test.tsx` import `render` from `(app)/shellRender`
rather than from Testing Library, because that hook throws outside `PreferencesProvider` by design.
`SettingsScreen.stories.tsx` could not do the same - `shellRender` says so itself - so every story
renders through a local `Frame` that mounts the provider **inside `render`**, never in a
`decorators` array, since the story smoke harness builds each story from `render` or
`meta.component` and never applies a meta's decorators. A decorator there works in the browser and
throws under Jest.

**PET-48's follow-up makes "Manage" real, and the modal behind it is the design system's rather than
Figma's.** `settings/ManageCategoriesModal.tsx` is
`ui_kits/spendifico-app/ManageCategoriesModal.jsx` rebuilt on daisyUI: a summary island over a
scrolling list with Edit and Delete per row, an "Add category" against a "Done", and no Figma frame
anywhere behind it. Four things about it reach past that one file.

**It is `AllocateBudgetModal`'s counterpart and not its reuse, which the source says in its own
header** - same canvas shell and two-island structure, but "the list island trades the cap field for
Edit / Delete icon actions". Reusing the Allocate modal unchanged was considered and rejected on
that basis: it edits caps inline and can neither rename nor delete. **This modal performs no write of
its own**, which is the most important thing about it: `AddCategoryModal`, `EditCategoryModal` and
`DeleteCategoryDialog` own every one, all three already existed, and all three open _over_ it - so
there is no action prop, no `pending`, no failure taxonomy and no `role="alert"` in it at all.

**It reads from props and resyncs, which is deliberately the opposite of the Allocate modal's rule.**
That one reads once on open and never resyncs, because it holds a draft a background refresh would
rewrite under the user's hands; this one holds no draft, so a delete landing behind it has to take
the dead row off the list. That also deletes the entire `stale` apparatus its neighbour needs, since
there is no payload here for the server to refuse.

**`ManageCategoriesProvider` exists for a reason no other modal in this app has, and it is the DOM
rather than the design.** `AddCategoryButton`'s one-trigger-one-route rule would put the state in the
card - but the card is inside `SettingsForm`'s `<form>`, and the sub-modals it opens pass `onSubmit`,
which is what makes `Modal` wrap their bodies in a real `<form>`. A `<dialog>` does not break form
association, so a modal rendered from the card would nest a form inside the page's - invalid HTML
that React will happily build via `appendChild` even though a parser would not. So the provider wraps
the header and `<main>` both and the dialog renders as a **sibling** of the form.
`transactions/FilterNavigation.tsx`'s shape, reached from the other direction. It must sit **inside**
`DeleteCategoryProvider` and `EditCategoryProvider`, in that order, because the edit modal's footer
calls `useDeleteCategory()`.

**Settings reads two more endpoints for it, and both degrade where their own modules throw.**
`readPalette()` and `readPeriods()` join `readCategoriesView()` in a `Promise.all`, mirroring
`transactions/categories/page.tsx`. The periods one is the departure worth knowing: `lib/periods.ts`
throws by design, because on that page a period-less header over period-scoped figures is a screen
that lies - here the periods back one question inside a modal nobody has opened, and
`EditCategoryModal` guards an absent current period by sending the cap with no anchor, which its own
comment calls "the honest fallback". `(app)/pages.test.tsx` pins both degraded arms, and the periods
case is written as a **rejection** so it fails if the `.catch` is ever removed.

**A review of that arrangement found the periods half unsafe as first written, and the fix is worth
knowing before copying the shape.** "The honest fallback" is honest for a caller that has no anchor
to offer; it is not honest for one that simply failed to load the list. A cap raised from Settings
during a periods outage was sent unanchored, so the backend dated it at the current period and
**retroactively re-priced the period already in progress** - the exact rewriting PET-72 exists to
prevent, with no dialog and nothing on screen to say the anchor had been dropped. So the degrade
stays and its consequence is now **visible**: `SettingsScreen` resolves a `canManage` flag and the
card's "Manage" is `disabled` when either the categories or the periods read is missing. The general
rule that leaves is worth stating - **a read may only be degraded to a value the UI can tell apart
from a real one**, and where it cannot, the control that would consume it closes instead. The same
review found the categories half degrading to an empty list plus a zeroed allocation, which the
modal drew as "you have no categories" over a $0 budget: an outage stated as a fact about the
account. It is `null` now, and `null` renders no modal at all.
