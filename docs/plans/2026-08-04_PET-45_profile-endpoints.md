# PET-45: profile and preferences read and update endpoints

## Context

PET-45 ("[BE] Add profile and preferences read and update endpoints", epic PET-7
Settings, Medium, 3 points) ships the backend for the Settings page and the sidebar
footer: one read returning firstName, lastName, email, currency, monthlyBudget and
monthStartDay, and one update persisting all of them in a single save (SET-2, SET-3,
SET-5). Branch `feat/PET-45-profile-read` is cut from `main` - the backend stack is
fully merged, so nothing is stacked.

The data is already split the way the feature needs it: email lives only in central
`users` (it is the login identifier, guarded by the partial unique index
`users_email_live_unique` scoped to `deleted_at IS NULL`), everything else lives in the
per-user database's single-row `profile` table, whose columns match the ticket exactly.
ACs 4 and 5 (a changed month start day or budget affects later period-scoped reads) are
satisfied structurally rather than by code here: nothing derived is stored, and the
reads that consume `monthStartDay` and the budget are PET-28's and the dashboard
tickets'.

Scope addition, by request: the two published-contract gaps recorded in docs/TODO.md
Housekeeping - `RegisterDto.currency` publishes as a bare string while
`@IsISO4217CurrencyCode()` enforces the ISO list, and `monthStartDay` publishes as
`type: number` while `@IsInt()` rejects fractions - get fixed on `RegisterDto` and are
not reproduced by the new DTO, with openapi e2e pins covering both DTOs.

## Decisions made

1. **A new `src/profile/` module with `GET /api/profile` and `PATCH /api/profile`,**
   mirroring `src/transactions/`. The resource is the session's own - there is no
   `/profile/{id}` - so the global `SessionGuard` covers it with no decorator, and like
   the transaction routes it carries no throttler and documents no 429.
2. **PATCH, tri-state, hand-written DTO.** Same contract and same rationale as
   `UpdateTransactionDto`: absent = unchanged, a value sets, and **no field accepts
   null** because every profile column is NOT NULL - so every field uses
   `@ValidateIf((_, v) => v !== undefined)` and none uses `@IsOptional()`. An empty
   body is a 400 thrown before any database is touched. The Settings form saves the
   whole page at once (SET-5), which a full-body PATCH satisfies; tri-state keeps
   partial saves possible without a second contract.
3. **GET reads email from `SessionPrincipal`, not from central.**
   `SessionService.validate` joins `users` live on every request, so the principal's
   email is never stale; the read touches only the caller's own database.
4. **An email conflict is a 409, disclosed.** The update pre-checks
   `UsersService.findByEmail`; a live row with a different id answers
   `ConflictException` before anything is written. This deliberately makes Settings an
   email-existence oracle for authenticated users - unlike the public auth routes,
   whose identical 202s defeat unauthenticated enumeration - and it sits behind no
   throttler. Accepted for MVP because the form needs the signal (a silent or generic
   failure cannot distinguish a typo from a taken address); recorded in docs/TODO.md.
5. **Write order: user-db profile first, central email last.** No cross-database
   transaction exists, so the order is chosen for failure semantics. The 409 pre-check
   runs before either write, so a conflict leaves both stores untouched. The
   operationally riskier write (opening, possibly migrating, a per-user database)
   happens before the login-critical central one. Residual: two concurrent PATCHes to
   the same new address race the pre-check, the loser violates the unique index after
   its profile fields persisted, and answers a logged 500. Retry-safe (the retry gets
   an honest 409 or succeeds); mapping the constraint error to 409 is a possible later
   refinement, at the cost of driver-specific error sniffing.
6. **A missing profile row is a 500, not a 404.** A verified session guarantees the row
   exists (verification inserts it before clearing the payload), so absence is a broken
   invariant, not a client-addressable state - a documented 404 would invite the
   frontend to build a "create profile" flow that does not exist. The service throws a
   plain `Error` naming the user id; the global filter logs it in full and answers the
   generic 500. Consequence: neither profile operation declares a 404, and the openapi
   pins assert the exact status sets.
7. **The response carries the six fields and no timestamps** - firstName, lastName,
   email, currency, monthlyBudget (major units, converted through `money.ts` at the
   service boundary like everywhere else), monthStartDay. The sidebar footer and the
   Settings form need nothing more, and omitting the instants keeps the
   `format: 'date-time'` question PET-28's.
8. **Currency publishes as `pattern: '^[A-Za-z]{3}$'` plus an ISO 4217 description.**
   The DTO uppercases input before validation, so lowercase is accepted - the
   case-insensitive pattern is honest, and the full ISO list belongs in the description
   rather than a 180-entry enum that drifts. `monthStartDay` gets an explicit
   `@ApiPropertyOptional({ type: 'integer' })`; the derived `minimum: 1, maximum: 28`
   merge in (proven in-repo by `UpdateTransactionDto.amount`, where explicit and
   derived keys already coexist).

## Design

### New files, `backend/src/profile/`

- **`dto/profile-response.dto.ts`** - the six required fields above.
  `monthlyBudget`'s doc comment says "major units" (the openapi pin greps for it, the
  `TransactionResponseDto.amount` convention); `monthStartDay` carries
  `@ApiProperty({ type: 'integer' })` so the response schema is honest too.
- **`dto/update-profile.dto.ts`** - tri-state per decision 2. Validator stacks mirror
  `RegisterDto` field for field: names `@IsString() @IsNotEmpty() @MaxLength(100)`;
  email `@Transform(normalizeEmail(value) ?? value)` then `@IsEmail()`; currency
  uppercase transform + `@IsISO4217CurrencyCode()` + the decision-8 metadata;
  monthlyBudget `@ApiPropertyOptional({ minimum: 0, exclusiveMinimum: true })`
  `@IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(1_000_000_000)`;
  monthStartDay `@IsInt() @Min(1) @Max(28)` + the integer metadata.
