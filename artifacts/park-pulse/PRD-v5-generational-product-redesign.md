# Park Pulse — Generational Product Redesign PRD

**Version:** 5.0 · **Status:** Research and specification complete; implementation not authorized by this document  
**Prepared:** 2026-10-18 · **Product:** Park Pulse · **Application:** `artifacts/park-pulse`  
**Purpose:** Single, evidence-labelled specification for a whole-site redesign that makes Park Pulse a credible, useful discovery product for parks and public amenities—not a decorative dashboard.

> This is a product and design specification, not a claim that the application, data, licences, or the recommendations below have passed implementation or production acceptance. Facts are labelled **verified in workspace**, **reported by project documentation**, or **unverified**. Recommendations are not findings. This PRD does not grant authority to deploy, publish data with unresolved rights, add dependencies, or alter production.

## 0. Relationship to existing documents

- This document is the design, page, content, and user-experience successor to the older [PRD-v4](PRD-v4-sydney-facilities-atlas.md) and is intended to supersede redesign-related UX assumptions in the root `FINAL_PRD_V5.md` where they conflict.
- Existing data-pipeline contracts, open questions, and per-council acquisition evidence remain in [`../../FINAL_PRD_V5.md`](../../FINAL_PRD_V5.md), [`../../DATA_INVENTORY.md`](../../DATA_INVENTORY.md), [`../../Data/council-manifest.json`](../../Data/council-manifest.json), and [`../../Data/council-sources.md`](../../Data/council-sources.md). Do not silently treat a “downloaded” status as permission to publish.
- The codebase’s [REDESIGN-NOTES.md](REDESIGN-NOTES.md) records the prior map-first Explore repair and its verification claims. It is useful context, not independent verification of the present snapshot. This new PRD requires a **square/near-square, immediately visible Explore map plus a deliberate full-site content redesign**; where that differs from existing layout tests/notes, update tests only under a separately approved implementation plan.
- **No implementation is specified as already done.** The task that produced this PRD was explicitly read-only. Preserve the starting worktree and all uncommitted files.

---

# Part A — Executive summary and product strategy

## 1. Vision

Make it effortless to answer: **“What useful, welcoming public green spaces and amenities are near me, and what do I need to know before I go?”** Park Pulse should join an honest map, a readable search/results experience, useful facility details, and transparent source/coverage information. It should be welcoming to casual visitors without hiding controls from people who need them.

The map is essential, but it is one way of understanding the place—not the only interface. Search, filters, a result list, feature details, map state, and provenance must work as one product. Never imply that a sparse or differently sourced layer is a complete regional inventory.

## 2. Audited product context

| Area | Verified in workspace / code | Consequence |
|---|---|---|
| App shell | React 19, Vite, TypeScript, Wouter SPA; routes are `/`, `/explore`, `/dashboard`, `/about`, and a fallback. Pages are lazy-loaded in `src/App.tsx`. | Preserve SPA and route-level loading unless measurement establishes a reason to change them. |
| Map | Leaflet 1.9 with markercluster, custom markers, culling, viewport logic, URL state, and a Radix-based park detail dialog. Explore is large (2,960 lines in the snapshot inspected). | Improve the experience without a wholesale map-library rewrite; decompose the page only in an approved implementation plan. |
| UI | Handwritten `pp-*` styling and six legacy theme IDs; Radix/shadcn components are vendored and already present. Dashboard already uses the vendored UI patterns. | Use existing primitives when appropriate; no new UI dependency merely to achieve a redesign. |
| Test scaffolding | 11 Vitest files and 7 Playwright specs were discovered. Tests cover Explore, councils, accessibility, contrast, performance, dashboard, and transport. | Keep interface tests aligned to the new responsive composition and exercise all core states. The existing test count is not a pass result for this snapshot. |
| Project data | App-served files exist in `artifacts/park-pulse/public/data/`; read-only parsing confirmed the counts below. | Data visualisation and counts must use the served artifacts or clearly labelled manifests, not aspirational inventory documents. |
| Generated data gap | In the inspected snapshot, `public/data/boundaries/` and `public/data/transport/` are absent; the Explore code requests `boundaries/councils-index.json` and, when enabled, `transport/stops.geojson`. The index builder and GTFS converter exist, but their outputs were not present. | Council boundary controls can fail until a reproducible build pipeline emits the files. GTFS must remain unavailable/disabled with an honest state until its output exists. |
| Job data | `public/data/oracle/index.json` is a 48-byte empty index; Dashboard code intentionally handles empty job data. | Employment and Oracle content stays visibly gated/empty; do not seed production with mock listings or decorative zeroes. |
| Network/build | `pnpm` was absent; Corepack resolved the pinned `pnpm@12.6.0` and the install was then attempted. `pnpm install --frozen-lockfile` **failed** with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: the `overrides` map in `pnpm-workspace.yaml` is not reflected in the working-tree `pnpm-lock.yaml`. The lockfile was **not** rewritten, because that file carries pre-existing uncommitted changes. No app run, test, build, or browser route check was performed. | Runtime observations are source inspection only. Frozen-install reproducibility is itself a Phase 0 blocker (F-19); rerun baseline QA in an authorized execution session. |
| Instructions/tools | No repository `AGENTS.md`, `CLAUDE.md`, or `SKILL.md` files were found. This session exposed a web-research agent, but not `/ecc-recipes`, context7, shadcn MCP, radix-ui MCP, or browser automation. | The specification records available research honestly; it must not imply unavailable skills/MCPs were invoked. The implementation agent should check actual availability again. |

## 3. Intended users and product principles

User groups below are product hypotheses, not findings from interviews. Validate them with users before optimizing for one group:

1. Residents and visitors looking for a nearby park or amenity.
2. People planning a specific outing (play, dog exercise, picnic, sport, quiet green space).
3. People who need practical access information, including accessible amenities.
4. Civic/open-data users checking where a record came from, when it was updated, or where coverage stops.

**Principles:**
- **Useful before impressive:** every headline, metric, chart, card, and animation earns its place by answering a real question.
- **Coverage is part of truth:** show geography, source, update date, and known limitations beside claims about records.
- **Map + list parity:** selecting and filtering in one representation is reflected in the other; no map-only critical task.
- **Known / unknown / absent are distinct:** an unavailable field is not “No”; missing dataset is not “zero”; no listed record is not proof that no facility exists.
- **Progressive detail:** clear basic use first; secondary layers and technical provenance remain discoverable.
- **Accessible and fast by construction:** keyboard, screen-reader, reduced-motion, zoom, and lower-powered device use are first-class.
- **No false promise:** no unsupported “live,” regional completeness, verified accessibility, or popularity claim.

## 4. Scope and exclusions

**In scope:** two-theme design system; full redesign of Home, Explore, Insights/Dashboard, About, shared navigation/footer, not-found, and key dialogs; truthful use of all publishable existing datasets; accessibility, responsive layout, copy, asset strategy, source/licence transparency, performance and QA requirements; exactly three proposed routes (Part E, §15).

**Out of scope unless a future decision unlocks it:** user accounts; public contributions/moderation; trip routing or timetables; job-listing feeds or employment statistics; a live data-ingestion service; a database migration; claiming operational status for incomplete generated artifacts; broad 38+ LGA coverage as a product promise; publishing datasets or derivatives whose rights are unresolved. Do not commit large generated data, raw archives, build output, or secrets as part of the redesign.

---

# Part B — Current-state audit and dataset truth

## 5. Routes and journeys

