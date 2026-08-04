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
Check your email). **Three of them are built**: Welcome at `/`, Setup step 1 at `/setup`, and
Setup step 2 at `/setup/categories`.

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

**`lib/routes.ts` declares where the other screens will live**, and only the two Welcome links
out to: `/setup` and `/login`. Same single-declaration reasoning as `SIDEBAR_HREFS`, and the
two sets must not restate each other - app routes stay in `ui/Sidebar.tsx`, access routes here.
Welcome is deliberately absent, because it is served at `/` and there is no path to declare.
`/setup` and `/setup/categories` now answer; `/setup/register` and `/login` **404 today**, which
is as far as a frontend-only ticket reaches: the href is the contract its criterion describes,
and an inert control would fail that criterion outright while hiding it. `lib/routes.test.ts` asserts with
`fs` that every built route has a `page.tsx` behind it, the way `SidebarNav.test.tsx` does for
the four app routes; it classifies each key as built or pending rather than sweeping them all,
so adding a route forces a decision instead of silently escaping the check.

**There is no `(access)` route group, and Welcome is still the odd one out.** It is a
two-column split with a left-aligned logo, where 02, 03 and 22 are centred cards with a step
indicator, so a group whose one member shares nothing with the rest would carry no decision.

**PET-9 answered the shared-layout question, and the answer is "yes, but not as a layout".**
Frames 02, 03 and 22 draw identical chrome - the centred column, the lockup, the three-dot
indicator, the card - varying only in which dot is filled and the column width (520 / 600 /
520). That chrome is `app/setup/SetupShell.tsx`, a Server Component taking `step`, **not** a
route layout: the active step differs per route, and an App Router layout cannot read the
pathname on the server, which is the same trap `ui/Sidebar`'s `active` prop was built around.
A layout would have to become a client component just to know which dot to fill.

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

## Not built here

`frontend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in a route: three of the six access screens, the
shell's content and its authentication, and any call to the backend at all. That list is the
single home, so nothing is restated here.

The one trap to carry into every file in this directory: **both session seams are stubs that
answer optimistically.** `requireSession()` lets every request through and `hasSession()`
returns `false` for everybody, so a route that reads as authenticated is not, and a screen
that renders is not evidence that its data path exists. Both are PET-52's, and the stubs are
documented above under The app shell.
