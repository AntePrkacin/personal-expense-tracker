# PET-27: transaction write endpoints and the global session guard

## Context

PET-27 ("[BE] Add transaction write endpoints with derived-view recomputation", epic
PET-4, High, 5 points) ships create, update and delete over a per-user transaction
store. Branch `feat/PET-27-transaction-write-endpoints` is stacked on
`feat/PET-14-link-verification-and-sessions` (PR #11), the top of the backend stack.

The tech spec is explicit that every aggregate - dashboard cards, trend buckets, donut,
category cards, allocation summary - is **computed on read and never stored** (spec
section 3: "Derived per category per month (not stored)", "Aggregates (all derived from
transactions) ... Never stored as mock constants"; section 4: "Derived views recompute
whenever createTransaction, updateTransaction, deleteTransaction ... succeed"). The
read endpoints belong to PET-28 and the dashboard/category tickets. So "derived-view
recomputation" here means exactly: store the data correctly - verbatim `YYYY-MM-DD`
date, integer cents, category id - so later reads compute right. A backdated
transaction lands in its own month because month attribution derives from `date` plus
the profile's `monthStartDay` at read time; there is no month column to get stale.

Scope addition moved here from PET-45: flip `SessionGuard` from per-route `@UseGuards`
to a global `APP_GUARD` plus `@Public()` on hello, register, login-link and verify
(AC7: those four answer exactly as before; transaction routes 401 without a session).

## Decisions made

1. **Tombstone soft delete, and AC3 gets amended in Jira.** AC3 as written says "no
   soft-delete record", but that wording was re-derived from the delete dialog's copy
   without the sync consideration; docs/TODO.md already records that "permanently" is
   satisfied by a tombstone invisible through the API. The offline-sync future is the
   deciding reason: a hard delete risks row resurrection under delete-update conflicts
   once devices hold replicas. So `transactions` carries `deleted_at` like every other
   table; the DELETE endpoint is one conditional
   `UPDATE ... SET deleted_at WHERE id = ? AND deleted_at IS NULL ... RETURNING` (404
   when it matches nothing, the `consume()` pattern), and UPDATE guards on
   `deleted_at IS NULL` so a tombstoned row cannot be edited back to life. Follow-up:
   amend AC3 on PET-27 and comment with the rationale.
2. **No display-only columns.** Time, payment method, status and account (DET-8, A20)
   appear only on the detail mock and no form captures them; they get no columns, and
   `forbidNonWhitelisted` 400s them at the API edge rather than dropping them silently.
   Recorded in docs/TODO.md, and PET-28/PET-34 get Jira comments so their reads answer
   empty or default rather than hunting for missing columns.
3. **No `db.transaction()` anywhere in this feature.** Every write is a single
   statement (plus a category-existence SELECT before inserts/category changes), so
   `LoginTokenService.issue()` stays the only transactional call site and the embedded
   driver's no-overlap constraint is never tripped. Check-then-insert is not a race
   today: categories have no delete CRUD, and when they get one (tombstone), a dangling
   reference is exactly what the FK-less schema already obliges every read to tolerate.
4. **PATCH with an explicit DTO, not `PartialType`.** `@IsOptional()` skips validation
   for `null` as well as `undefined`, so a naive partial DTO would let
   `{"merchant": null}` reach a NOT NULL column and 500. Each field uses
   `@ValidateIf((_, v) => v !== undefined)` instead; `note` alone keeps `@IsOptional()`
   because null is meaningful there. The PATCH tri-state contract: absent = unchanged,
   null = clear (nullable fields only), value = set.
5. **An empty PATCH body is a 400**, thrown before the user database is even opened: a
   bare UPDATE would still bump `updated_at` via `$onUpdateFn` for a request that said
   nothing.
6. **Status codes.** POST 201 (Nest default, no override decorator), PATCH 200, DELETE
   204 via `@HttpCode`. Errors 400/401/404 per route; no 429 (no throttler on these
   routes), no 500 documented (repo-wide policy, pinned by the OpenAPI e2e). An unknown
   `categoryId` in a body answers 404 'Category not found.', keeping 400 to mean "the
   shape was rejected"; the `:id` param goes through a bare `ParseUUIDPipe` (no version
   pin, matching `isUuid()`'s reasoning: the point is rejecting garbage, not policing
   versions) and answers 400 when malformed.
