# PRD — Park Pulse v3: "Sydney's Public Facilities Atlas"

**Status:** Draft for approval
**Date:** 2026-10-10
**Author:** Buffy (Codebuff)
**Supersedes:** the 13-phase v2 improvement programme (all 13 phases shipped and verified)
**Evidence base:** [AUDIT-2026-10.md](AUDIT-2026-10.md) — live browser audit, measured performance, WCAG computation, ArcGIS REST probing

---

## 1. Why now

v2 made Park Pulse fast, correct and well-tested. It closed all 13 of its phases, removed every `any` cast, and now holds at 157.3 kB gzip with zero long tasks. The audit shows the *engineering* is healthy and the **product** is the bottleneck: the app knows about parks, but a person in Sydney asking "can I swim, play netball, and find a toilet with a baby change facility near me?" cannot answer it.

Three facts define this generation:

1. **The data is richer than the app.** The City of Sydney's live toilets layer carries `Accessible`, `BabyChange`, `AdultChange`, `AllGender`, `DumpPoint`, `OpeningHours` and `KeyRequired`. Park Pulse ships a flattened local copy (`n/lat/lng/t/h/a/b`) that discards all of it. We are shipping a worse version of a public dataset we could use verbatim.
2. **~3,570 verified features are one API call away** — playgrounds, sports facilities, pools, libraries, recreation centres, seats, stairs, bridges, community gardens, venues for hire, bicycle parking.
3. **"All of Sydney" is not currently true and cannot simply be made true.** Council coverage is real for Sydney, Parramatta and Bayside, and essentially absent for Blacktown, Cumberland, Canterbury-Bankstown, Georges River, Northern Beaches, Sutherland and Hornsby. This must be a product decision, not an engineering surprise.

---

## 2. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Answer "what can I do here?" per park, not "how big is it?" | ≥ 8 facility classes joinable to a park |
| G2 | Honest multi-LGA coverage | Every layer carries jurisdiction + source + licence metadata; the UI states coverage limits |
| G3 | Full keyboard operability | Zero keyboard traps; WCAG 2.2 AA on all shipped themes |
| G4 | Sub-second interaction at any dataset size | p95 interaction < 100 ms; zero long tasks |
| G5 | A pipeline, not a one-off import | Adding a new council is a config entry, not a code change |

**Non-goals for v3:** user accounts, ratings/reviews, iOS/Android apps, real-time occupancy, or paid tiers.

---

## 3. Personas and the core loop

- **Priya, weekend planner** — "Find somewhere with a playground *and* accessible toilets within 15 minutes."
- **Tom, new to the area** — "What can I do within 500 m of here?" (transit-aware, currently unsupported)
- **Jess, facility operator** — needs to know a facility exists and is maintained; not in v3.
- **A council analyst** — needs provenance and licence clarity to trust the data.

The core loop becomes: **choose an activity → see every place in Sydney that offers it → narrow by what matters (accessible, open now, has toilets) → navigate → save.**

Today the loop is: browse parks → read size → click through.

---

## 4. Scope

### 4.1 Phase A — Fix what the audit found (blocking, ~1 week)

Nothing else should start until these land. They are small, high-risk-if-deferred, and each has a failing-or-missing verification today.