| Route | Current implementation and purpose | Verified design/content issues and opportunity |
|---|---|---|
| `/` Home | Hero, external Unsplash image, Quick Explore 10-card grid, hard-coded “park of the day” and facts, recent history, feature cards, counter stats, CTA, footer. | Quick Explore is explicitly removed from the target. Many sections repeat the same feature claims; “park of the day,” facts, and stats are constants rather than demonstrably sourced/rotated from the live index. Copy claims “live open data,” “2,000+ parks,” and other coverage without defining scope. Replace with a compact editorial landing and live, sourced snapshot; remove unsupported claims. |
| `/explore` | Search, council selection/stats, filters, result cards, Leaflet map, map legend, favourites/recents, URL actions and park dialog. | Component is very large and state-dense. Current copy says “everything is on by default,” though the exact default layer availability differs and generated boundary/transport outputs are absent in this snapshot. Existing above-fold shell has a left rail and map, but prior notes describe it as wide rather than near-square. Redesign with grouped filters, readable category hierarchy, balanced near-square map, clearer result/map sync, coverage context, and resilient missing-data states. |
| `/dashboard` Insights | Filter grid, council jobs panel, Oracle search; job index intentionally empty; council URL scope shared with Explore. | The page’s employment-based scope cannot produce real output with the empty index. Redesign as an honest **parks and public-amenities insight** page using available verified data; put gated job features in an explicitly “not available” product decision register, not in the primary dashboard. |
| `/about` | Mission, steps, source cards, tech stack, tips, shortcuts, external Unsplash image, update date. | Repetitive promotional language, stale/contradictory counts and theme descriptions, weak data limitation/licensing presentation. Replace with a concise product explanation, real coverage table, provenance/methodology, and contact/feedback path only if an owner supplies it. |
| Fallback | Branded 404 with links to Explore/Home. | Keep branded recovery; provide route-safe links, descriptive page title, keyboard visibility, and no broken link fallback. |
| Shared navigation/footer | Four route links and theme picker; footer repeats destinations and offers filter links. | Keep simple IA, improve current-route semantics, mobile menu focus/escape behavior, and footer source/legal references. Verify each filtered deep link against actual parser behavior before retaining it. |

**Existing user journeys to preserve:** search by park/suburb/type; search suggestions and recent queries; council single/multi selection and shareable URL; filters/sorting and result counts; map/list selection; park detail, nearby facilities, directions, coordinates; locate-me permission flow; favourite, recents, and reset; keyboard help; theme preference; transit as opt-in. Validate each interaction independently—component presence does not prove correct behavior.

## 6. Findings register

Severity: **P0** release blocker, **P1** high, **P2** medium, **P3** lower. Classification is explicit; a source-inspection finding is not presented as a browser reproduction.

| ID | Class / priority | Evidence in inspected snapshot | Required disposition |
|---|---|---|---|
| F-01 | Verified workspace gap / P0 | Explore fetches the council index, but generated `public/data/boundaries/` is absent; the generator is not called by package `dev`/`build` scripts. | Make generation a deterministic, documented prerequisite/build stage or deliver validated artifacts through the approved data packaging process. Fresh checkout must not silently break council UI. |
| F-02 | Verified workspace gap / P0 | Explore’s enabled transport path fetches `data/transport/stops.geojson`; `public/data/transport/` is absent in snapshot. | Keep the layer disabled/unavailable with a labelled explanation until the conversion output exists; integrate only after local pipeline tests and license review. |
| F-03 | Verified product-data inconsistency / P1 | `stats.json` says 51 dog areas; Home/About claim 29. `meta.json` data date is 2026-05-02 while stats generation is 2026-10-18; About footer says data updated 2025. | Generate public figures from one validated manifest and make observation date explicit; remove stale literal counters. |
| F-04 | Verified product-data inconsistency / P1 | `stats.json` reports canopy average 22.2%; `Data/council-sources.md` documents 16% area-weighted mean across 33 measured councils. `council-sources.md` notes CC BY-NC-ND and says derivative publication needs clearance. | Reconcile formula, selected universe, and provenance. Do not surface either number as an unqualified product metric or publish canopy-derived values until legal approval. |
| F-05 | Verified unsupported product language / P1 | Home copy claims “live open data”; existing manifests describe manually collected/static local extracts, and freshness metadata is mixed. | Replace “live” with precise local snapshot/freshness language. Show a date only if tied to a reproducible source manifest. |
| F-06 | Verified implementation limitation / P1 | OSM Blacktown file has 1,605 points; metadata says it spans Blacktown, Cumberland, and Parramatta and calls it not council data. Read-only file sample: 1,592 records have no suburb field. | Do not label all 1,605 as Blacktown/council parks or claim council completeness; expose as OSM-derived mapped places with spatial scope caveat and licensing/attribution. |
| F-07 | Verified UX risk / P1 | Park records are 418 polygons; list/map use a computed centroid for map pins and the list names them parks. Facilities and polygon records are separate layers. | Preserve polygon geometry for map selection/detail context; label point as representative centre only where needed. Do not conflate dataset records into one “parks” total without defined deduplication. |
| F-08 | Verified scope issue / P1 | `stats.json` defines `locations: 2023`, matching 418 City of Sydney park records plus 1,605 OSM-derived park/playground points; other facility layers are not included in that figure. The OSM data cover a partly overlapping region and are not a council inventory. | Remove unqualified “mapped locations” total or explain its exact two-source layer-record scope; do not imply unique places or complete park coverage. Lead with separate category counts. |
| F-09 | Verified missing-data state / P1 | Oracle index is empty; Dashboard labels job stats/search whose numeric outputs cannot be populated. | Recenter Insights around real parks/amenities data; job-based dashboard remains hidden or clearly gated until an approved, licensed dataset exists. |
| F-10 | Verified content inconsistency / P1 | Home/About claim 2,000+ parks/green spaces, 29 dog spaces, 1,795 NPWS, and six map themes. The legacy 2,023 figure only sums two park-related datasets; 51 off-leash records are in the served dog file; six is the existing UI theme count, not a product outcome. | Replace with scoped category-specific counts and make map-theme UI count irrelevant to product impact. |
| F-11 | Verified asset risk / P2 | Home and About use remote Unsplash URLs in JSX; only favicon and Open Graph image are in app public assets. No license/accessibility/availability evidence was supplied for the two referenced photos. | Audit usage rights, consent/representation and origin; use licensed, optimized local assets with dimensions and descriptive alt text, or remove imagery. |
| F-12 | Potential route-state risk / P2 | Footer links include `filter=playground`, `dogs`, `iconic`, `pocket`, `sportsfield`, `sort`, `locate`, and `surprise`. Source inspection indicates corresponding handlers exist for these parameters, but links were not exercised in a live browser and no exhaustive link audit was run. | Verify every deep link end-to-end before declaring it broken; retain supported destinations, correct only demonstrated mismatches, and test refresh/back/forward and invalid values. |
| F-13 | Verified documentation conflict / P1 | Existing PRDs contain earlier/superseded scope and “38+” framing. Project research says official Sydney planning region has 33 LGAs; local index covers 35 incl Central Coast and unincorporated. | Use “35 boundary entries” only when describing index; identify 33 official planning-region LGAs plus two additional entries where methodology supports it. Do not assert 38+ without an owner-approved boundary definition. |
| F-14 | Verified visual/copy opportunity / P2 | Home has 10 Quick Explore cards; separate “What You Can Find,” facts, stats, and CTA repeat functionality. | Remove Quick Explore entirely; integrate legitimate entry actions into Explore search and a compact 3-step hero preview. Do not rebrand an equivalent card grid. |
| F-15 | Verified interaction debt / P1 | Explore owns many behaviors and UI states in a single page; custom shortcuts overlay is not a Radix dialog; some handlers create URLs/clipboard actions with local toasts. | Implement only after interaction/state inventory, tests and dependency review; use accessible dialog primitive for overlay, validate external actions and failure feedback. |
| F-16 | Potential / P1 | The transport converter processes GTFS stop_times fields to join route modes; actual public layer artifact absent. OSM/tiles use external services. | Audit data rights and upstream use policies. Keep arrival/frequency features out of scope; graceful offline/upstream error behavior. |
| F-17 | Unverified / P1 | No browser screenshots, runtime errors, accessibility scans, link probes, performance profile, or build/test result was produced in the audit environment. | Carry as a pre-implementation baseline gap. Do not mark current routes, mobile behavior, accessibility or performance pass/fail. |
| F-18 | Verified availability / P2 | `pnpm` and project dependencies were unavailable. E2E config would create test artifacts if run; no run attempted. Corepack later resolved the pinned CLI, but install still failed before dependency resolution (see F-19). | A later authorized execution session should install via project’s pinned package manager and inspect exact script side effects before running. |
| F-19 | Verified reproducibility blocker / P1 | `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`; `pnpm-workspace.yaml` declares a large `overrides`/`allowBuilds` map (`esbuild` pinned to `0.27.3`, platform packages excluded, `lightningcss`/`rollup`/`@tailwindcss/oxide` targets removed) that the checked-in `pnpm-lock.yaml` does not record. A frozen, CI-safe install cannot run from this tree as-is. | Regenerate and commit the lockfile with the intended config, or reconcile config and lockfile deliberately; verify `--frozen-lockfile` on a clean checkout before any release or CI gate depends on it. Do not hand-edit or silently drop overrides to make CI green. |