7. **Date validation composes two stock decorators; no custom validator.** An inline
   `@Matches(/^\d{4}-\d{2}-\d{2}$/)` pins the date-only shape (the swagger plugin only
   lifts inline regex literals into `pattern`; a named const silently drops it), and
   `@IsDateString({ strict: true, strictSeparator: true })` runs a real calendar check
   that rejects 2026-02-30. The string is stored and returned verbatim; **no
   `new Date(dto.date)` anywhere** in the write path, because that would shift dates
   across timezones.
8. **Money converts at exactly one boundary.** `src/common/money.ts` gains
   `fromCents()`; `TransactionsService` calls `toCents` on the way in and `fromCents`
   on the way out, and nothing else converts. Amount validation copies
   `RegisterDto.monthlyBudget` exactly, including
   `@ApiProperty({ minimum: 0, exclusiveMinimum: true })` - docs/TODO.md's housekeeping
   item warns that `@IsPositive()` alone renders `minimum: 1`, wrong for decimals.
9. **Guard flip mechanics.** New `src/auth/public.decorator.ts` (`IS_PUBLIC_KEY` +
   `SetMetadata`); `SessionGuard` gains `Reflector` and a `getAllAndOverride` public
   check as its first lines; `{ provide: APP_GUARD, useClass: SessionGuard }` sits
   beside `APP_PIPE`/`APP_FILTER` in `app.module.ts` with the same e2e-parity comment,
   extended: the failure direction reverses to fail-closed, since a forgotten
   `@Public()` 401s a public route loudly where a forgotten `@UseGuards` used to leave
   an endpoint silently open. `AuthModule` drops `SessionGuard` from providers/exports
   (keeps `SessionService`). Global guards run before the controller-level
   `ThrottlerGuard`, but on public routes the guard is a pure metadata read that never
   touches header or body, so the throttle trackers see the raw body exactly as before.
   Guards are invisible to OpenAPI: the flip commit must produce a zero-diff
   `npm run api:sync`, which is itself AC7 evidence.
10. **Commit subjects carry no ticket number**, matching the branch's history; the
    branch name and PR carry PET-27.

## Design

### Schema (`backend/src/database/user/schema.ts`)

```
transactions:
  id            text PK, caller-supplied newId()   (no $defaultFn on ids)
  merchant      text NOT NULL
  category_id   text NOT NULL      // no .references(), schema-wide convention
  amount_cents  integer NOT NULL   // toCents() at the service boundary
  date          text NOT NULL      // YYYY-MM-DD verbatim, month derived at read time
  note          text NULL
  created_at    integer timestamp_ms NOT NULL $defaultFn(now)
  updated_at    integer timestamp_ms NOT NULL $defaultFn(now) $onUpdateFn(now)
  deleted_at    integer timestamp_ms NULL          // tombstone
indexes (v1 RC third argument returns an ARRAY, not an object):
  transactions_date_idx ON (date)
  transactions_category_id_idx ON (category_id)
```

Export `TransactionRow`/`NewTransactionRow` via `$inferSelect`/`$inferInsert`. Both
indexes ship in this migration because PET-28's month-window and per-category scans are
already specified, and a second user-scope migration would re-open every user database
just to add an index. Generate with `npm run db:generate` from `backend/`; expect
exactly one new `drizzle/user/<timestamp>_add_transactions/` directory (migration.sql +
snapshot.json), commit both, never rename the folder. Any diff under `drizzle/central/`
means an accidental edit. Existing user databases upgrade on next open.

### Module layout (`backend/src/transactions/`)

`transactions.module.ts` needs no imports: `DatabaseModule` is `@Global`, the guard is
global after the flip, and `@CurrentUser` is a plain import. `controllers:
[TransactionsController]`, `providers: [TransactionsService]`. `AppModule` adds
`TransactionsModule` to imports. Files: controller, service, service spec, and
`dto/create-transaction.dto.ts`, `dto/update-transaction.dto.ts`,
`dto/transaction-response.dto.ts`.

### HTTP contract

Controller: `@ApiTags('transactions') @ApiBearerAuth() @Controller('transactions')` -
the bearer declaration is class-level (one decorator, cannot drift per route), no
`@UseGuards`, no throttler.

| Route                         | Success | Errors        |
| ----------------------------- | ------- | ------------- |
| `POST /api/transactions`      | 201     | 400, 401, 404 |
| `PATCH /api/transactions/:id` | 200     | 400, 401, 404 |
| `DELETE /api/transactions/:id`| 204     | 400, 401, 404 |

