# ParkPulse PRD — FINAL (V6.0, complete rewrite of V5)

**Version:** 6.0 (supersedes V5.0 in place — this file is the single source of truth)
**Date:** 2026-10-14
**Status:** READY FOR PLANNING → implementation only via `/plan` (see §7)
**Scope:** Full product, uniform depth: Greater Sydney multi-council expansion across 8 phases
**Architecture:** React 19 + Vite + TypeScript + Leaflet SPA (`artifacts/park-pulse`) + Node.js data pipeline scripts + static GeoJSON data layer; PostgreSQL gated (see Phase 8 TBD)

---

## 0. Document Control & Authoring Contract

| Field | Value |
|---|---|
| Authoring method | `/prompt-optimizer` diagnosis → `/plan-prd` template → `product-capability` SRS-grade depth → `article-writing` structure → `living-docs-governance` doc roles |
| Supersedes | FINAL_PRD_V5.md content (V5.0) — overwritten in place per user decision |
| Consumed by | `/plan FINAL_PRD_V5.md` (one delivery milestone per invocation) |
| Style rules | Checkbox requirements (`- [ ]` / `- [x]`), tables over prose, no marketing language, no invented facts (see §3.7) |
| Deviation notice | Standard `/plan-prd` forbids implementation detail; this PRD **intentionally binds file paths, component names, and tool invocations** because the authoring instruction requires zero creative latitude for the implementing agent. Requirements ("what/why") and binding constraints ("exactly how") are separated into distinct subsections per phase. |

---

## 1. Product Frame (requirements only)

### 1.1 Problem
ParkPulse visualizes parks, trees and amenities for **City of Sydney only (101 km²)** while the product thesis requires **Greater Sydney (38+ councils, ~12,367 km²)**. Users cannot select councils, compare councils, or see data outside the single LGA; data acquisition, sharding and search all assume one council. Leaving this unsolved means every Phase 2–8 feature ships against a single-LGA dataset and must be reworked later.

### 1.2 Evidence
- `Data/LGAs_Sydney_and_surrounds.json` contains full polygon boundaries for **35 councils** (extracted by `scripts/extract-councils-v2.mjs`) — acquisition of the *boundary* problem is already solved and verified on disk.
- `artifacts/park-pulse/public/data/` already serves per-layer data with a caching + viewport-culling architecture proven at 1,605-feature (Blacktown) and 48,999-point (trees) scale.
- `DATA_INVENTORY.md` documents 18 datasets (~1.4 GB) collected and ready for processing.
- Assumption — needs validation via council portal downloads (Phase 2) for per-council parks/trees/canopy availability.

### 1.3 Users
- **Primary:** A Greater Sydney resident/hiker choosing parks by council area; needs council-scoped results, comparable stats, and a map that renders multiple council areas at once.
- **Secondary:** The operator (developer) maintaining 8 phases of data pipelines across 35+ councils.
- **Not for:** Job seekers or recruiters until the Oracle dataset exists (Phase 6 TBD gates).

### 1.4 Hypothesis
We believe **council selection + multi-council rendering over the extracted boundary set** will **make ParkPulse usable region-wide instead of single-LGA** for **Greater Sydney residents**.
We'll know we're right when **a user can select ≥2 councils, see both boundaries color-coded on the map, and get a results list + stats panel scoped to exactly those councils, with no console errors and a11y checks passing**.

### 1.5 Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Council coverage on disk | 35/35 boundaries render; ≥38 by end of Phase 2 | `councils-index.json` entry count; acceptance checks per phase |
| Council select latency | < 300 ms from click to boundary paint (cached) | Playwright timing assertion in `e2e/explore.spec.ts` |
| Results correctness | 100% of listed parks fall inside a selected council (point-in-polygon) | Vitest unit test with fixture geometry |
| Regression | Existing 4 vitest suites + 3 Playwright specs stay green | `pnpm test`, `pnpm test:e2e` |
| Accessibility | 0 axe violations on new controls (WCAG 2.2 AA) | `e2e/a11y.spec.ts` + `get_audit_checklist` |
| Bundle/data budgets | Index ≤ 25 KB; each boundary ≤ 80 KB; no new initial-load payload | `build-councils.mjs` output report |

---

## 2. Detected Project Context (facts — do not re-derive, do not contradict)

| Area | Fact |
|---|---|
| Monorepo | pnpm 12.6 workspace; root scripts `pnpm dev/build/serve/typecheck` delegate to `@workspace/park-pulse` |
| App | `artifacts/park-pulse`: React 19.1, Vite, TypeScript ~5.9, wouter router, lazy routes (`Home`, `Explore`, `About`) |
| Map | Leaflet 1.9 + leaflet.markercluster; custom canvas/divIcon markers; `preferCanvas` |
| Styling | Hand-written `pp-*` classes in `src/index.css` (1,122 lines) with `data-theme` variants (default/dark/sunset/neon/minimal/satellite); Tailwind v4 present as build tool; shadcn/ui fully vendored at `src/components/ui` (57 components, `components.json` new-york style) — **but Explore uses only `pp-*` markup** |
| State/async | Local `useState`/`useMemo`; `fetchWithCache(url, ns)` localStorage cache (7-day TTL, **2 MiB per-entry cap**); `useCulledMarkerLayer` for viewport-culled point layers |
| Popups | Built with DOM APIs + `textContent` — **never interpolate dataset strings into HTML** (XSS rule) |
| A11y pattern | Visually-hidden input + visible checkmark, `focus-visible` rings, keyboard shortcut registry (`/ ? S C F T L D W G N P M 1-4`) |
| Tests | Vitest (`src/utils/*.test.ts`, 4 suites, jsdom) + Playwright (`e2e/explore.spec.ts`, `a11y.spec.ts`, `contrast.spec.ts`; workers=1; `vite preview` on port 4321; dark colorScheme default). **@testing-library/react is NOT installed — do not add it; component behavior is proven via Playwright.** |
| Data on disk | `Data/councils.json` (35 councils, 20 MB full-res), `Data/LGAs_Sydney_and_surrounds.json`, app data at `artifacts/park-pulse/public/data/` (Parks 418 features, Blacktown 1,605, trees 48,999 sharded, plus toilets/transport/fountains/dog/NPWS) |
| Council build | `artifacts/park-pulse/scripts/build-councils.mjs` → `public/data/boundaries/councils-index.json` + `public/data/boundaries/councils/{lga_id}.geojson` (Douglas–Peucker, ≤ 80 KB each). **Output on disk was generated before the km² area fix — must be regenerated and verified (Phase 1 gate P1.0).** |
| Trap | Repo-root `public/data/boundaries/nsw-lgas.geojson` (5.7 MB) is **not served** by the app (vite `publicDir` = `artifacts/park-pulse/public`). Never reference it from app code. |
| Network | Sandbox blocks outbound network; fetch/convert scripts are authored locally, run on a connected machine; no API keys anywhere |
| Git | `main`; commits small and phase-scoped; never commit `dist/`, `test-results/`, generated shards/geojsons |

