# PET-64: category, colour and icon templates in central

Ticket: PET-64. Branch: `feat/PET-64-central-category-templates`, worked in a git worktree,
based on `main`.

Everything marked **AGREED** was decided during planning and should not be re-litigated during
implementation. Where a decision reverses something the repo currently documents, the file that
documents it is named, because both have to change together.

## Context

This branch is the first experiment toward a **super-admin panel**. The intended end state: a
super admin manages users and the *template* data behind onboarding, namely which default
categories are offered and which colours and icons a user may choose from. A user's own database
keeps holding only that user's own categories, exactly as it does today. Central gains template
tables and nothing else that is user data.

None of that is documented anywhere yet, which is why this branch exists: to start it, beginning
with the default categories, their colours and their icons.

**This reverses the repo's current default, deliberately.** `backend/src/database/user/schema.ts`
says closed sets are constrained in TypeScript rather than in SQLite, and
`backend/src/database/CLAUDE.md` says central's three exceptions are "not a licence to put more
profile data in central". Both hold for a set that only changes with a deploy. An admin-editable
set is not that: it is data, and central is the only database that can hold it.
`backend/src/database/CLAUDE.md` needs a fourth sanctioned exception written into it, naming
template data specifically and saying why it is not user data.

### The constraint everything else bends around

**Tailwind cannot build a class from runtime data.** `bg-${row.token}` compiles to nothing, with
no build error. The same is true of icons: `lucide-react` imports by name at build time, so a
runtime string cannot become a component without a static map or a dynamic-import path. This is
what forces Decision 1.

## Decision 1: templates reference a curated allowlist — AGREED

A template row does not carry a colour *value* or an arbitrary icon name. It carries a **token the
code already ships**, plus the presentation the admin controls.

```
central.colour_templates    token ('accent-content') | label ('Pine') | sort_order | enabled
central.icon_templates      name  ('paw-print')      | label ('Paw')  | sort_order | enabled
central.category_templates  name  ('Family & pets')  | colour_id | icon_id | description
                                                     | sort_order | enabled
```

The admin can rename, reorder, enable, disable and reassign. The admin cannot invent a
seventeenth colour or an off-map icon; that is a deploy.

**The payoff is that the compile-time guarantees survive where they matter.** `@IsIn` against the
code-side allowlist still publishes a real OpenAPI enum, so `frontend/src/types/api.d.ts` still
gets a literal union for colours and icons, and `Record<CategoryColour, string>` in
`categoryColour.ts` is still its own exhaustiveness proof. Only category *names* lose their union,
because those are genuinely admin-authored.

Validation checks the **allowlist**, never the `enabled` flag. `enabled` is presentation: the
picker offers what is enabled, and a category already carrying a since-disabled colour keeps
rendering.

## Decision 2: the palette — AGREED

