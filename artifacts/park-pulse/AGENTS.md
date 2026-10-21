# Park Pulse app — instructions

Sydney parks and facilities atlas. Static Vite build: all data ships as JSON/GeoJSON under
`public/data/`, there is no server at runtime. Product intent lives in
`PRD-v5-generational-product-redesign.md` and `IMPLEMENTATION-LOG.md` (what shipped and what
is deliberately still open).

## Stack

React 19 · TypeScript · Vite 7 · Tailwind CSS 4 (`@tailwindcss/vite`, no config file) ·
Radix primitives behind a vendored shadcn/ui copy in `src/components/ui` · Leaflet +
markercluster · `wouter` routing · vitest · Playwright + axe. The vendored `ui/` copy also
pulls react-hook-form, recharts and sonner; the app's own pages do not use them directly.

`framer-motion` and `zod` are declared but unused. Do not spread them further or delete
them on a whim — motion here is CSS tokens (below), and validation is hand-written.

## Layout

```
src/App.tsx            routes: / explore dashboard amenities compare atlas about + 404, lazy per page
src/pages/             Home, Explore, Dashboard (Insights), Amenities, Compare, Atlas, About, not-found
src/components/        Navbar, Footer, ParkModal, CouncilSelector/Stats, MultiCouncilPanel, ui/ (vendored)
src/data/layers.ts     layer registry — single source of truth for published datasets
src/data/snapshot.ts   count lookup (countFor) over generated stats; null means unknown, never 0
src/hooks/             useTheme (warm|night), useCulledMarkerLayer, use-mobile, use-toast
src/utils/             councils, dataCache, geo, geojson, compare, canopy (+ colocated *.test.ts)
src/index.css          --pp-* palette, legacy pp-* components, shadcn bridge, motion tokens
src/styles/field-atlas.css   fa-* redesign component layer (newer surfaces)
src/styles/type.css          type scale
e2e/*.spec.ts          Playwright: explore, councils, dashboard, home, pages, perf, transport, a11y, contrast
```

## Commands

```bash
pnpm --filter @workspace/park-pulse dev         # shard trees + stats, then vite on :4173
pnpm --filter @workspace/park-pulse build       # shard trees + stats, then vite build → dist/public
pnpm --filter @workspace/park-pulse typecheck   # tsc --noEmit
pnpm --filter @workspace/park-pulse test        # vitest run (jsdom)
pnpm --filter @workspace/park-pulse test:e2e    # Playwright; boots vite preview on :4321
```

`dev`/`build` regenerate shard and stats artifacts; they are build output, never edited or
committed. `BASE_PATH` and `PORT` are read from the environment.

## Design system

- One palette, two themes: `warm` (Warm Field) and `night` (Night Field), applied as
  `data-theme` on `<html>` by `useTheme`. Map basemap (`streets`/`satellite`) is a **map
  style**, not a theme — keep them separate.
- All colour, radius, shadow and spacing values come from the `--pp-*` tokens in
  `src/index.css`. Both themes must be satisfied; any new colour needs a contrast check.
- shadcn utilities are bridged to the palette by the `@theme inline` block; `bg-card`,
  `text-muted-foreground` etc. already resolve to `--pp-*`. Do not add a second palette.
- `src/components/ui` is vendored shadcn for surfaces **outside** Explore. Explore still
  renders `pp-*` markup and is being migrated surface by surface; do not switch it to the
  shadcn layer casually.
- `.fa-*` (field-atlas) is the current component layer for redesigned surfaces; extend it
  rather than adding new global `pp-*` rules.

### Motion tokens

`src/index.css` ends with a `@theme static` block holding the Design Engineering motion
tokens (registry `design-engineering-motion`, MIT © HKTITAN, adapted manually — the shadcn
CLI's theme install would overwrite the palette):

`--ease-out-quart` · `--ease-out-expo` · `--ease-in-out` · `--ease-spring`
`--duration-press` 120ms · `--duration-hover` 160ms · `--duration-popover` 200ms ·
`--duration-modal` 250ms · `--duration-page` 300ms

Use them (`transition: opacity var(--duration-hover) var(--ease-out-quart)`), never
hand-picked curves. Rules: name the animated properties (never `transition: all`);
entrances use ease-out; exits run at ~60% of the entrance duration; no ease-in entrances; no
scaling from 0. `prefers-reduced-motion` is already handled globally — new animation must
still degrade to a static state, not a broken one.

## Data contract

- `src/data/layers.ts` is the only place a dataset is described: publisher, coverage,
  licence status, limitations, `status` (`published` | `gated` | `unavailable`) and
  `countKey`. `countKey` indexes the generated `public/data/stats.json`.
- **Unknown is not zero.** `countFor` returns `null` when a count is absent; UI renders
  "—"/omits, never "0".
- Explore's default layers are parks + off-leash areas; trees, toilets, fountains, NPWS and
  transport are opt-in.
- Council data: parks and boundaries cover all 35 LGAs; tree shards currently exist for
  Parramatta only. Canopy is licence-gated and must not be presented as a derived figure.
- Licensing and provenance for every source are recorded in `DATA_INVENTORY.md` at the repo
  root. A new source needs its licence status before it appears on screen.

## Testing

- Unit: `vitest` (jsdom), colocated `*.test.ts`. Cover parsing, registry invariants and
  count semantics when you touch `src/data` or `src/utils`.
- E2E: Playwright, `workers: 1`, against `vite preview` on `:4321`. Every spec asserts real
  rendered behaviour; `a11y.spec.ts` and `contrast.spec.ts` run axe and colour measurements
  in **both** themes. Add or update a spec when you change a flow — do not loosen an existing
  assertion to make it pass.
- Use `playwright-cli` for exploratory checks (snapshots, screenshots, clicking through a
  flow) before writing or fixing a spec.
- For any visual change, look at the rendered result at desktop and ~390px, and read the
  console. A green build is not evidence that the page looks right.

## Commits

Commit every piece of work before reporting done — features, fixes, docs, config, and any
problem you found even if you could not fix it (write it into `IMPLEMENTATION-LOG.md` under
"Open issues" and commit that). The full policy is the "Commits" section of the root
`AGENTS.md`; the parts that bite most often here:

- Stage explicit paths, never `git add -A`. UI fixes, data-pipeline scripts and docs are
  separate commits.
- Never commit generated output: `public/data/trees/`, `boundaries/`, `transport/`,
  `councils-trees/`, `canopies/`, `dist/`, or the `review/` screenshots. Curated evidence
  belongs in `docs/superpowers/`.
- Run `pnpm --filter @workspace/park-pulse typecheck` before committing app code, and the
  relevant spec before committing anything user-visible. A red tree is only acceptable with
  the failure written down in the same commit.
- Committing is routine and expected; pushing, PRs and deploys are not — those happen only
  when asked.

## Pitfalls

- Leaflet needs its container sized before init; the Explore layout is viewport-locked on
  desktop and stacked under 900px — test both.
- Marker counts and layer counts are asserted in e2e; changing default layers or clustering
  breaks those specs, deliberately.
- Manual chunks (`leaflet`, `react-vendor`) keep the entry small. Importing Leaflet from a
  non-Explore page defeats that.
- `public/data` is served verbatim; a 6 MB artifact on the default path is a real cost.