## 7. Data inventory and publication status

Counts below were parsed from app-served files in this snapshot, not live source systems. They are **record counts**, not unique real-world place totals. Coordinate/coverage and freshness must be shown per layer, not inferred from a marketing label.

| Layer (app path) | Snapshot records / structure | Fields and useful display | Coverage / provenance / freshness | Target default |
|---|---|---|---|---|
| City of Sydney parks (`Parks.geojson`) | 418 polygon/multipolygon features; 1.15 MB | name, type, playground flag, area, asset id. | City of Sydney; 415/418 centroids within boundary is a note in the manifest, not independently revalidated in this audit. Last update/license need source-record verification. | On; primary parks layer, boundaries preferred to centroid pins. |
| OSM park/playground features (`blacktown.geojson`) | 1,605 point features; 0.57 MB. 1,592 lack parsed suburb fields in inspection. | OSM tags include names, leisure/amenity, access, hours, wheelchair, dog, sport, website; actual tags vary by record. | Metadata claims Blacktown/Cumberland/Parramatta and explicitly says not council data; source provenance/license in manifest unresolved. | Off until rights/provenance clarified, or on only with distinct “OSM mapped places” layer and visible ODbL notices/review. Never use to assert complete council inventory. |
| City tree inventory (`trees.geojson`) | 48,999 points; 16.8 MB; sharded at runtime by script. | species/common name, DBH, height, canopy measurement field, type, age/status, asset id. | Metadata says City of Sydney extract and “live layer is newer”; determine actual vintage/validity before user-facing age/condition claims. | Off at overview zoom or zoom-gated; discoverable in Trees category, rendered progressively. |
| Toilets (`toilets-sydney.json`) | 3,127 array records; 420 KB. | compact keys: name, lat/lng, suburb, hours, accessible/baby-change booleans (`h/a/b`). | National Public Toilet Map attribution in metadata; reuse license still requires source-specific confirmation. Attribute flattening means not all NPM fields appear in app. | Off at regional zoom; available as opt-in amenity, cluster/aggregate. |
| NPWS facilities (`npws-facilities-greater-sydney.geojson`) | 1,795 points; 1.0 MB. | asset/subtype, branch, LGA, comments, modification date, coordinates. | NSW NPWS/SEED. Coordinate fields also carry DMS text; validate actual geometry coordinates and date semantics. Current “last updated” and licence must be confirmed. | Off at low zoom; offer a clear facility category switch. |
| Drinking fountains (`drinking-fountains.geojson`) | 273 points; 74 KB. | site name, suburb, accessibility flag. | City of Sydney metadata; confirm exact licence/date and meaning of accessibility field. | Opt-in. |
| Dog off-leash areas (`Dog_off-leash_parks.geojson`) | 51 points; 24 KB. | park name, suburb/postcode/street, hours, prohibited areas, description. | City of Sydney metadata; local extract geography should be verified before making “Greater Sydney” wording. | On as distinct dog amenity; preserve hours/restrictions. |
| GTFS stops | `public-transports.json`: 1,164 points/records; legacy file. A different `transport/stops.geojson` (26,198) is described in docs and converter, **absent in inspected public tree**. | legacy schema differs from converted GTFS; converted mode types and count have docs but no artifact. | TfNSW feed archive; source licence/version and service date need review. | Off; only surface whichever validated artifact actually ships, with feed date and coverage. |
| Canopy | No canopies or council boundaries output present in app-served directory in this snapshot. `stats.json` contains a 22.2% figure; docs report 33/35 derived values, 16% weighted mean. | Scalar cannot be treated as an authoritative layer before definitions/reconciliation. | NSW 2024/25 canopy source described as CC BY-NC-ND; legal review explicitly needed before publishing derivatives. | Not displayed as a numeric value/map until rights, formula and discrepancy resolved. |
| Council boundaries | No app-served index or per-council geometry present in snapshot; builder and source JSON exist outside served data. | 35 boundary entries reported; selected index fields include area and display labels after generation. | official-region boundary definition and license/attribution still must be published. | Selector shown only after generated index is included/verified; otherwise hidden disabled state with explanation. |
| Oracle/jobs | `oracle/index.json` is empty. | No production listing schema/data to visualize. | Dataset, rights, coverage, currentness, and campuses unresolved. | No fake job content; omit from core navigation/dashboard pending gate. |
| Other discovered inputs | Alcohol-free zones in `Data/` (not currently in app public data), raw boundaries/archives and council downloads exist in workspace, not every one is served. | Do not expose solely because a file exists. | Validate source, geometry, licence, regional scope, sensitivity, and generation pipeline before publishing. | No default layer unless an ingestion decision passes the gate. |

### 7.1 Data contract / quality gates

Every publishable layer MUST have a machine-readable record: `id`, human label, publisher/source URL, licence and exact attribution, geographic coverage and known gaps, geometry/CRS, feature count at generation, source observation date, fetch/generation date, field meanings/units, validation result, update policy, and UI default/zoom strategy. Missing values remain `null`/“Not provided”; invalid geometry is reported and excluded with a count, never silently corrected or fabricated.

Before displaying a derived metric: document formula, denominator, scope, filters, handling of missing records, cross-check against source, repeatable test, and a visible methodology note. “Feature rows” must not be labelled unique “parks.” Never add category counts to produce a unique total without reliable deduplication.

### 7.2 License and external-service gates

- **Do not ship** Parramatta parks/trees until explicit license/permission is confirmed; manifest says no license was stated.
- **Do not present Blacktown OSM-derived records as council-owned/open council data.** Confirm source and ODbL obligations; show OSM attribution when the layer is used and get data/licensing review for database combination/redistribution.
- **Do not publish canopy percentages or geometry** until ND derivative/display rights are explicitly cleared by the data owner/legal reviewer. A user-provided copy of the data does not authorize publication.
- Confirm toilet dataset reuse rights; public-facing availability of the National Public Toilet Map is not by itself evidence of an open reuse licence.
- Confirm precise City of Sydney, NPWS/SEED, TfNSW, boundary and dog data licence records and attribution. Keep OpenStreetMap tile attribution visible and follow provider policies.
- No new third-party data feed, API credential, geocoder, analytics, or hosted service without a separate owner gate and service/rights research.

