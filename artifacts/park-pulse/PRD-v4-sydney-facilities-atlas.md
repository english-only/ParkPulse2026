# PRD-v4 — ParkPulse v4 "Sydney Facilities Atlas"

**Status:** Draft for build · **Date:** 2026-10-09 · **Owner:** ParkPulse
**Preceded by (required reading):**
[`PRODUCT-BRIEF.md`](PRODUCT-BRIEF.md) ·
[`COMPETITIVE-LANDSCAPE.md`](COMPETITIVE-LANDSCAPE.md) ·
[`DESIGN-AUDIT.md`](DESIGN-AUDIT.md) ·
[`SIDEBAR-SPEC.md`](SIDEBAR-SPEC.md) ·
[`SOURCE-REGISTRY.md`](SOURCE-REGISTRY.md)

---

## 1. Goals

From `PRODUCT-BRIEF.md` (Go decision, 2026-10-09):

1. **Surface the data we already have.** ~3,570 verified features exist in the repo but
   only 418 markers render. Every row of `SOURCE-REGISTRY.md` §2 becomes a queryable,
   rendered layer.
2. **Fix what was proven broken.** All nine findings in `DESIGN-AUDIT.md` (DA-1…DA-9)
   close; the seven v4 exit criteria in `DESIGN-AUDIT.md` §6 become release gates.
3. **Ship the locked IA:** a map with a persistent, spec-compliant sidebar covering all
   14 mandated points (`SIDEBAR-SPEC.md` §1–§14) plus Cmd/Ctrl+K palette (§8) and Vaul
   bottom sheet (§12).
4. **Two themes, zero broken preferences:** Light/Dark via semantic custom properties,
   with deterministic migration of every legacy `parkpulse_theme` value (§6.4).
5. **Licence integrity:** the two mandated corrections land in code and copy
   (`blacktown` → OSM/ODbL; `toilets-sydney` → NPM/CC-BY 3.0 AU).

### 1.1 Success metrics (baseline → target)

| Metric | Baseline (v2) | v4 target |
|---|---|---|
| Keyboard-reachable filter controls | 12 hidden (`display:none`) | 0 hidden; axe WCAG 2.1.1 pass |
| Contrast failures (dark) | 109 AA failures | 0 failing pairs in both themes |
| Licence accuracy | 2 mislabelled sources | 0; every registry row live-verified |
| Data surfaced | ~3,570 features / 418 markers | all registry sources rendered as layers |
| Toilet attribute fidelity | 8 flattened letters | full NPM field set queryable & displayed |
| Theme count | legacy multi-theme system | 2, 100% legacy-value migration coverage |
| Automated suites | 75 unit + 18 Playwright | green in CI, a11y + contrast + migration specs extended |
| Bundle / runtime | 157 kB gzip, 174 ms, 0 long tasks | no regression |

---

## 2. Architecture

### 2.1 Information architecture (locked)

```
┌────────────────────────────────────────────────────────┐
│ Navbar (theme toggle, shortcuts entry, About)          │
├──────────────┬─────────────────────────────────────────┤
│              │                                         │
│  SIDEBAR     │              MAP (full height)          │
│  (persistent)│   markers · clusters · tiles · layers   │
│  search      │                                         │
│  filters     │   ↔ hover/selection sync (§7 of spec)   │
│  results     │                                         │
│  saved       │                                         │
│  collapse→rail                                       │
├──────────────┴─────────────────────────────────────────┤
│ Cmd/Ctrl+K palette (overlay) · shortcuts dialog (?)    │
└────────────────────────────────────────────────────────┘
Mobile ≤ 768px: sidebar becomes Vaul bottom sheet, 3 snap points; map always usable.
```

The sidebar is the product spine; the map is the canvas. Behavioural contract is
authoritative in `SIDEBAR-SPEC.md` (states, keyboard, a11y, tokens). This PRD does not
restate it — it links it and adds acceptance criteria.

### 2.2 Two-theme token system

- Two value sets only: `:root` (Light) and `[data-theme="dark"]` (Dark), exposing
  semantic `--pp-*` custom properties (colour, surface, border, focus, map overlay).
- Components and feature CSS read **only** `--pp-*` variables. No component-level
  `data-theme` selectors, no colour literals tied to a theme name.
