# frontend/CLAUDE.md

Guidance for Claude Code inside `frontend/`. Root `CLAUDE.md` carries the rules that hold
everywhere and points here; this file is the authority for everything inside the Next.js app.
Runnable detail lives in the guides: commands in `docs/guides/commands.md`, environment values
in `docs/guides/configuration.md`.

Read Design tokens before you write a single class. Tailwind's own palette and type scale are
cleared, so `text-red-600` and `text-4xl` generate no CSS, fail no build, and look exactly like
a class that did nothing.

## Design tokens

`frontend/src/app/globals.css` is the single source of truth for the design system and
mirrors the Figma **Foundations** page. Tailwind v4 is configured CSS-first, so there is
no `tailwind.config` to look for. Read the stylesheet before styling anything.

**Tailwind's own palette and type scale are cleared** (`--color-*: initial`,
`--text-*: initial`). This is the load-bearing decision: `text-red-600`, `bg-zinc-100`
and `text-4xl` genuinely do not exist and generate no CSS. Because Tailwind drops
unknown utilities silently rather than erroring, a class that appears to do nothing is
usually a class that is not in the design. Use the tokens (`text-body-m`,
`bg-status-danger-soft`, `text-text-secondary`) or add one to the theme.

Colour tokens are group-prefixed to match the Figma groups: `brand-*`, `surface-*`,
`text-*`, `border-*`, `status-*`, `category-*`. This is why you write
`text-text-primary` and `border-border-default`; the stutter is deliberate.

Each `status-*` group carries three values and they are not interchangeable: the bare name
is the fill (`status-danger`, `#dc2626`), `-text` is the darker one to set type in
(`status-danger-text`, `#b91c1c`), and `-soft` is the tint to sit that type on
(`status-danger-soft`). Red type therefore takes `text-status-danger-text`, not
`text-status-danger`. Note also that the three status colours carry meaning - danger means an
error or an over-budget condition - so reaching for one purely because a design asks for that
hue says something the interface did not intend.

**The 19 type styles are `@utility` blocks, not `--text-*` tokens**, because a type
style has to carry its font-family and the compiler only accepts `--line-height`,
`--letter-spacing` and `--font-weight` as paired suffixes on a `--text-*` token.

**The spacing scale is Tailwind's, not a redeclared Figma one.** The `--spacing`
namespace also drives `w-*`, `h-*`, `size-*`, `inset-*` and `translate-*`, so overriding
it would silently delete every sizing key not explicitly listed. The Figma mapping
(`Space/16` = 16px = `p-4`) is documented in `globals.css`.

Two smaller traps. `--radius-full` is ignored by the compiler, so Radius/Full is
Tailwind's built-in `rounded-full`; and clearing `--radius-*` also removes the bare
`rounded` utility, so use `rounded-md` explicitly.

**Foundations declares four shadows, and they are the one group with no Figma swatch behind
them.** `--shadow-card` is the centred card every access frame and every dashboard card draws;
`--shadow-panel` and `--shadow-chip` are Welcome's decorative panel, which shipped them as
arbitrary literals before PET-9 gave them names; `--shadow-modal` is the lifted box behind every
dialog, and it is deliberately not `--shadow-panel` - close enough to read as a duplicate in a
diff, far enough apart that reusing either would be visibly wrong. All four shadow namespaces are cleared -
`--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*` and `--text-shadow-*` - for the same reason
the palette is, so `shadow-lg` and `drop-shadow-md` generate nothing. Bare `shadow` disappears
with the namespace exactly as bare `rounded` does; `shadow-none` is the one survivor, because it
is a static utility rather than a token lookup. `globals.test.ts` pins each of those. Note the
card's value is a raw fill in the frame rather than a bound variable, one row up from the
unbound circle colour in `docs/TODO.md`.

**Only light mode is designed.** No dark theme ships, and `dark:` variants should not be
added. Note that Tailwind cannot make `dark:` a build error, so this rests on review.

The two typefaces load through `next/font/google` in `frontend/src/app/fonts.ts`. That
module exists separately from `layout.tsx` so `.storybook/preview.ts` can import the same
loaders. The variable classes must land on `<html>`, which is where `:root` resolves.

