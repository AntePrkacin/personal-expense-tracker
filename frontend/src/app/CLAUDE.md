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

**`/` is a bare `redirect('/dashboard')`.** No frame in the design corresponds to it: VER-4
lands both a new and a returning account on the Dashboard, and a signed-out visitor belongs
in the access flow, which the shell's own session check sends them to. It is here rather than
in a middleware matcher so the rule has one home.

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
Check your email). **One of them is built**: Welcome, at `/`.

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
Both destinations **404 today**, which is as far as a frontend-only ticket reaches: the href is
the contract WEL-2 and WEL-3 describe, and an inert control would fail both outright while
hiding it. `/setup` is chosen so it is correct however PET-9 shapes onboarding - one route for
all three steps, or the first of three - so the string does not move either way; docs/TODO.md
records that trade-off.

**There is no `(access)` route group and no shared layout, on purpose.** Welcome is
architecturally the odd one out: a two-column split with a left-aligned logo, where 02, 03 and
22 are centred cards with a step indicator. A group whose one member shares nothing with the
rest carries no decision. PET-9 is the ticket that discovers whether a shared layout exists.

**The right half of Welcome is `aria-hidden`, and that is load-bearing.**
`app/DecorativePanel.tsx` is a dark panel with two accent washes, a sample budget card and two
floating chips - WEL-4's "display only", every figure fabricated and permanently so. It is
hidden because `ui/ProgressBar` publishes `role="progressbar"` with `aria-valuenow`, so
unhidden it announces a real progressbar reporting 62% of a budget that is not the reader's,
and `ui/Tag` announces "On track" as if it described their finances. Two notes: `aria-hidden`
does **not** remove focusable descendants from the tab order, so the screen's test pins that
the subtree contains none; and it is a plain `div`, never an `<aside>`, because an
`aria-hidden` landmark is self-contradictory.

**Storybook gains a third section, `Screens/`.** Named after the Figma page the frames live on,
exactly as `Components` and `Foundations` are. It needs its own story smoke test
(`app/screens.stories.test.tsx`) because each of those suites asserts its own title prefix,
which is the one thing each exists to make unambiguous - that is now the fourth copy of the
same harness, and docs/TODO.md records the helper it should become.

`app/WelcomeScreen.tsx`, `app/DecorativePanel.tsx` and `components/LogoLockup.tsx` are all
covered by `components/ui/utilities.test.ts`, which guards their hard-coded classes alongside
`ui/`'s and the shell's. **The two box shadows are deliberately excluded** - they are the first
in the repo, Foundations has no shadow tokens, and that file's `selector()` cannot escape their
parens and commas. Both facts are in docs/TODO.md.

## Not built here

`frontend/CLAUDE.md` carries the list, under its own `## Not built here`, and it loads
alongside this file whenever the work is in a route: five of the six access screens, the
shell's content and its authentication, and any call to the backend at all. That list is the
single home, so nothing is restated here.

The one trap to carry into every file in this directory: **both session seams are stubs that
answer optimistically.** `requireSession()` lets every request through and `hasSession()`
returns `false` for everybody, so a route that reads as authenticated is not, and a screen
that renders is not evidence that its data path exists. Both are PET-52's, and the stubs are
documented above under The app shell.