- `data-theme` attribute is the single source of truth on `<html>`; default follows
  `prefers-color-scheme` until the user makes an explicit choice (existing
  `useTheme`/`applyInitialTheme` contract in `src/hooks/useTheme.ts` is preserved).
- Fixes DA-6 (hardcoded contrast values) and DA-7 (audit coverage) by construction:
  one token table × two themes is what `contrast-audit.mjs` validates.

### 2.3 Ingest pipeline (one-shot, no daemons)

```
data/sources.config.json  ──►  scripts/ingest-facilities.mts  ──►  public/data/*.geojson|json
   (manifest: URL, format,                 (npm run ingest)           + public/data/meta.json
    licence, bbox, lastCount,
    lastVerified)                          pre-check: returnCountOnly /
                                           package_show before re-download
```

- Trigger model: manual or CI-cron invocation only — **no resident process**
  (`SOURCE-REGISTRY.md` §4).
- `lastVerified` timestamps and `lastCount` baselines come from
  `SOURCE-REGISTRY.md` §2 (all verified 2026-10-09).
- Dead endpoints are never silently reused — replacements are listed in
  `SOURCE-REGISTRY.md` §6 and the config must match them.

---

## 3. Data layer (Workstream B detail)

### 3.1 `data/sources.config.json` manifest (api-design-informed schema)

One JSON object per source; the manifest is the extension point for the multi-LGA
question left open in PRD-v3 §6 (a new council = a new manifest row + a layer mapping,
not a code change):

```jsonc
{
  "id": "cos-parks",                    // stable key; used by layer config & tests
  "name": "City of Sydney — Parks",
  "provider": "City of Sydney",
  "endpoint": "https://…/FeatureServer/0/query",
  "method": "arcgis-query",             // arcgis-query | ckan-csv | gtfs | static
  "format": "geojson",
  "licence": { "name": "CC BY 4.0", "attribution": "City of Sydney",
               "url": "https://creativecommons.org/licenses/by/4.0/" },
  "bbox": [-33.95, 150.95, -33.65, 151.35],   // Greater Sydney where applicable
  "lastCount": 418,                     // verified 2026-10-09 (SOURCE-REGISTRY §2)
  "lastVerified": "2026-10-09",
  "refresh": "weekly-count-precheck",   // see cadence table §4 of registry
  "status": "active"                    // active | static | dead (log-only)
}
```

Validation rules (also unit-tested):
- Every `endpoint` must have appeared in `SOURCE-REGISTRY.md` §2 (live) or §6 (with its
  replacement) — no unverified URLs.
- Every `licence` block required; attribution strings are rendered verbatim in About /
  layer credits. The two corrected rows (`blacktown` → OSM/ODbL, `toilets-sydney` →
  NPM CC BY 3.0 AU) are asserted by test.
- `lastCount` mismatch against a live `returnCountOnly=true` probe ⇒ re-download;
  match ⇒ skip (cheap weekly check).

### 3.2 Ingest contract

- `npm run ingest` reads the manifest, fetches, reprojects/clips to bbox where
  declared, writes GeoJSON/JSON shards plus a `meta.json` entry
  (`lastUpdated`, `licence`, `count`, `source`).
- Exit non-zero on: unreachable endpoint (non-declared), licence block missing, count
  regression > 50% without `--force` (protects against partial feed failures).
- Never writes partial files over shipped data: temp file → atomic rename.
- Attribute preservation: NPM toilet rows keep the full field set
  (`Accessible`, `BabyChange`, `AllGender`, `ChangingPlaces`, `OpeningHours`…) —
  no flattening (metric: toilet attribute fidelity).

### 3.3 Licence fixes (mandated)

| Dataset | Wrong label (current) | Correct | Where it must appear |
|---|---|---|---|
| `blacktown.geojson` (1,605 features) | council-style attribution | **OpenStreetMap contributors, ODbL 1.0** | `meta.json`, About, map credit |
| `toilets-sydney.json` (3,127 rows) | generic/NPM-mismatched | **National Public Toilet Map, CC BY 3.0 AU** | `meta.json`, About, toilet layer credit |

---

## 4. Workstreams and acceptance criteria

Execution order is **B → C → D → A** (rationale: Appendix A).