| ID | Item | Acceptance criterion |
|---|---|---|
| A1 | Remove `display:none` from `.pp-filter-checkbox input`; use a proper visually-hidden pattern | Every one of the 12 filters is reachable by Tab and toggles with Space. E2E test asserting keyboard reachability. |
| A2 | Theme the `.pp-size-*` and `.pp-park-type-badge` colour tokens | 0 contrast failures in all 6 themes. **Extend `contrast.spec.ts` to sample these selectors** — the current spec's narrow coverage is why 109 failures went unnoticed. |
| A3 | Fix theme persistence — `parkpulse_theme` is written but never lands | Choice survives reload across all browsers. |
| A4 | Re-label `blacktown.geojson`: OSM-derived, multi-LGA, ODbL attribution | `meta.json` accurate; an on-screen data-provenance page states source, licence and extent per layer. |
| A5 | Replace the `::root` compound selectors at `index.css:834-837` (invalid CSS) | Scrollbar rules actually apply. |
| A6 | Skip-to-content link; `<h1>` on `/explore`; `<footer>` landmark in the Explore layout | axe-core reports zero landmark/heading violations on all routes. |
| A7 | `aria-modal` + a visually-hidden `Dialog.Description` on the park modal | Dialog announces name **and** key facts on open. |
| A8 | Enlarge sub-24 px targets (card actions to 24×24 minimum) | 0 targets under 24×24 in the shipped list. |
| A9 | `index.html`: drop `maximum-scale=1`, add meta description + OG/Twitter tags | Lighthouse a11y 100; link previews render. |

### 4.2 Phase B — Data pipeline (~3 weeks)

**The central architectural change: replace committed GeoJSON blobs with a fetch-and-build pipeline.**

Today `public/data/*.geojson` is committed and hand-maintained; `trees.geojson` alone is 16.4 MB and is sharded at build time by `scripts/shard-trees.mjs`. That model cannot absorb ~3,570 new features across multiple councils with per-layer licensing.

- **B1. Source manifest.** A declarative `data/sources.config.json` listing every layer: ArcGIS item ID, service URL, layer index, geometry type, jurisdiction, licence, attribution string, refresh cadence. Adding a council becomes a config entry.
- **B2. Ingest script** (`scripts/ingest-facilities.mts`, reusing the sharder conventions). Pulls via ArcGIS REST `query` with `f=geojson`, normalises to one internal `FacilityFeature` shape, and emits per-layer shards.
- **B3. Stop forking the source.** Replace the flattened `toilets-sydney.json` with a lossless projection of the live layer, preserving accessibility and hours flags. Same for any other local fork.
- **B4. Facility→park join.** Spatial containment (`geo.ts` already has `haversineKm`; add a polygon point-in-polygon test) so each of the 418 parks carries its facility manifest. This is what turns the app from a park list into an activity index.
- **B5. Provenance manifest.** Per-layer `{ source, licence, retrievedAt, featureCount, bbox }`, surfaced on `/about` and in `meta.json`.
- **B6. Coverage honesty.** A generated coverage page listing which LGAs are represented, which are OSM-sourced, and which are absent.

**Phase B deliverable data (verified live counts, City of Sydney):**

| Layer | Features | Novelty |
|---|---|---|
| Bicycle parking | 1,761 | New |
| Seats | 890 | New |
| Stairs | 523 | New |
| Public toilets (lossless) | 525 | Richer fields |
| Drinking fountains | 273 | Already shipped |
| Playgrounds | 162 | New |
| Sports facilities | 70 | New — 22 sport columns |
| Public transport | 64 | Already shipped |
| Venues for hire | 37 | New |
| Community gardens | 22 | New |
| Library locations | 11 | New |
| Swimming pools | 6 | New |
| Recreation centres | 6 | New |
| Bridges | 82 | New |

Plus Parramata (parks 1,594, playgrounds 145, sporting fields 95, buildings 182, picnic areas 31, fitness equipment 21) and Bayside (parks 219, picnic tables 26, BBQ 6).

### 4.3 Phase C — Feature: activity-first discovery (~2 weeks)

- **C1. Facility filter model.** Extend the existing `useCulledMarkerLayer` pattern (proven: zero long tasks) to all new layers. Add a `CategoryPanel` grouping facilities by activity — Play, Sport, Swim, Rest, Amenity, Culture — with per-category counts from `layerCounts`.
- **C2. Filter faceting.** Composite predicates: `playground AND accessible-toilets AND has-baby-change`. The existing checkbox state model extends naturally to a predicate tree; this is the single biggest UX step-change available and it is what Phase B's data exists to enable.
- **C3. Facility detail.** Extend `ParkModal.tsx` with a facilities section; accessible toilet flags become explicit badges, and `OpeningHours` renders as text (`h` is already a flat field — surface it).
- **C4. Sport lookup.** Present the 22 sport columns as tags: "This park has: AFL, cricket, AFLW, netball."
- **C5. Saved-list sharing that survives the data model.** `localStorage` saved parks become deep links carrying facility criteria.