`@ApiOperation` descriptions state which resource each 404 names (the transaction in
the URL vs a `categoryId` sent in the body) and that amounts are major units.

`CreateTransactionDto`: merchant `@IsString @IsNotEmpty @MaxLength(200)`; categoryId
`@IsUUID()`; amount `@IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
@Max(1_000_000_000)` plus the explicit `@ApiProperty` from decision 8; date per
decision 7; note `@IsOptional @IsString @MaxLength(500)`.

`UpdateTransactionDto`: the same stacks behind `@ValidateIf(provided)` per decision 4,
every field `?:` so nothing lands in the schema's `required`; `note?: string | null`.

`TransactionResponseDto` (plain class in a `.dto.ts` file, or the plugin silently emits
`{}`): id, merchant, categoryId, amount (major units), date (verbatim), note
(string | null), createdAt/updatedAt (ISO strings).

### Service

Every method starts with `getUserDb(userId)` (the session principal's id, already
UUID-validated). Cross-user isolation is structural: user B's database has no row with
user A's transaction id, so it 404s with zero extra code.

- `create`: category existence SELECT (`id = ? AND deleted_at IS NULL LIMIT 1`, miss
  throws 404), then one INSERT with `{ id: newId(), merchant, categoryId, amountCents:
  toCents(amount), date, note: note ?? null }` `.returning()`, mapped through
  `fromCents`.
- `update`: build a sparse `set` from defined fields only - never `updatedAt`, because
  drizzle v1's `buildUpdateSet` auto-applies `$onUpdateFn` columns on every UPDATE (a
  unit test pins that the service does not set it manually). `{}` throws 400 first;
  a present `categoryId` runs the existence check; then one
  `UPDATE ... WHERE id = ? AND deleted_at IS NULL ... RETURNING` - no row means 404.
- `remove`: `UPDATE ... SET deleted_at = now WHERE id = ? AND deleted_at IS NULL
  RETURNING id` - no row means 404, else the controller answers 204.

### Tests

Unit specs follow the house pattern (plain `new Service(mocks)`, `test/query-chain.ts`
with `argsOf`/`toSql`/`paramsOf`):

- `transactions.service.spec.ts` (~14 cases): the category check's WHERE renders
  `deleted_at IS NULL`; unknown category 404s before insert; `values` carries a
  UUID-shaped id, 200050 cents for 2000.5 and 402 for 4.02, date verbatim, `note: null`
  when omitted; response maps to major units and ISO strings; `{}` PATCH 400s before
  `getUserDb`; sparse set contains exactly the provided fields; amount converts and
  never passes through as major units; categoryId change runs the check, absent skips
  `select`; `note: null` lands in `set`; no manual `updatedAt`; zero-row RETURNING
  throws 404 for update and remove; remove issues an UPDATE (tombstone), not a DELETE.
- `session.guard.spec.ts`: constructor gains a reflector stub; existing cases keep
  passing with the non-public default; new cases pin that a public route resolves true
  with no header and no `validate` call, and that the reflector is queried with
  `IS_PUBLIC_KEY` and exactly `[handler, class]`.
- `money.spec.ts`: `fromCents(200050) === 2000.5`, `fromCents(402) === 4.02`, and a
  `toCents(fromCents(n)) === n` round-trip including the DTO cap.

`test/transactions.e2e-spec.ts` mirrors `verify.e2e-spec.ts` fixtures (`nextEmail()`
per test because the e2e email limiter is 3, sessions minted via
`LoginTokenService.issue()`, user-DB rows read through the same `UserDatabaseService`
instance - a second driver would deadlock): 401s with missing and garbage bearers (body
keys match `ErrorResponseDto`); create happy path (201, major-unit echo,
`amount_cents` correct in the row, `createdAt === updatedAt`); 4.02 stores 402;
a past-month date (`2025-11-05`) stores verbatim; unknown category 404 and nothing
inserted; validation 400s naming the field (missing merchant; amount 0, negative,
three decimals, over cap; date `2026-02-30`, `03/08/2026`, a datetime);
`forbidNonWhitelisted` 400 for `paymentMethod`/`status`/`time`; PATCH happy with a
small delay so `updatedAt > createdAt`; note set then cleared with null;
`{"merchant": null}` 400s (the ValidateIf pin); `{}` 400s; unknown id 404, malformed id
400; DELETE answers 204, the row keeps existing with `deleted_at` set, a repeat DELETE
404s; cross-user PATCH and DELETE 404.

