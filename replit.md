# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Park Pulse App (`artifacts/park-pulse`)

React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Leaflet. Sydney parks explorer.

### Architecture
- **Routing**: wouter
- **Map**: vanilla Leaflet + leaflet.markercluster
- **Themes**: 6 themes (default/dark/sunset/neon/minimal/satellite) via `useTheme` + `THEMES` array + `data-theme` attribute. Satellite uses Esri World Imagery tiles.
- **State**: component-local (no Redux/Zustand)
- **Data**: static GeoJSON/JSON in `public/data/` — no backend needed

### Key files
- `src/pages/Explore.tsx` — main map+sidebar page (all map logic, filters, layers)
- `src/pages/Home.tsx` — home page (hero, quick explore, Park of the Day, recently viewed, stats)
- `src/components/ParkModal.tsx` — park detail modal (nearby NPWS, dog parks)
- `src/components/Navbar.tsx` — nav + theme picker
- `src/utils/dataCache.ts` — localStorage cache utility (7-day TTL, 4MB cap)
- `src/context/ToastContext.tsx` — toast notifications
- `src/types/park.ts` — Park, DogPark, NPWSFacility, RecentPark interfaces

### Type notes
- `Park.id` is `number`; `favoriteIds` is `Set<number>`; `toggleFavorite` takes `id: number`
- `RecentPark.id` is `number` — localStorage stores number IDs

### Data layers
- `Parks.geojson` — main Sydney parks (cached as `pp_parks`)
- `blacktown.geojson` — Blacktown OSM parks
- `Dog_off-leash_parks.geojson` — dog off-leash areas (cached `pp_dogs`)
- `npws-facilities-greater-sydney.geojson` — NPWS facilities, clustered (cached `pp_npws`)
- `drinking-fountains.geojson` — fountains (cached `pp_fountains`)
- `toilets-sydney.json` — public toilets (cached `pp_toilets`)
- `public-transports.json` — transport stops (cached `pp_transport`)
- `trees.geojson` — 17MB trees, canvas circleMarker renderer, zoom≥16 only (NOT cached — too large for localStorage)