---

# Part C — Design system

## 8. Visual direction: “Field Atlas”

A contemporary civic field guide: editorial clarity, a restrained emerald identity, lightly tactile cards, precise maps, useful labels, and enough photographic warmth to invite exploration. It should feel locally grounded and trustworthy—not like a SaaS admin panel, an unstructured checkbox wall, or a stock-photo brochure. Photography supports place/context; it never substitutes for actual mapped data.

### 8.1 Exactly two themes

**Theme 1 — Night Field (OLED black + emerald):** near-black canvas, raised charcoal surfaces, cool/muted green-gray text, bright emerald for primary action and focus, separate map surface. Avoid large glowing gradients and neon overload.

**Theme 2 — Warm Field (warm white + deep green):** warm near-white canvas, white/card surfaces, deep forest-green text/action, soft sage borders, restrained earth/leaf accents. Preserve the same hierarchy while using warmer paper-like surfaces.

Proposed initial tokens are hypotheses and must be checked in rendered UI, states, and contrast tests before they become final. WCAG ratios below use the sRGB contrast calculation for these pairs only; they do not certify every component state.

| Token | Night Field (proposal) | Warm Field (proposal) |
|---|---|---|
| `--pp-bg` | `#080D0B` | `#F6F7F1` |
| `--pp-surface` | `#111A16` | `#FFFFFF` |
| `--pp-surface-raised` | `#18231D` | `#ECF1E9` |
| `--pp-text` | `#F2F5F3` | `#19231D` |
| `--pp-text-muted` | `#B4C2B9` | `#45544A` |
| `--pp-primary` | `#43D18A` | `#176B43` |
| `--pp-border` | `#34443A` | `#D2DDD2` |
| `--pp-focus` | `#9AF2BF` | `#176B43` |
| Example body contrast | `#F2F5F3`/`#080D0B` = 17.83:1; muted `#B4C2B9`/`#080D0B` = 10.59:1 | `#19231D`/`#F6F7F1` = 15.00:1; `#45544A`/`#FFFFFF` = 8.02:1 |

Use explicit high-contrast text/icon colours on primary buttons, add hover/pressed/disabled tokens, and test overlays/compositing. Theme toggle changes the UI palette, not the map’s external provider; a satellite map base can remain a separately named map style only if it is still licensed, reliable, and described accurately. Remove “six themes” marketing if product theme count becomes two.

### 8.2 Type, spacing, shape, motion

- Keep existing Inter as a starting family; do not add a font dependency. Prefer locally bundled/self-hosted licensed WOFF2 after checking font license and effect on bundle; otherwise retain robust system fallbacks and avoid delaying first paint on Google Fonts.
- Editorial display headings: responsive clamp, tight line-height, clear hierarchy; body minimum 16 CSS px for primary reading; metadata is subordinate but readable. Use tabular numerals for data.
- Use a consistent 4px spacing base, 8/12/16/24/32/48px scale; 8px default control radius, 12–16px cards, pills only for true chips, not every container.
- Borders and low-elevation shadows establish hierarchy; avoid thick card stacks and gradient-as-decoration. Animation is short and purposeful; honor `prefers-reduced-motion` and do not animate metric count for essential information.
- Icons use the existing Lucide package where it is already available; every icon-only control has an accessible name. Never encode category/status by color alone.

---

# Part D — Page-by-page requirements

## 9. Shared shell, navigation and footer

**NAV-001 (P1):** A compact shared header contains brand/home, primary destinations **Explore**, **Insights**, and **About**, with one evident primary “Explore parks” action where space permits, and the two-theme selector. Mark the current route using `aria-current="page"`. Do not add an unimplemented fourth menu category. Desktop header height target 64–76px; mobile menu is an accessible disclosure/sheet with Escape/outside close, focus return, no hidden tabbable content.

**NAV-002 (P1):** One canonical route/deep-link registry defines public page paths, filter query keys, sort values, park IDs/slugs, council IDs/mode, and invalid-param behavior. Use stable feature identifiers when present; resolve legacy `?park=name` safely. Ensure navigation links do not discard active search/council scope without user intent. Back/forward and reload reproduce shareable state.

**NAV-003 (P1):** Audit every internal and external link in Home/About/footer/popups/cards. Each label describes destination/action; external links use safe target/rel, identify third parties, and have a verified HTTPS URL. Remove repeated footer filter links that duplicate the Explore control unless they remain reliable, useful deep links. Do not claim manual validation of external links until probed.

**NAV-004 (P2):** Footer is concise: product purpose, primary route links, dataset-source/methodology route, required layer attributions, last data refresh based on source manifest, and privacy/accessibility/contact links only when owner-provided policy/destination exists. Remove “Built by … · Data updated 2025” until verified/current. Do not invent legal pages or contact address.

## 10. Home (`/`)

**Goal:** Explain scope and usefulness quickly, then open discovery. No Quick Explore grid.

**HOM-001 (P1):** Hero at first view: short eyebrow “Parks and public places across Greater Sydney”; headline “Find your next patch of green.”; support copy: “Explore parks and public amenities on a map, with source and coverage shown as you go.” Primary action “Explore the map”; secondary “How the data works” links to About or data-methodology page only if its anchor exists. Compact portrait/collage/map thumbnail is optional only if authentic, licensed and locally optimized.

**HOM-002 (P1):** Replace feature-card repetition with three proof-led bands: (1) a date-stamped snapshot from the local data manifest (only category-specific, provenance-aware counts; distinguish source coverage; do not sum overlapping categories); (2) 3 illustrated steps (search, narrow by amenity/council, inspect a sourced feature); (3) a cropped, interactive preview or editorial screenshot that leads directly to Explore. Home has one clear CTA near hero and one at end, not multiple repeated “ready?” sections.

**HOM-003 (P1):** Remove hard-coded `FEATURED_PARKS`, `FACTS`, `getHoursUntilNextPick`, and static counter animation as authority. Replace “Park of the day” with a deterministic sample selected from the loaded, eligible, licensed park dataset (label “Featured place” and include a provenance link), or omit if no reliable, genuinely useful feature selection can be delivered. Facts/figures derive from generated stats and carry source/date; no stock “interesting” facts until individually sourced and validated.

**HOM-004 (P1):** Recent history remains only if users can remove it, storage failure is handled, labels explain local-only retention, and links open the correct place. Respect privacy; do not add tracking or server identity. If disabled in browser, page remains functional.

**HOM-005 acceptance:** No Quick Explore heading/card grid; no stale literal count/fact; hero CTA reaches `/explore`; every displayed number reconciles to a manifest; all images have rights evidence and width/height, optimized variant, intentional crop and appropriate alt (or empty alt if decorative); mobile first viewport has no overflow or oversized hero.

## 11. Explore (`/explore`) — primary product surface

**EXP-001 composition (P1):** Short intro, then a two-column product workspace: left discovery rail (search, council/area scope, category groups, active filters/results) and a prominent **square or near-square** map on the right. At 1280×720 and 1440×900, the map must be visible at initial load without scrolling. Target map frame aspect ratio 1.0–1.5 (width:height) where viewport allows; use available height intentionally and never shrink to a tiny thumbnail. Visually separate rail and map with 16–24px gap and distinct surface/border treatment. Avoid a tall hero taking up the first view.

