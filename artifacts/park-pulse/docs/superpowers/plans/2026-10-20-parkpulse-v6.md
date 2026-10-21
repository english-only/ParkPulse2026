# Park Pulse v6 Implementation Plan

> **For agentic workers:** Execute top to bottom. Steps use `- [ ]`. The user asked for
> implementation in this session — no approval gate.

**Goal:** One coherent, distinctive product across every route in both themes, with Explore
rebuilt around a left control rail and a square map, and Quick Explore gone.

**Spec:** `docs/superpowers/specs/2026-10-20-parkpulse-v6-design.md`

**Tech Stack:** React 19, Vite 7, Tailwind 4 (bridged), wouter, Leaflet + markercluster,
vitest, Playwright + axe.

## Global constraints

- Two themes only: `warm`, `night`. `data-theme` on `<html>`, `parkpulse_theme` in storage.
- Motion from the nine registry tokens in `src/index.css`. No `transition: all`. No new deps.
- Counts come from `stats.json` via `countFor`; unknown stays `null`, never `0`.
- Explore defaults stay parks + off-leash on, everything else opt-in (EXP-005).
- `public/data/**` generated artifacts are never hand-edited.
- Do not touch unrelated working-tree changes; do not commit.

## Task 1 — Cascade and type system repair

**Files:** `src/index.css`, `src/styles/type.css`, `index.html`

- Move the element reset and heading/body/anchor rules into `@layer base`. Root cause of the
  unstyled Insights page: unlayered `*{padding:0}` beats every Tailwind utility, so `.px-4`,
  `.space-y-*`, `.gap-*` were dead on every route that used utilities.
- Retire IBM Plex Mono: drop the two `@font-face` blocks, repoint the data role to the text
  face with `font-variant-numeric: tabular-nums`. Remove its preloads.
- Add the six-step type scale as tokens; make `.fa-*` type classes use them.

**Verify:** `pnpm run typecheck`, `pnpm run test`, walk `/dashboard` in the browser and confirm
padding/gap utilities apply; `contrast.spec.ts` still passes.

## Task 2 — Field-atlas primitives

**Files:** `src/styles/field-atlas.css`

- Type scale adoption; remove `.fa-eyebrow` (and its usages in tasks 3–6).
- Add `fa-ledger`, `fa-figure`, `fa-chip`, `fa-panel`, `fa-toolbar`, `fa-key`, `fa-map-frame`,
  `fa-field` (hero plot), `fa-guide`.
- Route motion onto tokens for `.fa-btn`, `.fa-nav-link`, `.fa-entry`, `.fa-card`.
- Re-check both palettes for the new surfaces; keep AA.

## Task 3 — Home

**Files:** `src/pages/Home.tsx`, `src/components/ParkFieldPlot.tsx`, `src/utils/heroPlate.ts`
(new), `src/utils/heroPlate.test.ts`, `scripts/build-hero-plate.mjs` (new)

- Hero: headline (unchanged copy, tested), lede, two actions, and the **park plate** — the
  real park polygons from `hero-plate.json`, drawn as outlines to the layer's true aspect,
  resting in page ink with a type key that isolates one type in its Explorer colour. A count
  line states the layer total; no scatter, no invented geometry.
- "What is mapped": `.fa-stat` retained (4, values from `stats.json`) but composed as a
  ledger with sources, not four identical cards.
- Replace the numbered-card row with a two-column guide: one paragraph of method on the left,
  three short named steps on the right, no card boxes.
- Entry links keep the four tested hrefs, restyled as a list with real counts where known.
- Recents and CTA: keep behaviour, tighten copy and layout.

## Task 4 — Explore

**Files:** `src/pages/Explore.tsx`, `src/styles/explore-atlas.css` (new, imported from index.css)

- Fix the map race: every async layer loader checks `mapRef.current === map` and a `cancelled`
  flag before touching the map (Root cause of `_initIcon` `appendChild` errors under StrictMode).
- Replace the 10-chip hero with an intro band: h1, lede, three verified figures, data note.
- Left rail: search, **Categories** (every published layer + park-type refinements, with real
  counts and pressed state), council scope disclosure, results toolbar, result list.
- Right: square `.fa-map-frame` (aspect-ratio 1, max 720px, sticky), header strip with visible
  count + basemap/locate, in-map legend disclosure driven by the same filter state.
- Mobile: map directly under the intro and sticky, controls and results beneath; FAB scrolls
  to the controls. No horizontal overflow at 390px.
- Delete dead `pp-*` rules that no longer have markup once the page is migrated.

## Task 5 — Insights

**Files:** `src/pages/Dashboard.tsx`, `src/components/dashboard/*`

- Rebuild on fa primitives: page head, coverage ledger + table, gated-prototype callout,
  filter grid, council panel, oracle — all inside `.fa-wrap` so utilities finally work.

## Task 6 — Compare, Amenities, Atlas, About, 404

- Remove eyebrows; align heads, panels, tables, states; Compare gets a real empty state and
  type summary; Amenities becomes a ledger list rather than six identical cards; Atlas and
  About keep their tested tables.

## Task 7 — Themes, map styling, PWA metadata

- Sync `theme-color` meta to the active theme; add `manifest.webmanifest`, icons, iOS meta.
- Re-tune night map tiles/markers/controls; verify both themes at 3 widths.
- No service worker: offline caching is not claimed anywhere.

## Task 8 — Tests and review

- Unit: `heroPlate` parsing (rejects malformed viewBox, open or injected path data, bad type
  indexes), per-type counting and grouping; category list invariants.
- E2E: Explore layout (rail left, square map right, sticky), Quick Explore absent, every
  published layer present with counts, filter→marker sync, empty state + reset, theme
  persistence across routes, no console errors.
- Run typecheck, vitest, build, Playwright (incl. axe + contrast).
- Taste inspector over the built app at 1440/768/390; fix legitimate findings; re-run.
