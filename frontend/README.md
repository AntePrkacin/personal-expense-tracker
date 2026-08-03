# Frontend - Decode Academy Demo

Next.js 16 (App Router) single-page-ish app for the Decode Academy Demo teaching
repo. React 19, Tailwind CSS v4, TypeScript, tested with Jest + React Testing
Library. Runs on **port 4200** (the backend NestJS API owns 3000).

## Getting Started

```bash
cd frontend
npm install
npm run dev          # http://localhost:4200
```

Optional local config:

```bash
cp .env.example .env.local   # sets BACKEND_URL for the backend
```

Edit `src/app/page.tsx`; the page hot-reloads on save.

## Scripts

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Dev server on :4200                       |
| `npm run build`      | Production build                          |
| `npm start`          | Serve the production build on :4200       |
| `npm run lint`       | ESLint (`eslint-config-next`)             |
| `npm test`           | Unit tests (Jest + React Testing Library) |
| `npm run test:watch` | Tests in watch mode                       |

## Project Structure

```text
src/
  app/
    layout.tsx     Root layout (html/body, metadata)
    page.tsx       Home route ('/')
    globals.css    Tailwind entry + theme tokens
    page.test.tsx  Example RTL test
```

New routes are folders under `src/app/` with a `page.tsx`. Shared UI goes in
`src/components/` (create it when you add your first shared component; it does
not exist yet).

Data access that talks to the backend should live in a small typed module, and
the types it uses are generated rather than written. `src/types/api.d.ts` comes
from `backend/openapi.json` via `npm run api:types` (or `npm run api:sync` from
the repo root, which regenerates both). It is committed and must never be edited
by hand; CI regenerates it and fails on a diff. Read a shape out of it the way
`src/app/page.tsx` does, indexing `paths` by route and status, rather than
restating it locally.

## Deploy on Vercel

This repo is a multi-app repo, so Vercel must build only this folder:

1. Import the Git repo into Vercel.
2. Set **Root Directory** to `frontend` in Project Settings.
3. Vercel auto-detects the Next.js preset (build `next build`, no extra config).
4. Add `BACKEND_URL` (and any other env vars) under **Environment
   Variables**, pointing at the deployed backend.

Every push to a connected branch then gets a preview deployment; merges to the
production branch promote automatically. The NestJS backend is **not** deployed
to Vercel - it ships separately.
