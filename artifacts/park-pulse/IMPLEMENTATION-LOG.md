# Redesign implementation log

Companion to [PRD-v5-generational-product-redesign.md](PRD-v5-generational-product-redesign.md).
It records what has actually shipped, the evidence captured for it, and what is
deliberately still open. Nothing here is a claim of release readiness.

## Shipped — Phase 1 (design foundation) and Phase 2 (shared shell + Home)

| PRD requirement | Implementation | Evidence |
|---|---|---|
| §18.2 typed layer registry | `src/data/layers.ts` — eleven layers with publisher, coverage, licence status, limitations, publication status and `countKey`. Counts are never stored in the registry. | `src/data/snapshot.test.ts` (unique ids, published ⇒ artifact, unavailable ⇒ no count) |
| §7.1 data contract / unknown ≠ zero | `src/data/snapshot.ts` — explicit count paths, integer-only validation, ISO-date validation, flattened map, `countFor` returns `null` rather than `0` | `snapshot.test.ts` covers invalid counts, invalid dates, missing files, `locations` exclusion |
| §8.1 exactly two themes | `useTheme` reduced to `warm` (Warm Field) and `night` (Night Field); legacy ids (`default`, `dark`, `sunset`, `neon`, `minimal`, `satellite`, `light`) migrate on read | Contrast suite runs both palettes; theme test asserts exactly two pressed-state buttons and persistence across reload |
| §8.1 map basemap ≠ UI theme | Explore's tiles are driven by a `basemap` state (`streets` / `satellite`) with its own control, `?basemap=` param, legacy `?theme=satellite` support, and `html[data-basemap]` so Night Field never inverts imagery | Explore e2e suite (14 tests) |
| §8.2 type, spacing, motion | 4px rhythm, 8/12/16/24/32/48 spacing, 8px control radius, solid primary action, reduced-motion overrides | `src/styles/field-atlas.css`; screenshots |
| NAV-001…004 | New header: skip link, `aria-current`, three destinations, single Explore action, two-option theme switch, Escape-closing mobile disclosure with focus return. New footer: purpose, destinations, publishers, snapshot date, OSM attribution. | `home.spec.ts` shell tests; axe on `/about` both themes |
| HOM-001…005 | Hero, sourced snapshot band, three steps, four real Explore deep links, local-only recents, one closing CTA. Quick Explore grid, hard-coded featured parks, rotating facts, animated counters and remote Unsplash hero removed. | `home.spec.ts` (13 tests) |
| ABOUT-001…003 | Coverage table from the registry, "what is not published" register, reading guide, accessibility statement, attribution, shortcuts in a `<details>` | `home.spec.ts` About tests; axe both themes |

## Fixed along the way

- **Night Field destructive colour.** The shadcn bridge hard-coded `#b42318`
  for `--color-destructive`, which measures 2.69:1 on `#111A16`. The dashboard's
  "Council index unavailable" alert failed axe in Night Field. Added
  `--pp-danger` / `--pp-danger-fg` per theme (`#FF9D9D` on night) and bridged
  `--color-destructive` to them. Verified by `contrast.spec.ts`.
- **Tests updated to the new contract** (not weakened): the theme test now
  asserts a two-option toggle instead of a six-item listbox; contrast tests use
  `night` / `warm`.

## Completed — data-restoration and Phase 3/4 pass (2026-10-19)

| Gap | Fix | Evidence |
|---|---|---|
| **F-01** council index absent | `build-councils.mjs` is now part of `dev`/`build` and exits cleanly with an explicit warning when the 20 MB local extract is missing. Regenerated the index and all 35 boundaries. | `councils-index.json` 12.0 KB, 35/35 `area_km2 > 0`, geometry 436 KB total; `councils.spec.ts` 7/7. |
| **F-02** transport artifact absent | Ran `gtfs-convert.mjs --stops`; registry now marks transport `published` with `countKey: transport.stops`. | 26,198 stops / 6.2 MB; `transport.spec.ts` 2/2 against an independent pip reference. |
| **FR3.1** council tree shards | A plain `shard-trees.mjs` run now auto-discovers `Data/council-downloads/*/trees.geojson` and emits `public/data/councils-trees/`, so `dev`/`build` cannot ship a selector with no shards. | Parramatta 66,345 trees → 15 shards; council shard test now passes. Missing downloads are skipped, not faked. |
| **F-08 / EXP-005** stale Explore copy and defaults | Headline no longer aggregates overlapping datasets; it leads with "Park records" for the parks list. Default map is parks + off-leash areas only; trees, toilets, fountains, NPWS and transport are opt-in. | `explore.spec.ts` new EXP-005 test; F-08 copy assertion in the park-count test. |
| **INS-001…004** Insights still employment-shaped | Added a real "What this build measures" section (published layers, record counts, publisher, coverage, park-type breakdown) before the prototype, and labelled the filter grid / stats / Oracle search as an unlicensed, deliberately gated prototype. | `dashboard.spec.ts` 6/6, axe and contrast on the dashboard in both themes. |
| **F-19** frozen install | Removed the duplicated `packageManagerDependencies` document that had been prepended to `pnpm-lock.yaml`; the real v9 lockfile was kept. | `pnpm install --frozen-lockfile` exits 0 (“Lockfile is up to date”). |

## Verification run in this workspace (restoration pass)

- `pnpm run typecheck` — exit 0.
- `pnpm run test` — 235 tests / 13 files pass (4 new in `layers.test.ts`).
- `pnpm run build` — exit 0; shard → stats → council index → Vite.
- `pnpm install --frozen-lockfile` — exit 0.
- Playwright (Chromium): **54/54 pass in 1.8 min** across all eight specs
  (`explore`, `councils`, `dashboard`, `perf`, `transport`, `a11y`,
  `contrast`, `home`). The previously timed-out `perf` and `transport` specs
  now complete in seconds to low minutes. The About axe scan waits for the
  body background transition to settle before measuring, so it no longer reads
  a half-faded palette.

## Deliberately still open

- **Featured place** (HOM-003) is omitted rather than faked. The hero plate is the
  City of Sydney park layer alone; drawing a “Greater Sydney” plate from it would
  imply coverage the park layer does not have.
- **Other councils' trees**: only Parramatta has a downloaded tree dataset, so
  the council tree registry holds one entry. The selector still scopes parks
  and boundaries for all 35.
- **Canopy** remains gated by licence (CC BY-NC-ND / TBD-11/TBD-12). The
  extraction script and source zips exist, but no derived percentage is shown.
- **Employment prototype** is visible only as an explicitly gated interface
  prototype; no job dataset exists (TBD-7) and every dependent figure is “—”.
- **Bundle artifact side effect:** `pnpm build` regenerates ignored data
  artifacts (`stats.json`, tree shards, boundaries, council shards). They are
  local build outputs, not committed source.