`npm test` runs `frontend/src/app/globals.test.ts`, which both asserts every documented
value and compiles the stylesheet through Tailwind's own `compile()` to confirm each
utility actually generates. `npm run storybook` renders the whole system under
**Foundations** for diffing against Figma.

## Shared components

`frontend/src/components/ui/` holds the design-system primitives, mirroring the Figma
**Components** page. **Every tile on that page now has a component**: `Button`, `Input`,
`Select`, `Tag`, `ProgressBar`, `Stat`, `SectionHeader`, `ListRow` and `Sidebar`.
`npm run storybook` renders them under **Components**. The library is complete; a new
component from here on is a feature's own, not a tile.

**Shared UI is split by role, not by file type.** `components/ui/` is the primitive layer,
the vocabulary every screen draws from. Components that only make sense for one feature go
in `components/` beside it, or next to the route that uses them. Nothing has earned a
feature folder yet, so `ui/` is currently the only child - the app shell's own components
took the second option and live under `app/(app)/`, documented in
`frontend/src/app/CLAUDE.md`.

`components/` has four direct children of its own, and all four are there for one reason:
**`LogoLockup.tsx`**, the accent tile carrying the cedi glyph plus the wordmark,
**`AccessCard.tsx`**, the centred column and card box under it, and **`ResendLink.tsx`** with
**`LogInAgain.tsx`**, the pair of recovery controls. None is a Components-page tile,
so `ui/` is wrong; each belongs to more screens than one route segment holds, so beside a route is
wrong too - the lockup to all six access frames, the card to the five that are centred cards, and
the two controls to screen 24 plus PET-52's verify failure screen.
`AccessCard` arrived late, in PET-12, and the sequence is the useful part: the chrome lived in
`app/setup/SetupShell.tsx` while only the three onboarding steps drew it, and moved here when Log
in and Check your email turned out to draw the identical box with no step indicator. That shell
still exists and still owns the indicator and the per-step width, which really are onboarding's.
Note `ui/Sidebar.tsx` holds a _second_, smaller copy of the same lockup
(34px, `rounded-[10px]`, `text-on-dark` against `surface-ink`) and that is deliberate for now:
unifying them is not a refactor of one file, it needs a size and a tone pair, and it would
drag a merged, pinned component through whichever ticket happens to notice.

The Storybook section is still called **Components** while the folder is `ui/`. That
mismatch is deliberate: `ui/` says where the code lives, **Components** is the Figma page
name, and the stories exist to be diffed against it.

Five conventions, all of which existing files demonstrate:

- **Tests and stories are colocated**, `Tag.tsx` next to `Tag.test.tsx` and
  `Tag.stories.tsx`. Do not "tidy" them into `__tests__/` or `stories/` trees. Parallel
  trees make a rename touch three directories, and they hide the one signal worth having
  at a glance: a component with no test file beside it.
- **Files are flat inside `ui/`**, not a folder per component. Alphabetical sort already
  groups a component with its satellites, and it keeps imports at `@/components/ui/Tag`
  rather than a stuttering `.../Tag/Tag` or nine files all named `index.tsx`. Promote one
  component to its own folder when it first needs private sub-parts; a mixed directory is
  fine. There is no barrel `index.ts` and adding one is not an improvement.
- **Variant classes come from a `Record<Variant, string>` holding complete literal class
  strings** (`TAG_TONES`, `CATEGORY_TILE`, `BUTTON_VARIANTS`, `INPUT_VARIANTS`,
  `FIELD_CONTROL_BORDER`), interpolated into a template literal. This is
  not style preference. Tailwind's scanner reads these files as raw text, so a class built
  by interpolation (`bg-category-${n}`) is found by nobody and compiles to nothing, with
  no build error and no failing test. There are no `clsx` / `cva` style dependencies and
  none are needed. The rule extends to position classes held in data, which is why
  `DecorativePanel`'s `SAMPLE_CHIPS` spells out `top-55 left-52.5` rather than computing it.
- **`src/components/ui/utilities.test.ts` compiles every one of those classes** through
  Tailwind and fails if any generates no CSS. It is what makes the point above enforceable
  rather than a rule people remember. Add new class maps to it.
