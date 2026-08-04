# Troubleshooting

Symptom first. If something here sends you to another guide, the fix lives there.

## The repo and both apps

| Symptom                                                   | Cause                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:3000/` returns 404                      | Correct. A global `api` prefix means the route is `/api/hello`. The prefix is set once in `backend/src/main.ts`                                      |
| A screen renders but shows no real data                   | Expected for now. Nothing in `frontend/src` fetches the backend yet, so every screen is placeholder data until the session cookie lands              |
| `node: command not found`, but it worked via the AI agent | Claude Code can ship its own bundled Node, which your terminal does not see. Install Node yourself, see [Prerequisites](installation.md#prerequisites)              |
| Servers die as soon as the AI assistant finishes          | Expected. Processes an assistant starts belong to its session. Start `npm run start:dev` and `npm run dev` in your own terminals and leave them open |
| Commits go through with no lint or message check          | You skipped the root `npm install`, so the hooks were never installed. Check with `git config core.hooksPath`, which should print `.husky/_`         |
| ESLint cannot find its config                             | You ran it from the repo root. Each app's ESLint runs from that app's directory                                                                      |
| Ports look backwards                                      | They are asymmetric on purpose: backend **3000**, frontend **4200**. Both are wired into code and config, so do not swap them                        |
| `mise: command not found` after installing it             | You skipped the shell activation line. See [Installing mise](installation.md#optional-mise)                                                              |
| `mise run audit` lists vulnerabilities but still succeeds | Deliberate: it is a report, not a gate. See [Auditing and updating dependencies](commands.md#auditing-and-updating-dependencies)                                |
| mise gives you a different Node major than CI             | `mise.toml` and `.nvmrc` both pin the major and must be bumped together. mise does not read `.nvmrc`, so the two are independent                     |
| CI fails on "OpenAPI spec is up to date"                  | You changed a request or response shape without regenerating. Run `npm run api:sync` from the repo root and commit both files it writes              |
| The spec has a response of `{}`                           | The shape is an `interface`, or its class is not in a `*.dto.ts` file. Both make the generator's plugin skip it, and neither is an error             |

## The GitHub CLI

| Symptom                               | Fix                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gh: command not found`               | Not installed. See [Installation](installation.md#optional-the-github-cli). On macOS restart the terminal after `brew install` |
| `gh auth status` says not logged in   | Run `gh auth login`. In a container or over SSH, add `--web` or use a token via `GH_TOKEN` |
| `HTTP 403` when posting a review      | Your token lacks `repo`, or you lack write access to that repository                       |
| git still asks for a password on push | You answered "No" to the credential-helper prompt. Re-run `gh auth login` and answer Yes   |
| Two accounts, wrong one is used       | `gh auth switch`                                                                           |

