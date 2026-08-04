# Spendifico web app

Next.js (App Router) frontend for Spendifico, the personal expense tracker. React,
Tailwind CSS v4, TypeScript, tested with Jest + React Testing Library, with the design system
rendered in Storybook. Runs on **port 4200** (the NestJS API owns 3000).

```bash
cd frontend
npm install
cp .env.example .env.local   # optional: sets BACKEND_URL, defaults to http://localhost:3000
npm run dev                  # http://localhost:4200
npm run storybook            # http://localhost:6006, the design system reference
```

Every script in this app is listed in [Commands](../docs/guides/commands.md).

## Project structure

```text
src/
  app/
    layout.tsx        Root layout (html/body, fonts, metadata)
    page.tsx          '/' - redirects into the app shell
    fonts.ts          next/font loaders for the two Foundations typefaces
    globals.css       Tailwind entry + the design tokens
    globals.test.ts   Guards the tokens against drift
    icon.svg          Favicon
    (app)/            The signed-in shell: sidebar + page header, and the four
                      routed views (dashboard, transactions, insights, settings)
  components/
    ui/               Design-system primitives, mirroring the Figma Components page
  lib/
    format.ts         Money, name and period formatting for display
  types/
    api.d.ts          Generated from backend/openapi.json, committed, never hand-edited
  stories/
    foundations/      Storybook reference for colour, type, spacing, radius
.storybook/           Storybook config, importing the same font loaders as the app
```

A new route is a folder under `src/app/` containing a `page.tsx`. Shared UI is split by role:
design-system primitives go in `src/components/ui/`, and a component that only makes sense for
one feature goes beside the route that uses it. Every component's `*.test.tsx` and
`*.stories.tsx` sit **beside it**, never in separate `__tests__/` or `stories/` trees.

## Before you write your first class

**Read [`CLAUDE.md`](CLAUDE.md) in this directory.** Tailwind's own palette and type scale are
deliberately cleared, so `text-red-600` and `text-4xl` generate no CSS, fail no build, and look
exactly like a class that did nothing. That file is the authority on the design tokens, the
component conventions, the app shell and the one trap that silently breaks Tailwind's scanner.

`src/types/api.d.ts` is generated from the backend's committed OpenAPI document by
`npm run api:types`, or by `npm run api:sync` from the repo root which regenerates both halves.
It is committed, CI fails on a diff, and it must never be edited by hand: read a shape out of it
by indexing `paths` by route and status rather than restating it locally.

## Deploy on Vercel

This is a multi-app repo, so Vercel must build only this folder:

1. Import the Git repo into Vercel.
2. Set **Root Directory** to `frontend` in Project Settings.
3. Vercel auto-detects the Next.js preset (build `next build`, no extra config).
4. Add `BACKEND_URL`, and any other variables from
   [Configuration](../docs/guides/configuration.md), under **Environment Variables**, pointing at
   the deployed backend.

Every push to a connected branch then gets a preview deployment, and merges to the production
branch promote automatically. The NestJS backend is **not** deployed to Vercel; it ships
separately.

`vercel.json` in this directory pins the function region to `lhr1` to match where the backend
runs, because the default is Washington and would put a transatlantic round trip on every
server-side fetch. [Deployment](../docs/guides/deployment.md) has the reasoning and the backend
half.
