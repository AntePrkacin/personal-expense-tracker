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
`docs/explainers/category-colors-icons-description-preview.html` is the sign-off artifact and now
renders against the real installed versions.

| Category       | Token               | Icon                  |
| -------------- | ------------------- | --------------------- |
| Groceries      | `success`           | `shopping-basket`     |
| Dining Out     | `secondary`         | `utensils`            |
| Transportation | `info`              | `car`                 |
| Utilities      | `accent`            | `zap`                 |
| Healthcare     | `error`             | `heart-pulse`         |
| Entertainment  | `primary`           | `tv`                  |
| Education      | `primary-content`   | `graduation-cap`      |
| Travel         | `secondary-content` | `plane`               |
| Personal Care  | `accent-content`    | `scissors`            |
| Gifts          | `success-content`   | `gift`                |
| Family & pets  | `info-content`      | `paw-print`           |
| Loans & Debt   | `warning`           | `landmark`            |
| Uncategorized  | `warning-content`   | `circle-question-mark` |

`circle-question-mark`, not `circle-help`: the latter is a deprecated alias of it in the installed
lucide 1.29.0. All thirteen names are verified to exist there.

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
| 0.029 | Personal Care / Gifts | `accent-content` / `success-content`      |
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

## Decision 4: `description` stays on the template — AGREED

The original plan added a `description` column to the user-scope `categories` table. It should not.
`categories` already has `note`, editable through both DTOs and returned in `CategoryResponseDto`,
so a second free-text column would need a stated difference and has none.

The descriptions in the table above are **onboarding copy**: they help someone choose a chip. They
belong on `category_templates` and are read by the onboarding screen. Nothing copies them into the
user's own row.

**This is what keeps the user scope untouched.** No new user-scope column means no user-scope
migration, and `backend/src/database/CLAUDE.md` is explicit that such a migration runs unattended
against live data one user at a time. `icon` already exists on `categories` and stays nullable, and
`color` keeps its name, `text` type and `NOT NULL`, so `db:generate:user` should report no changes.
Treat it as a signal if it does not.

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
  survive, so it becomes a shape check plus the existing `@ArrayUnique`/`@ArrayMaxSize`, with
  membership resolved against central. An unknown id is a 400, consistent with the existing rule
  that "a malformed address is a fact about the input, not about the account", and it leaks no
  account existence.
- That lookup is one indexed central read and must stay **ahead of** the floated token-issue and
  mail-send, so the empty-202 timing property `backend/CLAUDE.md` documents still holds.
- `users.onboarding_payload` now stashes ids.
- `seedStarterCategories` reads the picked templates from central and copies name, colour and icon
  into the user's database. **`FALLBACK_CATEGORY` stays a code constant** and stays out of
  `category_templates`, for the reason that file already gives: it must never appear as a pickable
  chip, and its name is a system invariant the API answers 409 for. Its colour becomes
  `warning-content` and its icon `circle-question-mark`.

### 7. Frontend

- **`frontend/src/app/setup/starterCategories.ts` is deleted**, and with it the
  `AssertNever<Exclude<...>>` guard. The chip list is data now, so `api.d.ts` cannot carry a union
  for it.
- `/setup/categories` becomes async and fetches the public endpoint server-side. It cannot use
  `authorizedGet`, since there is no session yet, so it goes through `lib/backend.ts` directly.
  Follow `lib/transactions.ts` for the classified-failure policy.
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
- [ ] Wait for PET-23 to merge, since it also rewrites `categoryColour.ts`
- [ ] Add `backend/src/database/central/template-tokens.ts` with `COLOUR_TOKENS` and `ICON_NAMES`
- [ ] Add the three template tables to `central/schema.ts`; generate with `drizzle.central.config.ts`
- [ ] Seed the templates idempotently in `openCentralDatabase`, guarded on "any row exists"
- [ ] Add `backend/src/templates/` with the public categories read and the guarded palette read
- [ ] Switch `color` and `icon` on all four category DTOs to `@IsIn` with an explicit `enum:`
- [ ] Switch `RegisterDto.categories` to template ids, resolved ahead of the floated work
- [ ] Rewrite `seedStarterCategories` to copy from central; keep `FALLBACK_CATEGORY` a code constant
- [ ] Backend tests, including the `openapi.e2e-spec.ts` enum assertions
- [ ] `npm run api:sync` from the root; commit both artifacts
- [ ] Rewrite `categoryColour.ts` and its test
- [ ] Delete `starterCategories.ts`; make `/setup/categories` async; move the draft to ids
- [ ] `TransactionRow` draws the real icon; widen `CategoryLabel` with `icon`
- [ ] Update the six documentation files listed above
- [ ] Full verification pass, including the two-theme browser walk on a re-provisioned account

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
