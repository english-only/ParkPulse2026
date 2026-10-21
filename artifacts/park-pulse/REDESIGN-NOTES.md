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
| Blacktown parks | 1,605 | on (scoped) | viewport-culled markers |
| Trees | 48,999 | on | sharded, z≥16 circle markers + zoom hint |
| Public toilets | 3,127 | on | viewport-culled |
| NPWS facilities | 1,795 | on | own cluster group, subtype colours |
| Drinking fountains | 273 | on | viewport-culled |
| Dog off-leash | 51 | on | 🐾 markers |
| Transport stops | 26,198 | **opt-in** | council-scoped (FR4.4), viewport-culled |
| Inner West parks/trees | — | **opt-in** | `public/data/inner-west/` is empty; layers 404-safe, off by default |
| Canopy | 16% | stat tile | council stats |
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