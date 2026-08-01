# One HTTP contract: NestJS-generated OpenAPI plus generated frontend types

Plan for the item recorded in `docs/TODO.md` under "Deferred by design → OpenAPI spec,
generated frontend types, and Swagger", and in `CLAUDE.md` under "Not yet built →
Generated API types". Nothing here is implemented yet.

## Context

The backend declares its response shapes and the frontend redeclares them by hand.
`HelloResponse` lives in `backend/src/app.service.ts:7` and is copied into
`frontend/src/app/page.tsx:3` with a comment naming the backend as source of truth.
`UserResponse` (`backend/src/users/users.service.ts:23`) has no twin yet only because
nothing on the frontend consumes `/api/users`.

The failure mode is not a type error, which is the whole problem. Rename `message` to
`greeting` in `AppService` and the frontend still compiles: `res.json()` returns `any`, the
annotation on `getHello` is an unchecked assertion, and the page renders an empty box. The
duplicated `interface` buys autocomplete, not safety.

**Why do this now, with only three endpoints.** Tech spec section 4 lists **19 operations**
(`register`, `requestLoginLink`, `verifyLoginLink`, `getProfile`,
`updateProfileAndPreferences`, `getDashboardSummary`, `listTransactions`,
`createTransaction`, `getTransaction`, `updateTransaction`, `deleteTransaction`,
`listCategoriesWithStats`, `createCategory`, `updateCategory`, `deleteCategory`,
`getAllocationSummary`, `getInsightSet`, `generateInsights`). Three exist. The durable part
of this work is the wiring: the plugin, the spec-emitting script, the generator, the CI
drift gate. The throwaway part is the annotations on `POST /api/users` and
`GET /api/users/:id`, which `docs/TODO.md` already expects auth to reshape or delete. Doing
the wiring while the frontend consumes exactly one endpoint means the blast radius is one
file, and every one of those 19 operations then costs nothing extra. Doing it after means
hand-mirroring 19 shapes first and retrofitting later.

## Decisions

- **Code-first, not spec-first.** The backend exists and is already the source of truth,
  and `CreateUserDto` already carries the `class-validator` decorators a generator needs.
  Hand-authoring OpenAPI YAML would add a second artifact with nothing enforcing that Nest
  matches it, and NestJS server-stub generation from a spec is poor. The spec becomes a
  build output, like `backend/drizzle/` migrations.
- **Types only on the frontend, no generated client.** `openapi-typescript` emits a
  `.d.ts` and no runtime. This is not a preference: `frontend/src/app/page.tsx` fetches in
  an async Server Component with `cache: 'no-store'`, and a generated client that wraps
  `fetch` fights Next.js caching semantics. Types-only keeps the call sites idiomatic Next.
  `openapi-fetch` is the one optional upgrade worth considering later, because it delegates
  to global `fetch` and passes `RequestInit` straight through, so `cache` and `next` options
  survive.
- **Commit the generated spec and the generated types.** Same rule and same reason as
  `backend/drizzle/` and `.agents/skills/`: generated, but everyone needs byte-identical
  copies and a fresh clone must work with no extra step. It also means
  `cd frontend && npm run build` never needs a running backend, which keeps the frontend CI
  job independent of the backend job.
- **Drift is a CI failure, not a convention.** A committed generated artifact rots silently
  unless something checks it, which is exactly the failure this plan exists to kill.
  Regenerate in CI and fail on a non-empty `git diff`.
- **Response shapes become classes.** Unavoidable, see step 2.
- **The uniform error shape gets into the spec too.** `AllExceptionsFilter` returns
  `{ statusCode, message, error, timestamp, path }` on every failure. A spec that describes
  only happy paths documents half the contract.

**Non-goals.** No spec-first workflow. No generated HTTP client. No hand-written
`@ApiProperty()` on fields where the CLI plugin can derive them. No treating the two
`/api/users` routes as stable API worth polishing; annotate them enough to prove the
pipeline and expect them to change.

## Steps

### 1. Install and wire the plugin

`cd backend && npm install @nestjs/swagger` (the v11 line matches the `@nestjs/*` 11.1.28
already installed). **Verify at install** whether a separate UI package is needed: older
majors required `swagger-ui-express` for Express, recent ones bundle their own assets. Add
it only if the docs route 404s without it.

Turn on the CLI plugin in `backend/nest-cli.json`, which today has only
`compilerOptions.deleteOutDir`:

    "compilerOptions": {
      "deleteOutDir": true,
      "plugins": [
        {
          "name": "@nestjs/swagger",
          "options": { "introspectComments": true }
        }
      ]
    }