**EXP-002 responsive (P1):** At wide desktop, rail and map share one workspace. Tablet transitions to a compact filter drawer/top bar and useful map/list switch; mobile (390×844 and 320×640 stress case) uses a clear **Map / Results** switch or stacked summary, full-screen/large map on Map tab, bottom-sheet filters/details only when modal behavior and focus are correct. Map remains operable after panel changes via `invalidateSize`; controls are not covered by sticky elements/home-indicator. No horizontal page scroll. Do not copy a desktop side-by-side layout down to phone.

**EXP-003 find and scope (P1):** Search searches supported attributes and category names actually present; debounced input has clear button, accessible suggestion list and keyboard selection, `aria-live` result count, and safe empty/no-match/error/loading states. A search for unsupported attributes must not appear to work. Council filter uses only a generated, validated boundary index; on absent output present a concise unavailable state and preserve other Explore features. Selected council mode and deep link only work after the verified geometry output is included. “Search this area” is an explicit optional action after map pan/zoom; it does not silently change result scope.

**EXP-004 category taxonomy (P1):** Search and filters group by task: **Places** (parks/green spaces; park type/playground where sourced), **Visit needs** (dog off-leash hours/restrictions; toilets; water), **Nature & facilities** (trees, NPWS amenities), **Getting there** (transport, opt-in), **Area & council** (verified council selection). Keep major categories immediately visible, minor categories discoverable in collapsible groups with counts when known. Park-type checkboxes are refinements, not separate duplicate record layers. Show dataset/coverage badges for distinct provenance, especially OSM. Hide or disabled-label unsupported categories with why; never a dead control.

**EXP-005 defaults (P1):** Default to readable primary park layer and core dog-area data only after layer/license/coverage verification. Avoid crowding low-zoom map with 48,999 trees, 3,127 toilets, 1,795 NPWS or thousands of points. These remain available via category toggles; layer count is sourced and filter-aware. Transport is opt-in. OSM, canopy, council and GTFS availability follow their gates in §7.2. “All data on” is explicitly **not** a target if it obscures results or misleads; broad data accessibility is the target.

**EXP-006 map/list synchronization (P1):** One state model owns category toggles, text query, council selection, selected feature, sort, map extent state, and shareable URL. Selection from list and map opens the same detail view, highlights/focuses corresponding map geometry/marker, and results count describes current scope. Cluster counts are not presented as unique filtered result totals. Marker clustering/viewport culling stays in use; tree shards remain zoom-gated. Fit bounds is triggered by explicit scope changes, not every asynchronous load or pan. Handle overlapping markers through cluster and keyboard-accessible result list; do not use color alone.

**EXP-007 presentation and controls (P1):** Results panel includes count, active-filter chips with remove, clear all, useful sort options only when data supports them, cards with sourced name/type/suburb and available facilities. Distinguish polygon areas from point facility records. The map has named zoom/locate/recenter controls, attribution, interactive layer legend, and non-map alternative. Layer controls are keyboard and touch usable; ensure focus is visible/unobscured. Avoid burying first-time filters inside an unexplained collapsed panel.

**EXP-008 detail overlay (P1):** Keep a centered, focused accessible dialog on desktop (width 560–720px, max-height 85dvh; scrollable body) with header, category/source badge, place name, geographic context, facility details, data freshness/provenance/coverage, and actions. The existing Radix Dialog foundation may be reused. Escape closes, focus traps, focus returns to actual opener, click outside closes only if safe, controls have names. Map pan/zoom and results remain unchanged on dismiss; selection highlight persists until new selection/reset. On mobile present a near-full-screen dialog/bottom sheet with accessible close and no focus hidden behind browser chrome. Use only fields available per record; unknown data is labelled unknown, not “No.” Text from data is rendered as text, never interpolated into HTML. External directions/share links are derived from validated numeric coordinates and use safe `rel`.

**EXP-009 error and empty states (P1):** Separate “no search matches,” “no features in this area,” “dataset not loaded,” “network failed,” “filter combination too narrow,” “data not published/licensed,” and “browser denied location.” Include retry only for retryable failures; no infinite repeated requests. Keep map usable when an optional overlay fails. Location permission denial never blocks manual map use.

**EXP-010 search/history/favorites (P2):** Retain favourites, recent and shortcuts only after keyboard/mobile testing. State is local-only and can be cleared. Shareable URLs exclude location coordinates and personal/favourite data unless the user explicitly opts in. Prevent query parameters with unsafe size or malformed identifiers from causing work or layout failure.

**EXP acceptance:** Browser checks at 1440×900, 1280×720, 1024×768, 768×1024, 390×844 and 320×640; verify layout/map ratio, filter state and deep links; keyboard-only search→filter→select→details→close; map/list selection sync; dataset error and missing artifact states; no core task depends on color or map pointer use; axe serious/critical zero plus manual focus/contrast review; each layer’s record tally matches the validated manifest, with overlaps noted and no false unique-total.

## 12. Insights (`/dashboard` shown as “Insights”)

**INS-001 (P1):** Reframe around *what the current data can prove*: coverage by layer and geography; park type/playground breakdown for the 418 City of Sydney polygon records; available published facility counts by dataset; source update dates; and transparent “coverage varies by layer” map/table. First question answered: **“What is in this dataset, where does it cover, and how complete/current is it?”**

**INS-002 (P1):** Every visualisation names data period, geographic extent, count/denominator, unit and source. Use category bar charts only where each record’s categories are understood. Provide keyboard-accessible data table equivalent; labels, shape/pattern and color redundantly encode series. Don’t compare councils if underlying facilities are not comparable or scope differs. Canopy is gated (§7.2). Do not chart jobs, vacancy growth, university overlap, or empty-index data in the core page.

**INS-003 (P1):** Remove/rework the employment filter grid and Oracle search from the user-facing primary Insights page while data are absent. Keep technical prototype gated from navigation or show an owner-approved informative notice, not blank filters that imply available jobs. No fake fixtures in production. If future dataset is proposed, document licensor, schema, refresh, geography, bias, and calculation before enabling.

**INS-004 states:** Dashboard loads stat manifest locally; loading skeleton does not imply zero; unavailable source/invalid stats show error and last known valid date (if safe); no source row shows “Not measured,” not zero. Scope changes explicitly recalculate totals; add method note. Acceptance: table/visualization cross-check against same manifest and calculator tests; no charts for unsupported values; narrow screen stacks cards and retains table horizontal accessibility/alternative.

## 13. About and data trust (`/about`)

**ABOUT-001 (P1):** Replace long promotional/how-to inventory with: concise “What Park Pulse does”; scope/coverage statement; how search/map work; data sources and last checked dates; what each layer does/does not represent; accessibility, licence and attribution; known gaps; link to the proposed Data Atlas when available. Keep technical stack as secondary expandable material or remove—users need provenance, not build tools.

**ABOUT-002 (P1):** Copy must not assert that every record is open, current, “live,” complete, Greater-Sydney-wide, accessible, or verified. Say that layers have different coverage and freshness. For example: “Park Pulse combines public datasets. Coverage and update dates differ by layer; check the source note on each result.” This replacement is proposed copy, not an organizational claim.

**ABOUT-003 (P1):** Audit every existing story/claim: “2,000+,” “29 off-leash,” “1795,” “29 parks,” “6 map themes,” “live,” “recently updated,” park-of-day facts, external source badges. Retain only values linked to validated source manifest. Retire keyboard tip content if shortcuts change. Image rights gate applies globally.

**ABOUT acceptance:** every statement traceable to a source/owner approval; all source links tested; all relevant licences and data limitations linked; no empty `lastUpdated`; headings/TOC keyboard navigable; no unsupported user history/impact claims.

## 14. Not found (`/not-found`) and shared overlays

**SYS-001 (P2):** Keep branded 404 with useful Explore/Home recovery, current theme, one h1, title metadata and no stale route-specific state. Test unknown direct URL and SPA navigation. Ensure shortcut help uses dialog semantics, Escape and focus return, unlike a click-only overlay.