### Workstream B — Data & sources (first)

**Scope:** manifest schema, one-shot ingest script, licence corrections, `meta.json`
regeneration, dead-endpoint hygiene, count pre-check.

Acceptance criteria:
- [ ] `data/sources.config.json` exists and covers every active row of
      `SOURCE-REGISTRY.md` §2 (CoS 11 layers, Parramatta 3+, NPM CSV, NPWS, TfNSW,
      OSM-derived statics).
- [ ] `npm run ingest` runs end-to-end in CI, is idempotent, and honours the
      count pre-check (no re-download when `lastCount` matches).
- [ ] Both licence corrections verified in `meta.json` **and** rendered About copy.
- [ ] All six dead endpoints from `SOURCE-REGISTRY.md` §6 absent from config (or
      present only as `status:"dead"` log entries with replacement).
- [ ] Toilet features expose the full NPM field set end-to-end (unit test on a
      fixture row).
- [ ] Counts match registry baselines: Parks 418, Playgrounds 162, Toilets
      26,977-row CSV → Greater Sydney extract, NPWS 1,795, trees 49,650 shard-safe.

### Workstream C — Map & IA features

**Scope:** render every registered source as a layer; clustering/virtualisation budgets
for high-count layers (seats 890, bike parking 1,761, trees 49,650, toilets ~3.2 k);
fix DA-1, DA-3, DA-5, DA-9; shortcut modifier guard; polite live region.

Acceptance criteria:
- [ ] Every `status:"active"` manifest row has a toggleable layer with correct
      attribution credit.
- [ ] DA-1: shortcut handler ignores events with Ctrl/Cmd/Alt held — regression test in
      `e2e/explore.spec.ts`.
- [ ] DA-3: shortcuts modal is a Radix dialog — same contract asserted for `ParkModal`
      (focus trap, Escape, restore focus).
- [ ] DA-5: filter/result changes announced via exactly one polite live region.
- [ ] Marker/cluster interaction stays within the 174 ms / 0-long-task budget with the
      largest layer visible (perf smoke test).
- [ ] All Playwright suites pass (DA-9) as a CI gate.

### Workstream D — Sidebar (spec-driven)

**Scope:** implement `SIDEBAR-SPEC.md` §1–§17; the 14 mandated points are the DoD
checklist; cmdk palette (§8), Vaul sheet (§12), collapse-state focusability (fixes
DA-2), dep hygiene (DA-8).

Acceptance criteria:
- [ ] All 14 checklist items in `SIDEBAR-SPEC.md` §17 pass their stated per-section
      acceptance (reviewed one-by-one; no partial credit).
- [ ] DA-2: collapsed desktop sidebar contributes **zero** tab stops —
      `document.activeElement` never lands inside it while collapsed (Playwright).
- [ ] Cmd/Ctrl+K opens the palette from any focus position; palette supports the 8
      command groups (spec §8); `?` opens the shortcuts dialog.
- [ ] Mobile: Vaul sheet with 3 snap points, map usable at every snap point,
      a11y contract of spec §12 (focus, `aria-modal`, swipe + button parity).
- [ ] Result list virtualised; density options + sticky chrome per spec §10;
      50 ms search budget per spec §2.
- [ ] DA-8: unused shadcn files either imported or deleted; `cmdk` and `vaul` become
      real dependencies of shipped code (they are already in `package.json`).

### Workstream A — Theme migration (last)

**Scope:** collapse to Light/Dark semantic tokens; migrate `parkpulse_theme`; fix
DA-4, DA-6, DA-7; rewrite the legacy About copy about map tile themes → two themes; Navbar
dropdown semantics.

Acceptance criteria:
- [ ] `src/hooks/useTheme.ts` `Theme` type = `"light" | "dark"`; legacy values migrated
      per §6.4 on first load (no user is silently re-themed to a wrong scheme).
- [ ] Zero selectors remain for legacy theme names in CSS
      (`[data-theme="sunset|neon|minimal|satellite|default"]` grep = 0 hits in
      `src/`).
- [ ] `contrast-audit.mjs` extended (or replaced by full-text Playwright contrast
      coverage) and passes for **both** themes — 0 failing pairs.
- [ ] DA-4: Navbar theme control has valid roles, Escape closes, arrow keys move
      focus/selection.