### 4.4 Phase D — Performance & platform (~1.5 weeks)

- **D1. Route-level code splitting.** `React.lazy` for `/about` (static-only) and defer Explore. Split `manualChunks` so Leaflet loads only with `/explore`. Context7 confirms Leaflet 2.0 alpha uses `ResizeObserver` and adds `aria-keyshortcuts`. **[unverified]** — confirm Leaflet 2.0 alpha production-readiness before adopting; the sharding/culling work is built against 1.9.4.
- **D2. `preferCanvas` for the culled point overlays.** Trees already use `L.canvas()`; fountains/toilets/transport still create thousands of DOM markers. **[unverified — profile before and after]**
- **D3. Move data to Cache Storage / IndexedDB.** 1,258 kB currently sits in `localStorage` (measured). The existing `CacheNotice` quota path becomes a real user-visible state.
- **D4. Service Worker.** Offline map shell and cached tiles. **[unverified — tile-server usage policy must be checked against the OSM tile usage policy before caching tiles; do not ship without that check.]**
- **D5. Fix `transition: all` (3,456 elements) and remove blanket `will-change` (100 elements).** Mechanical, low-risk, measurable.
- **D6. Delete the 44 zero-import shadcn components** and drop recharts/cmdk/vaul/embla/react-day-picker/framer-motion from `devDependencies`. Verified tree-shaken from the bundle today, so zero runtime risk — pure maintenance win.

### 4.5 Phase E — Quality gates (~1 week, continuous thereafter)

- **E1. Contrast matrix test** across all 6 themes × representative selectors. Must reach zero failures to pass.
- **E2. Keyboard-only E2E path**: tab to filters, operate every one, open/close the modal, use map keyboard nav. One test that would have caught S1.1.
- **E3. Data contract tests.** Every layer in `sources.config.json` must resolve, and every feature must satisfy the internal `FacilityFeature` shape. Catches upstream schema drift before it reaches the map.
- **E4. Freshness monitor.** Surface `retrievedAt` per layer; fail loudly when stale.
- **E5. Bundle budget in CI.** Fail the build above a gzip ceiling (target ≤ 180 kB JS).

---

## 5. Data sources (all verified live on 2026-10-05)

Base service host: `services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services`, org `cityofsydneyspatial`.

| Dataset | Item ID | Count |
|---|---|---|
| Parks | `b38a28bd916e4df7871043656d6d36d6` | 418 |
| Playgrounds | `4c9bb08348874b2e8d0998c460dbcded` | 162 |
| Sports and recreation facilities | `2ba0944eb45449d4982cda303e1a1589` | 70 |
| Swimming pools | `1be3eaa7fbf449649c3bb06821fa3f7e` | 6 |
| Drinking fountains | `166d56fa6d644397add849d6190fc388` | 273 |
| National public toilets | `8b0855f034ef4106967e4b0463184190` | 525 |
| Library locations | `e22b20f1bcee44bbb4ed76ac060c6609` | 11 |
| Recreation centres | `026b3b134b5c488db62ac5e2d6e8e764` | 6 |
| Dog off-leash parks | `20b8bb752d7943d98b9704ed66d539fa` | 51 |
| Seats | `25fe6ed6b4644ddc8216566f82f8887b` | 890 |
| Stairs | `944e406a8a154d118810f5f95243c408` | 523 |
| Bridges | `27fea579cb3741f592456cddc357ff35` | 82 |
| Community gardens | `9d014ebca20d45f5924b6308b56fed69` | 22 |
| Venues for hire | `295675f834174b08bb8d4ea2af5e0d42` | 37 |
| Bicycle parking | `6971b82d163346c1a24ae71ea4bfe72c` | 1,761 |
| Stations, stops, wharves | `1d9f62232b174d6abe8f1b932dfa6404` | 64 |
| Trees | `15c4713a688a48fcb604fc343118af05` | 49,662 |