- **Components stay Server Components.** None of them carry `'use client'`, because none
  holds state. `Button`, `Input` and `Select` accept handler props without it: a client
  component that imports one pulls it into the client bundle on its own, and only a Server
  Component trying to pass a function would break. Only add the directive when a component
  genuinely needs the client itself.

**`ui/Button` either navigates or acts, never both.** Its props are an exclusive union: pass
`href` and it renders a `next/link`, otherwise a `<button>` with `type`, `disabled` and
`onClick`. The `never`s in that union are load-bearing rather than pedantic - an anchor cannot
be disabled by author styles, so `<Button href disabled>` would look dimmed and still
navigate - and `npm run build`, the typecheck gate, is what rejects the combination. Both
renderings share one exported `BUTTON_BASE` plus `BUTTON_VARIANTS`; **never duplicate those
strings into a second link-shaped component**, which is the whole reason the prop lives here.
A wrapped `<button>` inside an `<a>` was the alternative and is invalid HTML, so the element
itself has to change.

**Form fields go through `ui/Field.tsx`.** `Input` and `Select` are both built on it, and
it owns the label, the inline validation message, and the `aria-invalid` /
`aria-describedby` wiring between them. Build a new control on it rather than repeating the
pattern; that is what keeps every form in the app reporting errors identically. Two things
about it look like friction and are not: `id` is a **required** prop, because `useId()` is a
hook and generating one would force `'use client'` onto the whole field layer; and each
state-dependent colour comes from its own `Record` (`FIELD_CONTROL_SURFACE` for the fill,
`FIELD_CONTROL_BORDER` for the border) rather than being appended conditionally, because
`border-border-strong` and `border-status-danger` have equal specificity, so emitting both
makes the winner depend on stylesheet order. Classes carrying a variant prefix
(`focus-within:`, `disabled:`) are exempt, since the extra pseudo-class settles it.

**Every field label is `self-start`, and that is a bug fix rather than alignment.** `ui/Field`'s
column is `w-full` and a flex item stretches by default, so a label used to be a full-width block -
472px of it inside the Add transaction modal against about 55px of text. Clicking anywhere in that
invisible strip activated the control, which is `<label for>` behaving exactly as specified and
reads as a glitch. It was worst on a `<select>`: Chrome focuses the control from a forwarded label
click but does **not** open the list, so the border turned accent and nothing else happened.
Shrinking the label to its own text makes the hit area what a reader would guess it is, and
`Field.test.tsx` pins the class because jsdom computes no layout to measure. `ui/Select`'s control
also carries `cursor-pointer` now, for the reason `BUTTON_BASE` does: the user agent draws an arrow
over a `<select>`, so the one control on a form that opens a list read as unclickable.

**Padding sits on the control, never on the bordered box.** Both `Input` and `Select` put it
on the `<input>` / `<select>`, and `Input`'s `$` prefix and `Select`'s chevron are absolutely
positioned over the control with `pointer-events-none`. A padded box turns its own 14-16px
band into a dead zone where a click places no caret and opens no list.

**Six details of the form components have no Figma counterpart.** They were chosen, not
read, so do not "correct" them without asking the designer:

- **The inline error pattern** - red border plus one line of `text-body-s
text-status-danger-text`, no icon. Assumption A29 records that no form error visual exists
  anywhere in the file.
- **The disabled button dimming** (`disabled:opacity-60`). Frame 15 draws the in-flight
  "Generating..." button identically to a resting secondary one, so the design says only the
  label changes (A26). A control that looks enabled while it is not is a defect, hence the
  addition.
- **The disabled field fill** (`bg-surface-muted` plus `text-text-tertiary`). No disabled
  field is drawn anywhere in the file, and it cannot simply be left out: author styles beat
  the user agent's own disabled treatment, so an undecorated disabled field is
  pixel-identical to an editable one.
- **The forced-colors focus outline** on the field box. Windows High Contrast forces every
  border colour to one system colour, so the designed accent border cannot signal focus
  there. The outline is scoped to `forced-colors:` alone, so normal rendering still matches
  Figma exactly.