The plugin reads the TypeScript AST at build time and derives schema properties, required
vs optional, and the `class-validator` constraints, so `CreateUserDto` needs no new
decorators at all. `introspectComments` turns the existing JSDoc on `monthlyBudget`
("Major units (e.g. 2000.50). Stored as integer cents.") and `monthStartDay` ("Capped at 28
so the day exists in every month.") into schema descriptions, which is free documentation
already written.

### 2. Responses must be classes, in `.dto.ts` files

This is the crux and the reason Swagger alone was never worth adding. `HelloResponse` and
`UserResponse` are `interface` declarations, which erase at compile time: there is no
runtime object for the plugin or for `SwaggerModule` to read, so a spec generated today
would describe request bodies and return `200 OK` with no schema at all.

Two changes, both small:

- `backend/src/users/dto/user-response.dto.ts` exporting `class UserResponseDto` with the
  eight current fields. `UsersService` and `UsersController` import it as their return type
  instead of the local `UserResponse` interface.
- `backend/src/dto/hello-response.dto.ts` (or alongside `app.service.ts`) exporting
  `class HelloResponseDto`.

The `.dto.ts` suffix is load-bearing: the plugin only introspects files matching its
`dtoFileNameSuffix` option, which defaults to `['.dto.ts', '.entity.ts']`. A response class
left inside `users.service.ts` is invisible to it. Either use the suffix or extend the
option; the suffix is cleaner and matches where `create-user.dto.ts` already lives.

Then `@ApiResponse` (or the shorthand `@ApiOkResponse` / `@ApiCreatedResponse`) on each
handler pointing at the class, plus the failure statuses the code actually throws: 409 on
`POST /api/users` (duplicate email) with 400 from the global `ValidationPipe`, and on
`GET /api/users/:id` both 404 (unknown or deleted id) and 400, because `ParseUUIDPipe`
(`users.controller.ts`) rejects a malformed id before the handler runs. That second 400 is
easy to miss precisely because no validation decorator declares it anywhere.

### 3. An error DTO worth sharing

`backend/src/common/dto/error-response.dto.ts`, mirroring `AllExceptionsFilter` exactly:
`statusCode: number`, `message: string | string[]`, `error: string`, `timestamp: string`,
`path: string`.

`message` is genuinely a union, not sloppiness: `class-validator` failures come back as an
array of strings and everything else as a single string. The frontend has to handle both,
so the spec has to say both.

That union is also the one place expected to need a hand-written annotation: the CLI
plugin derives plain types well but not `string | string[]`, so this field carries an
explicit `@ApiProperty({ oneOf: ... })`. Consistent with the non-goals above, which ban
hand-written `@ApiProperty` only where the plugin can derive the type.

Worth a tiny decorator helper (`@ApiErrorResponse(400, 404, 409)`) that stamps the same
`content` block onto several statuses at once, rather than repeating `@ApiResponse` five
times per handler. Keep it in `src/common/`.

### 4. Emit the spec to disk, from the build output

Add `backend/src/openapi.ts`: create the app with
`NestFactory.create(AppModule, { logger: false })`, call `app.setGlobalPrefix('api')`, build
a `DocumentBuilder` document, `writeFileSync` it, `await app.close()`. Never `listen()`.

Two traps here, both silent:

- **`setGlobalPrefix('api')` must run before `SwaggerModule.createDocument`.** The document
  paths are read from the registered routes, so forgetting it produces a spec where every
  path has lost its `/api`, and the generated frontend types then key off wrong URLs. This
  is the same duplication the e2e suite already lives with, which re-applies the prefix by
  hand for the same reason. Both places now have to match `main.ts`.
- **The generator must run against `dist/`, never `ts-node` over `src/`.** The plugin is a
  compile-time transformer wired through `nest build`. Run the script with `ts-node` and the
  plugin never fires, so the spec comes out with empty schemas and looks merely disappointing
  rather than broken. Hence the script lives in `src/` and must **not** be added to the
  `exclude` list in `tsconfig.build.json` (unlike the two `drizzle.*.config.ts` entries
  already there).

Scripts in `backend/package.json`:

    "api:spec": "nest build && node dist/openapi.js"

Write the document to `backend/openapi.json` and commit it.

Separately, serve the interactive UI from `main.ts` with
`SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true })` so it lands at
`/api/docs` rather than `/docs`. The Swagger route is not covered by `setGlobalPrefix` on
its own, and `useGlobalPrefix` is what opts it in. This has independent value in a teaching
repo where people poke at the API by hand.

### 5. Generate the frontend types

`cd frontend && npm install -D openapi-typescript`, then:

    "api:types": "openapi-typescript ../backend/openapi.json -o src/types/api.d.ts"

Reaching across into `backend/` is fine and deliberate: this is a multi-app repo with both
apps checked out together, not two independently released packages, and reading a committed
JSON file introduces no build-order coupling.

Then rewrite `frontend/src/app/page.tsx`: delete the local `interface HelloResponse` and its
comment, and derive the type from the spec instead, something like

    type HelloResponse =
      paths['/api/hello']['get']['responses'][200]['content']['application/json']

A local alias is worth keeping so the fetch helper stays readable. The important part is
that the alias now resolves into generated types rather than restating them.

### 6. Root convenience script

The root `package.json` owns repo-wide tooling, so add there:

    "api:sync": "npm --prefix backend run api:spec && npm --prefix frontend run api:types"

One command regenerates the whole chain. This is the command referenced in the docs and in
CI, so nobody has to remember the two halves or their order.

### 7. Close the drift gate in CI

In `.github/workflows/ci.yml`, add a step to the **backend** job after Build:

    - name: OpenAPI spec is up to date
      run: |
        npm run api:spec
        git diff --exit-code --stat openapi.json

That catches a backend change that forgot to regenerate. The frontend half needs the
generated types checked the same way, but the frontend job has no `backend/node_modules`,
so run it in the backend job too (after the step above, `npm --prefix ../frontend ci` is
wasteful) or add a small fourth job that installs both. **Decide during implementation;**
the cheap version is to check only `openapi.json` in CI and rely on
`cd frontend && npm run build` failing when the committed types no longer match the code
that uses them. That is weaker but not nothing, since `next build` is the frontend
typecheck gate.

### 8. Keep the formatters and linters off the generated files

Not optional housekeeping, because both generated files land inside globs that already
match. Do this in the same commits that create them.

`.lintstagedrc.js` third glob, `{backend,frontend}/**/*.{js,html,css,scss,json,md}`, matches
`backend/openapi.json`, so the pre-commit hook would reformat it seconds after the generator
wrote it, guaranteeing a stale-spec CI failure on a commit that changed nothing. Its second
glob, `frontend/**/*.{ts,tsx}`, matches `frontend/src/types/api.d.ts` and would run
`eslint --fix` over it as well.

Two edits:

- Add both paths to the existing `.prettierignore`, under the "Generated artefacts" section
  that already holds `package-lock.json` and the build directories for this exact reason.
  Prettier honours `.prettierignore` even for explicitly passed files, so this covers both
  the hook and the future repo-wide `prettier --check` gate.
- Add `src/types/api.d.ts` to `globalIgnores` in `frontend/eslint.config.mjs`, which already
  lists `next-env.d.ts` for the same reason: a generated declaration file is not code anyone
  can fix in response to a lint error.

### 9. Tests

- Extend `backend/test/app.e2e-spec.ts` or add `test/openapi.e2e-spec.ts` asserting the
  document has the three paths, that `/api/users` POST documents 201/400/409 and GET
  404/400, and that `UserResponseDto` carries `monthlyBudget`. **This must be an e2e test against the built
  output, not a unit spec.** The plugin does not run under `ts-jest`, so a unit spec would
  see no metadata and fail for a reason that has nothing to do with the code being wrong.
  (Wiring the plugin into ts-jest `astTransformers` is possible if a unit spec is ever
  really wanted.)
- Existing suites should be untouched. `app.e2e-spec.ts` and `users.e2e-spec.ts` assert
  response bodies, not types, so converting the interfaces to classes cannot move them.
- `frontend/src/app/page.test.tsx` mocks `fetch`, so it is unaffected by the type change.
  Worth confirming rather than assuming.
- One assertion that a real failure body (e.g. the 400 from an invalid `POST /api/users`)
  has exactly the keys `ErrorResponseDto` declares. That is the only thing keeping the
  filter and its DTO in step; see the matching risk below.

### 10. Docs on landing

- `CLAUDE.md`: delete "Generated API types" from **Not yet built**; rewrite the
  "API response contract is hand-mirrored, and that is a known wart" paragraph under
  Architecture into a description of the generated pipeline; add `api:spec` / `api:types` /
  `api:sync` to Common commands; note that `backend/openapi.json` and
  `frontend/src/types/api.d.ts` are generated-but-committed, in the same breath as
  `drizzle/`.
- `README.md`: the `api:sync` command and the `/api/docs` URL.
- `docs/TODO.md`: remove the "OpenAPI spec, generated frontend types, and Swagger" entry
  from **Deferred by design**, since the whole point of that entry was that the two halves
  must land together. Add a Housekeeping note if the frontend drift check was left out of
  CI in step 7.

## Suggested commits

Conventional Commits are enforced, and step 2 is a refactor that stands on its own.

1. `refactor(backend): make api response shapes classes in dto files`
2. `feat(backend): generate an openapi spec and serve swagger at /api/docs`
3. `feat(frontend): derive api types from the generated openapi spec`
4. `ci: fail when the committed openapi spec is stale`
5. `docs: describe the generated api contract`

## Verification

1. `cd backend && npm run lint && npm run build` (build is the typecheck gate).
2. `npm run api:spec`, then read `backend/openapi.json` by hand and confirm: three paths,
   each keyed **with** the `/api` prefix; `CreateUserDto` shows `maxLength: 100` on the name
   fields, `format: email`, the 1..28 bound on `monthStartDay`, and the JSDoc as
   descriptions; the 200/201 responses have real schemas rather than empty objects; 400,
   404 and 409 reference the error shape, including the `ParseUUIDPipe` 400 on
   `GET /api/users/:id`.
3. `npm test && npm run test:e2e`.
4. `npm run start:dev`, open `http://localhost:3000/api/docs`, and POST a user through the
   UI. Confirm the 409 on a repeat matches what the spec claims.
5. `cd frontend && npm run api:types && npm run build && npm test`. The build is the real
   check that the generated types are consumable.
6. **Prove the gate works, which is the actual deliverable.** Rename a field in
   `UserResponseDto`, run `npm run api:sync`, and confirm `git diff` is non-empty. Rename
   `message` in `HelloResponseDto`, run `api:sync`, and confirm
   `cd frontend && npm run build` now **fails**. Revert both. If that second check does not
   fail, the pipeline is decorative and something in step 5 is wrong.
7. Both apps still work together end to end: backend on 3000, frontend on 4200, greeting
   renders.

## Known risks and accepted trade-offs

- **Committed generated artifacts drift if the gate is skipped.** Mitigated by step 7, and
  the same bet the repo already makes for `backend/drizzle/` and `.agents/skills/`. The
  weaker frontend half of the gate (step 7) is the soft spot; record it in
  `docs/TODO.md` if it ships that way.
- **The CLI plugin is build-time magic.** Schemas appear without visible decorators, which
  is pleasant until it silently does not happen. Two known ways to lose it: running the
  generator under `ts-node`, and a response class outside a `.dto.ts` file. Both are called
  out above and both fail quietly, producing a valid-looking spec with empty schemas.
  Verification item 2, reading the generated JSON by hand once, exists to catch exactly this.
- **The error DTO is itself a hand-mirror.** `ErrorResponseDto` restates what
  `AllExceptionsFilter` builds by hand, and nothing structural forces the two to stay in
  step: a field added to the filter is invisible to the spec until someone remembers the
  DTO. A far smaller surface than the problem this plan kills, but the same category of
  wart. The e2e assertion in step 9 comparing a real failure body against the DTO's keys
  is the cheap guard.
- **The prefix is now duplicated three ways.** `main.ts`, `test/app.e2e-spec.ts`, and the
  new `src/openapi.ts` each call `setGlobalPrefix('api')`. A shared constant or a small
  `configureApp(app)` helper used by all three would fix it properly and is arguably worth
  doing as part of step 4.
- **Annotating endpoints that auth will delete.** Accepted and deliberate: the wiring is
  what lasts, the annotations on the two `/api/users` routes are cheap and expected to go.
- **`monthlyBudget` crosses the boundary as major units** while the column is
  `monthly_budget_cents`. The spec describes the API, so major units is correct, and the
  JSDoc-derived description is what stops a frontend developer from guessing wrong. Nothing
  about this work changes the `Math.round(v * 100)` caveat already in `docs/TODO.md`.
- **A generated `.d.ts` is only as honest as the backend's own annotations.** If a handler
  returns something its `@ApiResponse` does not describe, the spec is confidently wrong and
  the frontend now trusts it. `nest build` catches this only where the declared return type
  is the DTO class; keep handler return types explicit rather than inferred.
