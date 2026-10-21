# ParkPulse UI Redesign — Working Record

**Date:** 2026-10-17 · **Scope:** full-site review, Explore rebuilt as an explorer
app shell, map made first-class, verification pass across all suites.

## Architectural findings (defect state found)

1. **Explore was a broken hybrid.** `.pp-explore-page` was a fixed
   `height:100vh; overflow:hidden` shell, but `.pp-explore-main` still stacked
   hero → results → map vertically. The rail's ~17,000 px of results and the
   map below it were *clipped with no way to scroll*: the map was on screen 0
   px of the time on load.
2. **The desktop shell CSS existed but never won.** The `@media (min-width:901px)`
   block sat *before* the base rules it overrides (`.pp-sidebar` line 518,
   `.pp-map-container` line 669) — same specificity, later source order, so
   the media rules were dead. The JSX also never contained the `.pp-explorer`
   wrapper the CSS targeted.
3. **`L.MarkerClusterGroup` ambient types were incomplete** — hand-written
   `src/leaflet-markercluster.d.ts` lacked `zoomToShowLayer`, so
   `selectPark` could not reveal a marker still wrapped in a cluster
   (typecheck surfaced this; runtime plugin supports it).
4. **Radix `DialogTitle` warning (real a11y defect):** ParkModal forced
   `id="modal-title"` + manual `aria-labelledby`, so Radix's generated
   `titleId` never reached the DOM and its binding was orphaned.
5. **Geocode fallback logged cancellation as failure** — the effect cleanup's
   `AbortError` was `console.error`'d and toasted ("Could not load geocoding")
   on every query change.
6. **Hero headline double-counted nothing but under-counted everything:**
   "418 parks, trees & facilities" used the parks-only count while trees
   alone are 48,999.
7. **Legend only knew six park-type colours** — toilets, fountains, dogs,
   NPWS, trees, transport and the council overlays were all unmapped colours
   with no identification system.

## Design decisions

- **Desktop = viewport-locked explorer app shell** (the Google-Maps-class
  composition): slim intro band (~204 px at 720p) → **left controls/results
  rail** (`clamp(340px,30vw,420px)`, internal scrolling, sticky search) +
  **right map filling the remaining height** (896×452 at 1280×720 — above the
  fold, checked by test). Short viewports tighten the intro band rather than
  shrinking the map. ≤900 px keeps the stacked, document-scrolling layout.
- **All desktop shell rules were consolidated in one media block at the END
  of `index.css`** with a comment explaining why source order matters there.
- **Legend = two-column map key**: static "Park types" column + interactive
  "Map layers" column. Layer rows are real `aria-pressed` buttons wired to
  the *same* `filters` state as the rail (single source of truth), with a
  hollow dashed swatch + struck-through label for the off state — state reads
  without relying on colour alone.
- **Honest hero total**: sum of additive datasets only (parks + Blacktown +
  trees + toilets + fountains + dogs + NPWS + Inner West); park-type counts
  are subsets and transport ships opt-in, so nothing double-counts. Falls
  back to static text until layers report — never a fabricated 0.
- **Marker selection through clusters**: `selectPark` waits for the fly-to,
  then uses `zoomToShowLayer` when clustering still wraps the target.
- **Tests were rewritten, not weakened**: the layout contract test now
  asserts the rail-left/map-right/above-the-fold composition; the FR7.1 hover
  test samples the polygon bbox for a point where the path itself is the
  hit-target (markers sit above the boundary pane); modal tests use semantic
  role locators instead of `#modal-title`.

## Data exposed through the map (live counts observed)