- [ ] OS-preference following preserved for users with no explicit choice
      (`prefers-color-scheme` listener behaviour unchanged).
- [ ] Tile attribution (`osm.tiles` etc.) survives migration visually in both themes.

### 4.1 Findings → workstream closure map

| Finding | Sev | Closed in |
|---|---|---|
| DA-1 modifier-key hijack | S1 | C |
| DA-2 invisible tab stops | S1 | D |
| DA-3 shortcuts modal semantics | S2 | C |
| DA-4 Navbar dropdown semantics | S2 | A |
| DA-5 single live region | S2 | C |
| DA-6 theme-hardcoded contrast | S3 | A |
| DA-7 audit coverage gap | S3 | A |
| DA-8 unused component debt | S3 | D |
| DA-9 unverified suites | S3 | C + D (test plan) |

---

## 5. Test plan

Baseline: 75 Vitest unit + 18 Playwright tests (`a11y.spec.ts`, `contrast.spec.ts`,
`explore.spec.ts`). Gates: `npm run typecheck`, full Vitest, full Playwright — all
required green in CI before release (DESIGN-AUDIT §6.7).

**Extend, by workstream:**

| Layer | New/extended tests |
|---|---|
| Unit (Vitest) | manifest schema validation; licence-block presence + the two corrected rows; theme migration table — all six legacy values → expected Light/Dark, unknown value → system fallback; count pre-check logic; toilet full-field fixture |
| Playwright a11y | collapsed-sidebar tab-order (DA-2); shortcuts dialog Radix contract; Navbar Escape/arrows (DA-4); filter announcements (DA-5); palette focus return after Cmd/Ctrl+K |
| Playwright behaviour | modifier-guard regression (DA-1); sidebar 14-point spot checks (search budget, sort options, snap points); layer toggles for each manifest source |
| Playwright contrast | both themes, full rendered text (closes DA-7) |
| Perf smoke | largest-layer load within baseline budgets (174 ms / 157 kB gzip / 0 long tasks) |

Re-verify independently at each gate; do not trust `AUDIT-REMEDIATION-REPORT.md`.

---

## 6. Cross-cutting embeds

### 6.1 Sidebar spec summary

Authoritative: [`SIDEBAR-SPEC.md`](SIDEBAR-SPEC.md) — regions (§0), layout (§1),
search (§2), filters (§3), results (§4), sort (§5), saved (§6), map sync (§7), Cmd/Ctrl+K
palette (§8), keyboard contract (§9), density/scroll (§10), states (§11), mobile Vaul
sheet (§12), perceived performance (§13), visual tokens (§14), a11y contract (§15),
state sync (§16), 14-point checklist (§17).

### 6.2 Registry summary

Authoritative: [`SOURCE-REGISTRY.md`](SOURCE-REGISTRY.md) — schema (§1), verified
sources w/ 2026-10-09 timestamps and counts (§2), licence corrections (§3), refresh
cadence (§4), workstream mapping (§5), dead-endpoint log (§6), validation record (§7).
Highlights consumed here: CoS org `cNVyNtjGVZybOQWZ` (Parks 418, Playgrounds 162 …);
Parramatta now `services6.arcgis.com/NrOjMi9LSYL3MUze` (`services1` returns 400);
NPM CSV 26,977 rows (`metadata_modified` 2026-09-30); NPWS CKAN (2026-10-03), SEED
ZIP needs ranged GET (signed-URL HEAD → 403); `gtfsdata.` DNS-dead.

### 6.3 Licence fixes

See §3.3 — `blacktown` → OSM/ODbL 1.0; `toilets-sydney` → NPM CC BY 3.0 AU. Enforced
by manifest schema (licence block required) and a dedicated unit test.

### 6.4 `parkpulse_theme` value migration table

Storage key unchanged: `parkpulse_theme` (`src/hooks/useTheme.ts`). Migration runs once
on load, before `initialTheme()` resolves; migrated values written back so the legacy
set never reappears.

