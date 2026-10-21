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
import {
  decodeShard,
  type ShardManifest,
  type TreeShardPayload,
} from "./treeShardFormat";

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
  /** Display name of the council dataset this tree came from (null = city baseline). */
  councilName: string | null;
}

/** Registry emitted by `scripts/shard-trees.mjs --lga` (FR3.1). */
export interface CouncilTreeRegistry {
  version: number;
  councils: Array<{ lga_id: string; display_name: string; total: number; shards: number }>;
}

/** Which shard files to fetch: one entry per (council, cell). */
export interface ShardRequest {
  lgaId: string;
  displayName: string;
  cell: string;
}

/**
 * Pure resolver: given the registry, the manifests that have been loaded for
 * the requested councils, and a viewport, list every shard that must be
 * fetched. Councils the user selected but whose data is not in the registry
 * contribute nothing (their status is "missing" in council-manifest.json).
 *
 * Kept pure so `treeData.test.ts` can prove the multi/single/no-selection
 * behaviour with fixtures and no network (FR3.3–3.4, FR3.7).
 */
export function resolveShardRequests(options: {
  registry: CouncilTreeRegistry | null;
  manifests: ReadonlyMap<string, ShardManifest>;
  bounds: Bounds;
  councilIds: readonly string[];
}): ShardRequest[] {
  const { registry, manifests, bounds, councilIds } = options;
  if (!registry || councilIds.length === 0) return [];
  const requests: ShardRequest[] = [];
  for (const id of councilIds) {
    const entry = registry.councils.find(c => c.lga_id === id);
    const manifest = manifests.get(id);
    if (!entry || !manifest) continue; // no tree dataset published for this council
    for (const cell of cellsForBounds(manifest, bounds)) {
      if (manifest.cells.some(c => c.c === cell)) {
        requests.push({ lgaId: id, displayName: entry.display_name, cell });
      }
    }
  }
  return requests;
}

export interface TreeSourceInfo {
  /** "sharded" city shards, "council" council shards, "geojson" fallback. */
  mode: "sharded" | "council" | "geojson";
  /** Total trees available in the dataset, not just the loaded subset. */
  total: number;
  /** Trees actually loaded for the current viewport. */
  loaded: number;
  /** Councils whose trees were loaded (display names), for the overlay badge. */
  councils?: string[];
}

function cellKey(col: number, row: number): string {
  return `${col}_${row}`;
}

/** Shape the shared codec produces → the app's TreeRecord. */
function decode(payload: TreeShardPayload, councilName: string | null = null): TreeRecord[] {
  return decodeShard(payload).map(r => ({
    lat: r.lat,
    lng: r.lng,
    assetId: r.assetId,
    commonName: r.commonName,
    speciesName: r.speciesName,
    treeType: r.treeType,
    treeStatus: r.treeStatus,
    age: r.age,
    dbhCm: r.dbhCm,
    height: r.height,
    councilName,
  }));
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
let registryPromise: Promise<CouncilTreeRegistry | null> | null = null;
const councilManifestPromises = new Map<string, Promise<ShardManifest | null>>();

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

/** Registry of council shard sets; null when no council trees are sharded yet. */
function loadCouncilRegistry(): Promise<CouncilTreeRegistry | null> {
  if (!registryPromise) {
    registryPromise = fetchWithCache<CouncilTreeRegistry>(
      "data/councils-trees/index.json",
      "pp_councils_trees_index",
    )
      .then(({ data }) => (data?.councils?.length ? data : null))
      .catch(() => null);
  }
  return registryPromise;
}

function loadCouncilManifest(lgaId: string): Promise<ShardManifest | null> {
  let pending = councilManifestPromises.get(lgaId);
  if (!pending) {
    pending = fetchWithCache<ShardManifest>(
      `data/councils-trees/${lgaId}/manifest.json`,
      `pp_council_trees_manifest_${lgaId}`,
    )
      .then(({ data }) => (data?.cells?.length ? data : null))
      .catch(() => null);
    councilManifestPromises.set(lgaId, pending);
  }
  return pending;
}

/** Test seam: forget the cached manifests/registry so new ones are picked up. */
export function __resetTreeManifestCache(): void {
  manifestPromise = null;
  registryPromise = null;
  councilManifestPromises.clear();
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
      councilName: null,
    });
  }
  return { mode: "geojson", total: trees.length, loaded: trees.length };
}

/**
 * Council-scoped tree loading (FR3.3–3.4): with a selection, only the
 * selected councils' shard sets are consulted; with no selection the city
 * baseline behaves exactly as before (regression-free).
 */
async function loadCouncilTrees(
  bounds: Bounds,
  councilIds: readonly string[],
): Promise<{ trees: TreeRecord[]; info: TreeSourceInfo }> {
  const registry = await loadCouncilRegistry();
  if (!registry) return { trees: [], info: { mode: "council", total: 0, loaded: 0, councils: [] } };

  const wanted = registry.councils.filter(c => councilIds.includes(c.lga_id));
  const manifests = new Map<string, ShardManifest>();
  await Promise.all(
    wanted.map(async c => {
      const manifest = await loadCouncilManifest(c.lga_id);
      if (manifest) manifests.set(c.lga_id, manifest);
    }),
  );

  const requests = resolveShardRequests({ registry, manifests, bounds, councilIds });
  const total = wanted.reduce((sum, c) => sum + c.total, 0);
  if (!requests.length) {
    return { trees: [], info: { mode: "council", total, loaded: 0, councils: wanted.map(c => c.display_name) } };
  }

  const payloads = await Promise.all(
    requests.map(req =>
      fetchWithCache<TreeShardPayload>(
        `data/councils-trees/${req.lgaId}/${req.cell}.json`,
        `pp_council_trees_${req.lgaId}_${req.cell}`,
      ).then(({ data }) => ({ req, data })),
    ),
  );

  const trees: TreeRecord[] = [];
  for (const { req, data } of payloads) {
    if (data?.n) trees.push(...decode(data, req.displayName));
  }

  return {
    trees,
    info: {
      mode: "council",
      total,
      loaded: trees.length,
      councils: wanted.map(c => c.display_name),
    },
  };
}

/**
 * Load the trees for a viewport. Resolves to an empty result (rather than
 * rejecting) when the viewport is outside the dataset, so the caller never
 * needs to special-case "no data here".
 *
 * Pass `councilIds` when a council selection is active to load only those
 * councils' shard sets; without it the city baseline shards are used.
 */
export async function loadTreesForBounds(
  bounds: Bounds,
  options?: { councilIds?: readonly string[] },
): Promise<{ trees: TreeRecord[]; info: TreeSourceInfo }> {
  const councilIds = options?.councilIds ?? [];
  if (councilIds.length > 0) {
    return loadCouncilTrees(bounds, councilIds);
  }

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
