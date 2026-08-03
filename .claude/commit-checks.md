# Commit Pre-flight Checks
<!-- AUTO-GENERATED - refresh with `/commit refresh-checks` -->
<!-- Last updated: 2026-08-01 -->

This file is read by the `/commit` skill. It knows which apps exist, whether they
depend on each other, and which lint/test commands to surface before a commit.

---

## Dependency Note

`backend/` and `frontend/` are **independent** npm projects - neither imports the
other's source. A change in one app does not require re-testing the other, so
surface checks only for the app(s) whose files actually changed.

The one cross-app coupling is the HTTP contract, and it is generated rather than
hand-mirrored. A backend change to any request or response shape means running
**`npm run api:sync`** from the repo root and committing both generated files,
`backend/openapi.json` and `frontend/src/types/api.d.ts`. This is not a follow-up
task: CI regenerates both and fails the commit on a diff. If a commit touches
`backend/src/**/*.dto.ts` or a controller's `@ApiResponse` decorators and neither
generated file is staged, say so before committing.

---

## App Registry

| App        | Path        | Lint             | Test       | E2E                   | Build (= typecheck) |
|------------|-------------|------------------|------------|-----------------------|---------------------|
| `backend`  | `backend/`  | ✅ `npm run lint` | ✅ `npm test` | ✅ `npm run test:e2e` | ✅ `npm run build`  |
| `frontend` | `frontend/` | ✅ `npm run lint` | ✅ `npm test` | ⚠️ none                | ✅ `npm run build`  |

Notes:
- Neither app has a standalone `typecheck` script - `npm run build` is the
  typecheck gate (`nest build` → `tsc` for backend, `next build` for frontend).
- Backend `npm run lint` already includes `--fix`. Frontend does not: use
  `npm run lint -- --fix`.
- Frontend has no e2e suite. That is the only gap in the registry.
- Both suites use Jest, which runs once and exits. No watch-disabling flag needed.

---

## Commands per App

### `backend` - `backend/`

```bash
cd backend && npm run lint
```
```bash
cd backend && npm run build   # doubles as typecheck
```
```bash
cd backend && npm test
```
```bash
cd backend && npm run test:e2e
```

### `frontend` - `frontend/`

```bash
cd frontend && npm run lint
```
```bash
cd frontend && npm run build  # doubles as typecheck
```
```bash
cd frontend && npm test
```

---

## Full pre-push (both apps)

Run when a change spans both apps, or before opening a PR:

```bash
cd backend  && npm run lint && npm run build && npm test && cd .. && \
cd frontend && npm run lint && npm run build && npm test && cd ..
```
