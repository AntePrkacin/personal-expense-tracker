# PET-57: Refactor the frontend to daisyUI

Ticket: PET-57. Branch: `refactor/PET-57-daisyui-frontend`, worked in a git worktree. This is
the pointer-style third revision of the plan: revision 1 prescribed a full 14-component
migration (31-55 hours), revision 2 halved it by deleting dead surface (16-28 hours), and this
one delegates to the sources of truth instead of prescribing per file. The per-file reasoning
survives in this file's git history.

## Sources of truth

- **Figma**, for structure, layout and content:
  [Foundations](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=5-2),
  [Components](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=5-3),
  [Screens](https://www.figma.com/design/9bM26sKqmJTiZkej4V1Toz/Personal-Expense-Tracker?node-id=1-4).
  Per-frame links for all 24 screens are in the tech spec,
  [02-tech-spec-personal-expense-tracker.md](../project-management/02-tech-spec-personal-expense-tracker.md).
- **daisyUI**, for how everything looks: its default components and the Blueprint MCP's rules
  and component syntax.

## The instructions

1. **Refactor the whole production interface to match Figma as close as possible using default
   daisyUI.** The boundary: Figma governs structure, layout and content; stock daisyUI governs
   colour, type, radius and shadow. No re-theming daisyUI toward Figma's hex values.
2. **Production surface only, because daisyUI IS the component library now.** Nothing from
   Figma's Components page is rebuilt as a wrapper library: screens use daisyUI classes
   directly, and a local wrapper survives only where it carries real logic. Components nothing
   renders are deleted; the ticket that first needs one reaches for the daisyUI class instead.
   The four in-app views keep their empty `<main>`.
3. **Default `light` / `dark` themes, zero theme configuration**, selected automatically from
   the OS. No `dark:` variants anywhere; semantic colours resolve through the active theme.
4. **Category colours convert to the nearest daisyUI theme colour**, e.g. Figma's Category
   Orange to `--color-warning`. Collisions are acceptable; categories are decoration. The eight
   colours live behind `frontend/src/components/ui/categoryColour.ts`, whose API stays.
5. **Make the interface responsive.** This is new work: every Figma frame is a fixed 1440x1024,
   so mobile behaviour (including the sidebar collapse via `drawer`) is authored here.

## Method

Drive the work with the Blueprint MCP workflow exactly as its author intends:
`convert_figma_to_daisyui` per screen against the linked frames, with the mandatory chain
around it: `setup_expert` (already done, `workflowId` `pet-57-daisyui-refactor-1`, bound to
this worktree's `frontend/`), `rules_enforcer`, `component_syntax_expert` in batches before any
markup, and `quality_inspector` with `auditIntent` `fix_changes` after. Two execution
directives: the orchestrating session (Fable) keeps the judgment-heavy pieces (the theme, the
app shell, the sidebar) and delegates the mechanical per-screen and per-component work to
**Opus or Sonnet** subagents; and the run is **autonomous, asking no questions until every
checklist item below is done** and the gates are green.

## Constraints the repo enforces

File paths in this section are relative to `frontend/` deliberately: `npm run docs:check`
requires backticked repo-rooted paths to resolve, and these files are being deleted.

- Delete the two token-pinning test files, `src/app/globals.test.ts` and
  `src/components/ui/utilities.test.ts`, the Storybook Foundations section
  (`src/stories/foundations/`), and the story-only components with their stories and tests.
- Strip the `@theme static` token block and the `@utility` type styles from
  `src/app/globals.css`; keep the `src/app/fonts.ts` loaders, re-exposed as `@theme` tokens.
- Drop the class-coupled `toHaveClass` assertions; behaviour and accessibility tests stay green
  as they are. Storybook must keep building, since `build-storybook` is a CI step.
- Rewrite `frontend/CLAUDE.md`, revisit `frontend/src/app/CLAUDE.md`, update `docs/TODO.md`;
  `npm run docs:check` runs in the `conventions` CI job.

## Checklist

- [x] Commit this plan alone, push, open a draft PR against `main` with this checklist in the body
- [ ] Install `daisyui` and register the plugin in `frontend/src/app/globals.css`; strip the
      token layer, keeping the two font families as `@theme` tokens
- [ ] Delete the dead surface: token-pinning tests, Foundations, story-only components
- [ ] Run the Blueprint convert workflow over the app shell, the seven access screens and the
      four view headers, to the fidelity and scope boundaries above
- [ ] Remap the eight category colours onto their nearest theme colours
- [ ] Drop the class-coupled assertions, keep the behaviour tests green, fix surviving stories
- [ ] Run `quality_inspector` with `auditIntent` `fix_changes` and clear its findings
- [ ] Smoke-check every screen in light and dark, at a mobile and a desktop width, through Chrome
- [ ] Rewrite `frontend/CLAUDE.md`, revisit `frontend/src/app/CLAUDE.md`, update `docs/TODO.md`
- [ ] Green `npm run lint`, `npm test`, `npm run build`, `npm run build-storybook`, and
      `npm run docs:check`

## Out of scope

The four in-app views stay header-only. No backend contract changes, so `npm run api:sync` is
not involved and no generated artifact is touched. No new routes. `frontend/src/lib/format.ts`
is untouched. A named theme pair and a visible theme toggle are deferred; the automatic OS
behaviour ships instead.