| Dataset | Count | Default | Rendering |
|---|---|---|---|
| Parks (network) | 418 | on | clustered by type (6-colour key), deselect clustering z16+ |
| Blacktown OSM places | 1,605 | on (scoped) | viewport-culled markers; labelled as OSM, not council parks |
| Trees | 48,999 | **opt-in** (EXP-005) | sharded, z≥16 circle markers + zoom hint |
| Public toilets | 3,127 | **opt-in** | viewport-culled |
| NPWS facilities | 1,795 | **opt-in** | own cluster group, subtype colours |
| Drinking fountains | 273 | **opt-in** | viewport-culled |
| Dog off-leash | 51 | on | 🐾 markers |
| Transport stops | 26,198 | **opt-in** | converted GTFS artifact present; council-scoped (FR4.4) |
| Council trees | 66,345 (Parramatta) | **opt-in** | council shard set, fetched only for the selection |
| Inner West parks/trees | — | **opt-in** | `public/data/inner-west/` is empty; layers 404-safe, off by default |
| Canopy | — (gated) | — | licence/ND unresolved; no figure shown |
| Councils / area | 35 / 12,396 km² | — | selector + boundary shading (FR1.6/7.1) |

## Verification (all run against the final build)

- `pnpm typecheck` → 0
- `pnpm test` (vitest) → **215/215**
- `playwright test` → **41/41**
- `scripts/.verify-sync.mjs` (legend↔rail↔map two-way sync, combined
  toggles, search incl. Nominatim fallback, clear-restore, popup) → **17/17,
  zero console errors**
- `scripts/.verify-pages.mjs` (5 routes × 3 viewports: overflow, nav, h1,
  footer, console + explore composition at desktop/phone) → **91/91**
- Limitation: the Freebuff preview webview produced no frames, so visual
  checks were taken from live DOM geometry probes + Playwright's own
  Chromium instead of in-panel screenshots.

## Known gaps / next candidates

- Inner West layer toggles are honest no-ops until that data directory is
  populated (404s are toasted and the toggle stays inert).
- The map at 720p is 896×452 — wide-landscape rather than square; squareness
  improves with viewport height (>=900p gives ~1010×626). Making it strictly
  square would waste the rail/map horizontal balance.
- Only Parramatta has a downloaded council tree dataset; the other 34 council
  areas have boundaries and park scoping but no council tree shards.

## Completion pass — 2026-10-19

- Council index and 35 boundaries regenerated and wired into `dev`/`build`
  (`F-01`); GTFS stops converted (`F-02`); council shard auto-discovery added
  (`FR3.1`).
- Explore defaults now match EXP-005 (parks + off-leash only) and the header
  reports `N park records` instead of an overlapping `mapped locations` total
  (`F-08`).
- Insights now leads with the real layer-coverage section and labels the
  employment grid/Oracle search as a gated prototype (`INS-001…004`).
- `pnpm install --frozen-lockfile` passes (`F-19`). Full evidence is in
  [IMPLEMENTATION-LOG.md](IMPLEMENTATION-LOG.md).
## v6 field-atlas pass — 2026-10-20

Direction, tokens and component language: [docs/superpowers/specs/2026-10-20-parkpulse-v6-design.md](docs/superpowers/specs/2026-10-20-parkpulse-v6-design.md).
Execution plan: [docs/superpowers/plans/2026-10-20-parkpulse-v6.md](docs/superpowers/plans/2026-10-20-parkpulse-v6.md).

### What changed, route by route

- **Shared** — two families only (Fraunces display, Source Sans 3 text/data); six size tokens
  with a 13px floor; one accent per theme; `fa-*` primitives for panels, chips, toolbars,
  ledgers, figures and map frames; a single reveal motion (`useRevealOnScroll`) and route
  fade; icon theme switch (no emoji); manifest/PWA metadata and theme-color per theme.
- **Home** — park-plate hero drawn from `hero-plate.json` (418 real City of Sydney park
  outlines, true aspect, type key), ledger of real layer counts with publisher/coverage,
  short guide, deep-link entries, live CTA. No identical three-card row, no stock imagery.
- **Explore** — Quick Explore removed. Left rail: search, council scope, map layers (every
  shipped category with real counts), park type, minimum area, results, scope totals. Right:
  a square map, centred and sticky for the length of the results. Mobile leads with a pinned
  map. Scope totals moved after the results so the list sits nearer the fold.
