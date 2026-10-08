/**
 * Loader for the sharded tree dataset produced by `scripts/shard-trees.mjs`.
 *
 * The original `trees.geojson` is ~16 MiB / 48,999 points. It is replaced at
 * runtime by a manifest plus small, individually cacheable shards, so opening
 * the trees layer costs only the tiles actually in view instead of the whole
 * city. If the shards are missing (sharder not run) this falls back to the
 * original geojson so the feature degrades rather than disappears.
 */
import { fetchWithCache } from "./dataCache";

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface TreeRecord {
  lat: number;
  lng: number;
  assetId: string;
  commonName: string;
  speciesName: string;
  treeType: string;
  treeStatus: string;
  age: string;
  dbhCm: number | null;
  height: number | null;
}

interface DictColumn {
  table: string[];
  idx: number[];
}

interface TreeShardPayload {
  n: number;
  lng: number[];
  lat: number[];
  assetId: string[];
  dbh: (number | null)[];
  height: (number | null)[];
  common: DictColumn;
  species: DictColumn;
  treeType: DictColumn;
  treeStatus: DictColumn;
  age: DictColumn;
}

interface ShardManifest {
  version: number;
  total: number;
  grid: {
    size: number;
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  cells: { c: string; n: number; b: number }[];
}

export interface TreeSourceInfo {
  /** "sharded" when viewport shards are in use, "geojson" on fallback. */
  mode: "sharded" | "geojson";
  /** Total trees available in the dataset, not just the loaded subset. */
  total: number;
  /** Trees actually loaded for the current viewport. */
  loaded: number;
}

function cellKey(col: number, row: number): string {
  return `${col}_${row}`;
}

function decode(payload: TreeShardPayload): TreeRecord[] {
  const out: TreeRecord[] = new Array(payload.n);
  for (let i = 0; i < payload.n; i++) {
    out[i] = {
      lat: payload.lat[i],
      lng: payload.lng[i],
      assetId: payload.assetId[i],
      commonName: payload.common.table[payload.common.idx[i]] ?? "",
      speciesName: payload.species.table[payload.species.idx[i]] ?? "",
      treeType: payload.treeType.table[payload.treeType.idx[i]] ?? "",
      treeStatus: payload.treeStatus.table[payload.treeStatus.idx[i]] ?? "",
      age: payload.age.table[payload.age.idx[i]] ?? "",
      dbhCm: payload.dbh[i] ?? null,
      height: payload.height[i] ?? null,
    };
  }
  return out;
}

/**
 * Which manifest cells intersect the viewport, plus a small ring of
 * neighbours. The ring means a pan of one or two cells does not immediately
 * trigger a fetch, which is what makes panning feel continuous.
 */
function cellsForBounds(manifest: ShardManifest, bounds: Bounds, pad = 1): string[] {
  const { size, minLng, maxLng, minLat, maxLat } = manifest.grid;
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const clamp = (n: number) => Math.min(size - 1, Math.max(0, n));

  const west = clamp(Math.floor(((bounds.west - minLng) / spanLng) * size));
  const east = clamp(Math.floor(((bounds.east - minLng) / spanLng) * size));
  // Row 0 is the south edge of the grid, so latitude is inverted.
  const north = clamp(Math.floor(((maxLat - bounds.north) / spanLat) * size));
  const south = clamp(Math.floor(((maxLat - bounds.south) / spanLat) * size));

  const wanted: string[] = [];
  for (let col = west - pad; col <= east + pad; col++) {
    for (let row = north - pad; row <= south + pad; row++) {
      if (col < 0 || row < 0 || col >= size || row >= size) continue;
      wanted.push(cellKey(col, row));
    }
  }
  return wanted;
}

let manifestPromise: Promise<ShardManifest | null> | null = null;

function loadManifest(): Promise<ShardManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetchWithCache<ShardManifest>("data/trees/manifest.json", "pp_trees_manifest")
      .then(({ data }) => (data?.cells?.length ? data : null))
      .catch((err) => {
        console.warn("[trees] sharded manifest unavailable, falling back to trees.geojson:", err);
        return null;
      });
  }
  return manifestPromise;
}

/** Test seam: forget the cached manifest so a new manifest is picked up. */
export function __resetTreeManifestCache(): void {
  manifestPromise = null;
}

async function loadFromGeoJson(): Promise<TreeSourceInfo> {
  const { data } = await fetchWithCache<GeoJSON.FeatureCollection>(
    "data/trees.geojson",
    "pp_trees",
  );
  const trees: TreeRecord[] = [];
  for (const f of data.features ?? []) {
    const c = (f as GeoJSON.Feature<GeoJSON.Point>).geometry?.coordinates;
    if (!c) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    trees.push({
      lat: c[1],
      lng: c[0],
      assetId: typeof p.asset_id === "string" ? p.asset_id : "",
      commonName: typeof p.CommonName === "string" ? p.CommonName : "",
      speciesName: typeof p.SpeciesName === "string" ? p.SpeciesName : "",
      treeType: typeof p.TreeType === "string" ? p.TreeType : "",
      treeStatus: typeof p.Tree_Status === "string" ? p.Tree_Status : "",
      age: typeof p.Tree_Age === "string" ? p.Tree_Age : "",
      dbhCm: typeof p.DBH_in_cm === "number" ? p.DBH_in_cm : null,
      height: typeof p.TreeHeight === "number" ? p.TreeHeight : null,
    });
  }
  return { mode: "geojson", total: trees.length, loaded: trees.length };
}

/**
 * Load the trees for a viewport. Resolves to an empty result (rather than
 * rejecting) when the viewport is outside the dataset, so the caller never
 * needs to special-case "no data here".
 */
export async function loadTreesForBounds(bounds: Bounds): Promise<{ trees: TreeRecord[]; info: TreeSourceInfo }> {
  const manifest = await loadManifest();
  if (!manifest) {
    const info = await loadFromGeoJson();
    return { trees: [], info };
  }

  const wanted = cellsForBounds(manifest, bounds);
  const available = new Set(manifest.cells.map((c) => c.c));
  const cells = wanted.filter((c) => available.has(c));
  if (!cells.length) {
    return { trees: [], info: { mode: "sharded", total: manifest.total, loaded: 0 } };
  }

  const payloads = await Promise.all(
    cells.map((cell) =>
      fetchWithCache<TreeShardPayload>(`data/trees/${cell}.json`, `pp_trees_${cell}`).then(
        ({ data }) => data,
      ),
    ),
  );

  const trees: TreeRecord[] = [];
  for (const payload of payloads) {
    if (payload?.n) trees.push(...decode(payload));
  }

  return {
    trees,
    info: { mode: "sharded", total: manifest.total, loaded: trees.length },
  };
}