`test/openapi.e2e-spec.ts`: the pinned path list grows from 5 to 7; new per-operation
pins (exact response-code sets, `TransactionResponseDto` $refs, `security ===
[{ bearer: [] }]` on all three); schema pins: amount carries
`{ minimum: 0, exclusiveMinimum: true }` and not `minimum: 1`; date carries
`{ pattern: '^\\d{4}-\\d{2}-\\d{2}$', format: 'date' }`; Create's `required` is exactly
merchant, categoryId, amount, date; Update has none; Response requires all eight
fields. Regenerate `backend/openapi.json` + `frontend/src/types/api.d.ts` via the root
`npm run api:sync`; CI drift-gates both.

### Docs touched on this branch

- `session.guard.ts` class doc: the switch point it describes arrived with PET-27;
  rewrite for the global registration and the fail-closed direction.
- CLAUDE.md: the guard paragraph (Architecture), the Persistence sentence "Transactions
  and insights arrive there later", and the "Not yet built" data-model bullet. The
  plans-directory paragraph is another branch's work and is not touched here.
- docs/TODO.md: the data-model item; the soft-delete item extends to transactions; the
  money housekeeping item notes the second compliant field; a new item records the
  display-only-fields deferral (A20).

## Steps

1. This plan doc, committed first.
2. Schema + migration (`npm run db:generate`).
3. Guard flip: `public.decorator.ts`, guard + spec, `APP_GUARD` in AppModule, four
   `@Public()` markings, session route loses `@UseGuards`, AuthModule cleanup. Verify
   `npm run api:sync` produces no diff.
4. Endpoints: module, DTOs, service, `fromCents`, unit specs, OpenAPI e2e updates,
   regenerated artifacts.
5. E2e suite.
6. Docs pass (CLAUDE.md, docs/TODO.md).
7. Jira: amend PET-27 AC3 plus a rationale comment; comment the display-only-fields
   deferral on PET-28 and PET-34.

## Commits

1. `docs: plan transaction write endpoints`
2. `feat(backend): add the transactions table`
3. `feat(backend): guard every route by default, opting public ones out`
4. `feat(backend): add transaction create, update and delete endpoints` (needs 2 and 3)
5. `test(backend): cover transaction writes end to end` (needs 4)
6. `docs: record the transaction data model and write contract`

2 and 3 are independent of each other; 4 needs both.

## Verification

1. `cd backend && npm run lint && npm run build && npm test` green at every commit.
2. `npm run test:e2e` green - the existing suites double as the AC7 regression net for
   the guard flip, since they drive every public route unauthenticated.
3. Root `npm run api:sync`: zero diff after commit 3, a committed diff in commit 4,
   zero afterwards.
4. Local smoke: run the backend with no mail vars (the login link logs to the console),
   register and verify to mint a session, then curl create/patch/delete with the
   bearer. Confirm 401 without it, and that `GET /api/hello` and the three auth POSTs
   still answer unauthenticated.

## Known risks and accepted trade-offs

- **The `@IsOptional` null trap** is the sharpest edge in the PATCH contract; the
  `@ValidateIf` pattern plus an e2e pin keep it closed.
- **The `pattern` lift requires an inline regex literal**; the OpenAPI e2e pin makes a
  silent drop loud.
- **Same-millisecond `updatedAt`**: epoch-ms resolution means create-then-patch inside
  one millisecond leaves the two equal; the e2e inserts a tiny delay rather than
  asserting strict inequality on adjacent statements.
- **Number precision is safe but pinned**: max cents is 10^11, five orders of magnitude
  inside `Number.MAX_SAFE_INTEGER`; `toCents` rounds float noise on the way in;
  `fromCents` division round-trips exactly through JSON's shortest-form printing.
- **First transaction write per user pays the open-and-migrate cost** inside
  `getUserDb`. Existing behavior; do not add a tighter per-request timeout.
- **`ParseUUIDPipe`'s 400 message is a string** where ValidationPipe's is an array;
  both fit `ErrorResponseDto.message`'s `oneOf`, so the filter is untouched.
- **AC3 diverges from the implementation until the Jira amendment lands**; step 7
  closes that gap and the rationale comment keeps the record honest.
