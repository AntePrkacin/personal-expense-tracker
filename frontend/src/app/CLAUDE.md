# frontend/src/app/CLAUDE.md

Guidance for Claude Code inside `frontend/src/app/`: the routed screens themselves. This file
is the authority for the signed-in shell and for the access screens outside it.

It does not repeat the design system. `frontend/CLAUDE.md` owns the tokens, the `ui/`
primitives and their conventions, and it loads alongside this file, so read it before writing
any class: Tailwind's own palette and type scale are cleared, and an unknown utility generates
no CSS while failing no build.

This file exists because `frontend/CLAUDE.md` passed 400 lines when PET-8 landed, which is the
promotion trigger `docs/agents/conventions.md` sets. It is one directory deeper, so it loads
only when the work is actually in a route.

## The app shell

`frontend/src/app/(app)/` is the shell every signed-in screen renders inside: the fixed dark
sidebar beside a content column, with the four routed views `/dashboard`, `/transactions`,
`/insights` and `/settings` under it. A **route group**, so the paths stay exactly the hrefs
`ui/Sidebar` declares while sharing one layout; the access screens (01, 02, 03, 22, 23, 24)
sit outside it and inherit none of it.

**`PageHeader` and `SidebarNav` live here rather than in `components/ui/`, deliberately.**
`ui/` mirrors the tiles on the Figma Components page and is complete, and neither of
these is a tile - they are the shell's own. The visible consequence is that `PageHeader`'s
stories are filed under **Shell**, not **Components**, so they cannot join
`ui.stories.test.tsx` (which asserts every module's title starts with `Components/`);
`(app)/shell.stories.test.tsx` is one copy of that smoke test for them. Their
hard-coded classes are still guarded by `ui/utilities.test.ts`, because a _fourth_ copy of
the Tailwind compile harness was worse than one list covering both folders.

**`SidebarNav` is the shell's only `'use client'` file, and it exists for exactly one
reason.** `Sidebar` takes `active` as a prop so it can stay a Server Component, and an App
Router layout cannot read the pathname on the server, so something has to call
`usePathname()`. It matches by **prefix with a trailing-slash boundary**, so
`/transactions/abc` keeps Transactions lit while `/settings-import` does not light Settings.

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

**The month select and the search field are inert `div`s, not controls.** A8 says the select
renders the current period and does nothing until month navigation is designed, and the
search filters a list that does not exist until PET-28. Neither is a `<select>`, `<input>` or
`<button>`, so neither announces itself as operable, and `(app)/pages.test.tsx` pins that -
`queryByRole('combobox')` and `queryByRole('textbox')` both have to stay empty.

**`export const dynamic = 'force-dynamic'` on the layout is load-bearing today.** The pages
read `new Date()` for the overline; without it Next prerenders them and every screen shows
whatever month the build ran in, a bug that only appears a month after deploying. PET-52's
`cookies()` read makes the segment dynamic on its own, at which point the line becomes
redundant and should be deleted rather than left as a claim about nothing.

`(app)/layout.test.tsx` asserts both that export and that `requireSession()` is called, because
the layout is three lines long and every one of them fails silently when deleted. The session
call is the sharper of the two: it is a documented no-op today, so without the assertion the
call site could be dropped with the suite green, and PET-52's deferral would quietly become an
omission.

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

**`lib/session.ts` holds two stubs, and they are PET-19's and PET-8's deferrals.**
`requireSession()` is called once, by the `(app)` layout, and lets every request through, so
the shell is browsable with no backend - PET-19's deferral of its AC5. `hasSession()` is called
once, by `app/page.tsx`, and answers `false` for everybody, which is what puts Welcome at `/`;
that is PET-8's. Both doc comments are the specification PET-52 fills in: read the httpOnly
cookie, lift it into `Authorization: Bearer <token>`, call `GET /api/auth/session`, then either
redirect or answer. They deliberately do **not** name the cookie, because that name is not
decided anywhere in the repo and choosing it here would hand PET-52 a contract it did not pick.
Both return a promise from a non-`async` function so the signatures are already the real ones.

They are two functions rather than one because the callers want opposite things from the same
read: the shell wants "let me through or send me away" and answers nothing itself, while the
root route wants a fact to branch on, since both of its destinations are legitimate. PET-52
should give them a shared helper for the fetch rather than two round trips.

**The sidebar footer's profile is fabricated.** `PLACEHOLDER_PROFILE` in `(app)/layout.tsx`
is Figma's own sample data ("Marko", "Kovač", "marko@email.com"), so the shell diffs against
the design rather than against invented copy - which also means it looks entirely real in a
screenshot. It cannot be fixed here: names live in the per-user database's `profile` row and
the email on the central `users` row, so it needs PET-45's read reached with PET-52's cookie.
`ui/Sidebar` itself stays clean; its test pins that those three strings appear nowhere in the
component.

## The access screens

The six frames outside the shell (01 Welcome, 02 and 03 Setup, 22 Register, 23 Log in, 24
Check your email). **All six are built** as of PET-12: Welcome at `/`, the three onboarding steps
at `/setup`, `/setup/categories` and `/setup/register`, then `/login` and `/check-email`. What is
still missing from the flow is the verify page that consumes an emailed link, which is PET-52's.

**`/` is the front door and its one job is choosing which door.** `app/page.tsx` awaits
`hasSession()`; a signed-out visitor gets `<WelcomeScreen />` and a signed-in one is redirected
to `/dashboard`, because VER-4 lands both a new and a returning account there. The rule is here
rather than in a middleware matcher so it has one home. Until PET-52 fills the seam in,
`hasSession()` answers `false` for everybody, so **every visitor lands on Welcome and
`/dashboard` is reached by typed URL only** - the same shape of deferral the shell's own gate
already carries.

Two consequences of that gate being async. The screen is a **separate component**
(`app/WelcomeScreen.tsx`) rather than inlined, because Storybook cannot render an async Server
Component that awaits a session, and it keeps the screen's own test free of mocks. And `/`
currently prerenders **static**, correctly, since nothing in the path reads a request yet;
PET-52's `cookies()` read opts it out on its own, so no `export const dynamic` belongs there
now or then. That is the opposite of `(app)/layout.tsx`, whose `force-dynamic` is load-bearing
today - do not copy it here by reflex.

**`lib/routes.ts` declares where the access screens live**, including the two Welcome links
out to: `/setup` and `/login`. Same single-declaration reasoning as `SIDEBAR_HREFS`, and the
two sets must not restate each other - app routes stay in `ui/Sidebar.tsx`, access routes here.
Welcome is deliberately absent, because it is served at `/` and there is no path to declare.
Every key now answers, and for four tickets some did not: a declared-but-unbuilt route was as far
as a frontend-only ticket reached, because the href is the contract its criterion describes and an
inert control would fail that criterion outright while hiding it. `lib/routes.test.ts` asserts with
`fs` that every built route has a `page.tsx` behind it, the way `SidebarNav.test.tsx` does for
the four app routes; it classifies each key as built or pending rather than sweeping them all,
so adding a route forces a decision instead of silently escaping the check. **Its `PENDING` list is
empty now and stays**, because a blanket sweep would pass today and then quietly accept the next
unbuilt route - which is the state `/login` and `/check-email` were in the whole time.

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
conditional anywhere. Two things to know before touching it. **The width class has to stay on the
element carrying `shadow-card`**, because `SetupShell.test.tsx` finds the card by that class and
then looks for the step's width on it - moving the width to a wrapper is the one change that breaks
a suite the extraction was meant to leave alone. And that suite passing **unchanged** is what
proved the DOM stayed byte-identical, which is worth repeating rather than re-deriving.

**The right half of Welcome is `aria-hidden`, and that is load-bearing.**
`app/DecorativePanel.tsx` is a dark panel with two accent washes, a sample budget card and two
floating chips - WEL-4's "display only", every figure fabricated and permanently so. It is
hidden because `ui/ProgressBar` publishes `role="progressbar"` with `aria-valuenow`, so
unhidden it announces a real progressbar reporting 62% of a budget that is not the reader's,
and `ui/Tag` announces "On track" as if it described their finances. Two notes: `aria-hidden`
does **not** remove focusable descendants from the tab order, so the screen's test pins that
the subtree contains none; and it is a plain `div`, never an `<aside>`, because an
`aria-hidden` landmark is self-contradictory.

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
rather than a mount effect for the reason `stories/foundations/Reference.tsx` already records
about the stylesheet, plus two sharper ones: `react-hooks/set-state-in-effect` rejects the
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

**The step indicator is `aria-hidden`.** The card's own overline states "STEP 1 OF 3" in text,
so three unlabelled shapes carry nothing a reader is missing - unhidden they announce as three
empty generics. Same call `ui/Input` makes on its `$` prefix. `SetupShell.tsx` records the two
rejected alternatives so nobody "improves" it into one: a second `role="progressbar"`
(restating the overline, and `ui/ProgressBar` is the repo's one progressbar), and an `<ol>` with
`aria-current="step"` (the textbook pattern, but it invents list semantics and three step names
the design never draws). The `aria-hidden` footgun applies here as it does on Welcome, so the
test pins that the subtree contains nothing focusable.

**`/setup` is deliberately not gated on a session.** `/` redirects a signed-in visitor and the
`(app)` shell gates itself, but this route does neither: PET-9 has no session to read, and a
third call into the `lib/session.ts` stubs would be a claim it cannot test. Whether onboarding
stays reachable with a live session is PET-52's.

**Storybook gains a third section, `Screens/`.** Named after the Figma page the frames live on,
exactly as `Components` and `Foundations` are. It needs its own story smoke test
(`app/screens.stories.test.tsx`) because each of those suites asserts its own title prefix,
which is the one thing each exists to make unambiguous - that is now the fourth copy of the
same harness, and docs/TODO.md records the helper it should become. PET-9 added a module to it
rather than a fifth section, exactly as that item predicted.

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

`app/WelcomeScreen.tsx`, `app/DecorativePanel.tsx`, `app/setup/` and
`components/LogoLockup.tsx` are all covered by `components/ui/utilities.test.ts`, which guards
their hard-coded classes alongside `ui/`'s and the shell's. That now includes the box shadows,
which PET-9 turned into Foundations tokens (`frontend/CLAUDE.md` owns them) and which had been
excluded for two reasons that are both gone: there was no token to check them against, and
that file's `selector()` could not escape their parens and commas.

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
call `ui/Tag`'s dot and `ui/Input`'s `$` prefix make. That file records the rejected
`<input type="checkbox">` alternative, and two appearance decisions with no Figma counterpart:
`border-[1.5px]` in both states, and the checkmark stroked `text-brand-accent` rather than
`currentColor`.

**The three onboarding cards differ only in width, and `STEP_WIDTH` is where that lives.** Frame
03 is 600px against 02's and 22's 520. PET-9 hard-coded `w-130` with a note saying PET-10 either
changes it or lifts it to a prop; a second width appeared, so `SetupShell` now holds a
`Record<SetupStep, string>` beside `STEP_DOT`. No prop, every class still a complete literal
string for Tailwind's scanner, guarded by `components/ui/utilities.test.ts` like its neighbour,
and frame 22's width recorded now rather than left for PET-11 to rediscover.

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

**Step 3's two name fields are a `grid`, not a flex row, and the 214px in the frame is a
consequence rather than a measurement.** Frame 22 draws them at 214px each with a 12px gutter
inside the card's 440px content box, and `(440 - 12) / 2` is exactly 214 - so `grid grid-cols-2
gap-3` reproduces the design without restating any of its numbers. A flex row would not: `ui/Field`
is `w-full`, which spans a grid cell correctly and overflows a flex row, so the fix there would
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
one failure message sits above the footer row in the same `text-body-s text-status-danger-text`
treatment `ui/Field` uses, with **`role="alert"`, which `ui/Field` deliberately omits**: Field's
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

**`/login` is deliberately not gated on a session**, for the reason `/setup` is not: a fourth call
into the `lib/session.ts` stubs would be a claim nothing can test, `/` already redirects a signed-in
visitor, and LOG-5 makes Welcome's "I already have an account" the only designed entry. Whether it
stays reachable with a live session is PET-52's. Note the two new routes render differently for the
same reason one has a `cookies()` read and the other does not: `npm run build` reports `/login`
static and `/check-email` dynamic, and **neither carries an `export const dynamic`** - the cookie
read opts its route out on its own, exactly as `lib/session.ts` predicts for `/`.

**`LoginForm` holds its value in `useState`, not in the onboarding draft.** `/login` is outside
`app/setup/layout.tsx`, so `useSetupDraft` would throw, and a returning user's address has nothing
to do with a half-finished onboarding payload. Nothing needs to survive a round trip either: LOG-4's
Back goes to Welcome, which is a way out rather than a step to come back from. Its two field
messages are the same strings `RegisterForm` uses, copied rather than shared - there is no copy
module in this repo and two overlapping strings are the wrong reason to invent one.

## Not built here

`frontend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in a route: the `/api/chat` route handler, the
shell's content and its authentication, and any read from the backend. That list is the
single home, so nothing is restated here.

The one trap to carry into every file in this directory: **both session seams are stubs that
answer optimistically.** `requireSession()` lets every request through and `hasSession()`
returns `false` for everybody, so a route that reads as authenticated is not, and a screen
that renders is not evidence that its data path exists. Both are PET-52's, and the stubs are
documented above under The app shell.
