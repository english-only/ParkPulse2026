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
- **Themes**: 5 themes (default/dark/sunset/neon/minimal) via `useTheme` hook + `data-theme` attribute
- **State**: component-local (no Redux/Zustand)
- **Data**: static GeoJSON/JSON in `public/data/` — no backend needed

### Key files
- `src/pages/Explore.tsx` — main map+sidebar page (all map logic, filters, layers)
- `src/components/ParkModal.tsx` — park detail modal (nearby NPWS, dog parks)
- `src/components/Navbar.tsx` — nav + theme picker
- `src/utils/dataCache.ts` — localStorage cache utility (7-day TTL, 4MB cap)
- `src/context/ToastContext.tsx` — toast notifications
- `src/types/park.ts` — Park type

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
- Sort by Default / Name (A–Z) / Nearest (requires geolocation)
- Haversine distance calculation + distance badge on cards
- Locate Me → auto-enables nearest sort + stores userLocation
- Load More button (cap 100, +100 per click)
- Filters section: max-height 42%, internally scrollable
- Layer count badges on filter items (after first load)
- "Cached data ↺ refresh" indicator
- Trees layer: L.circleMarker + L.canvas renderer (replaces divIcon for performance)
- ParkModal: nearby NPWS facilities within 2km, nearby dog park within 500m
- Mobile FAB "Filters" button when sidebar collapsed
- Custom scrollbars per theme (all 5)
- Card stagger fade-in animation
- High-contrast / forced-colors media query
- Reduced motion respected
