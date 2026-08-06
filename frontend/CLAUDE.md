# frontend/CLAUDE.md

Guidance for Claude Code inside `frontend/`. Root `CLAUDE.md` carries the rules that hold
everywhere and points here; this file is the authority for everything inside the Next.js app.
Runnable detail lives in the guides: commands in `docs/guides/commands.md`, environment values
in `docs/guides/configuration.md`.

## Design tokens

**daisyUI 5 on Tailwind v4 is the design system as of PET-57**, which retired the hand-rolled
Figma-token layer. `frontend/src/app/globals.css` is now small enough to read in one breath: the
Tailwind import, the daisyUI plugin registering the built-in `light` / `dark` themes selected
automatically from the OS, and the two font tokens. There is no `tailwind.config`; Tailwind v4
is configured CSS-first. Figma still governs each screen's structure, layout and content, but
colour, type, radius and shadow are stock daisyUI - the design deliberately no longer matches
Figma's pixels, which is the decision PET-57's plan rests on.

Four rules keep it coherent:

- **Theme-aware colour is daisyUI semantic colour, never a raw palette class.** The names are
  `base-100/200/300`, `base-content`, `primary`, `secondary`, `accent`, `neutral`, `info`,
  `success`, `warning` and `error`, each with a `-content` pair for what sits on it. Tailwind's
  full palette is back, so `text-red-600` now compiles and quietly bypasses the theme - the
  exact inversion of the old failure, where a wrong class generated nothing. The compile-time
  check died with the token layer, so this rests on review.

- **Never write a `dark:` variant.** Semantic colours resolve through the active theme, so dark
  mode needs nothing from markup, and a `dark:` override would fight the theme instead of
  following it.

- **Colour modifiers are semantic state, not decoration.** `btn-primary` marks the one
  emphasized action per screen; `btn-error`, `input-error` and `text-error` mark destructive
  actions and invalid state. The three status colours still carry meaning: reaching for one
  because a design asks for that hue says something the interface did not intend.

- **Class strings stay complete literals.** Tailwind's scanner reads source as raw text, so an
  interpolated `bg-${tone}` compiles to nothing with no build error. Variant maps keep whole
  strings per key (`ui/categoryColour.ts` is the pattern), and daisyUI modifiers are literal
  classes in markup.

Typography: the two families load through `next/font/google` in `frontend/src/app/fonts.ts`,
whose variable classes must stay on `<html>` - that is where `:root` resolves, and both
`.storybook/preview.ts` and the root layout apply them. `--font-sans` (Inter) is what Tailwind's
preflight reads as the default body family; `font-display` (Plus Jakarta Sans) is the heading
and wordmark face. Type sizes are Tailwind's own scale (`text-sm`, `text-2xl`); the 19 named
Figma type styles are gone.

**Light and dark both ship**, selected by `prefers-color-scheme` with no theme controller,
deliberately: a controller and automatic prefers-dark must not coexist, or a browser already in
dark mode makes the control switch dark to dark. A visible toggle is deferred and trades away
the automatic behaviour when it lands.

## Shared components

**daisyUI is the component library now.** A screen reaches for daisyUI classes directly, and a
local component earns a file only when it carries real logic or genuinely shared behaviour.
PET-57 deleted `Tag`, `ProgressBar`, `Stat`, `SectionHeader` and `ListRow` - story-only or
single-decorative-use wrappers around what daisyUI ships as `badge`, `progress`, `stat` and
`list` - and `Field`, whose job the two field components absorbed. When a view finally needs a
stat row or a transaction list, write the daisyUI classes in place rather than resurrecting a
wrapper; the ticket that needs shared behaviour can extract one then.

`frontend/src/components/ui/` keeps four primitives and a helper, each owning behaviour:

- **`ui/Button` either navigates or acts, never both.** Its props are an exclusive union: pass
  `href` and it renders a `next/link`, otherwise a `<button>` with `type` (defaulting to
  `button`, not HTML's `submit`), `disabled` and `onClick`. The `never`s are load-bearing - an
  anchor cannot be disabled by author styles, so `<Button href disabled>` would look dimmed and
  still navigate - and `npm run build`, the typecheck gate, is what rejects the combination.

- **`ui/Input` and `ui/Select` own the field pattern**: the `fieldset` / `label` pair, the
  controlled `error` prop rendered as a `text-error` line, and the `aria-invalid` /
  `aria-describedby` wiring between them. daisyUI's `validator` class is deliberately unused: it
  colours from the HTML validation API, and every form here is `noValidate` with controlled
  messages. `id` is a required prop because `useId()` is a hook and would force `'use client'`
  onto the field layer. There is deliberately no `type="number"` - the currency variant would
  render spinners and discard a half-typed `24.` mid-keystroke; `inputMode="decimal"` gets the
  numeric keypad without either problem.

- **`ui/Sidebar` takes its active item as a prop**, not a `usePathname()` call, which keeps it a
  Server Component; the `(app)` shell's thin `'use client'` wrapper (`SidebarNav`) reads the
  pathname. `SIDEBAR_HREFS` is the single declaration of the four app routes and the contract
  the route folders match. The panel is `bg-neutral`, daisyUI's always-dark slot, so it stays
  dark in both themes the way the design draws it. Its collapse lives in the layout, not here:
  the `(app)` shell wraps everything in a daisyUI `drawer` that is fixed open at `lg` and
  off-canvas behind a hamburger below it.

- **`ui/categoryColour.ts` maps the eight stored colour words onto theme colours**,
  nearest-match and lossy on purpose: orange and yellow both land on `warning`, accepted because
  category colours are decoration. The colour words are the stable identity the category rows
  and the picker use; only the rendered hue follows the theme. Do not "fix" the collision by
  reaching for a raw palette value.

`components/` has four direct children, all belonging to the access screens: `LogoLockup.tsx`
(the accent tile and wordmark), `AccessCard.tsx` (the centred column and `card` box, with an
`aboveCard` slot the onboarding step indicator drops into), and `ResendLink.tsx` with
`LogInAgain.tsx`, the recovery controls. Each is shared by more screens than one route segment
holds, which is why they are neither in `ui/` nor beside a route.

Three conventions, all of which existing files demonstrate:

- **Tests and stories are colocated**, `Button.tsx` next to `Button.test.tsx` and
  `Button.stories.tsx`. Do not "tidy" them into `__tests__/` or `stories/` trees.

- **Files are flat inside `ui/`**, no folder per component and no barrel `index.ts`.

- **Components stay Server Components.** None carries `'use client'`, because none holds state;
  a client component that imports one pulls it into the client bundle on its own. Only add the
  directive when a component genuinely needs the client itself.

Tests assert behaviour and semantics, not class strings. The daisyUI state classes
(`menu-active`, `input-error`) are the one exception, as the visible half of an aria attribute
the same test pins. The old compile-pinning suites (`globals.test.ts`, `utilities.test.ts`) are
gone with the token system they guarded.

Storybook keeps three sections: **Components** for `ui/`, **Screens** for the frames, **Shell**
for the app shell's own pieces. **Foundations is gone** with the token layer it documented.
`.storybook/preview.ts` imports `globals.css` and applies the font variable classes, so the
daisyUI plugin registration lands in every story automatically.

`frontend/src/lib/format.ts` owns display formatting, in four parts. Money: amounts are
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
`app/setup/BudgetForm.tsx` depends on rather than merely benefits from.

All four parts hard-code `en-US` and its separators. When the currency chosen during onboarding
is finally stored, the locale follows it through all of them together; `docs/TODO.md` tracks
that.

## The screens

The signed-in shell, its four routed views and the access screens outside it are documented in
`frontend/src/app/CLAUDE.md`, which loads whenever you read a file under `src/app/`. Read it
before touching a route, a layout or the session gate: two of the seams there are deliberate
stubs, and the session gate's one-read shape is load-bearing.

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
from `frontend/` is what covers them.** Reach for it after changing a prop type, a discriminated
union or anything a test constructs by hand; CI does not.

## Not built here

Treat these as planned, not available. This list exists so you do not build on something that
is not there. One bullet per capability, ordered alphabetically by its bold lead-in; when a
capability lands, delete its whole bullet and nothing else. Why each one is deferred, where
that was a decision rather than a queue, is in `docs/TODO.md`.

- **A visible theme toggle.** The theme pair follows the OS automatically, and shipping a
  `theme-controller` alongside that automatic behaviour is the combination daisyUI's own rules
  forbid - a browser already in dark mode would make the control switch dark to dark. Adding a
  toggle is its own change and trades the automatic selection away.
- **Every read except the two the access flow needed.** `lib/session.ts` calls
  `GET /api/auth/session` and `lib/profile.ts` calls `GET /api/profile`, both lifting the
  session cookie into an `Authorization` header server-side, and both are the pattern to copy.
  What no screen fetches yet is its own data - the dashboard summary, the transaction list and
  its detail, the categories and their month stats all exist on the backend and are read by
  nobody.
- **The `/api/chat` route handler.** The env template deliberately declares no model-provider
  key. Add whichever variable your provider needs when you build the route, server-side only and
  never behind `NEXT_PUBLIC_`. Note this is not the repo's _first_ route handler -
  `app/auth/verify/route.ts` is, and it is the one to copy the shape from.
- **The shell's content.** The `(app)` group, the four routes and the page header exist, every
  screen renders its designed header, and the shell is really gated and really shows the
  signed-in user's profile as of PET-52. What is missing is everything below the header: all
  four `<main>` elements are empty. The month select and the search field are drawn but inert by
  design.
