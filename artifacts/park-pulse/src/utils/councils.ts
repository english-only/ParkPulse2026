/**
 * Pure logic for the multi-council governance UI (PRD FR1).
 *
 * Everything here is deliberately free of React and Leaflet so it can be
 * unit-tested against fixtures: ordering, stable colour assignment,
 * alias resolution, point-in-polygon scoping (FR1.6), selection stats
 * (FR1.8) and deep-link serialisation (FR1.9).
 */

/** One row of `public/data/boundaries/councils-index.json`. */
export interface CouncilIndexEntry {
  id: number | string;
  lga_id: string;
  name: string;
  display_name: string;
  priority: boolean;
  priority_rank: number | null;
  /** Rounded area in km²; always > 0 for entries produced by build-councils.mjs. */
  area_km2: number;
  /** [south, west, north, east] in EPSG:4326 degrees. */
  bbox: [number, number, number, number];
  /** [lat, lng] of the largest polygon. */
  centroid: [number, number];
  /** Path relative to `public/data/`, e.g. `boundaries/councils/blacktown-city-council.geojson`. */
  geometry_file: string;
}

export interface CouncilIndex {
  generated_from: string;
  total_councils: number;
  total_area_km2: number;
  councils: CouncilIndexEntry[];
}

export type CouncilMode = "single" | "multi";

/** 8-colour palette fixed by the PRD; index = hash(lga_id) % 8. */
export const COUNCIL_PALETTE = [
  "#2D6A4F",
  "#E76F51",
  "#4A90E2",
  "#9B59B6",
  "#F4A261",
  "#1D6FA8",
  "#DC267F",
  "#5B8C5A",
] as const;

/**
 * FNV-1a 32-bit. Chosen over a trivial sum-of-chars hash because the palette
 * assignment must be stable across sessions and machines — a hash that
 * depends on iteration order would recolour boundaries on every reload.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable palette colour for a council. Same id → same colour, always. */
export function councilColor(lgaId: string): string {
  return COUNCIL_PALETTE[hashString(lgaId) % COUNCIL_PALETTE.length];
}

/**
 * Priority councils first (priority_rank ascending), then everything else
 * alphabetically by display name. Nulls sort last; the comparison is
 * sensitivity-free so "ku-ring-gai" and "Ku-ring-gai" order identically.
 */
export function sortCouncils(entries: readonly CouncilIndexEntry[]): CouncilIndexEntry[] {
  return [...entries].sort((a, b) => {
    const ar = a.priority_rank;
    const br = b.priority_rank;
    if (ar !== null && br !== null && ar !== br) return ar - br;
    if (ar !== null && br === null) return -1;
    if (ar === null && br !== null) return 1;
    return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" });
  });
}

/** PRD alias table: shorthand → exact display_name. */
export const COUNCIL_ALIASES: Record<string, string> = {
  sydney: "City of Sydney",
  hornsby: "Hornsby Shire Council",
  "ku-ring-gai": "Ku-ring-gai Council",
};

/**
 * Resolve a user-typed token to a council: exact alias first, then
 * display_name / raw name / lga_id equality (case-insensitive), then
 * prefix match on the display name. Returns null when nothing matches.
 */
export function resolveCouncilQuery(
  query: string,
  entries: readonly CouncilIndexEntry[],
): CouncilIndexEntry | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const alias = COUNCIL_ALIASES[q];
  if (alias) {
    const hit = entries.find(e => e.display_name === alias);
    if (hit) return hit;
  }

  const exact = entries.find(
    e =>
      e.display_name.toLowerCase() === q ||
      e.name.toLowerCase() === q ||
      e.lga_id.toLowerCase() === q,
  );
  if (exact) return exact;

  const prefix = entries.find(e => e.display_name.toLowerCase().startsWith(q));
  return prefix ?? null;
}

/** Free-text filter used by the selector search box (FR1.2). */
export function filterCouncils(
  entries: readonly CouncilIndexEntry[],
  query: string,
): CouncilIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    e =>
      e.display_name.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.lga_id.toLowerCase().includes(q),
  );
}

// ── Geometry ────────────────────────────────────────────────────────────────

type Ring = Array<[number, number]>;
type PolygonCoords = Ring[];

export interface CouncilGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | PolygonCoords[];
}

/** [south, west, north, east]. */
export type BBox = [number, number, number, number];

/** Ray-casting point-in-ring test on [lng, lat] coordinates. */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Polygon with holes: inside the outer ring and not inside any hole.
 * A point exactly on a hole's edge counts as outside the hole (inside the
 * polygon), which matches how map fills render at these coordinates.
 */
export function pointInPolygon(lng: number, lat: number, polygon: PolygonCoords): boolean {
  const outer = polygon[0];
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lng, lat, polygon[i])) return false;
  }
  return true;
}

function polygonsOf(geometry: CouncilGeometry): PolygonCoords[] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates as PolygonCoords]
    : (geometry.coordinates as PolygonCoords[]);
}

