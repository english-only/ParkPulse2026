# Park Pulse v6 — design direction

**Goal:** make Park Pulse read as one deliberate product — a field atlas of Sydney's public
green space — across every route and both themes, without changing what the data says.

## The idea

Park Pulse is a **survey instrument, not a dashboard**. The product's authority comes from
naming its sources and its limits. The interface should feel like a well-made field guide:
a serif for place names and headlines, a quiet sans for everything you read while working,
tabular numerals wherever counts line up, and a map that is always the anchor of the screen
rather than a decoration below it.

The one live thing on the landing page is the **park plate**: all 418 park areas in the
City of Sydney layer, drawn from `public/data/hero-plate.json` as their real outlines at
build time. It is not decoration and not a scatter — a centroid can fall outside its own
polygon, while an outline cannot. The frame is square, matching the Explore map; the city
keeps its true aspect inside it rather than being stretched to fill. A two-kilometre
scale bar is computed from the plate's own ground scale, so it stays true at any width.
Choosing a type in the key isolates it in the Explorer palette; the drawing is the same
layer the map renders.

## Type

Two families. Both self-hosted from `public/fonts` (no CDN).

| Role | Family | Use |
|---|---|---|
| Display | Fraunces 600/700 | h1–h3, place names, the wordmark |
| Text/data | Source Sans 3 400/600/700 | body, labels, controls, numerals (tabular) |

IBM Plex Mono is retired. Three voices made every screen read like a developer README, and
the data role can be carried by tabular figures in the text face. This also removes ~15 KB of
font payload.

Six sizes, each with one job:

| Token | Size | Job |
|---|---|---|
| `--fa-text-xs` | 13px | the floor: source lines, key hints, legal |
| `--fa-text-sm` | 14px | metadata, table cells, chips |
| `--fa-text-md` | 16px | body, controls, ledger qualifiers |
| `--fa-text-lg` | 19px | lede, section intros |
| `--fa-text-xl` | 22–28px | h2 |
| `--fa-text-display` | `clamp(2.25rem, 1.5rem + 2.7vw, 3.9rem)` | h1 only |

Nothing meant to be read is set below 13px. The regression that prompted this floor was a
2 × 12px rail: 150 text blocks under 13px on Explore, mostly result metadata and council
statistics.

Rules: display tracking `-0.02em`, leading 1.02–1.12; body leading 1.55; measure 58–68ch;
no uppercase letter-spaced micro-labels above headings (the "eyebrow" is removed everywhere —
the heading says what the section is).

## Colour

The existing `--pp-*` palettes stay; they are contrast-tested. What changes is discipline:
**one accent, used for action and current state only**, and structure carried by tone steps
rather than borders.

| Role | Warm Field | Night Field |
|---|---|---|
| Canvas | `#F6F7F1` | `#000000` |
| Panel | `#FFFFFF` | `#0A0F0C` |
| Sunken | `#ECF1E9` | `#060A08` |
| Ink | `#19231D` | `#F2F5F3` |
| Muted ink | `#45544A` | `#B4C2B9` |
| Hairline | `#D2DDD2` | `#24312A` |
| Accent | `#176B43` | `#43D18A` |

Night is genuinely black at the canvas and lifts panels by 4–8% luminance, never by glow. The
map keeps its tile filter for streets; markers, popups and controls are re-tuned so a marker is
legible on the inverted tiles.

## Layout

- Page frame: `min(1200px, 100% - 48px)`, one pair of equal margins at every width.
- Explore shares that frame but narrows its instrument to `min(1010px, 100% - 48px)` so the
  intro, the controls and the map all hang off one vertical line. The map is square, centred
  in its column, and capped by viewport height so it never needs a scroll to be whole.
- Section rhythm: 96–128px desktop, 56–72px phone. Gaps inside a section stay smaller than
  the gap between sections.
- Route-specific composition: Home editorial (headline + field, ledger, short guide, entry
  list); Explore workspace (intro band, then controls left / square map right); Insights
  ledger; Atlas table; Compare tool; About prose. No route is a copy of another's template.
- Surfaces: 12px radius panels, 999px only for chips and toggles. Shadows only on things that
  truly float (dialog, popover, dropdown).

## Components

- `fa-panel` — a bordered work surface with an optional header row and a footer note.
- `fa-toolbar` — one horizontal row of controls above a list; never a wall of icon buttons.
- `fa-chip` — pressed/unpressed filter with `aria-pressed`, count as a second line.
- `fa-key` — map legend entry with a swatch and a label; the swatch encodes the marker.
- `fa-stats` / `fa-stat` — the ledger: name, publisher/coverage and a right-aligned count,
  one row per record kind. The default way to show counts; used on Home and Insights.
- `fa-figure` — a large number with its unit and its caveat.
- `fa-map-frame` — the map window: header strip, the map, an overlay key.

## Motion

Reuse the nine registry tokens already in `src/index.css`. Nothing hand-tuned.

| Moment | Motion |
|---|---|
| Nav current route | underline scaleX from 0, `--duration-hover`, `--ease-out-quart` |
| Button press | `scale(.98)`, `--duration-press` |
| Card hover / selected | `translateY(-2px)`, tone step, hairline → accent, `--duration-hover` |
| Filter chip toggle | background + swatch only, `--duration-hover` |
| Panel/dialog entrance | opacity 0→1, `scale(.98→1)`, `--duration-modal`, `--ease-out-expo` |
| Route content | opacity 0→1, `translateY(6px→0)`, `--duration-page`, `--ease-out-quart` |
| Hero field | one staggered reveal (80 ms apart, `--ease-out-quart`), then still |
| Map selection | cross-fade of the selected card's accent; no marker movement that implies travel |

Exits run at 60% of entrances. Every effect is unwound by the global
`prefers-reduced-motion` rule to a static state, and no interaction depends on hover.

## Explore workspace (the instrument)

Desktop: search → council scope → map layers → park type → results → scope totals, left; a
square map on the right that sticks under the header for the whole length of the results.
That only works if the map's grid column is as tall as the rail (`align-items: stretch`); with
`start`, the column ended at the frame and the map scrolled away.

Mobile: the map leads and stays pinned while search, filters and results pass beneath it.
The map header keeps its three tools on one row by dropping the count line under 560px; the
same count is in the results heading.

Every category the build publishes is a chip with its real count: parks, off-leash areas,
drinking fountains, public toilets, NPWS facilities, transport stops, street trees, plus the
five park-type refinements and a minimum-area step. Nothing is invented, and nothing valid is
hidden to make the map look calmer.

Scope totals live after the results: they qualify a selection, they are not a step in finding
a place, and keeping them out of the top of the rail brings the results list several hundred
pixels closer to the fold.

## Motion, as built

- Route content: one fade-and-rise (`--duration-page`, `--ease-out-quart`).
- Sections and their rows: a single reveal on entry, 45 ms stagger, never replayed. Hidden
  state exists only after the observer runs, so the page is readable without JavaScript.
- Hero field: one reveal for the whole plot rather than ~950 animated dots.
- Controls: hover/press at `--duration-hover` / `--duration-press`; no motion delays input.
- Reduced motion: every effect unwinds to a static state under `prefers-reduced-motion`.

## Non-goals

- No third theme, no second palette, no theme-per-page.
- No new runtime dependency for motion or state.
- No fabricated categories, counts, coordinates or facilities.
- No backend, auth or database. The product is a static build over published files.