---

# Part E — Exactly three proposed new pages

These are proposals, not existing routes and not authorisation to implement. Each requires an approved phase and data/legal gate.

## 15.1 NEW-001 — Amenities (`/amenities`)

- **Problem/audience:** Visitors searching specifically for toilets, fountains, dog off-leash places or NPWS facilities need a category-first directory without configuring a complex map.
- **MVP:** One accessible searchable directory with category tabs/filters, map/list toggle, amenity detail with source/freshness and fields actually in that dataset; query scopes to validated available sources; shareable category/location filters. Deep-link into Explore detail. No fabricated unified address or “open now” calculation from inconsistent source hours.
- **Data:** current toilet, fountain, off-leash, NPWS and park datasets only after rights and field validation; display each source’s geographic scope. Toilets/fountains/dog areas are current local snapshots; not guaranteed citywide. No transport unless separately selected.
- **Acceptance:** results can be reached without map; category count equals source manifest; hours/restrictions render exactly with original meaning; missing amenity field says “Not provided”; external source and accessibility attribute are not inferred. Responsive and keyboard tested.
- **Gate/risk:** toilet reuse license; fountain accessibility semantics; dog layer geography; NPWS coordinate/source timestamps. If fewer than two category layers clear gates, do not launch as a new route; incorporate validated category controls into Explore instead.

## 15.2 NEW-002 — Compare Parks (`/compare`)

- **Problem/audience:** People weighing outing choices need a side-by-side view of only known attributes, rather than repeatedly opening and closing detail cards.
- **MVP:** Choose 2–4 parks from verified park records; compare type, suburb, area when present, playground flag, distances only when user grants geolocation, and nearby facility counts only when computation/data provenance is sound. Selection is anonymous/local; clear/export/share is explicit. Missing values render “Not provided”.
- **Data:** verified park geometries and fields; nearby facility relation can be offered only as “mapped within X km” with documented distance algorithm/source; it must not mean a service is inside the park or available at time of visit.
- **Acceptance:** every value ties to record ID/field and method; fixtures test null/area unit/distance; compare page never asserts that the largest/nearest is objectively best; works at mobile screen-reader/keyboard; no account requirement.
- **Gate/risk:** identity resolution/duplicate features, park area source/units, nearest facility assumptions. If data cannot compare two locations fairly, defer this page rather than fill columns with generic badges.

## 15.3 NEW-003 — Data Atlas (`/data`)

- **Problem/audience:** Users and civic-data practitioners need to understand what is mapped, who published it, what it covers, how old it is, what is missing, and whether reuse is permitted.
- **MVP:** Layer catalogue backed by the same validated source manifest as Explore/Insights; search by category/publisher; coverage badge, row count, observation/generated dates, geography, field descriptions, exact licence/attribution, limitations, source link, and processing/method note. “Not confirmed” is explicit; no download/re-host action until approved.
- **Acceptance:** every visible map toggle resolves to an Atlas record and vice versa; row count and timestamp agree with generated manifest; no licence defaults are guessed; missing source outputs have “not currently published” status; public documentation has accessible table/list equivalent to any map.
- **Gate/risk:** requires a maintained, versioned manifest; legal review and licensing completeness. Defer publication of unresolved legal text while still marking layer “not available pending rights review.” This page complements About by being operational/source-specific, not a second marketing/about page.

---

# Part F — Content and asset plan

## 16. Copy rules and approved draft copy

- Voice: warm, precise, modest, locally grounded; short sentences; use Australian English (“favourites”, “kilometres”). Call the geographic scope Greater Sydney only for a dataset that actually has that extent; say “City of Sydney parks dataset” where applicable.
- Keep nouns stable: **park/green space** for a park dataset record, **facility** for an amenity point, **layer** for a source-backed map collection, **mapped records** for dataset rows. Avoid calling a facility point a park.
- Proposed global notices: “Coverage varies by dataset.” / “Last checked: [date from source manifest].” / “This record may not reflect current on-site conditions.” / “Accessibility details not provided.” Do not show a freshness date when unknown.
- Proposed Explore title: **“Find a park or public amenity.”** Supporting line: **“Search mapped places, filter by what you need, and check each result’s data source.”**
- Proposed Home hero: **“Find your next patch of green.”** Support: **“Explore parks and public amenities on a map, with source and coverage shown as you go.”** CTA: **“Explore the map.”**
- Proposed About: **“Park Pulse brings together public datasets to help people explore parks and amenities. Each layer has its own coverage, update date and limitations.”**
- Empty state: **“No mapped results match these filters. Try removing one or view the full area.”** Distinguish from source/area unavailable: **“This layer is not available here yet. Coverage depends on the source dataset.”**
- Error: **“We couldn’t load this layer. The rest of the map is still available.”** Include Retry only when error is retryable.

## 17. Image audit and strategy

| Asset/use | Snapshot evidence | Requirement |
|---|---|---|
| Home hero | JSX uses `images.unsplash.com/photo-1568393691622-c7ba131d63b4?...`; not in app public assets. | Replace only after confirming subject, rights, local asset availability, people/child consent and editorial fit. Use responsive AVIF/WebP, explicit width/height, focal crop and correct alt. Never depend on remote stock photo for app’s identity. |
| About image | JSX uses remote Unsplash photo `photo-1501854140801-50d01698950b?...`; no local copy or rights record. | Same source/licence/performance audit. Use one authentic asset only if it advances story. |
| Open Graph | `public/opengraph.jpg` exists (101,280 bytes); visual/rights/content audit not completed. | Inspect before reuse, ensure title and asset rights are correct and social preview works. |
| User attachment | `attached_assets/image_1777799543233.png` is a 1565×754 screenshot of Netlify’s generic “Page not found” error. | Treat as diagnostic evidence from a prior context, not a product photograph/design target; do not publish it. |
| Icons/favicons | SVG favicon exists; Explore uses Lucide/inline SVG and emoji. | Use consistent icon family for controls; emoji can stay in user text, not the sole status/category mark. |

Asset budget: hero ≤250 KB mobile/≤450 KB desktop transfer, image dimensions declared, lazy-load below fold, LCP image not lazy-loaded if actually above fold; target no layout shift. Use only assets with documented source and usage terms. No image generation/download in this PRD-only task.

---

# Part G — Technical, accessibility and quality contract

## 18. Data/UI architecture constraints

1. Keep the SPA, Wouter, React, Leaflet, existing source format and cache until profiling justifies change. No database/service expansion in the redesign by default.
2. Use one typed layer registry/manfiest as the authority for label, attribution, license review status, source date, count, coverage and default/zoom behavior. Runtime state derives layer availability from that registry; it does not claim files exist simply because a generator exists.
3. Generated boundaries, GTFS, shards, canopy outputs must have reproducible, offline-testable generation and validation. Before `dev`/`build`, a clean checkout must either generate required outputs via safe deterministic commands or operate with explicit missing-state fallback. Do not make a routine user run multi-gigabyte/raw-data extraction unexpectedly. Document needed local inputs separately.
4. Data from files, query params, popups and external APIs is untrusted: validate GeoJSON bounds/types/schema, escape/render as text, clamp values and avoid unsafe HTML. Validate coordinate order/ranges, geometry validity, duplicate IDs, nulls, units, and row counts.
5. Keep large overlays lazy/viewport-culled/zoom-gated as measured. Don’t load or cache a whole 26k transport stops file to service every pan; ensure query/viewport behavior and memory/cache budget are tested. Keep static source outside app JS; route-level splitting is already configured.
6. Fix single source of truth for `generatedAt` / `dataLastUpdated` and per-layer dates, never a hand-edited homepage value. Build data stats from same ingestion manifest as the map. Version cache keys when schema/interpretation changes; keep network fallback.
7. No proposed service integration. No auth, analytics, payments, hosted database, or external AI is required for this product scope. If one becomes necessary, do independent service research and obtain owner authorization.