### Features implemented
- 7-day localStorage cache via `fetchWithCache` for all GeoJSON/JSON fetches
- Fuzzy search scoring (exact → startsWith → includes → suburb → type → sequential char)
- "Did you mean?" suggestions on zero results
- Search history dropdown (last 5, stored in `parkpulse_history`)
- Autocomplete dropdown (suburbs by prefix + park name by startsWith)
- Sort by Default / Name (A–Z) / Nearest (requires geolocation)
- Haversine distance calculation + walking-time badge on distance cards
- Locate Me → auto-enables nearest sort + stores userLocation
- Load More button + **infinite scroll** sentinel (IntersectionObserver, +50 per trigger)
- Filters section: max-height 42%, internally scrollable
- Layer count badges on filter items (after first load)
- "Cached data ↺ refresh" indicator
- Trees layer: L.circleMarker + L.canvas renderer (replaces divIcon for performance)
- `allParksRef` keeps tree-popup nearest-park lookup fresh (stale-closure fix)
- Tree circleMarker popup: name/species/genus + nearest park + "View nearest park" button
- ParkModal: nearby NPWS facilities within 2km, nearby dog park within 500m
- ParkModal: Get Directions (Google Maps), Share (copy ?park= URL), Save, "View on OpenStreetMap"
- ParkModal: click-to-copy coordinates row, "Find Nearby Parks" (≤1km)
- Mobile FAB "Filters" button when sidebar collapsed
- Custom scrollbars per theme (all 5)
- Card stagger fade-in animation
- High-contrast / forced-colors media query
- Reduced motion respected
- **Map legend** (bottom-left): 5 marker colour categories
- **Deep-link**: `?park=<name>` opens park modal on load; `?filter=<key>` pre-sets a filter; `?locate=1` triggers locate; `?q=` syncs search
- **URL sync**: `?q=` and `?sort=` update as user types/changes sort, restored on mount
- **Recently-viewed chips** strip in sidebar — last 4 parks with Clear button; refreshes when modal closes
- **`/` keyboard shortcut** to focus search (with `<kbd>` hint in input)
- **Arrow key navigation** ↑↓ between result cards from search input; Escape returns to search
- **Park stats bar**: playgrounds / iconic / neighbourhood / sportsfield counts (idle state)
- **Fit-to-results button** next to results count — fitBounds on filtered parks
- **Viewport park counter** — "X parks visible" pill centered at map top
- **Suburb click-to-filter** — clicking suburb pill in park card searches that suburb
- **Type badge click-to-filter** — clicking type badge on card activates that filter
- **Export saved parks** — copy icon button in results header (Saved mode) copies list to clipboard
- **Directions link** in map popup (alongside "View Details")
- **Neon theme** applies CSS hue-rotate filter to map tiles (distinct from Night Mode)
- Park card favorite button wired to `toggleFavorite(park.id)` — Set<number> type-safe
- **Min area filter** preset buttons (Any / 500m²+ / 2,000m²+ / 1ha+ / 5ha+) in Filters panel
- **Compact view toggle** — list icon button in results header, hides meta/facilities rows for dense browsing
- **Surprise Me button** (dice icon) — opens a random park from current filtered results
- **Scroll-to-top button** — appears in results list after scrolling down, smooth-scrolls back to top
- **Home page**: Park of the Day (date-seeded from curated list, links to `?park=` deep-link)
- **Home page**: Quick Explore 8 cards (Playground/Dogs/Iconic/Pocket/Largest/Near Me/Sports/Neighbourhood)
- **Home page**: Recently Viewed links now use `?park=` deep-links to open specific park modals
- **Active filter chips**: pill strip below results header for each active filter — click × to remove individually
- **Copy search link button**: link icon in results header (when filters/search active) copies current URL to clipboard
- **Keyboard shortcuts overlay**: `?` key or `?` button in results header shows full shortcuts modal (animated)
- **S / C / F / T shortcuts**: Surprise me / toggle Compact / Fit-map-to-results / Cycle theme (`T` uses `THEMES` array)
- **About page**: Keyboard shortcuts section with grid of key bindings; updated tech stack to show 6 themes
- **Hero height**: removed `min-height: 88vh` so Quick Explore is immediately visible below the fold
- **Sort by Largest**: 4th sort option (Largest) sorts parks by area descending; `?sort=size` URL param restored on mount
- **Map popup**: now shows suburb and area (📍/📐 icons) alongside park name and type
- **Empty state**: context-aware messages — search mismatch vs filter mismatch vs no saved parks
- **Type breakdown strip**: shows park type distribution (up to 5 types) below active filter chips when results are filtered
- **Sort button fix**: `white-space: nowrap` on `.pp-sort-btn` prevents A–Z from wrapping to two lines
- **Rank badges**: `#1`–`#10` on park cards when `sortBy === "size"`; top 3 get gold/silver/bronze colours
- **Largest sort banner**: summary strip below geocode hint when sorted by Largest (shows leader park + combined ha)
- **Clickable type breakdown strip**: clicking a type tag in breakdown toggles that filter; active state highlighted
- **Home page "Did you know?"**: 14 rotating facts strip between Features and Stats sections
- **Home page clear history**: "Clear history" ghost button in Recently Viewed section header
- **Walk time in modal**: when user location is enabled, ParkModal shows distance + walking time from current location
- **About page**: updated feature list covering all features; satellite theme in tech stack
- **Satellite theme**: 6th theme using Esri World Imagery tiles; legend has readability overrides; attribution switches
- **Satellite theme shortcut**: `T` key cycles through all 6 themes without touching the Navbar dropdown
- **ParkModal area bar**: visual progress bar + "% of Sydney's largest" + fun comparison (tennis courts/football fields)
- **ParkModal coords row**: inline click-to-copy row + separate "Coords" footer button for discoverability
- **Quick pills**: 8 pills including new ⚽ Sports; stats bar now shows 6 types including dog parks + pocket parks
- **Export saved parks**: now includes Google Maps link per park in clipboard output
- **Geocode hint**: close (×) button to dismiss "Showing X parks near Y" banner without clearing all
- **Recently viewed chips**: now show suburb as a sub-label below park name