**The thirteen assignments exactly as originally drawn.**
`docs/explainers/category-colors-icons-description-preview.html` is the sign-off artifact. It
renders against the real installed versions **and in the app's real context**: the same surfaces
(`bg-base-200` page, `bg-base-100` card inside the transactions table's own wrapper) and the same
three marks at the sizes the app draws them, verified by measurement rather than by eye. That last
part matters, because a token that reads fine as a 36px tile behind a glyph can be invisible as the
8px dot beside a category name, and only the dot column shows it.

| Mark | Where | Size |
| --- | --- | --- |
| Tile | `TransactionRow.tsx`, the merchant cell | `size-9 rounded-field`, `size-4.5` glyph |
| Dot | the same row's category cell | `size-2 rounded-full`, no glyph |
| Chip | `CategoryChip.tsx`, onboarding step 2 | `status status-lg`, no glyph |

| Category       | Token               | Icon                  |
| -------------- | ------------------- | --------------------- |
| Groceries      | `success`           | `shopping-basket`     |
| Dining out     | `secondary`         | `utensils`            |
| Transportation | `info`              | `car`                 |
| Utilities      | `accent`            | `zap`                 |
| Healthcare     | `error`             | `heart-pulse`         |
| Entertainment  | `primary`           | `tv`                  |
| Education      | `primary-content`   | `graduation-cap`      |
| Travel         | `secondary-content` | `plane`               |
| Personal care  | `accent-content`    | `scissors`            |
| Gifts          | `success-content`   | `gift`                |
| Family & pets  | `info-content`      | `paw-print`           |
| Loans & debt   | `warning`           | `landmark`            |
| Uncategorized  | `warning-content`   | `circle-question-mark` |

`circle-question-mark`, not `circle-help`: the latter is a deprecated alias of it in the installed
lucide 1.29.0. All thirteen names are verified to exist there.

**Category names are sentence case: first letter capital, everything else lower.** So "Dining out",
"Personal care", "Loans & debt", not "Dining Out", "Personal Care", "Loans & Debt". This is not a
new convention, it is the one `starter-categories.ts` already follows with "Dining out", and it
matters more now than it did: the admin panel will let someone type a name straight into
`category_templates`, so the rule needs to be written down where they can find it and enforced on
the write endpoint when that ships. The seed data in this ticket is what sets the precedent
everything after it copies.

### Why the contrast objection does not bind

Measured in headless Chromium against daisyUI 5.7.16, several tiles fall below 3:1 against the
card in one theme (`primary-content` 1.23 light, `info-content` 1.13 dark, others between). That
looks like a WCAG 1.4.11 failure and is not, because **colour carries no information anywhere in
this app**:

- `CategoryDonut.tsx` wraps its ring in `aria-hidden="true"` and calls the legend "the accessible
  equivalent" and a "strict superset", naming every category with amount and percentage in text.
- The legend swatch is itself `aria-hidden="true"`, declared decorative in its own comment.
- Legend rows and ring slices are both `sorted.map`, so order is a second channel.
- `CategoryChip`'s dot is `aria-hidden` beside a text label.
- Every glyph clears 3:1 on its own tile in both themes, worst case 3.05, so the icons are
  readable everywhere.

1.4.11 governs graphical objects *required to understand the content*. These are not, by explicit
design. What remains is legibility, and that call has been made against the preview.

`error-content` is excluded as a fourteenth colour: `#4d0218` is 1.01 against the dark card, the
same luminance as the surface. It is the only token in the set with no usable theme.

### The three close pairs are deliberate — AGREED

Measured in OKLab, where roughly 0.10 is the floor for telling two categories apart:

| ΔE    | Pair                  | Tokens                                    |
| ----- | --------------------- | ----------------------------------------- |
| 0.029 | Personal care / Gifts | `accent-content` / `success-content`      |
| 0.037 | Education / Travel    | `primary-content` / `secondary-content`   |
| 0.060 | Groceries / Utilities | `success` / `accent` (already ships today) |

Kept rather than re-picked. Breaking Education/Travel would force one onto a near-black tile,
since `primary-content`, `secondary-content` and `neutral-content` are all near-white so only one
pale tile is possible. That is a large visual change to fix something invisible, in a channel that
carries nothing. Near-identical also beats exact reuse: `accent-content` and `success-content`
differ in hue (188° against 169°) and can separate on a wide-gamut display, where a reused token
never can.

**Record it in code, not only here.** `categoryColour.ts` gets a comment naming all three pairs
with their measured ΔE and this reasoning, and `categoryColour.test.ts` gets a test pinning them.
The precedent is that suite's existing `expect(CATEGORY_TILE.orange).toBe(CATEGORY_TILE.yellow)`,
commented "Pinned so it cannot be 'fixed' by inventing a ninth theme colour", and
`starter-categories.ts`'s defence of its two colour reuses. Without both, the map reads as
thirteen distinct colours and renders eleven.

**Caveat that binds the sequencing.** `TransactionRow.tsx` renders `<ShoppingBag />` for *every*
category today, calling it "Figma's placeholder mark for every category". The close-pair decision
leans on each category having its own icon as the identity channel, so the per-category icon has
to land **with** the palette, not after it.

## Decision 3: `categories.color` stores the daisyUI token name — AGREED

`color: "accent-content"`, verbatim. Not a hex, and not an invented colour word.

Hex is not merely indirect here, it is incoherent. `primary` is the one token daisyUI values
differently per theme, so Entertainment (`#422ad5` light, `#605dff` dark) and Education (`#e0e7ff`,
`#edf1fe`) have no single hex. A stored hex would record one value and paint the other half the
time.

Consequences:

- **Both category DTOs change.** `@Matches(/^#[0-9A-Fa-f]{6}$/)` becomes `@IsIn(COLOUR_TOKENS)`
  with an explicit `@ApiProperty({ enum: COLOUR_TOKENS })`, on `create-category.dto.ts`,
  `update-category.dto.ts`, `category-response.dto.ts` and `TopCategoryDto`. The explicit `enum:`
  is the repo's convention, asserted in `backend/test/openapi.e2e-spec.ts`. This also deletes the
  inline-regex-literal trap both DTOs currently document.
- **`CATEGORY_COLOUR_BY_HEX` is deleted**, with the hex cases in `categoryColour.test.ts`, and
  `CategoryColour` becomes contract-derived. The silent grey fallback goes with it: a missing key
  in `Record<CategoryColour, string>` becomes a build error.
- **The label lives in `central.colour_templates.label`.** "Accent Content" is not a colour a
  person picks, and under Decision 1 the picker reads its copy from the API rather than from a
  frontend constant.
- **The class map's pairing inverts for `-content` tokens**: `'accent-content'` maps to
  `'bg-accent-content text-accent'`. Say so in the file, because it looks like a mistake.
- **Three files currently contradict the new fallback colour** and must be rewritten in the same
  change rather than left to argue with the code: `starter-categories.ts` ("Its color is not from
  the eight-color category palette... Do not 'fix' it to a palette color"), `backend/CLAUDE.md`'s
  Category endpoints section, and `categoryColour.ts`'s `CATEGORY_TILE_NEUTRAL` comment.

## Decision 4: the description seeds the user's `note` — AGREED

The original plan added a `description` column to the user-scope `categories` table. It should not.
`categories` already has `note`, editable through both DTOs and returned in `CategoryResponseDto`,
so a second free-text column would need a stated difference and has none.

Instead the template's `description` is **copied into `categories.note`** when a category is
seeded, alongside its name, colour and icon. The description lives on the template so the admin can
edit it centrally, and each user gets their own copy at provisioning, which they then own.

Three things follow from that, and the third is the one to watch:

- **`note` stops being empty on a fresh account.** Every seeded category arrives with the
  template's sentence in it. `CategoryResponseDto` already returns the field, so nothing about the
  contract changes and no screen breaks; it simply has content where it previously had none.
- **A user editing the note overwrites the description, permanently and correctly.** It is their
  copy from the moment it is written. An admin later editing the template does **not** reach back
  into anybody's existing categories, and should not: that row is user data now. Only new
  provisions pick up the new wording.
- **`note` surfaces on no screen today** (CED-4, A42), so seeding it has no visible effect until
  PET-37 and PET-38 build the category modals. Worth knowing before someone concludes the seed
  failed because nothing shows.

**This is what keeps the user scope untouched.** No new user-scope column means no user-scope
migration, and `backend/src/database/CLAUDE.md` is explicit that such a migration runs unattended
against live data one user at a time. `note` already exists and is nullable, `icon` already exists
and stays nullable, and `color` keeps its name, `text` type and `NOT NULL`, so `db:generate:user`
should report no changes. Treat it as a signal if it does not.

There is also **no data migration**: there are no real users and test accounts are purged. Wipe
local dev databases and re-provision, since existing rows hold hexes that no longer resolve.

## Decision 5: scope — AGREED

All three template tables, plus onboarding reading its chips from central. This is the slice where
registration changes shape.

The admin **write** side is explicitly out. There is no role or permission concept anywhere today:
central `users` holds an id, an email and a database pointer, and `SessionGuard` is the only guard.
`users.role`, a `SuperAdminGuard` and the admin UI are their own later work. This branch builds the
tables and the read path that panel will eventually write to.

## Implementation

### 1. The code-side allowlists

New `backend/src/database/central/template-tokens.ts`, exporting `COLOUR_TOKENS` (the sixteen
daisyUI semantic tokens) and `ICON_NAMES` (the thirteen lucide names this app imports), both
`as const` with derived types. Precedent for a DTO importing a closed set out of `database/`:
`register.dto.ts` already imports `STARTER_CATEGORY_NAMES`.

`ICON_NAMES` is a cross-app contract, since the frontend's static `CATEGORY_ICON` map must import
exactly these. Publishing it as an OpenAPI enum makes `Record<IconName, LucideIcon>` an
exhaustiveness proof, the same way the colour map becomes one.

### 2. Central tables

`backend/src/database/central/schema.ts` gains the three tables above, following that file's
conventions exactly: UUIDv7 text primary key from `newId()`, `timestamp_ms` instants with
`$defaultFn`/`$onUpdateFn`, a nullable `deletedAt` every read filters, **no foreign keys** (the
file's own comment explains why a declared constraint would be decorative under this engine), and
indexes returned as an array from the third argument. Partial unique index on the live rows of
`colour_templates.token`, `icon_templates.name` and `category_templates.name`, copying the
`users_email_live_unique` shape.

Generate with **`drizzle.central.config.ts`**. A bare `drizzle-kit generate` can resolve the wrong
scope and write a central table into `drizzle/user/`, where it would run against every user
database and never against central.

### 3. Seeding the templates

**Programmatically at boot, not in the migration SQL.** Root `CLAUDE.md` forbids hand-editing
anything under `backend/drizzle/**`, and drizzle-kit generates structure only, so appending
INSERTs to a generated `migration.sql` is not available. Seed in the `openCentralDatabase` factory
in `database.module.ts`, immediately after `migrate()`, which is already the point before any
consumer can query.

Guard it the way `seedStarterCategories` guards itself: **skip if any `category_templates` row
exists**. That is not only idempotence. It is what stops a boot re-creating a template the admin
deliberately deleted.

### 4. Endpoints

New `backend/src/templates/` module, reading central. Not part of `CategoriesModule`, which is
user-scope.

- **`GET /api/templates/categories`**, `@Public()` — the **fifth** public route. Onboarding step 2
  runs before an account exists, so it cannot be guarded. Returns the enabled category templates
  with their resolved colour token, icon name and description, in `sort_order`.
- **`GET /api/templates/palette`**, guarded — the enabled colour and icon templates with their
  labels, for the create and edit category picker.

Mind the throttler on the public route, and remember that a bare `@SkipThrottle()` means
`{ default: true }` and therefore silently skips nothing here.

### 5. Category DTOs

- `color`: as Decision 3.
- `icon`: `@IsString() @MaxLength(60)` becomes `@IsIn(ICON_NAMES)`, and becomes **required** on
  create. Narrowing is free now and expensive later.

### 6. Registration and seeding

- `RegisterDto.categories` becomes template **ids**. `@IsIn(STARTER_CATEGORY_NAMES)` cannot
  survive, so it becomes a shape check plus `@ArrayUnique`, with membership resolved against
  central. An unknown id is a 400, consistent with the existing rule that "a malformed address is
  a fact about the input, not about the account", and it leaks no account existence.
- **`@ArrayMaxSize` needs a real number, and this is not a detail.** `register.dto.ts:104` reads
  `@ArrayMaxSize(STARTER_CATEGORY_NAMES.length)`, deriving its bound from the constant this ticket
  deletes. There is no compile-time length once the list is a table, and **this is a `@Public()`
  unauthenticated endpoint**, so dropping the bound leaves an unbounded array on the one route
  anybody can post to. Pick a fixed literal ceiling well above any plausible template count and
  say in a comment that it is a hard cap rather than the list's length. Do **not** make it a count
  query: that would put a database read in front of validation on the route whose timing
  properties `backend/CLAUDE.md` is most careful about.
- That lookup is one indexed central read and must stay **ahead of** the floated token-issue and
  mail-send, so the empty-202 timing property `backend/CLAUDE.md` documents still holds.
- `users.onboarding_payload` now stashes ids.
- `seedStarterCategories` reads the picked templates from central and copies name, colour, icon and
  the template's `description` into the user's `note` column, per Decision 4.
  **`FALLBACK_CATEGORY` stays a code constant** and stays out of `category_templates`, for the
  reason that file already gives: it must never appear as a pickable chip, and its name is a system
  invariant the API answers 409 for. Its colour becomes `warning-content`, its icon
  `circle-question-mark`, and it needs a `note` sentence of its own since it has no template to
  take one from.

### 7. Frontend

- **`frontend/src/app/setup/starterCategories.ts` is deleted**, and with it the
  `AssertNever<Exclude<...>>` guard. The chip list is data now, so `api.d.ts` cannot carry a union
  for it.
- **`/setup/categories` becoming async is a props refactor across four files, not one clause.**
  Today `page.tsx` is a thin wrapper returning `<SetupCategoriesScreen />`, the screen is
  synchronous, and both it and `CategoryPicker` read `STARTER_CATEGORIES` by import. Once the list
  is fetched, the split has to become the one `frontend/src/app/CLAUDE.md` already calls "the shape
  the other three should copy": **`page.tsx` async and doing the read, the screen synchronous and
  taking the categories as a required prop**, passing them down to `CategoryPicker` as a prop too.
  That is not stylistic. Storybook cannot render an async Server Component, and the story harness
  builds each story from `render` or `meta.component` while never applying the meta's decorators,
  so a screen that fetches for itself cannot have a story at all. `SetupCategoriesScreen.stories.tsx`
  and `SetupCategoriesScreen.test.tsx` then hand in stand-in data instead of importing the constant.
- The read itself cannot use `authorizedGet`, since there is no session yet, so it goes through
  `lib/backend.ts` directly. Follow `lib/transactions.ts` for the classified-failure policy.
- **`app/setup/draft.ts` loses a guarantee, and this plan states it rather than letting it be
  discovered.** `parseDraft` currently drops unknown category names by filtering against the
  canonical list. With ids it can only dedupe and cap; membership becomes the server's to reject.
  That weakens the "everything this module hands out is something the field could have produced"
  property that file argues for.
- `categoryColour.ts`: `CATEGORY_TILE`, `CATEGORY_DOT` and `CATEGORY_FILL` re-keyed by the
  contract's colour union, the hex map and `categoryTileClass`'s hex path deleted, the
  three-close-pairs comment added, and a new `CATEGORY_ICON: Record<IconName, LucideIcon>`.
- `TransactionRow.tsx` stops rendering `<ShoppingBag />` for everything and renders the row's own
  icon. `lib/categories.ts`'s `CategoryLabel` widens from `id | name | color` to include `icon`;
  leave `CategoryOption` narrow, for the reason that file gives.
- `CategoryChip` takes a colour token and an icon.

### 8. Documentation

Each of these is wrong the moment this lands, so they change in the same commit:

- `backend/src/database/CLAUDE.md`: a **fourth** sanctioned central exception, naming template data
  and why it is not user data.
- `backend/CLAUDE.md`: a Templates section, the fifth `@Public()` route, and the Category endpoints
  paragraph on the fallback's colour.
- `frontend/src/app/CLAUDE.md`: onboarding fetches its chips, the draft holds ids, the compile
  guard is gone.
- `frontend/CLAUDE.md` and `frontend/src/components/CLAUDE.md`: the icon map and the rewritten
  `categoryColour.ts`.
- `docs/TODO.md`: the colour-picker decision recorded there is resolved. Rewrite it as a decision
  record rather than deleting it.

### 9. What this plan's own base does not contain

Two pieces of evidence this plan leans on are **not on `main`**, which is what this branch is based
on. `CategoryDonut.tsx` and `categoryColour.ts`'s `CATEGORY_FILL` are PET-23's, still in review.
The reasoning stands, since PET-23 merges first, but expect the files not to be there when you cut
the implementation branch, and re-read them on PET-23 rather than assuming this plan quoted them
from `main`.

The one place it bites: `categoryColour.ts` gains `CATEGORY_FILL` in PET-23 and is rewritten here.
Land PET-23 before starting section 7, or resolve that overlap by hand.

### 10. Blast radius, swept against `main`

The sections above describe the change. This one is the inventory of everything else that breaks,
found by sweeping the base rather than by reasoning about it. Nothing here is optional.

**`backend/src/scripts/seed-showcase.ts` breaks, and it is the least obvious casualty.** PET-60's
showcase seed boots the real `AppModule` and provisions through the real services, which is exactly
why it breaks: it hands `STARTER_CATEGORY_NAMES` to the onboarding payload at `:144`, and under
Decision 5 that field is template ids. It must resolve ids from central instead. Two further
snags in the same file:

- `:329` `find((c) => c.name === 'Groceries')` and `:340` `find((c) => c.name === 'Subscriptions')`
  are **name lookups against the seeded set**. "Subscriptions" is the riskier one: it sits on the
  A7 seam and may not survive the 13-name list. Both fall back to `pickableCategories[0]`, so a
  miss **degrades silently** into a demo whose subscription story is attached to the wrong
  category rather than failing loudly.
- `:210` says "with 22 names over 11 categories". Eleven becomes fourteen, and
  `docs/guides/seeding-dummy-data.md` repeats the same arithmetic at `:117` and `:119`.

**There are two `<ShoppingBag />` placeholder sites, not one.** `TransactionRow.tsx:67` is the one
Decision 2 already names; `[id]/CategoryContextCard.tsx:114` is the second, in PET-34's detail
page, and it renders the identical placeholder in the identical `size-9 rounded-field` tile. Both
become the real per-category icon, or the close-pair decision only half holds.

> **There were three, and this sweep missed one.** `(app)/dashboard/RecentTransactionsCard.tsx`
> draws the same tile with the same placeholder, and it was found during implementation by
> `grep -rn ShoppingBag src/` rather than by this inventory. It needed a contract change the plan
> did not anticipate: `DashboardCategoryDto` gained an `icon` field, for that tile alone - the
> donut's slices are bare colour and need none, and the card joins its category off the same
> response, so the join still costs no second request. The general lesson is the one this section
> was written to teach and did not quite manage: **sweep with a tool, not by reading**, and re-run
> the sweep after the change to prove no site is left.

**`categoryColour.ts` exports more than this plan first named.** Beside `CATEGORY_TILE`,
`CATEGORY_DOT`, `CATEGORY_COLOUR_BY_HEX`, `CATEGORY_TILE_NEUTRAL` and `categoryTileClass`, `main`
also has **`categoryDotClass`** and **`CATEGORY_DOT_NEUTRAL`**, and `[id]/TransactionDetailScreen.tsx:76`
is a live caller of the first. `CATEGORY_FILL` and `categoryFillVar` do **not** exist on `main`;
they arrive with PET-23, which section 9 already flags.

**`icon` keeps its nullable column.** Making `CreateCategoryDto.icon` required does **not** mean
`ALTER TABLE`. Tightening `categories.icon` to `NOT NULL` would be the one user-scope migration in
this whole change, and it is not worth it: the DTO is what enforces the invariant going forward,
and `backend/src/database/CLAUDE.md` is explicit that a user-scope migration runs unattended
against live data one user at a time. Leave the column alone.

**Fixtures that become invalid**, beyond the obvious hexes:

- `backend/test/categories.e2e-spec.ts` sends `icon: 'cup'` (`:333`, `:342`) and `icon: 'box'`
  (`:442`, `:450`). Neither is a lucide name, so both fail `@IsIn(ICON_NAMES)`.
- `frontend/src/lib/transactionDetail.test.ts:41` uses `color: '#22C55E'`, which is not even one of
  the current eight.
- `backend/test/categories.e2e-spec.ts:385` uses `color: 'teal'` as its **malformed** example. That
  string becomes a plausible token shape, so the negative case has to be re-pointed at something
  genuinely rejected, and keeping a `#RRGGBB` there as the now-invalid format is worth doing.
- Four `[id]/` fixtures carry `icon: null` alongside their hexes.

**Hard-coded counts are assertions, not just prose.** These fail rather than merely rot:
`categoryColour.test.ts:21-22` (`toHaveLength(8)`, `size).toBe(8)`), `:46-49` (the deliberate
orange/yellow collision), `starterCategories.test.ts:14,19-30,44,51-53` (the ten names written out,
and "reuses two colours"), and `SetupCategoriesScreen.test.tsx:83,162,349` ("ten chips", "the other
nine"). The prose copies are in `starter-categories.ts`, `create-category.dto.ts`,
`categoryColour.ts`, `starterCategories.ts`, `CategoryPicker.tsx`, `CategoryChip.tsx`,
`AccessCard.tsx`, `TransactionsTable.tsx`, `TransactionRow.tsx` and `transactions/page.tsx`.

**Documentation beyond the six files section 8 lists:**

- `docs/guides/seeding-dummy-data.md` — the eleven-category and 22-merchant arithmetic.
- `docs/guides/database.md:26` — its sample curl body `"categories":["Groceries"]` becomes an
  invalid registration payload the moment Decision 5 lands.
- `docs/project-management/02-tech-spec-personal-expense-tracker.md` — CED-6 ("the eight Category
  color tokens from Foundations"), the Foundations palette table, A7, and **A40**, which this
  ticket settles by fixing the icon set.
- `docs/TODO.md` closes **two** entries, not one: the colour-picker entry section 8 names, and
  "The starter category list exists in two files, linked only by a generated type", whose own
  preferred fix is "a public endpoint serving the starter list" — which is what Decision 5 builds.

## Verification

- `cd backend && npm run build` (the typecheck), `npm test`, `npm run test:e2e`.
- **From the repo root, `npm run api:sync`**, committing both `backend/openapi.json` and
  `frontend/src/types/api.d.ts`.
- Add to `backend/test/openapi.e2e-spec.ts`, beside its existing enum assertions, that
  `CreateCategoryDto.color` publishes the token enum and carries no `pattern`.
- `cd frontend && npm run lint && npm test && npm run build`, then `npx tsc --noEmit`, which is what
  covers the test files `next build` never reaches.
- Wipe `DATABASE_DIR`, re-register a test account, then walk `/setup/categories` and
  `/transactions` in headless Chromium in **both** themes, reading computed style rather than
  trusting the class attribute.
- `npm run docs:check` from the root.

## Checklist

- [x] Rename and rewrite the preview HTML against the installed daisyUI 5 and Tailwind v4
- [x] Replace this plan with the template architecture
- [x] Open PET-64, rebase onto `main`, rename the branch, open a draft PR
- [x] Wait for PET-23 to merge, since it also rewrites `categoryColour.ts`
- [x] Add `backend/src/database/central/template-tokens.ts` with `COLOUR_TOKENS` and `ICON_NAMES`
- [x] Add the three template tables to `central/schema.ts`; generate with `drizzle.central.config.ts`
- [x] Seed the templates idempotently in `openCentralDatabase`, guarded on "any row exists"
- [x] Add `backend/src/templates/` with the public categories read and the guarded palette read
- [x] Switch `color` and `icon` on all four category DTOs to `@IsIn` with an explicit `enum:`
- [x] Switch `RegisterDto.categories` to template ids, resolved ahead of the floated work
- [x] Rewrite `seedStarterCategories` to copy from central; keep `FALLBACK_CATEGORY` a code constant
- [x] Backend tests, including the `openapi.e2e-spec.ts` enum assertions
- [x] `npm run api:sync` from the root; commit both artifacts
- [x] Rewrite `categoryColour.ts` and its test, including `categoryDotClass` and
      `CATEGORY_DOT_NEUTRAL`
- [x] Give `RegisterDto.categories` a literal `@ArrayMaxSize` ceiling, since its bound currently
      comes from the deleted constant and the route is public
- [x] Delete `starterCategories.ts`; split `/setup/categories` into an async page and a
      prop-taking screen, thread the list through `CategoryPicker`, and re-point its stories and
      tests at stand-in data; move the draft to ids
- [x] Both `<ShoppingBag />` sites draw the real icon: `TransactionRow` and
      `[id]/CategoryContextCard`; widen `CategoryLabel` with `icon`
- [x] Repoint `seed-showcase.ts` at template ids; fix its two name lookups and its count comment
- [x] Fix the fixtures section 10 lists: hexes, `icon: 'cup'`/`'box'`, `#22C55E`, and the
      `color: 'teal'` negative case
- [x] Update the count assertions that fail, not only the prose that rots
- [x] Update the documentation in sections 8 and 10; close the two `docs/TODO.md` entries
- [x] Full verification pass, including the two-theme browser walk on a re-provisioned account
- [x] Re-run `mise run seed:showcase` end to end, the only thing that exercises provisioning
      against real data

## Risks worth stating

- **The `api:sync` failure is silent and total.** Skip it, or run `api:types` before `api:spec`, and
  `color` stays `string` in the contract. `Record<CategoryColour, string>` then degrades to
  `Record<string, string>`, which accepts any subset of keys. Every guarantee in this plan
  evaporates, the build stays green, and the tiles render grey.
- **Onboarding becomes network-dependent.** Step 2 renders from a constant today and cannot fail.
  After this it can, before the user has an account, on a screen A29 designs no error state for.
  That state is ours to invent and joins what A29 owes a designer.
- **`RegisterDto` is a breaking contract change** in the one flow with no session to fall back on.
  Free now, expensive once anyone real has registered.
- **The three close colour pairs ship visibly identical until the per-category icon lands**, which
  is why both are in this slice rather than sequenced apart.
