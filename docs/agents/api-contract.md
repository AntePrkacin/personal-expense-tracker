# The one HTTP contract

The backend is the source of truth for every request and response shape, and nothing restates
it. This file is the authority for that pipeline, because it is the one topic that spans both
apps: the backend generates `backend/openapi.json`, the frontend generates
`frontend/src/types/api.d.ts` from it, and CI fails if either drifts.

Read this before changing a DTO, a response shape, or how a page fetches. Four separate
mistakes in this pipeline still produce a spec; they just describe your response as `{}`.

## The prefix, and how the frontend reaches the backend

**The `/api` prefix lives in one place.** `backend/src/main.ts` sets a global `api`
prefix, so a controller mapped to `hello` is served at `GET /api/hello`. Note the
consequence: `GET http://localhost:3000/` returns 404, which is normal, not a broken
server. The e2e test re-applies the same prefix manually to match production, so if you
change the prefix you must change it in both places.

**Frontend to backend data flow: server-side, and currently nonexistent.** No file in
`frontend/src` fetches the backend any more. PET-19 deleted the scaffold greeting page, which
was the only caller; `/` is now the Welcome screen behind a session gate whose read is still a
stub (PET-52). The shape the first real read has to take is still fixed, though: an
**async Server Component** (or a route handler) fetching at request
time with `cache: 'no-store'`, so the session cookie never leaves the server and no CORS is
involved. CORS is enabled on the backend anyway (`main.ts`), for the case of genuinely
client-side fetches, allowing origin `FRONTEND_URL`.

## One contract, generated, and the frontend types come out of it

The backend is the source of truth and nothing restates it. `nest build` runs `@nestjs/swagger`'s CLI
plugin, `npm run api:spec` writes `backend/openapi.json` from the app's own routes, and
`npm run api:types` turns that into `frontend/src/types/api.d.ts`; `npm run api:sync` at
the root does both. A caller reads its response type out of `paths[<route>][<method>]` rather
than declaring one - the scaffold `page.tsx` demonstrated that until PET-19 deleted it, so the
first real read re-establishes the pattern. Both artifacts are **generated but committed**, for the same reason
`backend/drizzle/` and `.agents/skills/` are: everyone needs byte-identical copies and a
fresh clone must work with no extra step. It also keeps `cd frontend && npm run build`
working with no backend running, which is what lets the two CI jobs stay independent.

Four things about that pipeline that are easy to get wrong, all of which fail **quietly**:

- **Response shapes must be classes in `.dto.ts` files.** An interface erases at compile
  time, leaving nothing to hang metadata on, and the plugin only introspects files
  matching its `dtoFileNameSuffix` (default `['.dto.ts', '.entity.ts']`). Break either and
  the spec still generates - the response is just described as `{}`.
- **The generator runs against `dist/`, never `ts-node`.** The plugin is a compile-time
  transformer wired through `nest build`. `test/openapi.e2e-spec.ts` therefore asserts
  against the committed JSON rather than building a document in-process.
- **`setGlobalPrefix` must run before the document is built**, or every path loses its
  `/api` and the generated types point at URLs that 404. `API_PREFIX` in
  `src/common/api-prefix.ts` is shared by `main.ts`, `src/openapi.ts` and the e2e suite.
- **Generating the spec boots the real `AppModule`**, persistence and all.
  `src/openapi.env.ts` scrubs `TURSO_*` and sets `OPENAPI_EMIT`, which makes `AppModule`
  skip `backend/.env` - without the second half dotenv puts every scrubbed variable
  straight back, and writing a JSON file would sync against live Turso.

## Drift is a CI failure, in two halves

The backend job regenerates the spec and fails on a diff; the frontend job does the same for
`api.d.ts`. Together they prove the spec matches the code and the types match the spec. A
committed generated artifact rots silently otherwise, which is the exact failure this pipeline
exists to kill. Both steps regenerate a committed artifact and fail on a non-empty `git diff`.
Note where each one lives: the
frontend half runs in the frontend job because `openapi-typescript` only reads the
committed JSON and needs no `backend/node_modules`.

## What the document declares, and what it deliberately does not

**No operation documents a 500.** Every route can answer 500 through the global filter, so
documenting it per operation restates one non-actionable fact everywhere and widens every
generated response union; the document description in `src/openapi.document.ts` says it once
instead, and `test/openapi.e2e-spec.ts` pins that nothing declares it. Bearer auth is
declared with `addSecurity('bearer', ...)` rather than the `addBearerAuth()` helper, which
cannot be talked out of publishing `bearerFormat: 'JWT'` - these are opaque tokens, so that
would be a lie. The declaration and a bare `@ApiBearerAuth()` are two halves that fail
silently apart: miss either and the guarded operation looks public in both the spec and the
generated types.

Swagger UI is served at `http://localhost:3000/api/docs` from the same document.

## Regenerating it

From the repo root, `npm run api:sync` runs both halves in the right order. That is the
command to use after touching anything a response or request body is made of; the two
per-app scripts exist for CI, which has already built one side or the other.