## 19. Accessibility requirements

**ACC-001 (P0):** WCAG 2.2 AA target on all routes, both themes, all states. Map has a parallel searchable list and keyboard path; a pin cannot be the only way to access a place. Do not rely on color alone for categories, selected state, warnings or map legend.

**ACC-002 (P0):** All functions keyboard-operable; logical tab order; `:focus-visible`; focus never obscured by header, bottom sheet, popover or modal; skip-to-content; semantic landmarks and one clear page h1; accessible names/state on buttons/toggles/listbox/combobox/dialog.

**ACC-003 (P0):** Text contrast ≥4.5:1 normal, ≥3:1 large; graphical control and focus indicators ≥3:1 against adjacent colors where WCAG applies. Test actual color compositing, hover, disabled, active, shadows/overlays in both themes. Do not treat token-pair math as a full audit.

**ACC-004 (P1):** Pointer targets meet WCAG 2.2 minimum 24×24 CSS px with required spacing/exceptions; design primary touch controls at least 44×44 where feasible. Preserve pinch zoom/text reflow and keyboard map alternative.

**ACC-005 (P1):** Honor reduced motion; charts have title, units, concise text summary and table/CSV only if a permitted download exists. Map legend has text labels; layer status uses text/shape in addition to color. Images have meaningful alt or empty decorative alt.

**ACC-006 (P1):** Test screen reader/keyboard interaction with search, category controls, map markers/layers, dialog, details, theme picker and mobile navigation. Axe is an automated signal, not proof of conformance; manual audit is mandatory.

Research standards: WCAG 2.2 Quick Reference https://www.w3.org/WAI/WCAG22/quickref/ ; contrast https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html ; target size https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; focus not obscured https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html .

## 20. Performance, reliability and security acceptance

- **PER-001:** Record baseline LCP/INP/CLS and JS/CSS/data transfer on the actual build. Field Core Web Vitals good thresholds: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75; with no field telemetry, label numbers lab-only and report device/network/browser. Do not add analytics just to measure without owner decision.
- **PER-002:** No regression to route-level splitting. Initial Home must not fetch Explore’s large GeoJSON/Leaflet chunk. Verify through build manifest/network capture when environment allows. Avoid rendering all point markers at all zooms.
- **PER-003:** Define and test measurable local budgets before launch: initial route JS transfer ≤200 KB compressed proposed ceiling; primary result filter update ≤150ms p95 on named mid-tier reference machine; cached map filter response ≤300ms p95; no long task >200ms during common interactions. These are provisional engineering targets, not measured baselines; validate feasibility and amend only with evidence.
- **PER-004:** List growth/filters/scroll maintain responsive 60Hz interaction target where feasible; map pan p95 frame intervals under 50ms proposed (and report actual device). Keep memory bounded and test a warm/ cold cache, reduced network, failed tile/source, stale cache, localStorage quota/private mode, and 100% browser zoom.
- **SEC-001 (P0):** No secrets in repository/public bundles, no unsafe HTML, no user/location persistence beyond explicit local feature. Geolocation accessed only on click and never encoded in share URL. Validate/limit URL fields. External links use `noopener noreferrer`. No unauthorized network data feeds.
- **REL-001 (P1):** Every dataset fetch has loading, validated success, error and retry semantics; optional layer failure does not take down map. Preserve last-known-good data only if freshness is visible. Corrupt cache entries are dropped; cache version/TTL and eviction communicated. No “success” toast for a failed clipboard/share action.

## 21. Verification plan (must run in implementation; none claimed here)

