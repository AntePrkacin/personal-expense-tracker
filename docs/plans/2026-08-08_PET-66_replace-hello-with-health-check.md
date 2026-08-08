# PET-66: Replace `GET /api/hello` with a dedicated `GET /api/health` liveness check

## Context

`GET /api/hello` (`backend/src/app.controller.ts`) is the leftover NestJS starter greeting
route. It is currently doing double duty as Fly's deployment liveness probe:
`backend/fly.toml`'s `[[http_service.checks]]` points `path` at `/api/hello`, and that only
works because the greeting route happens to be `@Public()`, constant, and touches no
database - the exact properties a liveness check needs, arrived at by coincidence rather than
by design.

This plan replaces it with a purpose-built `GET /api/health` endpoint: same liveness
contract (no auth, no I/O, constant `200`), honestly named. No frontend runtime code calls
`/api/hello` today - only the generated `frontend/src/types/api.d.ts` references it, which
regenerates automatically via `npm run api:sync` - so this is backend-only.

## Checklist

- [ ] Add `GET /api/health`: controller route, service method, and a `HealthResponseDto`
      returning `{ status: 'ok' }`, `@Public()`, tagged the same as the old route.
- [ ] Remove `GET /api/hello`: controller method, service method, and
      `backend/src/dto/hello-response.dto.ts`.
- [ ] Update `backend/fly.toml`'s `[[http_service.checks]]` `path` to `/api/health`, keeping its
      existing comments accurate (still one of the `@Public()` routes, still liveness-only).
- [ ] Update `backend/src/main.ts`'s and `backend/src/common/api-prefix.ts`'s comments that name
      `/api/hello` as the example route.
- [ ] Update `backend/README.md`'s dev-server example and route table.
- [ ] Update `backend/CLAUDE.md`'s `@Public()` route list (hello, register, login-link, verify)
      to name `health` instead of `hello`.
- [ ] Update existing tests that assert on `/api/hello`: `backend/src/app.controller.spec.ts`,
      `backend/test/app.e2e-spec.ts`, `backend/test/openapi.e2e-spec.ts`.
- [ ] Run `npm run api:sync` from the repo root; commit the regenerated `backend/openapi.json`
      and `frontend/src/types/api.d.ts`.
- [ ] Run backend lint, build, unit tests and e2e tests; run frontend build to confirm the
      regenerated types compile.

## Out of scope

- No frontend ticket: nothing in `frontend/src` calls `/api/hello` at runtime.
- No change to any other `@Public()` route or to the session/auth guard.