- **`profile.service.ts`** - injects `UserDatabaseService` and `UsersService`.
  `get(userId, email)`: open the caller's db, select the live profile row, invariant
  `Error` when missing, map out through `fromCents`. `update(userId, sessionEmail,
  dto)`, in order: build the sparse update set (`toCents` on the way in, never
  `updatedAt` - `$onUpdateFn` owns it); detect `emailChanged` (both sides normalized);
  empty set and no email = `BadRequestException` before any db; if the email changed,
  pre-check and 409 per decision 4; write the profile (or, for an email-only PATCH,
  select the row for the response); `users.updateEmail` strictly last; respond with
  the merged result.
- **`profile.controller.ts`** - `@ApiTags('profile') @ApiBearerAuth()
  @Controller('profile')`, thin handlers over `@CurrentUser()`. GET documents
  200/401; PATCH documents 200/400/401/409 via `@ApiErrorResponse`, and its
  description states the tri-state semantics, the empty-body 400, what the 409 means,
  that changing email moves where login links are sent, and that the budget is major
  units.
- **`profile.module.ts`** - `imports: [UsersModule]` (the one real import; the
  database module is global), controller, service.

### Modified files

- **`src/users/users.service.ts`** - one new method, `updateEmail(userId, email)`: a
  single conditional UPDATE filtered on `isNull(deletedAt)`. Doc comment records that
  it expects an already-normalized address (the DTO's job everywhere in this repo) and
  that the partial unique index is the race backstop.
- **`src/app.module.ts`** - `ProfileModule` joins the imports.
- **`src/auth/dto/register.dto.ts`** - the decision-8 metadata on `currency` and
  `monthStartDay`, byte-identical to the new DTO's so the two schemas cannot drift.
- **`test/openapi.e2e-spec.ts`** - `/api/profile` joins the sorted path-list pin; a
  new describe pins exactly `['get', 'patch']` on the path, the exact status sets
  (GET `['200', '401']`, PATCH `['200', '400', '401', '409']`, every error `$ref`ing
  `ErrorResponseDto`, no 404 anywhere), `security: [{ bearer: [] }]` on both, the
  response schema (six required fields, `/major units/i` on the budget, integer
  monthStartDay), and the update schema (no `required`, the money pin extended to a
  third DTO, `format: 'email'`, nothing nullable, description matching `/409/`); an
  `it.each(['RegisterDto', 'UpdateProfileDto'])` pins the shared currency and
  monthStartDay fixes.

### Tests

- **`src/profile/profile.service.spec.ts`** (query-chain style, service constructed by
  hand): cents conversion both ways; tombstone filter rendered in the SQL; empty-dto
  400 with `getUserDb` never called; unchanged email never touches the central
  directory; foreign email 409 before any write; own email proceeds; profile write
  ordered before `updateEmail` (`mock.invocationCallOrder`); email-only PATCH selects
  instead of updating; missing row rejects with the email untouched; the update set
  never contains `updatedAt`.
- **`src/users/users.service.spec.ts`** - `updateEmail` sets exactly `{ email }` and
  its where clause carries both the id equality and `"deleted_at" is null`.
- **`test/profile.e2e-spec.ts`** (transactions e2e shape: MAILER override, the
  provision helper, two users): GET returns exactly the six keys, email lowercased,
  currency uppercased; 401 bare; a full-field PATCH persists everything in one request
  and the stored row holds integer cents; malformed email, budget 0 and -5, fractional
  and out-of-range monthStartDay, `{"firstName": null}`, an empty body and an unknown
  key are all 400 with nothing persisted; after an email PATCH the central row changed
  and a login link requested for the new address is delivered to it (AC6); the same
  bearer still works and `GET /api/auth/session` reports the new email; a PATCH to the
  other user's address is a 409 persisting nothing; a PATCH to the caller's own
  current email is a 200 no-op.

### Contract and docs

`npm run api:sync` at the repo root after the DTO work (both generated artifacts are
committed; CI fails on drift) - sanity-read the regenerated `openapi.json` for the two
fixed fields rather than trusting the merge. docs/TODO.md: the Housekeeping swagger
bullet records currency and monthStartDay as fixed and pinned (the date-time note
stays); the deferred-verification item stops saying getProfile "is PET-45's, not
this"; the `toCents` scaling bullet notes that currency is now user-changeable while
stored cents are never rescaled; a new Operational note records the accepted
residuals - the pre-check race answering 500, outstanding login links to the old
address surviving an email change (in-spec: AC6 governs subsequent links only), and no
notification to the old address. CLAUDE.md: an Architecture passage on the profile
endpoints and an updated "Not yet built".

## Implementation order

1. `register.dto.ts` metadata fixes plus their openapi pins; `api:sync`; green.
2. `UsersService.updateEmail` plus its unit tests.
3. DTOs, service, controller, module; wire into `AppModule`.
4. `ProfileService` unit tests.
5. The profile e2e suite.
6. OpenAPI pins for the new path and DTOs; `api:sync`; full run from `backend/`:
   `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.
7. Docs.

## Out of scope, flagged deliberately

- Constraint-error sniffing to turn the pre-check race into a 409.
- Login-link invalidation or an old-address notification on email change (standard
  account-takeover hygiene; one TODO line each).
- Per-currency exponents in `money.ts` (the existing TODO grows a note only).
- The Expensa-to-Spendifico rename (its own chore branch).