**Baseline attempt during this audit (2026-10-18):** environment had Node v24.21.0 and no `pnpm`; Corepack 0.36.0 resolved the pinned `pnpm@12.6.0`. `pnpm install --frozen-lockfile` aborted with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` because `pnpm-workspace.yaml` overrides are absent from the checked-in lockfile (F-19). The lockfile was intentionally not regenerated, as it already carried uncommitted user changes. Consequently **no** typecheck, unit test, build, or browser result exists for this snapshot, and every gate below is unstarted rather than passing.

| Gate | Target verification | Pass criteria |
|---|---|---|
| Product data | Node validation of served manifests + fixture tests for every displayed formula/count | Manifest count/attribution/date/schema agree across Home, Explore, Insights, About, Atlas; scope documented; no fabricated rows. |
| Build/types | `pnpm --filter @workspace/park-pulse typecheck`; workspace build only after side effects of generators are inspected | Clean exit; generated inputs handled as specified; no unexpected raw files/large outputs committed. |
| Unit tests | Existing Vitest suite + tests for new selectors/state, layer registry, stats formulas, URL parse/serialize, coverage/area, data missing/error states | All pass without weakening existing assertions. |
| Browser e2e | Existing Playwright suite adjusted for intended design; run Chrome at viewport matrix (1440×900, 1280×720, 1024×768, 768×1024, 390×844, 320×640) | Routes and deep links; no overflow/clipping; near-square map above fold on desktop; map/list sync; each layer; dialogs; share/back-forward; empty/error states. |
| Accessibility | Axe all routes/themes and open dialogs; keyboard-only route tests; manual screen-reader focus/semantics review; color calculations on rendered pairs | Zero serious/critical axe; all WCAG 2.2 AA issues triaged; core tasks possible without pointer/color. Do not equate axe=conformance. |
| Link audit | Extract internal links and exercise destinations/query behavior; manually check external source URLs/redirects | No dead internal destination; each external source/credit resolves and names its publisher. Capture date; do not claim if blocked. |
| Visual review | Real browser screenshots each route at desktop/tablet/mobile, both themes; inspect map state, errors, full-page content | Product feels cohesive; hierarchy, readable type, map area and responsive transitions match spec; images/source credit verified. |
| Performance | Lab run with pinned browser/device/network, cold and warm cache, map/layer heavy interaction; compare baseline | Meets agreed budgets or documented evidence-backed variance; no false field-data claim. |
| Security/privacy | Review URL/query inputs, stored keys, external links, attribution, data rights and generated public directory | No secrets; rights-cleared publication only; local-only user data; no DOM injection. |
| Review | Focused code and product/design review after implementation | Blockers fixed; open risks retained in a release checklist. |

## 22. Implementation roadmap and dependencies

Sequence is strict at gates; tasks can be parallelized only if data contracts and UI boundaries are frozen. P0/P1 priorities are not automatic authorization to code.

| Phase | Scope / requirement IDs | Dependencies / exit gate |
|---|---|---|
| 0 — Truth and foundation | F-01…F-19; DATA layer registry; frozen-install/lockfile reproducibility; generator reproducibility; route-state inventory; source/licence review; resolve 16% vs 22.2%; verify route/link/test baseline. | Owner approves data rights and what scope Park Pulse represents. Clean checkout can reproduce/explicitly degrade. No unsupported metric survives. |
| 1 — Design foundation | DES-001 tokens/themes, typography, interaction tokens, component inventory, copy glossary, asset/license registry. | Contrast checks in two themes; no required new dependency without explicit plan. |
| 2 — Shared shell + Home | NAV/HOM/SYS; remove Quick Explore and stale copy; implement source-grounded snapshot and responsive nav/footer. | Layer registry and valid destination URLs. |
| 3 — Explore core | EXP-001…010; grouped filters, map/list layout, accessible details, data-aware layers, responsive map. | Required data outputs validated; update existing E2E specs to new acceptance contract; no dead switches. |
| 4 — Insights + About | INS/ABOUT; genuine park/amenity summaries, source transparency and licensed content. | Stats definitions, freshness/license approved, missing states designed. |
| 5 — New route decisions | NEW-001 amenities, NEW-002 compare, NEW-003 data atlas; implement individually only if gates and value justify routes. | Each page’s source and utility gate; do not launch routes with insufficient data. |
| 6 — Cross-cutting polish | ACC/PER/SEC/REL; link audit; visual validation; final regression; content rights. | Full verification matrix pass; unresolved legal/data gaps explicitly exclude affected layer/claim. |

Effort sizing for planning: Phase 0 **L**, Phase 1 **M**, Home/shared **M**, Explore **XL**, Insights/About **M**, each new route **M–L** depending data, QA **L**. These are relative sizing hypotheses; estimate from a writing-plans task breakdown before implementation. No calendar-date promise.

### Requirement traceability index

`F-*` findings map to `DATA-001`, `DATA-002`, `DATA-003`, `HOM-*`, `EXP-*`, `INS-*`, `ABOUT-*`, `NAV-*`, `SYS-*`, `ACC-*`, `PER-*`, `SEC-*`, `REL-*`, and `NEW-*` sections. Each requirement includes a testable behavior and gate in its section; all P0/P1 must have owner/dependency recorded in the phase table. Future implementation plan must add individual task IDs and check off evidence after tests run.

---

# Part H — Risk register, unknowns, and definition of done

## 23. Risks and decisions

| Risk / decision | Why it matters | Owner decision/evidence required | Until resolved |
|---|---|---|---|
| Publication rights (OSM/Parramatta/canopy/toilets and other layers) | Redistribution, attribution and ND conditions can prohibit planned display or derivative publication. | Dataset-level license review and written permission where needed. | Exclude/restrict affected layer and all derived public metrics. |
| Product scope | 35 index entries differ from 33 planning-region LGAs; “Greater Sydney” can refer to different definitions. | Approve official boundary baseline and chosen geographic terminology. | Per-layer coverage label; no 38+ promise. |
| Geodata availability | Generated index/GTFS output absent from app public tree. | Choose reproducible generation/package path and verify artifact. | Controls are unavailable, not silently empty/0. |
| Data coverage/overlap | Source layers have disparate extents and overlapping feature types. | Publish coverage map/method and deduplication decision if totals required. | Present per-source totals only; no unique place count. |
| Currentness | Snapshot dates differ; static exports may be stale. | Define source update owner/cadence and automated manifest timestamp. | “Snapshot; date not confirmed” where appropriate; no “live.” |
| New pages scope | Amenities/compare/atlas need different data trust level. | Approve each route only after MVP value and required data test. | Keep as proposal; do not build decorative empty pages. |
| Photography rights | Remote stock images have no documented rights/use context in repo. | License evidence and alt/crop decision. | Remove/reuse only after rights check. |
| Job dashboard | Existing route implies data not available. | Decide whether to abandon the job product direction or acquire licensed data. | No job metrics/features in public primary navigation. |
| PRD conflict | Existing docs include contradictory prior phase plans and project status. | Owner confirms this doc’s authority and reconciliation of still-valid data pipeline items. | Treat this as UX/product spec, preserve existing data contracts; do not rewrite history. |

## 24. Research and tooling record

Research was conducted through the available web researcher, which reported reading these sources; standards/library behavior is separated from product recommendations:

- W3C WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/ ; contrast minimum: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html ; target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; focus not obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html .
- Leaflet accessibility guide: https://leafletjs.com/examples/accessibility/ ; API reference: https://leafletjs.com/reference.html ; GeoJSON/popup handling: https://leafletjs.com/examples/geojson/ . Recommendation: preserve keyboard-operable map behavior, label markers and never pass untrusted record text as popup HTML.
- NSW open-data policy: https://data.nsw.gov.au/data-policy/nsw-government-open-data-policy ; data-policy frameworks: https://data.nsw.gov.au/data-policy . Use provenance, quality and suitability context as product evidence, not as a claim that a particular local file meets the policy.
- OpenStreetMap Copyright and License: https://www.openstreetmap.org/copyright . Dataset-specific rights remain to be reviewed.
- NSW Planning canopy data: https://www.planning.nsw.gov.au/the-planning-system/urban-greening/urban-heat-and-canopy-data . Do not assume detailed or derived data is freely redistributable.
- National Public Toilet Map overview: https://toiletmap.gov.au/about ; accessibility: https://toiletmap.gov.au/accessibility . These show useful amenity-detail patterns, but do not prove an open reuse licence for the local extract.
- City of Sydney open-data access: https://www.cityofsydney.nsw.gov.au/library-information-services/access-open-data ; data portal: https://data.cityofsydney.nsw.gov.au/ . Confirm licence on each specific dataset, not the portal in general.
- Comparator pattern references: Google Maps saved places https://support.google.com/maps/answer/7280933?hl=en&co=GENIE.Platform%3DDesktop ; iNaturalist Explore (map/list, filters, save search) https://help.inaturalist.org/en/support/solutions/articles/151000198035-inaturalist-iphone-app-the-explore-screen . These support interaction recommendations only, not product-specific testing results.
- Research limitation: official AllTrails help pages returned 403 to the researcher; no AllTrails pattern is asserted as verified.

**ECC/MCP disclosure:** Existing PRDs mention `/ecc-recipes`, prompt-optimizer, product-lens, article-writing, brand-voice, living-docs-governance, writing-plans, frontend-patterns, accessibility, React patterns, React performance, verification-loop, security-review and other skills. In this Cloud workspace no skill files were available and those skill activation commands/tools were not exposed; this PRD did **not** invoke or claim those skills/MCPs. The existing repository includes vendored Radix/shadcn packages, but no shadcn/Radix MCP tools were exposed for live registry audits. Implementation must check availability and follow relevant project skills if they actually exist; it must not fabricate audit completion. Available tool used: researcher-web. Code and documentation were inspected with workspace tools.

## 25. Product definition of done

The redesign may be called ready for release only after all conditions pass with captured evidence:

1. All currently served routes and all approved new routes have reviewed desktop/tablet/mobile layouts, both themes, implemented copy, and accessible empty/error/loading states.
2. Explore has search/filter/result/map parity, a near-square desktop map visible at first view, phone-specific interaction, working layer defaults, and useful details from list or map.
3. Every public dataset/count/chart is reproducible from a validated manifest; geographic scope, freshness, source, licence and limitations are visible; no illegal, unlicensed, mock, misleading, or double-counted content ships.
4. Council/transport/canopy layers either have verified generated artifacts and tests or remain explicitly unavailable/gated; no hard failure, fake zero, or disabled-but-active control.
5. Job/Oracle features are removed from primary experience or use real, licensed, current data with honest method; never populate from empty index.
6. Exactly two UI themes are implemented and tested; contrast/focus/state checks pass. No user is forced to change system zoom or motion preference.
7. Navigation, footer, internal/external links, deep links, browser history, dialog/focus return, keyboard and location permissions are tested against the real interface.
8. Performance is measured on a named browser/device/network, both cold and warm; agreed budgets hold or variance has explicit owner acceptance and evidence.
9. Quality gates in §21 pass. Tests are not skipped/weakened; final source is independently reviewed. Live deployment or publishing remains a separate explicit authorization.
10. This PRD’s unresolved decision register has been closed or each blocked scope is excluded from the release.

---

*End of specification. Recommendations are not implementation approval. The first implementation plan must resolve rights and missing generated outputs before changing application code.*