/** Bounding box of a council geometry, [south, west, north, east]. */
export function bboxOfGeometry(geometry: CouncilGeometry): BBox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    const outer = polygon[0];
    if (!outer) continue;
    for (const [lng, lat] of outer) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
  }
  return [south, west, north, east];
}

function bboxContains(bbox: BBox, lng: number, lat: number): boolean {
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

/**
 * Point-in-polygon against a council geometry with a bbox pre-filter (FR1.6).
 * The bbox short-circuits the vast majority of parks before any ring is
 * walked, which is what makes selection-scoping of ~400 parks × N councils
 * cheap enough to run synchronously in a filter effect.
 */
export function pointInCouncil(
  geometry: CouncilGeometry,
  lng: number,
  lat: number,
  bbox?: BBox,
): boolean {
  const box = bbox ?? bboxOfGeometry(geometry);
  if (!bboxContains(box, lng, lat)) return false;
  return polygonsOf(geometry).some(polygon => pointInPolygon(lng, lat, polygon));
}

/** Union bbox of several entries' index bboxes, for fitBounds. */
export function unionBBox(entries: readonly CouncilIndexEntry[]): BBox {
  if (!entries.length) return [0, 0, 0, 0];
  let [south, west, north, east] = entries[0].bbox;
  for (const e of entries.slice(1)) {
    south = Math.min(south, e.bbox[0]);
    west = Math.min(west, e.bbox[1]);
    north = Math.max(north, e.bbox[2]);
    east = Math.max(east, e.bbox[3]);
  }
  return [south, west, north, east];
}

export interface Pointable {
  lat: number;
  lng: number;
}

/**
 * Keep only points whose centroid falls inside at least one selected
 * council. Geometries that failed to load are skipped (the caller keeps the
 * selection and shows "boundary unavailable" per FR1.10).
 */
export function filterByCouncils<T extends Pointable>(
  points: readonly T[],
  geometries: ReadonlyMap<string, CouncilGeometry>,
): T[] {
  if (!geometries.size) return [...points];
  const boxes = new Map<string, BBox>();
  for (const [id, geometry] of geometries) boxes.set(id, bboxOfGeometry(geometry));
  return points.filter(p =>
    [...geometries].some(([id, geometry]) =>
      pointInCouncil(geometry, p.lng, p.lat, boxes.get(id)),
    ),
  );
}

// ── Stats (FR1.8) ───────────────────────────────────────────────────────────

export interface SelectionStats {
  /** Number of councils in the selection (0 = network-wide totals). */
  councilCount: number;
  /** Sum of area_km² across the selection. */
  areaKm2: number;
  /** areaKm2 / totalAreaKm2 × 100, rounded to 1 dp; null when total unknown. */
  coveragePct: number | null;
  /** Parks whose centroid is inside the selection. */
  parks: number;
  playgrounds: number;
  /** Sum of park area (m²) → hectares, 1 dp. */
  parksAreaHa: number;
}

export interface SelectionPark extends Pointable {
  hasPlayground?: boolean;
  area?: number | null;
}

export function computeSelectionStats(options: {
  selected: readonly CouncilIndexEntry[];
  parksInSelection: readonly SelectionPark[];
  totalAreaKm2: number;
}): SelectionStats {
  const { selected, parksInSelection, totalAreaKm2 } = options;
  const areaKm2 = selected.reduce((sum, e) => sum + e.area_km2, 0);
  let areaM2 = 0;
  let playgrounds = 0;
  for (const p of parksInSelection) {
    if (p.hasPlayground) playgrounds++;
    if (p.area != null) areaM2 += p.area;
  }
  return {
    councilCount: selected.length,
    areaKm2: round1(areaKm2),
    coveragePct:
      totalAreaKm2 > 0 ? round1((areaKm2 / totalAreaKm2) * 100) : null,
    parks: parksInSelection.length,
    playgrounds,
    parksAreaHa: round1(areaM2 / 10000),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── Deep links (FR1.9) ──────────────────────────────────────────────────────

/**
 * Read `?councils=lga-3,lga-30&mode=multi`. Unknown ids are dropped
 * silently and an empty/absent param yields an empty selection; `mode`
 * defaults to "multi" when more than one id survives, else "single".
 */
export function parseCouncilsParam(
  councilsParam: string | null,
  modeParam: string | null,
  validIds: ReadonlySet<string>,
): { ids: string[]; mode: CouncilMode } {
  const ids = (councilsParam ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0 && validIds.has(s));
  const deduped = [...new Set(ids)];
  const mode: CouncilMode =
    modeParam === "multi" || modeParam === "single"
      ? modeParam
      : deduped.length > 1
        ? "multi"
        : "single";
  return { ids: deduped, mode };
}

/** Serialise for the URL; empty selection removes both params. */
export function serializeCouncilsParam(
  ids: readonly string[],
  mode: CouncilMode,
): string {
  if (!ids.length) return "";
  const params = new URLSearchParams();
  params.set("councils", ids.join(","));
  if (ids.length > 1 || mode === "multi") params.set("mode", mode);
  return params.toString();
}
