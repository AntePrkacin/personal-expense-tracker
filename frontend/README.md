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
    layout.tsx      Root layout (html/body, fonts, metadata)
    page.tsx        Home route ('/')
    fonts.ts        next/font loaders for the two Foundations typefaces
    globals.css     Tailwind entry + the design tokens
    globals.test.ts Guards the tokens against drift
    page.test.tsx   Example RTL test
```

New routes are folders under `src/app/` with a `page.tsx`. Shared UI goes in
`src/components/` (create it when you add your first shared component; it does
not exist yet).

## Design tokens

`src/app/globals.css` is the single source of truth for the design system, and
mirrors the Figma **Foundations** page. Read it before styling anything.

Two things about it are deliberate and will surprise you otherwise:

- **Tailwind's own palette and type scale are cleared** (`--color-*: initial`,
  `--text-*: initial`). `text-red-600`, `bg-zinc-100` and `text-4xl` do not
  exist and generate no CSS at all. Use the Foundations tokens - `text-body-m`,
  `bg-status-danger-soft`, `text-text-secondary` - or add a token to the theme.
  Tailwind drops unknown utilities silently, so a class that "does nothing" is
  usually a class that is not in the design.
- **The spacing scale is Tailwind's**, not a redeclared Figma one, because the
  `--spacing` namespace also drives `w-*`, `h-*` and `size-*`. The mapping
  (`Space/16` = 16px = `p-4`) is documented in `globals.css`.

Type styles are `@utility` blocks rather than theme tokens, because a style has
to carry its font-family and Tailwind's `--text-*` tokens cannot.

Only light mode is designed. There is no dark theme, and `dark:` variants should
not be added.

`npm test` runs `globals.test.ts`, which asserts every documented value is
present _and_ compiles the stylesheet through Tailwind to confirm each utility
actually generates - the failure mode a plain text assertion cannot see.

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
