# Park Pulse 2026 — workspace instructions

pnpm monorepo for **Park Pulse**, a Sydney parks and facilities atlas. The product is one
Vite/React app; everything else supports it with data, extraction scripts and shared types.

Read this before changing anything at the workspace root. When you work inside
`artifacts/park-pulse/`, its own `AGENTS.md` also applies and is more specific.

## Layout

| Path | What it is |
|---|---|
| `artifacts/park-pulse/` | The shipped app (React 19 + Vite 7 + TypeScript). See its `AGENTS.md`. |
| `lib/parks-sydney`, `lib/transport` | Shared data/model packages consumed by the app. |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db` | Shared API/DB packages. The current app is a static build and does not call them; do not wire them in without a requirement. |
| `scripts/` | Workspace-level Python/TS data extraction (`extract-councils*.mjs`). |
| `Data/` | Raw upstream downloads (large, mostly untracked). Source of truth for rebuilds, not served. |
| `FINAL_PRD_V5.md`, `DATA_INVENTORY.md`, `data-collection-requirements.md` | Product, data-source and licensing record. Check `DATA_INVENTORY.md` before adding a dataset. |
| `.kilo/plans/`, `website improvements PRD V6.md` | Planning documents. |

## Commands (run from the repo root; never invent alternatives)

```bash
pnpm install                          # pnpm only — the preinstall script rejects npm/yarn
pnpm run dev                          # app dev server
pnpm run build                        # production build
pnpm run typecheck                    # tsc build for libs, then every artifact + scripts
pnpm --filter @workspace/park-pulse test        # vitest
pnpm --filter @workspace/park-pulse test:e2e    # playwright
```

`packageManager` is pinned in `package.json`. `pnpm-workspace.yaml` sets
`minimumReleaseAge: 1440` as supply-chain defence — do not lower it to install something
sooner; use `minimumReleaseAgeExclude` only for a trusted, time-boxed fix.

## Data pipeline rules

- Derived data lives in `artifacts/park-pulse/public/data/`. Several directories
  (`trees/`, `boundaries/`, `transport/`, `councils-trees/`, `canopies/`) are generated and
  git-ignored; `stats.json`, `councils-index.json` and the council shards are also build
  output. Never hand-edit or commit them — edit the source in `Data/` or the script.
- Regeneration scripts live in `artifacts/park-pulse/scripts/` (`build-stats.mjs`,
  `build-councils.mjs`, `shard-trees.mjs`, `gtfs-convert.mjs`, `canopy-extract.mjs`).
  `dev` and `build` already run the ones whose absence would ship a broken selector.
- A dataset that is not published is **gated or unavailable, never zero**. Licence status
  is recorded per layer; do not add a dataset whose licence is unconfirmed.
- Counts come from generated stats through the layer registry, never from constants in code.

## Conventions

- TypeScript everywhere. `tsconfig.base.json` is shared; each package extends it.
- Import app code through the `@/` alias, not deep relative chains.
- Shared dependency versions go through the pnpm `catalog:` in `pnpm-workspace.yaml`.
- No new runtime dependency for something the stack already does.
- Generated files, `dist/`, `node_modules/` and test reports are never edited by hand.

## Verification before you report done

Run `pnpm run typecheck` and the tests for the package you touched. For app changes also
run `pnpm --filter @workspace/park-pulse build` and, for anything user-visible, the relevant
Playwright spec. Report the exact commands and their real output; if a step could not run,
say why.

## Commits — commit everything, every time

**Commit as you go. Nothing is left uncommitted.** Every change — a feature, a fix, a doc
tweak, a config edit, and above all any problem, defect, limitation or open question you
found — is committed on the branch you are working on before you report done. If you are
unsure whether something is worth a commit, commit it. If something is broken and you
cannot fix it, commit the finding: put it in `IMPLEMENTATION-LOG.md` ("Open issues") or
`REDESIGN-NOTES.md`, or the relevant PRD, and commit that document. An issue that exists
only in chat is a lost issue.

Git hygiene still applies, in this order of precedence:

1. **Never commit secrets.** `.env*`, tunnel credentials, tokens, keys, cookies and
   signing material stay out — they are already in `.gitignore`; keep them there.
2. **Never force-add data the rules exclude.** `/Data/` (1.3 GB of raw upstream downloads),
   generated `public/data` directories, `dist/`, `node_modules/` and scratch review output
   are ignored by policy. Their provenance is committed in `DATA_INVENTORY.md` and is
   regenerated with the committed scripts; the bytes are not the record.
3. **One logical change per commit.** Stage explicit paths — never `git add -A` or
   `git add .` — and keep unrelated work in separate commits.
4. **Make every commit buildable.** Do not commit known-broken code as a checkpoint; run the
   checks relevant to what you touched first. If a check fails and the fix is out of scope,
   commit the failing state plus a written note saying exactly what fails and why — never a
   silent red tree.
5. **Commit messages say why.** Subject in the imperative, under ~72 characters, then a body
   explaining the cause and the effect. Reference paths, not issue numbers, when there is no
   tracker.

Pushing, opening PRs and deploying are still separate, explicitly requested actions. Committing
is not.

## Working safely here

This checkout routinely holds uncommitted work across `Data/`, `artifacts/` and `lib/`.
`git status` first; never `git clean`, `reset --hard`, or revert files you did not change.
Large binary data and `.env*` files must stay out of commits and out of reports.