- **The currency field at rest.** The 1.5px `brand-accent` border is treated as the _focus_
  style, which is what the ticket and spec BUD-3 assert, but Figma only ever draws it on the
  currency amount field and never draws that field unfocused. Its 1px resting border is
  inferred from the plain Input tile. Focus also keeps that accent border on an _invalid_
  field rather than holding the red: invalidity is still carried by the message and by
  `aria-invalid`, and a 0.5px width change is too little focus signal to see.

- **The pointer cursor** (`cursor-pointer` in `BUTTON_BASE`). A design file has no cursors to
  read, and this one is not the browser's default either: Tailwind's preflight sets only
  `appearance: button` on a `<button>`, and the user agent draws an arrow, so every button in
  the app read as unclickable on hover until PET-10 added it. It lives in the shared base
  rather than the `<button>` branch, because the anchor and button renderings must not differ
  under the cursor even though an anchor gets the pointer natively. `disabled:` still wins
  through its pseudo-class. The one control that must _not_ inherit this is a deliberately
  inert one - the header's month and search pills are `div`s, so they do not.

**`ui/Sidebar.tsx` takes its active item as a prop, and that has a consequence for whoever
mounts it.** `active` is one of four keys matching the Figma variant property, not a
`usePathname()` call, which is what keeps the component a Server Component like the rest of
`ui/`. But an App Router layout cannot read the pathname on the server, so the `(app)` shell
needs a thin `'use client'` wrapper that calls `usePathname()` and passes `active` down;
reading it inside the sidebar instead would force `'use client'` onto the whole component and
break `ui.stories.test.tsx`, which renders every story under Jest with no router in context.
The four hrefs (`/dashboard`, `/transactions`, `/insights`, `/settings`) are declared in that
file's `NAV_SECTIONS` and are the contract the routing ticket has to match.

It is also the **first and only consumer of the six dark-surface tokens** (`surface-ink`,
`-ink-raised`, `-ink-elevated`, `text-on-dark`, `-on-dark-subtle`), which had shipped unused
since the Foundations work. `text-on-dark-muted` is now the one Foundations colour with no
consumer at all.

**Four more details have no Figma counterpart**, on top of the five form ones above:

- **The sidebar's white focus ring** (`focus-visible:outline-white`), where every other
  component uses `focus-visible:outline-brand-accent`. No sidebar focus state is drawn, and
  the accent on `surface-ink` is too dark to read as one.
- **The truncating footer name and email.** Figma clips inside a fixed 260px column because
  it only ever draws the short sample address; `min-w-0` plus `truncate` is the honest
  equivalent, the same pattern `ListRow` uses for a long merchant name.
- **`rounded-[10px]` on the logo tile and the nav pills**, the one place a literal beats a
  token. Figma bound that corner to a raw 10px rather than a radius variable, and the scale
  offers only 8 and 12. Worth a designer answer; until then the literal matches the design.
- **The wordmark reads "Spendifico", not Figma's "Expensa".** The rename was decided on
  2026-08-02 and this is its most visible string. PET-51 finished it everywhere in the repo,
  so the design file is the only holdout left; `docs/TODO.md` records that, and the one
  constraint the rename leaves on any future change to the per-user database naming.

`frontend/src/lib/format.ts` owns display formatting, in five parts. Money: amounts are
stored as positive magnitudes and displayed negative, and the sign is U+2212 MINUS SIGN
rather than the hyphen `Intl.NumberFormat` emits, matching the design. Names: `initials()`
and `shortName()` derive the sidebar footer's "MK" and "Marko K." from the two stored name
fields. Both are derived and never stored (SET-2), and SET-6 requires the sidebar footer and
the Settings avatar to agree, which is why one shared function is the point rather than a
convenience. Both take the first character with `Array.from(name)[0]` rather than
`charAt(0)`, which would split an astral-plane character into a lone surrogate. Period:
`monthOverline()` and `monthLabel()` give the page header its "October 2025" and "October",
shared because Dashboard and Transactions draw the identical overline. Both use the calendar
month and therefore ignore the profile's `monthStartDay`, which A9 says defines the period -
that value is PET-45's, and the display is correct for its default of 1. Amount input:
`formatAmountInput()`, `parseAmountInput()` and `amountCaret()` are the currency field as it is
being typed into, and they are deliberately **not** `formatCurrency`. That one goes through
`Intl`, which forces two decimals, rounds, drops a trailing separator and emits a symbol -
every one of which is wrong mid-keystroke, where a user typing `24.` would watch it become
`$24.00` under the caret. So none of the three touches `Number` on the way out, the fraction is
truncated rather than rounded, and the `$` belongs to `Input variant="currency"` instead of to
the string. `formatAmountInput` is **idempotent**, which the controlled input in
`app/setup/BudgetForm.tsx` depends on rather than merely benefits from. Calendar date:
`formatIsoDate()` turns the `YYYY-MM-DD` a transaction is stored under into the "Oct 8, 2025" the
Date field's trigger draws, and it goes through `lib/date.ts`'s `dateFromIso` rather than
`new Date(iso)` - which parses a date-only string as **UTC midnight**, so any zone behind UTC
formats it as the day before.