- **Insights, Amenities, Compare, Atlas, About, 404** — same frame, same type, route-specific
  composition; comparison table, coverage ledger, prototype disclosure and empty states all
  restyled and re-worded.
- **Map** — legend/key and chips read one source of truth; dogs marker glyph is drawn SVG;
  culling/clustering behaviour unchanged.

### Regressions found and fixed during verification

- Network-wide scope totals were hidden behind the selection guard (caught by
  `transport.spec.ts`); they are now always rendered, under Results.
- The map column used `align-items: start`, so the sticky map had no room to travel and
  scrolled away behind the results.
- Result metadata and council statistics were set at 10–12px (150 blocks under 13px).
- The theme switch used ☀/☾ glyphs; replaced with line icons in the navbar.

### Taste inspector (built app, 1440/768/390)

| Round | Home FAIL / WARN | Explore FAIL / WARN |
|---|---|---|
| Before | 12 / 6 | — |
| After v6 | **6 / 2–3** | **7 / 6** |

The Home warning count moves between 2 and 3 across runs because the inspector counts elements
that moved while it scrolled; the one-shot reveals only fire once. `off-centre` at 768px is a
classic-scrollbar artifact: 18px gutter on both sides, plus the 17px scrollbar it measures as
extra right margin.

Remaining Home findings are house rules that conflict with the product, recorded rather than
papered over: the "eyebrow" it flags is a snapshot-date line above a count column; the
"hairline" count is the ledger's row rules; "few-pictures"/"focal-point" ask for photography
and an 8vw headline, while this first screen leads with the product's own plotted geometry;
"headline-lines at 390" counts ledger rows as headlines. Fixed rather than argued: three
typefaces → two, ten sizes → six, body text 14 → 16px, 12px blocks → 13px floor, emoji →
icons, and a static page → one-shot reveals (the "still page" failure is gone).

### Skill map for this pass

| Skill | Governed work | Stage applied |
|---|---|---|
| superpowers: using-superpowers / brainstorming | direction, "survey instrument" framing | before any edit |
| superpowers: writing-plans | route-by-route plan with acceptance criteria | Phase B |
| superpowers: test-driven-development | filters vocabulary, park-field geometry, Explore browser specs written before/with the code | Phases C–D |
| superpowers: systematic-debugging | sticky-map bug, hidden network totals, a11y/contrast timing races | Phase D |
| superpowers: verification-before-completion | final typecheck/unit/build/e2e + browser review | Phase E |
| design-taste-frontend | art direction, type/colour discipline, inspector loop (Home, Explore) | B–E |
| frontend-design | composition and hierarchy per route | B–C |
| design-engineering | motion system, tokens, reveals, reduced-motion fallbacks | C |
| web-design-guidelines | semantics, focus, targets, contrast, responsive behaviour | C–D |
| writing-guidelines | headings, ledes, empty/error copy, source wording | C |
| vercel-react-best-practices | memoised derivations, cached icons/fetches, observer instead of re-render loops | C |
| vercel-composition-patterns | `fa-*` primitives, route composition without boolean sprawl | C |
| offline-first-pwa | manifest, icons, theme metadata, install presentation; no offline claim made | C |
| playwright-cli | browser inspection at 1440/768/390, both themes, interaction checks | D |
| supabase / supabase-postgres-best-practices | **not applicable** — static build, no database or backend | assessed |
| OWASP code/ai security skills | **not applicable** — no auth, user data, API keys or AI path; nothing introduced to create one | assessed |
| Context7 / shadcn / Radix MCPs | Radix dialog APIs unchanged in this pass; no new component library added | assessed |

### Final pass — repairs found by the end-to-end visual sweep

- **The park record panel was never centred.** `.pp-modal-content` is a sibling of the Radix
  overlay, not a flex child, so it rendered as an unpositioned block at the document flow's
  end (measured at x=0). It is now fixed-positioned and centred with the centring transform
  baked into the entrance keyframes; verified at 480×569 in a 1440×900 viewport.