| Legacy value | Label (old UI) | Migrated to | Rationale |
|---|---|---|---|
| `default` | Modern Green | `light` | light-surface design |
| `dark` | Night Mode | `dark` | dark-surface design |
| `sunset` | Sunset | `light` | warm light palette |
| `neon` | Neon | `dark` | dark-background palette |
| `minimal` | Minimal | `light` | white/neutral palette |
| `satellite` | Satellite | `dark` | dark basemap palette |
| *(absent)* | — | OS `prefers-color-scheme`, else `light` | preserve existing no-choice behaviour |
| *(unknown/corrupt)* | — | same as absent, rewrite key | defensive; never crash on bad storage |

Acceptance: table rows covered 1:1 by unit tests; after migration,
`localStorage["parkpulse_theme"] ∈ {"light","dark"}`.

---

## 7. Dependencies & out of scope

**Recorded dependencies (not built in the planning task):**
- `cmdk` — command palette (Workstream D) — already in `package.json`.
- `vaul` — mobile bottom sheet (Workstream D) — already in `package.json`.
- `react-window` (or equivalent) — result-list virtualisation (Workstream D) — **new
  dependency**, must be justified against bundle budget (157 kB gzip baseline).

**Out of scope for v4:** source-code changes in this planning task; daemons/cron
services; multi-LGA expansion (enabled by manifest design, not delivered); offline PWA
work beyond surfacing current offline states (spec §11).

---

## 8. Risks

| Risk | Mitigation (owner) |
|---|---|
| Same-pipeline verification bias | independent re-verification in DESIGN-AUDIT §0 + live registry probes (B) |
| Licence churn / wrong attribution | manifest requires licence block; corrected rows test-locked (B) |
| Sidebar scope creep (14 points + palette + sheet) | spec is frozen at `SIDEBAR-SPEC.md`; implemented only after B stabilises data (D) |
| Broken saved preferences on theme migration | deterministic §6.4 table + unit tests; storage key unchanged (A) |
| Multi-LGA drift | manifest is the extension point; no council hard-coding (B) |

---

## Appendix A — Workstream ordering rationale (B → C → D → A)

Question-by-question justification against the A-first alternative:

1. **Why B first?** Every other workstream consumes data shape. Sidebar facets
   (SIDEBAR-SPEC §3) exist only because the NPM CSV keeps its full field set; layer
   toggles (C) only exist if the manifest says what layers there are; attribution copy
   (A's About rewrite) is wrong until the two licence fixes land. Building UI against
   unstable data means rebuilding bindings — B first freezes the contract
   (`sources.config.json`) that C and D bind to.
2. **Why C before D?** The sidebar spec's sync requirements (§7) are two-directional:
   hover list → marker and marker → list. The map side (layers, clusters, selection
   model, live region) must exist as a stable API before the sidebar can bind to it.
   C also owns DA-1/DA-3/DA-5, which are map-surface bugs independent of sidebar
   redesign — fixing them first prevents the new sidebar from inheriting broken
   shortcut/dialog behaviour.
3. **Why D after C?** D is the largest single block (14 points + palette + sheet) and
   its acceptance is measured against a working map (sync, virtualisation budgets with
   real cluster counts from B, attribution credits). Spec-first, implement-second keeps
   §17 as a literal DoD checklist instead of a design aspiration.
4. **Why A last?** Theme migration touches every component and all of `index.css` —
   doing it while C/D are mid-flight multiplies merge conflicts across 133 legacy
   selector sites. It also depends on D for the sidebar's token usage (spec §14) and on
   B for tile attribution. DA-6 explicitly calls the current contrast fixes a
   "migration hazard": they are safest to replace once the components they style have
   settled.
5. **Why not A-first?** An A-first order re-themes components that D then rewrites
   (sidebar states, palette, sheet are new DOM) and that C re-touches (dialogs, live
   regions) — double work on the same lines, and the migration table's acceptance
   (no legacy selectors anywhere) would be verified before the last component exists.
   B-first/A-last minimises rework: each workstream consumes the previous one's frozen
   output instead of racing it.

Sequencing gate: a workstream's acceptance criteria must be green before the next
begins; B→C→D→A is strictly serial at the gate level even where implementation could
overlap.

---

*End of PRD-v4. Companion documents: `PRODUCT-BRIEF.md`, `COMPETITIVE-LANDSCAPE.md`,
`DESIGN-AUDIT.md`, `SIDEBAR-SPEC.md`, `SOURCE-REGISTRY.md`.*