**`lib/date.ts` is the other half of that and is deliberately not this file.** It owns the wire
form - today's date, the parts either side of a `YYYY-MM-DD` string, calendar-date arithmetic -
and touches neither `Intl` nor UTC, because a calendar date is a day rather than an instant and
must never follow a locale. That file records the two directions the mistake runs in;
`lib/calendar.ts` builds the picker's month grid on top of it.

All five parts hard-code `en-US` and its separators. When the currency chosen during onboarding
is finally stored, the locale follows it through all of them together; `docs/TODO.md` tracks
that, and PET-9 made the amount input its third consumer. The one thing that must **not** follow
it is `lib/date.ts`, for the reason above.

**`components/EmptyState.tsx` is the fifth direct child, and it arrived before its second
consumer rather than after.** `AccessCard` above records the usual sequence: chrome lives beside
one route until a second screen turns out to draw the identical box, then moves. This one skipped
the wait because the second consumer is already measurable in the design file - frame 07
Transactions (node `45:1044`) and frame 16 AI Insights (node `39:665`) are the same card, same
72px accent-soft circle, same `Display/S` heading, same 440px `Body/L` body, same primary button,
differing only in glyph and copy, and DSH-7 describes the same shape a third time inside the
dashboard's recent-list card. Waiting for PET-44 to prove what PET-30 could already see would
have bought a move commit and nothing else. It takes `icon`, `heading`, `body`, an optional
`action` and `SectionHeader`'s `headingLevel`, defaulting to 2 because `PageHeader` owns the
page's `h1`.

**Two of its values are the ones a reader will try to correct, so both are pinned by its
suite.** It is `rounded-lg`, Radius/LG at 16px, where every other card in the app is
`rounded-xl` at 20 - Figma binds a raw 16 on this frame. And it carries **no `shadow-card`**,
which makes it the first card here without one; `frontend/CLAUDE.md` calls that token "the centred
card every access frame and every dashboard card draws", and this frame simply has no shadow at
all. Reaching for `AccessCard`'s box string, which is the obvious move, is therefore wrong twice
over - and both mistakes look like the design until somebody opens Figma. The one deliberate
deviation is `max-w-110` where the frame fixes 440px: identical at the designed 1440 width, and
a narrower window wraps instead of overflowing the card's `px-10`, the same call `AccessCard`'s
`py-10` makes about a viewport Figma never draws.

## The screens

The signed-in shell, its four routed views and the access screens outside it are documented in
`frontend/src/app/CLAUDE.md`, which loads whenever you read a file under `src/app/`. Read it
before touching a route, a layout or the session gate: two of the seams there are deliberate
stubs, and the shell's `force-dynamic` is load-bearing while `/`'s static prerender is equally
deliberate, so copying one into the other breaks something quietly.

## Environment

`BACKEND_URL` (default `http://localhost:3000`) is the only variable this app reads, from
`frontend/.env.local`, and `docs/guides/configuration.md` is its single home. One rule about it
is inline in root `CLAUDE.md` because breaking it cannot be undone:

**Never give a server-only secret a `NEXT_PUBLIC_` prefix.** `BACKEND_URL` deliberately
has no prefix because it is read server-side only; a `NEXT_PUBLIC_` variable is inlined
into the browser bundle and is therefore public forever.