---

## 3. BINDING TOOLING CONTRACT

> Every phase below references this contract. "Invoke X" means: read the skill/command file and follow it as written. No phase may skip its mandated tools.

### 3.1 MCP mandates (the 3 connected servers — exact tools, exact triggers)

| MCP | Tool(s) | Mandatory when | Required output |
|---|---|---|---|
| **context7** | `resolve-library-id` (`query`, `libraryName`) → `query-docs` (`libraryId`, `query`, `language:"TypeScript"`), ≤ 3 calls per question | Before writing code against **any** third-party API: Leaflet (`GeoJSON`, `fitBounds`, `tooltip`, `interactive`), React 19 hooks, Vite config, Vitest, Playwright, wouter, leaflet.markercluster | Cite the library ID + doc snippet in the task's plan/PR description. If docs conflict with memory, **docs win** (per `documentation-lookup` skill) |
| **shadcn** | `search_items_in_registries` → `get_item_examples_from_registries` → `get_add_command_for_items` | Before building **any** new interactive UI control: search first whether the vendored `src/components/ui` or a registry item already does it (`search-first` skill: adopt > extend > build) | Record adopted component or explicit "hand-built, reason" in the plan |
| **shadcn** | `get_audit_checklist` | **After** every new/modified component file set (tool's own instruction: run after all steps complete) | Checklist executed item-by-item; failures fixed before the phase's acceptance run |
| **shadcn** | `get_project_registries`, `list_items_in_registries`, `view_items_in_registries` | When adding a component dependency to non-Explore surfaces (Phase 6 dashboard) | Chosen item name + version |
| **radix-ui** | `primitives_list_components` → `primitives_get_component_documentation(componentName)` | For any A11y-critical widget hand-built in `pp-*` style (dropdown/listbox, tooltip, checkbox, tabs, segmented control): Radix's documented **behavior contract is the spec** (arrow-key nav, Home/End, typeahead, Esc, focus return, ARIA roles) | Behavior table in the component's test plan; verified by Playwright keyboard test |
| **radix-ui** | `themes_get_component_documentation`, `themes_get_component_source`, `colors_list_scales` | Layout/styling reference for stats panels, legends, color-coded swatches (Phase 1 legend colors, Phase 6 dashboard) | Reference noted; final visuals must still use `pp-*` theme vars |

**Locked decision — where shadcn components are used:** Inside the Explore sidebar (Phases 1, 6 grid), new controls are hand-built with `pp-*` classes to keep zero layout/theme disruption, but must satisfy the Radix behavior contract obtained via **radix-ui MCP** and pass **shadcn `get_audit_checklist`**. On non-Explore surfaces (dashboard, modals, settings), consume already-vendored `src/components/ui/*` components. Never install new UI libraries.

### 3.2 ECC skill mandates (skill names are literal; invoke by these names)

| Stage | Required skills | Purpose |
|---|---|---|
| Requirements | `prompt-optimizer`, `product-lens`, `product-capability` | Frame why, convert PRD→capability contracts before multi-service work |
| Research | `search-first`, `deep-research`, `documentation-lookup`, `iterative-retrieval` | Existing solutions/deps before code; fresh docs via context7; web research for council portals |
| Planning | `blueprint` (multi-session phases), `writing-plans` (task-level plans), `plan-canvas` (human annotation review) | One-PR-sized steps, bite-sized tasks with checkable results |
| Implementation | `tdd-workflow`, `frontend-patterns`, `react-patterns`, `react-performance`, `coding-standards`, `error-handling`, `vite-patterns`, `accessibility`, `frontend-a11y`, `design-system` | Failing test first; hooks discipline; WCAG 2.2 AA; token-consistent styling |
| Data pipeline | `nodejs` conventions via `coding-standards`, `database-migrations`, `postgres-patterns` (Phase 8 only), `contract-first` (Phase 8 schema) | Deterministic scripts, machine-checkable contracts |
| Review | `security-review`, `requesting-code-review` → `receiving-code-review` | Adversarial review; technical rigor on feedback |
| Verification | `verification-loop`, `verification-before-completion`, `systematic-debugging`, `browser-qa`, `e2e-testing` | Six-phase PASS/FAIL report; evidence before any "done" claim |
| Documentation | `/update-docs`, `living-docs-governance`, `article-writing`, `brand-voice` | Sync docs from source of truth; keep doc roles (constitution/map/status/history); long-form copy in the voice derived from existing repo docs |
| Session/git | `using-git-worktrees`, `git-workflow`, `finishing-a-development-branch`, `save-session`/`resume-session` commands | Phase isolation, resumable multi-session delivery |

### 3.3 ECC command mandates (workflow order)

```
/plan-prd FINAL_PRD_V5.md      # only if requirements change → regenerates §1 with the 4-gate interview
/blueprint "<phase objective>"  # only when a phase spans > 2 sessions
/plan FINAL_PRD_V5.md           # picks next pending milestone → writes .claude/plans/*.plan.md; WAIT for confirm
/plan-canvas .claude/plans/*.plan.md   # optional human annotation pass
/react-test | /test-coverage    # TDD gate for component/util work
/quality-gate <file>            # formatter gate, remediate per report
/code-review                    # local uncommitted changes, after each phase's implementation
/react-review                   # hook correctness + render performance on TSX changes
/security-scan                  # Phase 7 and whenever handling user input/secrets
/test-coverage                  # coverage gap fill toward 80%
/update-docs                    # sync DATA_INVENTORY.md / README from source after pipeline changes
/save-session | /resume-session # end/start of every phase
```

### 3.4 Workflow & model routing (from prompt-optimizer scope analysis)

| Phase scope | Route |
|---|---|
| TRIVIAL–LOW (single util, CSS tweak) | Direct execution, then `verification-loop` |
| MEDIUM (one component + tests) | `/plan` first → `tdd-workflow` → `/code-review` → `verification-loop` |
| HIGH (Explore integration, sharding UI) | `/plan` + `writing-plans`; main session plans, subagent executes tasks (`subagent-driven-development`) |
| EPIC (Phases 2, 6, 8 spanning sessions) | `blueprint` skill for the multi-session plan; each phase = 1 PR; `/save-session` between |

**Multi-prompt splitting (mandatory for EPIC phases):** Prompt 1 = research+plan (`search-first`, `/plan`); Prompt 2..N = one phase-task each ending with `verification-loop` PASS; Final prompt = cross-phase `/code-review` + full `pnpm typecheck && pnpm test && pnpm test:e2e`.

### 3.5 Writing-skills mandate
- `article-writing` — all long-form docs (README, About copy, data-source guides): derive voice from existing repo docs first; no generic AI phrasing.
- `brand-voice` — run once to profile the existing V5/in-repo voice; reuse profile for all user-facing strings and docs.
- `writing-plans` — mandatory header/format for every implementation plan (`> REQUIRED SUB-SKILL: superpowers:subagent-driven-development …`), tasks right-sized to one test cycle, steps one action with a checkable result.
- `writing-skills` — only if a phase decision must be encoded as a new project skill; follow its SKILL.md verification steps before committing the skill.
- `living-docs-governance` — after every phase: assign the change to the right doc role; do not create new root files.

### 3.6 Prompt discipline
- Every subagent/orchestrated prompt is drafted and critiqued with `prompt-optimizer` rules first: intent, scope, missing-context check, acceptance criteria, explicit out-of-scope, verification steps. No bare one-line prompts to subagents.

### 3.7 Anti-creativity rules (never violate)
1. **Never invent data.** Missing values render as `—` plus a "pending" tooltip and a row in the §8 TBD register. No placeholder numbers, no lorem, no fabricated council/job/canopy values.
2. **Never add a dependency** without `search-first` (check what exists) + context7 doc lookup for its API.
3. **Never interpolate dataset strings into HTML**; use DOM APIs/`textContent` (existing pattern).
4. **Never fetch from the app code** anything outside `import.meta.env.BASE_URL`-prefixed local data (except the existing OSM/Esri tile and Nominatim endpoints).
5. **Never commit** generated shards/geojsons, `dist/`, `test-results/`, or data > 100 KB into git without an explicit user gate. *(Gate opened 2026-10-21: the three derived runtime layers under `public/data/` — `boundaries/`, `transport/`, `councils-trees/`, ~10 MB together — are committed so a fresh clone and the Netlify build can serve the real site. Their 1.3 GB of raw archives stay untracked; see `.gitignore` and `DATA_INVENTORY.md`.)*
6. **Never claim completion** without the `verification-loop` report attached (`verification-before-completion`).
7. **Never change** `pp-*` theme variable names or existing component signatures without a `/plan` that names the blast radius.
8. **Never bypass a failing gate** by weakening assertions, skipping tests, or adding suppressions.

---

## 4. Phase Requirements (uniform depth: Goal / Entry gate / FRs / Contracts / Acceptance / Exit gate / Tooling delta)

### Phase 1 — Multi-Council Governance UI  *(Week 1)*

**Goal:** A user can pick councils (single or multi), see color-coded boundaries on the map, and get results + stats scoped to the selection.
**Entry gate:** `councils-index.json` regenerated by `build-councils.mjs` with `area_km2 > 0` for all 35 entries (P1.0).

**Functional requirements**
- [x] **FR1.1** CouncilSelector dropdown: lists all councils sorted by `priority_rank` ascending (nulls last) then `display_name.localeCompare(..., { sensitivity: "base" })`; priority councils carry a "Priority" badge; search box filters on `display_name`, raw `name`, and `lga_id`.
- [x] **FR1.2** Council name translation: UI shows `display_name` everywhere (raw `name` only in tooltip/details); aliases resolve (e.g. "Sydney"→City of Sydney, "Hornsby"→Hornsby Shire Council, "Ku-ring-gai"→Ku-ring-gai Council).
- [x] **FR1.3** Single mode: selecting a council replaces the selection. Multi mode: selection toggles membership; switching single→multi keeps the selection; multi→single keeps the first selected only. Clear resets to none (= whole network).
- [x] **FR1.4** Multi-council rendering: each selected council's boundary drawn from its lazy-loaded GeoJSON, color-coded from the fixed 8-color palette `[#2D6A4F,#E76F51,#4A90E2,#9B59B6,#F4A261,#1D6FA8,#DC267F,#5B8C5A]` by `palette[hash(lga_id) % 8]` (stable across sessions); polygon interactive with sticky tooltip = `display_name`; fill opacity 0.12, stroke 2 px.
- [x] **FR1.5** Legend: council ↔ color chips with per-chip remove; visible whenever ≥1 council selected; matches `MultiCouncilPanel` colors exactly.
- [x] **FR1.6** Results scoping: when a selection exists, the results list and map markers contain **only** parks whose centroid passes point-in-polygon against the selected geometries (bbox pre-filter, then ray-casting; holes honoured).
- [x] **FR1.7** Map fit: one `fitBounds` to the selection's union bbox per selection change (not per data-load), padding `[48,48]`, `maxZoom: 14`.
- [x] **FR1.8** CouncilStats panel, dynamic per selection: `councils selected`, `area_km2` sum, `coverage %` vs `total_area_km2`, `parks in selection`, `playgrounds in selection`, `parks area (ha)`, and live `layerCounts` for enabled layers. No selection → network totals (35 councils, total area, all parks). Loading → skeleton; failure → `—` + toast.
- [x] **FR1.9** Deep-link sync: `?councils=lga-3,lga-30&mode=multi` read on mount and written on change (mirrors existing `?q/&sort` pattern); invalid ids dropped silently.
- [x] **FR1.10** States handled: index loading, index load failure (toast + controls disabled), boundary fetch failure (toast + selection kept but marked "boundary unavailable"), empty selection, single selection, ≥2 selections.
- [x] **FR1.11** localStorage: **no persistence** of council selection (session-only, by design).

**Contracts**
- Data: `artifacts/park-pulse/public/data/boundaries/councils-index.json` schema `{ total_councils, total_area_km2, councils: [{ id, lga_id, name, display_name, priority, priority_rank, area_km2, bbox:[s,w,n,e], centroid:[lat,lng], geometry_file }] }`; boundaries at `public/data/boundaries/councils/{lga_id}.geojson` (Feature, Polygon|MultiPolygon, EPSG:4326, ≤ 80 KB).
- Files created: `src/components/CouncilSelector.tsx`, `src/components/CouncilStats.tsx`, `src/components/MultiCouncilPanel.tsx`, `src/utils/councils.ts` (+ `src/utils/councils.test.ts`).
- Files modified: `src/pages/Explore.tsx` (state, boundary layer ref, filter effect deps, sidebar slots), `src/index.css` (new `pp-council-*` classes only).
- Placement: selector + mode toggle in the sidebar directly below `.pp-search-container`; stats panel below it (collapsible); legend chips inside `MultiCouncilPanel`; **no changes to map control positions**.
- Loading uses `fetchWithCache(url, "pp_council_index" | "pp_council_" + lga_id)` (respects 2 MiB cap).

**Acceptance criteria (run all, capture output)**
1. `pnpm --filter @workspace/park-pulse typecheck` → exit 0.
2. `pnpm --filter @workspace/park-pulse test` → all suites green including new `councils.test.ts` covering: sorting order, color stability, point-in-polygon (hole + multipolygon + bbox-miss cases), stats math.
3. `node artifacts/park-pulse/scripts/build-councils.mjs` → 35 entries, every `area_km2 > 0`, every geometry ≤ 80 KB.
4. `pnpm --filter @workspace/park-pulse test:e2e` → `explore` + `a11y` + `contrast` green, **plus new assertions**: select council → boundary visible; multi-select 2 councils → 2 colors + legend; results count equals pip count; keyboard-only selection works; 0 axe violations.
5. `shadcn get_audit_checklist` executed and reported.
6. Manual: `pnpm dev`, select Blacktown → list shows only Blacktown parks; clear → full list restored.

**Exit gate:** `verification-loop` report PASS attached to the phase PR.
**Tooling delta:** context7 for Leaflet/React APIs; radix-ui for dropdown behavior contract; shadcn for search-first + audit; `tdd-workflow`, `frontend-patterns`, `accessibility`.

---

### Phase 2 — Council Data Acquisition  *(Week 1–2, ongoing)*

**Goal:** Parks/trees/canopy source datasets for the 5–7 priority councils, with a machine-readable status manifest.
**Entry gate:** Phase 1 exit (boundary + selector exist).

**Functional requirements**
- [x] **FR2.1** Priority council list locked: Parramatta, Liverpool, Blacktown, Northern Beaches, Campbelltown, Camden, Randwick (City of Sydney is baseline, already shipped).
- [x] **FR2.2** Research each council's open-data channels in this fixed order: `opendata.{council}.nsw.gov.au` → `data.nsw.gov.au` → ArcGIS `{name}.maps.arcgis.com` → council site search "environment / GIS data / tree inventory"; also monitor the NSW Gov council portal (`environment.nsw.gov.au/LandUseManagementSites/Council.html`) for guideline changes. Deliverable: `Data/council-sources.md` table (council, dataset, URL, licence, status).
- [x] **FR2.3** One fetch/normalize script per source under `scripts/` following `extract-councils-v2.mjs` conventions (ESM, `projectRoot` resolution, exit code 1 on failure, no network at import time).
- [x] **FR2.4** `Data/council-manifest.json`: per council `{ lga_id, parks: "downloaded|missing|blocked", trees: …, canopy: …, fetched_at, source_url, licence }` — the single status surface.
- [x] **FR2.5** Normalized target schema per PRD §5.1 attribute list (`geometry`, `properties.name/type/lga_name/id/…`); unmappable fields recorded as `null` + manifest note, never fabricated.
- [x] **FR2.6** Sandbox constraint honored: scripts are authored and unit-tested offline (fixture in → fixture out); actual downloads run on a connected machine; `blocked` status is a first-class outcome.
- [x] **FR2.7** Council-count gap: document in `Data/council-sources.md` which 3 LGAs are missing to reach 38+ and their sources (TBD-4).

**Acceptance criteria**
1. `Data/council-manifest.json` parses; status coverage = 100% of priority councils.
2. Each script passes a fixture-based vitest/run in-sandbox (no network).
3. For every `downloaded` dataset: GeoJSON validates (FeatureCollection, EPSG:4326, non-empty) — provide `scripts/validate-geojson.mjs`.
4. `/update-docs` run: `DATA_INVENTORY.md` statuses refreshed from the manifest.

**Exit gate:** manifest + sources doc committed; `verification-loop` PASS.
**Tooling delta:** `search-first` + `deep-research`/`researcher-web` agent for portal discovery; `documentation-lookup` (context7) for GIS format questions; `data-scraper-agent` patterns for extraction scripts.

---

### Phase 3 — Tree Sharding per Council  *(Week 2)*

**Goal:** Council tree datasets load lazily at viewport scale for every council, not just the baseline.
**Entry gate:** ≥1 priority council tree dataset `downloaded` (Phase 2).

**Functional requirements**
- [x] **FR3.1** Merge normalized council tree GeoJSONs into the existing shard pipeline: `shard-trees.mjs` extended to (a) take an `--lga` input, (b) emit `manifest.json` entries mapping `lga_id → [shards]`.
- [x] **FR3.2** Output stays under the 2 MiB `dataCache` per-entry cap (measure, don't assume — existing `TARGET_BYTES = 900 KiB` rule applies per shard).
- [x] **FR3.3** `src/utils/treeData.ts` gains council-aware shard resolution: given viewport bounds + selected councils → only those councils' shards are fetched.
- [x] **FR3.4** Multi-council mode unions shard sets; single-council mode fetches one council; no selection keeps current behaviour (regression-free).
- [x] **FR3.5** Council-shard hover: tree/shard overlay tooltip includes council `display_name` (PRD legend requirement).
- [x] **FR3.6** Deterministic output: same input → byte-identical shards (enables safe caching + git-able manifest).

**Acceptance criteria**
1. `node artifacts/park-pulse/scripts/shard-trees.mjs` exits 0; every shard ≤ 900 KiB; manifest covers all loaded councils.
2. Vitest: manifest resolution logic (bounds+selection → shard list) tested with fixtures.
3. Playwright: select 2 councils, enable trees at zoom ≥ 16 → tree markers render; network log shows only selected councils' shards requested.
4. `pnpm typecheck`, full suite green (no regression to baseline sharding).

**Exit gate:** `verification-loop` PASS.
**Tooling delta:** context7 (Vite/Leaflet chunk APIs), `react-performance` (render cost), `content-hash-cache-pattern` for cache keys.

---

### Phase 4 — Public Transit Integration (GTFS)  *(Week 2)*

**Goal:** Council-scoped transit stops/routes on the map from the shipped GTFS static zip.
**Entry gate:** GTFS zip present (277 MB, 11 files — `stops.txt`, `routes.txt`, `trips.txt`, `shapes.txt` statuses per DATA_INVENTORY).

**Functional requirements**
- [x] **FR4.1** `scripts/gtfs-convert.mjs`: `stops.txt` → `public/data/transport/stops.geojson` (EPSG:4326; fields `stop_id, stop_name, stop_lat, stop_lon, route_types[]`); deterministic, streamed (file is large), exit 1 on malformed rows with row number logged.
- [x] **FR4.2** `routes.txt` + `shapes.txt` → `routes.geojson` (LineString per shape; `route_type` normalized to the enum {bus, rail, ferry, lightrail, metro}); **gate:** `shapes.txt` (~979 MB) processing runs only on a connected machine — script must support `--sample` mode for offline validation.
- [x] **FR4.3** `stop_times.txt` (~420 MB): **out of scope for conversion** until a frequency/arrival requirement exists (TBD-5); do not process speculatively.
- [x] **FR4.4** Explore layer: transport toggle switches from the current `public-transports.json` to the converted GeoJSON behind the same `useCulledMarkerLayer` contract; per-council scoping uses FR1.6 geometry filter.
- [x] **FR4.5** CouncilStats gains `transit stops in selection` (computed from `stops.geojson` + pip, bbox pre-filter).

**Acceptance criteria**
1. `node scripts/gtfs-convert.mjs --stops` produces `stops.geojson` with 11,632 ±0 features; validation script confirms EPSG:4326 ranges.
2. Vitest covers CSV parsing edge cases (quoted fields, CRLF, bad rows) with a fixture.
3. Playwright: transport layer on + council selected → only in-council stops visible; counts match pip reference.
4. `pnpm typecheck` + full suites green.

**Exit gate:** `verification-loop` PASS; manifest/Data inventory updated via `/update-docs`.
**Tooling delta:** `search-first` (CSV/stream libs before custom code), context7 for the CSV lib actually used, `contract-first` if stop schema is shared with UI types.

---

### Phase 5 — Canopy Cover Processing  *(Week 3)*

**Goal:** Per-council canopy percentage available to the UI as a numeric layer/attribute.
**Entry gate:** 4 canopy zips (~1.4 GB) present locally; GDAL availability confirmed or alternative chosen (TBD-6).

**Functional requirements**
- [x] **FR5.1** `scripts/canopy-extract.mjs`: unzip → `gdal_translate -of GeoJSON` per LGA tile (or documented fallback if GDAL absent) → clip to `councils/{lga_id}.geojson` boundary.
- [x] **FR5.2** Compute `canopy_percent = round(area(cover ∩ council) / area(council) × 100)` as integer 0–100; reproject to EPSG:4326; emit `public/data/canopies/{lga_id}.geojson` (polygon features carrying `canopy_percent`) **and** write scalar `canopy_percent` into `councils-index.json` (extend schema; rebuild index, never hand-edit).
- [x] **FR5.3** Raster math is offline-only (connected machine); the repo ships the script + a tiny fixture TIFF for CI-safe testing.
- [x] **FR5.4** UI: CouncilStats displays `Canopy {value}%` when present, `—` + "pending" tooltip when absent (never 0-by-default).
- [x] **FR5.5** Determinism: re-running on identical inputs yields identical percentages (rounding rule fixed above).

**Acceptance criteria**
1. Fixture-based run produces a valid GeoJSON + `canopy_percent` within 0–100.
2. Real run (connected machine) documented in `Data/council-sources.md` with per-LGA values; index rebuilt; `build-councils.mjs` still passes P1.0 checks.
3. Vitest: percentage math on synthetic geometry (exact expected values).
4. Full `pnpm typecheck && pnpm test && pnpm test:e2e` green.

**Exit gate:** `verification-loop` PASS.
**Tooling delta:** `search-first` (GDAL bindings vs CLI), context7 for GDAL/gdal-js usage, `error-handling` for missing-tool UX.

---

### Phase 6 — Advanced Filtering, Oracle Search & Dashboard  *(Week 3–4)*

**Goal:** Multi-filter grid, council dashboard with employment stats, and text search over listings — every data-dependent stat behind a TBD gate.
**Entry gate:** TBD-7 (job-listing dataset) resolved **or** UI shipped in gated state rendering `—`.

**Functional requirements — filter grid**
- [x] **FR6.1** 3×2 grid exactly as specified: [City & Neighborhoods | Industry | Disability Accessibility] / [Metro Areas | Employment Sector | Area-based Stats] with rows "Suburbs (list)", "Suburbs (sorted dropdown)", "Government only/All", "Cat level equal to one", "Disabled access eligible", "Level equal to one".
- [x] **FR6.2** Suburb lists: ≥50 suburbs per metro area, alphabetically sorted, multi-select, driven by local data (no network).
- [x] **FR6.3** Every filter composes with council selection (FR1.6) — filter chips row shows/removes each active constraint (existing `pp-active-chips` pattern).

**Functional requirements — Council dashboard (§1.3 recruitment value)**
- [x] **FR6.4** Stats table per selected council with **exact field definitions**; each field has `{ value: number | null }` and renders `—` + "pending data" tooltip when null:

| Field | Definition (locked) | Gate |
|---|---|---|
| `job_openings` | count of active listings with centroid inside council | TBD-7 |
| `government_pct` | `round(government_listings / job_openings × 100)` | TBD-7 |
| `vacancy_growth_12mo` | `round((n_m0 − n_m12) / n_m12 × 100)`; `null` if `n_m12 = 0` | TBD-7 |
| `industry_diversity_score` | Shannon entropy of industry distribution normalized ×100 → integer 0–100 | TBD-7 |
| `university_overlap_pct` | `round(listings within 5 km of UTS/SYD/UNSW/WSU campuses / job_openings × 100)` | TBD-7 + campus coords TBD-8 |

- [x] **FR6.5** Sector bar chart: government (target: 2 hires × 1,000 positions = 2,000 recruitments), technology, finance, health, education, others — percentages of `job_openings`; hidden entirely while `job_openings = null`.
- [x] **FR6.6** University affinity list: overlap % per campus + international-student share + 2–3 example relocation cities — all `null`-gated identically.
- [x] **FR6.7** Oracle search: query box with boolean AND/OR/NOT, suburb scoping, filters (government-only, industry, sector, degree level, salary band, distance-to-campus); results rows show `{company, title, suburb, council, sector, salary_band, campus_km}`. **Index does not exist until TBD-7** — ship UI against a typed `JobIndex` interface with an empty local fixture; no mock data may leak into production builds.
- [x] **FR6.8** Terms of Service overlay gates first search use (localStorage acceptance flag; no account system).

**Acceptance criteria**
1. Grid renders 3×2 with all rows; every control keyboard-operable and axe-clean (`e2e/a11y.spec.ts` extended).
2. With no job data: dashboard renders all columns with `—`, zero console errors, no fabricated values (assert in Playwright: no cell matches `/\d/` in the gated columns).
3. With fixture index (test-only): all five FR6.4 formulas produce exact expected values — Vitest table-driven tests.
4. `/code-review` + `/react-review` + `/security-scan` PASS (search input is user-controlled → verify no HTML interpolation, rate-limit-free DoS acceptable only client-side).
5. `shadcn get_audit_checklist` run on dashboard components; dashboard uses vendored `src/components/ui` (non-Explore surface).

**Exit gate:** `verification-loop` PASS; TBD-7/TBD-8 rows updated with evidence or explicit `still-blocked`.
**Tooling delta:** `contract-first` (`JobIndex` type as the contract between ingestion and UI), `database-migrations`/`postgres-patterns` only when Phase 8 gate opens, `radix-ui` MCP for grid/tabs behavior, `design-system` for chart tokens, `article-writing` + `brand-voice` for ToS copy.

---

### Phase 7 — UI Polish, Performance & Deployment  *(Week 4+)*

**Goal:** Ship-quality: a11y, performance, accuracy, live.
**Entry gate:** Phases 1–5 exit gates PASS (6 gated OK).

**Functional requirements**
- [x] **FR7.1** Shading favorites: hover-on/hover-off SVG palettes applied to selected-council shading (assets `coverage-grad palettes/hover-on.png` / `hover-off.png` per V5 §6 — verify presence, else render with CSS gradients and record TBD-9).
- [x] **FR7.2** Performance budgets measured and met: initial JS unchanged (council index loaded post-mount), council select < 300 ms cached, pan/zoom frame time no worse than baseline (measure with `react-performance` + Playwright tracing), total localStorage cache stays < 70 % of quota (existing eviction notice path).
- [x] **FR7.3** Accuracy validation: random sample of 20 parks checked against boundary membership (pip) and against council open data; mismatches triaged as data-bug vs code-bug with `systematic-debugging`.
- [x] **FR7.4** A11y: WCAG 2.2 AA across all themes — `accessibility` skill audit + `e2e/a11y.spec.ts` + `e2e/contrast.spec.ts` extended to council controls and dashboard; 0 violations.
- [x] **FR7.5** Deployment: existing `netlify.toml` (base `artifacts/park-pulse`, publish `dist/public`) validated with a production build; `deployment-patterns` checklist; preview deploy → `browser-qa` smoke (console errors, Web Vitals, 3-breakpoint screenshots, axe) → SHIP/DO-NOT-SHIP verdict.
- [x] **FR7.6** `pnpm build` output contains data files under budget; no secrets/source maps of data (secret scan via `security-scan`).

**Acceptance criteria**
1. Full gate suite: `pnpm typecheck && pnpm -r test && pnpm build && pnpm test:e2e` all green, captured.
2. `verification-loop` six-phase report PASS (build, typecheck, lint/format via `/quality-gate`, tests+coverage ≥ 80 % of `src/**` per `/test-coverage`, security grep, diff review).
3. `browser-qa` verdict SHIP with screenshot artifacts at 1280/768/375 px.
4. Lighthouse/Playwright performance numbers recorded in the PR (no regressions vs baseline captured in Phase 1).

**Exit gate:** release tag; `/update-docs`; `living-docs-governance` doc-role refresh.
**Tooling delta:** `browser-qa`, `ai-regression-testing`, `production-audit`, `/security-scan`, `finishing-a-development-branch`.

---

### Phase 8 — Data Layer (PostgreSQL)  *(gated)*

**Goal:** Replace filesystem-of-record with PostgreSQL for councils/parks/trees/canopy/transit/oracle **only if** a hosting decision is made.
**Entry gate:** **TBD-10 — DB hosting decision (needs validation via user decision + cost review).** Until then: implement nothing in this phase; the static GeoJSON architecture remains the system of record.

**Functional requirements (specification-only until gate opens)**
- [ ] **FR8.1** Schema per V5 §7.1 tables (`councils`, `parks`, `trees`, `canopy_percent`, `transit_stops`, `transit_routes`, `oracle_search`) with stated indices (`councils.name_loweridx` GIN, `oracle_search.lga_name_idx`, `oracle_search.keywords_idx` GIN).
- [ ] **FR8.2** Machine-checkable contract first: OpenAPI/JSON Schema in `lib/api-spec` consumed by generated types (`contract-first` skill) — frontend and pipeline must not hand-write divergent shapes.
- [ ] **FR8.3** Migrations are versioned, forward-only, idempotent-seeded (`database-migrations`).
- [ ] **FR8.4** Pipeline stages remain: extract → merge → shard → load (`load-data.mjs` new) with row-count assertions per stage.

**Acceptance criteria (defined, deferred):** migration up/down on a clean DB; contract test green both sides; load script asserts expected row counts from manifests.
**Tooling delta:** `postgres-patterns`, `database-migrations`, `contract-first`, `/multi-plan` if frontend+backend split across sessions.

---

## 5. Cross-Cutting Requirements

| Area | Requirement |
|---|---|
| Performance | Council index ≤ 25 KB; boundary ≤ 80 KB each; lazy-load everything council-related; reuse `useCulledMarkerLayer` culling for any new point layer; no new initial-route payload |
| Reliability | Every fetch has an error path (toast + preserved prior state); cache failures degrade to network; corrupt cache entries are dropped, not thrown (existing `dataCache` semantics) |
| Accessibility | WCAG 2.2 AA: keyboard for every control, visible focus, ARIA per Radix contract, contrast AA in **all** `data-theme`s (existing `contrast.spec.ts` enforces) |
| Security | No secrets in repo; no HTML interpolation of data; no new third-party endpoints; `/security-scan` in Phases 6–7; CSP unchanged |
| i18n/encoding | Council names include hyphens/apostrophes — always `textContent`; ASCII-safe slugs for filenames (already enforced by `file_prefix`) |
| Testing | Vitest for pure logic (pip, sorting, stats, parsing); Playwright for behavior/a11y/contrast/perf; **no @testing-library** (not installed — add only via an approved `/plan` + `search-first`) |
| Docs | `DATA_INVENTORY.md` is the data source-of-truth (updated via `/update-docs`); this PRD is requirements source-of-truth; plans live in `.claude/plans/`; no new root docs (`living-docs-governance`) |

---

## 6. Verification Matrix (every phase, no exceptions)

| Gate | Command / tool | Pass condition |
|---|---|---|
| G1 Types | `pnpm typecheck` | exit 0 |
| G2 Unit | `pnpm --filter @workspace/park-pulse test` | all green, new logic covered |
| G3 Build | `pnpm build` | exit 0, budgets hold |
| G4 E2E | `pnpm --filter @workspace/park-pulse test:e2e` | explore + a11y + contrast green |
| G5 A11y | `shadcn get_audit_checklist` + axe specs | 0 violations |
| G6 Review | `/code-review` (+ `/react-review` on TSX) | no blocking findings |
| G7 Security | `/security-scan` (Phases 6–7) | no findings or documented accepted risk |
| G8 Report | `verification-loop` | PASS report attached before any completion claim |

---

## 7. Delivery Workflow (ordered, per phase)

1. `save-session` context → `/plan FINAL_PRD_V5.md` → plan written to `.claude/plans/*.plan.md` → **wait for human confirmation**.
2. If phase > 2 sessions: `blueprint` first; tasks decomposed per `writing-plans` (bite-sized, checkable, TDD steps).
3. Research gates: `search-first` + context7 (`documentation-lookup`) before any new dependency/API use; shadcn search before building UI; radix docs before hand-built widgets.
4. Implement per `tdd-workflow` (failing test → minimal green → refactor); `frontend-patterns`/`react-patterns`/`coding-standards` apply throughout.
5. Gates G1–G8 in order; `/quality-gate` on every touched file; fix root causes only (`systematic-debugging`), never weaken tests.
6. Review: `requesting-code-review` → `receiving-code-review` (verify feedback technically before applying).
7. Docs: `/update-docs` + `article-writing`/`brand-voice` for user-facing copy; `living-docs-governance` to slot changes into doc roles.
8. Commit per task (`git-workflow`), branch per phase (`using-git-worktrees` when parallel), `finishing-a-development-branch`; `/save-session`.
9. Prompt hygiene: subagent prompts passed through `prompt-optimizer` checks (intent, scope, acceptance, out-of-scope, verification) before dispatch (`subagent-driven-development`).

---

## 8. TBD Register (anti-fluff: every gap has an id, owner method, and render rule)

| ID | Gap | Needs validation via | Until resolved |
|---|---|---|---|
| TBD-1 | Council **population** (handoff asked "sorted by population") | ABS/NSW ERP dataset acquisition | Sort stays `priority_rank` → alpha; no population field in index |
| TBD-2 | 35 vs 38+ councils | Phase 2 source research (FR2.7) | UI shows 35; copy says "35 of Greater Sydney councils" |
| TBD-3 | Per-council parks/trees availability | Council portal downloads (Phase 2) | Manifest status `missing/blocked`; stats show `—` |
| TBD-4 | Missing 3 LGAs to reach 38+ | `Data/council-sources.md` research | Listed as gap, not silently omitted |
| TBD-5 | `stop_times.txt` arrival/frequency data | Product decision on transit-time features (V5 §4.3) | Not processed |
| TBD-6 | GDAL availability/toolchain | Local `gdal_translate --version` on connected machine | Canopy phase stays gated; fixture path only |
| TBD-7 | Job-listings dataset for Oracle/dashboard | Data partnership/licence decision + acquisition | All FR6.4–6.8 values render `—`; chart hidden; search over empty fixture |
| TBD-8 | University campus coordinates | Public dataset fetch (Phase 6) | `university_overlap_pct = null` |
| TBD-9 | Shading palette assets presence | Verify `coverage-grad palettes/*.png` in repo | CSS-gradient fallback |
| TBD-10 | PostgreSQL hosting decision | User decision + cost review | Phase 8 untouched; static files remain SoR |
| TBD-11 | Canopy TIFF→% correctness | Cross-check 3 LGAs against published canopy reports | Mark values `provisional` in manifest |
| TBD-12 | Licence compliance per council dataset | Council-by-council licence text in manifest | Dataset excluded if licence unknown |

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Council portals block/renumber datasets | High | Phase 2 slippage | Manifest `blocked` state; multi-source order FR2.2; alternative ArcGIS mirrors |
| 20 MB boundaries tempt full-res client load | Medium | Perf regression | Only `build-councils.mjs` output is client-visible; full-res stays in `Data/` (§3.7-4) |
| localStorage 2 MiB quota exceeded by new layers | Medium | Silent data loss | Per-entry caps, existing quota notice, shard byte budgets |
| Point-in-polygon cost on large lists | Low | UI jank | bbox pre-filter + memoized pip; budget test at 10k points |
| Theme drift (pp-* vs shadcn/tailwind tokens) | Medium | Visual inconsistency | Locked rule §3.1 (pp-* inside Explore; vendored ui only outside) |
| Job-data never materializes | Medium | Phase 6 hollow | Null-gated UI is shippable and honest (§3.7-1) |
| GTFS shapes (979 MB) processing | Medium | Offline blocker | `--sample` mode + connected-machine gate FR4.2 |

---

## 10. Out of Scope (explicit — refuse scope creep)
- Mobile/native apps; user accounts/auth; server-side rendering.
- Live/scraped job feeds; any network call from production code beyond existing tiles/geocoding.
- Processing `stop_times.txt` (TBD-5) and Phase 8 DB work (TBD-10) until their gates open.
- Rebuilding the existing pp-* design system, renaming theme variables, or migrating Explore to shadcn markup.
- New npm dependencies without `search-first` + context7 + `/plan` approval.
- Committing generated/large data files (§3.7-5).

---

## 11. Definition of Done (product-level)
1. All Phase 1–5 and 7 checkboxes checked with gates G1–G8 PASS evidence; Phase 6 checked except TBD-gated cells rendering `—`; Phase 8 explicitly deferred with TBD-10 open.
2. Council coverage: ≥ 38 councils in `councils-index.json` (or TBD-2 updated with researched shortfall evidence).
3. A first-time user can: search → pick 1 council → see scoped results/stats/boundary → switch to multi → pick 2 more → read color-coded legend → share URL reproduces state — keyboard-only, all themes, zero axe violations.
4. `DATA_INVENTORY.md`, plans, and this PRD's milestone table are current (`/update-docs` + `living-docs-governance`).
5. `verification-loop` PASS report + `browser-qa` SHIP verdict attached to the release tag.

---

## Appendix A — On-disk data contracts (authoritative paths)

| Artifact | Path | Producer |
|---|---|---|
| Source boundaries (full-res) | `Data/LGAs_Sydney_and_surrounds.json`, `Data/councils.json` | `scripts/extract-councils-v2.mjs` |
| Council index (client) | `artifacts/park-pulse/public/data/boundaries/councils-index.json` | `artifacts/park-pulse/scripts/build-councils.mjs` |
| Per-council boundaries (client) | `artifacts/park-pulse/public/data/boundaries/councils/{lga_id}.geojson` | same |
| App datasets | `artifacts/park-pulse/public/data/*.geojson|json` | curated per DATA_INVENTORY |
| Tree shards + manifest | `artifacts/park-pulse/public/data/trees/` | `artifacts/park-pulse/scripts/shard-trees.mjs` |
| Status manifest | `Data/council-manifest.json` | Phase 2 scripts |
| Sources/licences | `Data/council-sources.md` | Phase 2 research |
| ⚠ Not served | repo-root `public/data/**` | never referenced by app code |

## Appendix B — Skill & MCP invocation index (quick reference)

**MCPs:** `context7` (`resolve-library-id`, `query-docs`) · `shadcn` (`get_project_registries`, `search_items_in_registries`, `list_items_in_registries`, `view_items_in_registries`, `get_item_examples_from_registries`, `get_add_command_for_items`, `get_audit_checklist`) · `radix-ui` (`primitives_list_components`, `primitives_get_component_documentation`, `primitives_get_component_source`, `primitives_get_getting_started`, `themes_list_components`, `themes_get_component_documentation`, `themes_get_component_source`, `themes_get_getting_started`, `colors_list_scales`)

**Commands:** `/prompt-optimizer` `/plan-prd` `/plan` `/plan-canvas` `/blueprint`(skill) `/react-test` `/react-build` `/react-review` `/code-review` `/test-coverage` `/quality-gate` `/security-scan` `/update-docs` `/save-session` `/resume-session`

**Skills by lane:** requirements `prompt-optimizer` `product-lens` `product-capability` · research `search-first` `deep-research` `documentation-lookup` `iterative-retrieval` · planning `blueprint` `writing-plans` `plan-orchestrate` · build `tdd-workflow` `frontend-patterns` `react-patterns` `react-performance` `coding-standards` `error-handling` `vite-patterns` `accessibility` `frontend-a11y` `design-system` `contract-first` `database-migrations` `postgres-patterns` · review `security-review` `requesting-code-review` `receiving-code-review` · verify `verification-loop` `verification-before-completion` `systematic-debugging` `browser-qa` `e2e-testing` `ai-regression-testing` `production-audit` · docs `writing-skills` `article-writing` `brand-voice` `living-docs-governance` · delivery `git-workflow` `using-git-worktrees` `finishing-a-development-branch` `subagent-driven-development` `executing-plans`

---

## 🚀 Milestone Table (consumed by `/plan`)

| # | Milestone | Outcome (user-visible) | Status | Plan |
|---|---|---|---|---|
| 1 | Council governance UI | Selector, stats panel, color-coded multi-council map | pending | — |
| 2 | Council data acquisition | Priority-council parks/trees/canopy sourced + manifest | pending | — |
| 3 | Tree sharding per council | Lazy council tree layers at zoom ≥ 16 | pending | — |
| 4 | GTFS transit | Stops/routes layer scoped to councils | pending | — |
| 5 | Canopy cover | Per-council canopy % in stats | pending | — |
| 6 | Filters + Oracle dashboard | Filter grid + null-gated employment dashboard | pending | — |
| 7 | Polish & deploy | A11y/perf/accuracy gates, live | pending | — |
| 8 | Data layer (gated) | PostgreSQL behind TBD-10 | blocked | — |

---
*Status: DRAFT — requirements + binding execution contract. Implementation planning via `/plan FINAL_PRD_V5.md` (waits for confirmation). No code may be written before its phase plan is confirmed.*