**Outside the LGA:**
- Parramatta — `098dd0fc35bc47328c0e6ee74b7cbe1b` (parks 1,594, playgrounds 145, sporting fields 95, buildings 182, picnic areas 31, fitness equipment 21)
- Bayside — `cc24201a363d402da93bd4a7322e3985` (parks 219, picnic tables 26, BBQ 6, playgrounds 4, toilets 4)
- Newcastle (template only, out of area) — `c04a1705b30341b48133baf41db60b8a`, `b8eac9ca31b345a5b0e1cfa9307c2c0d`

**Confirmed gaps:** Blacktown, Cumberland, Canterbury-Bankstown, Georges River, Northern Beaches, Sutherland, Hornsby — no usable council Feature Service located.

---

## 6. The multi-LGA question — a decision for you

This is the one place I am not going to choose unilaterally, because it changes what the app *is*.

**Option 1 — Honest scoped coverage (recommended).** Ship Sydney + Parramatta + Bayside from official sources with full attribution; state the remaining LGAs as uncovered. Every feature is authoritative. The app's promise becomes "the facilities we can verify, with sources shown."

**Option 2 — OSM gap-fill.** Use OpenStreetMap for the uncovered LGAs (ODbL, attribution required). Full geographic coverage, but varying quality and a permanent attribution obligation. This is almost certainly where the existing `blacktown.geojson` came from — and it is mislabelled as council data today.

**Option 3 — Facility-first, park-agnostic.** Treat facilities as first-class objects that may or may not sit inside a mapped park. Solves coverage elegantly — bicycle parking and transport stops are genuinely not park features — at the cost of a significant data-model change.

My recommendation is **Option 1 for v3, with Option 3's model designed for in v4.** Authority beats coverage when the product is "find somewhere to do something."

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Upstream schema drift breaks ingest | High | E3 data-contract tests against `sources.config.json` |
| Bundle growth from ~3,570 features | Medium | Culling is proven at zero long tasks; D1/D2/D3; E5 budget |
| Multi-LGA data model complexity | Medium | Decide §6 before Phase B starts |
| OSM licence obligations if Option 2 | High | ODbL attribution is non-negotiable; A4/B5 must land first |
| Tile-server policy on caching | Medium | Do not ship D4 without verifying the OSM tile usage policy |
| Theme count (6) multiplying contrast bugs | Medium | E1 contrast matrix across all themes, blocking |
| Unverified perf recommendations (D1/D2) | Low | Marked **[unverified]**; profile before/after, keep the change only if it measurably helps |

---

## 8. Milestones

- **M1 (week 1)** — Phase A complete. All nine audit fixes landed, each with a test. **This is the release that fixes a keyboard trap.**
- **M2 (week 4)** — Phase B complete. Pipeline live, ≥ 3,570 new features ingested, provenance and coverage pages shipped.
- **M3 (week 6)** — Phase C complete. Activity-first discovery and faceted filtering usable end-to-end.
- **M4 (week 7.5)** — Phases D + E complete. Bundle budget enforced, contrast matrix green, keyboard-only E2E passing.

Roughly 7.5 weeks of focused work, with M1 independently shippable and valuable on its own.

---

## 9. What I need from you

1. **The multi-LGA decision (§6)** — Option 1, 2, or 3. Phase B depends on it.
2. **Confirm M1 is worth shipping on its own**, or whether you want it bundled into M2.
3. **Whether to investigate the missing LGAs further.** My search found nothing for Blacktown, Cumberland, Canterbury-Bankstown and several others, but ArcGIS org naming is inconsistent — several councils publish under names my search did not guess. A more systematic sweep of each council's own open-data portal is likely to find more than I did, and I would rather find it before B2 is built than after.