## The frontend's half of CI

The frontend's `build-storybook` step is not redundant with `build`: `tsconfig.json`
includes `.storybook/**` and the story files, so `next build` already typechecks them.
The extra step catches what typechecking cannot, such as a broken framework option or a
CSS import that no longer resolves.

**`npm run build` is the typecheck for shipped code, but it does not reach `*.test.ts(x)`.**
Root `CLAUDE.md` states the short rule; this is the exception to know. `tsconfig.json` includes
every `.tsx` in the project, so a test file with a type error is in scope on paper - and yet
`next build` passes with one, because Next typechecks the module graph its routes actually pull
in and nothing imports a test. PET-12 found this the direct way: an exclusive-union prop was
being violated in four places in one suite while `build`, `lint` and `test` were all green,
because Jest transpiles without checking types and the build never looked. **`npx tsc --noEmit`
from `frontend/` is what covers them**, and running it reports pre-existing errors in
`src/components/ui/Sidebar.test.tsx` that no gate has ever failed on. Reach for it after
changing a prop type, a discriminated union or anything a test constructs by hand; CI does not,
which is why the errors are still there.

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **The `/api/chat` route handler.** The env template deliberately declares no model-provider
  key. Add whichever variable your provider needs when you build the route, server-side only and
  never behind `NEXT_PUBLIC_`. Related: `@google/genai` was once present in
  `frontend/node_modules` while absent from `package.json`, so a clean install removes it.
  Declare any SDK properly rather than relying on a leftover install. Note this is no longer the
  repo's _first_ route handler either - `app/auth/verify/route.ts` is, and it is the one to copy
  the shape from.
- **The shell's content.** The `(app)` group, the four routes and the page header exist, every
  screen renders its designed header, and the shell is really gated and really shows the signed-in
  user's profile as of PET-52. What is missing is everything below the header on **three** of the
  four: the Dashboard, AI Insights and Settings `<main>` elements are empty. Transactions is the
  exception as of PET-30 - it renders the tab bar, its real count badge and both empty states,
  leaving the table body and the filter bar as slots PET-29 fills, so a `filterBar` or `table`
  prop that goes nowhere is a seam rather than a stub. The month select and the search field are
  drawn but inert by design, and so are both of the transactions tabs. Every "Add transaction"
  button is real as of PET-31, including the empty card's - but the **table** it would populate is
  still PET-29's, so a save shows its effect in the count badge and nowhere else.
- **Every read a screen needs for its own data, bar the transactions list and the categories.**
  PET-52 ended the "nothing reads at all" era: `lib/session.ts` calls `GET /api/auth/session` and
  `lib/profile.ts` calls `GET /api/profile`, both lifting the session cookie into an
  `Authorization` header server-side. PET-30 added the third, `lib/transactions.ts`, and it is the
  first read a _screen_ makes for its own data - so it, rather than the two access reads, is the
  one to copy: it shows the classified-failure policy, and it shows what to do when the API's
  answer is ambiguous. PET-31 added `lib/categories.ts`, narrowed to what a picker needs.
  All four now go through `authorizedGet` in `lib/session.ts`, which is where the cookie becomes
  a bearer token; do not inline a fifth copy of that. What no screen fetches yet is the
  dashboard summary, the transaction _detail_, and the categories' **month stats** - the read
  exists but drops everything but `id` and `name`, so a screen wanting a cap or a spend adds it
  back rather than writing a new read.
- **Every write except creating a transaction.** PET-31 is the app's first authenticated write:
  `lib/createTransaction.ts` is a Server Action over `authorizedPost` in `lib/session.ts`, the
  write half of `authorizedGet` and the second thing to reuse rather than re-derive. Two of its
  decisions generalise to the writes still to come. It **surfaces the status on rejection** where
  the read helper collapses everything non-401 into `unavailable`, because 400, 404 and 401 need
  three different messages from a form and one of them must not say "try again". And it **does not
  parse the created row**: a 2xx whose body will not parse still means the write landed, so
  reporting failure there would have the user create a duplicate. Editing, deleting, and every
  category and profile write are still unbuilt.