- **Night Field facility badges were invisible**: a broken selector list applied
  `.pp-active-badge`'s dark ink to park-type badges, facility badges and active chips
  (`#06210f` on `rgb(12,18,14)` ≈ 1.05:1). Split into the two colour families it was meant
  to be; the modal is now scanned by axe in both themes.
- Modal text left behind by the 13px floor (11.2–12.5px: nav, position, suburb pill, OSM
  links, size caption, coordinates) lifted; coordinates now use tabular sans instead of a
  monospace fallback.
- The modality's emoji icons (📍 in the suburb pill, 🧺/⛺/🛝/🪑/🚻/🅿️ facility glyphs, ♡ in
  Save) replaced with lucide line icons at 15px, consistent with the nav theme switch.
- `index.html` gained a pre-paint theme script (verified with the app bundle blocked) and the
  OG/Twitter descriptions no longer repeat the retired "2,000+ parks" claim.

Final suite after these repairs: typecheck 0 · **256** unit · build 0 · **69** Playwright.

### Follow-up pass — navigation parity and the hero plate (2026-10-21)

- **The header was a partial sitemap.** It carried Explore, Insights and About while the
  footer carried Amenities, Compare and the Atlas too, so the three routes were only
  reachable from the bottom of the page. Both navigations now render the same list from
  `src/data/navigation.ts`: Explore, Amenities, Compare, Atlas, Insights, About. The
  separate “Explore parks” header button was removed because it duplicated the Explore
  link it sat next to. The desktop links collapse into the disclosure at 960px, where six
  destinations plus the theme switch no longer fit beside the brand. E2E asserts set
  equality between the header and the footer's Explore column.
- **The hero was a scatter of centroids, and a mixed one.** `hero-points.json` plotted
  953 points derived from the City of Sydney layer plus a Blacktown/OSM sample, and a ring
  centroid can fall outside its own polygon — the picture was neither one dataset nor an
  honest shape. It is replaced by `hero-plate.json`: 418 City of Sydney park areas,
  projected once (equirectangular, metres), simplified to 2.5 m, quantised to a viewBox
  whose aspect is the layer's true aspect (596×860). `scripts/build-hero-plate.mjs` runs
  before dev and build. The initial pass projected from the extent centre but offset from
  the top-left corner, putting half the city at negative coordinates; corrected before it
  shipped.
- **The plate rests in ink, not in five colours.** All outlines are drawn in the page's
  primary at low fill/stroke opacity, so the hero reads as part of the document rather
  than a confetti of category dots. Choosing a type in the key dims the rest and fills
  that type in its Explorer palette colour; the caption reports the filtered count.
- **The old scatter helpers and tests were removed** (`parkField.ts`, `parkField.test.ts`);
  `heroPlate.ts` parses the build artifact defensively — malformed viewBox, open or
  injected path data and out-of-range type indexes all yield no drawing rather than a
  wrong one.

Follow-up suite: typecheck 0 · build 0 · hero-plate unit 7 · two new Playwright checks
(header/footer destination parity; plate path count, no circles, type key filter).

### Square plate (2026-10-21, follow-up)

- The hero map frame is now **square**, matching the Explore map. The 596×860 City of
  Sydney outlines are fitted inside it at their true aspect (`preserveAspectRatio="meet"`),
  so the frame changed shape without the geography changing shape. The figure sits at
  480px, which brings the whole card — head, plate, caption, key — to ~650px and inside
  the first screen at 1440×1000.
- The square's side margins are used for honest cartographic furniture: a **2 km scale
  bar**, computed from `metresPerUnit` emitted by `build-hero-plate.mjs` (9.34 m per
  viewBox unit), not a decorative line. `scaleBarMetres` picks the largest round distance
  under 30% of the plate's height; `scaleBarPercent` sizes it against the square. It is
  `aria-hidden`, since the caption already states the drawing is to scale and the figure
  is decorative.
- E2E now asserts the plot is square (≤1px difference) and that the scale bar is real
  (label text plus a rendered rule wider than 60px).
