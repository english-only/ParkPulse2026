/**
 * Splits the monolithic `public/data/trees.geojson` (~17 MB / 48,999 points)
 * into small viewport-addressable shards so that:
 *
 *   1. the map only downloads the trees for the current viewport, and
 *   2. each shard fits comfortably under the localStorage cache cap in
 *      `src/utils/dataCache.ts` (which silently drops oversized entries).
 *
 * Source of truth stays the original geojson; the shards are build output and
 * are git-ignored. Output uses a columnar, dictionary-encoded format because
 * the low-cardinality string columns (species, type, age) dominate the raw
 * geojson's per-feature key repetition.
 *
 * Usage: node ./scripts/shard-trees.mjs
 */
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(artifactDir, "public", "data", "trees.geojson");
const outDir = path.join(artifactDir, "public", "data", "trees");

/** Target bytes per shard. Kept well under the 4 MiB dataCache cap. */
const TARGET_BYTES = 900 * 1024;
/** Bounds below this many cells we consider the grid too fine and coarsen. */
const MIN_CELLS = 4;

const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Pick the coarsest grid whose largest shard stays under TARGET_BYTES.
 *
 * The bytes-per-feature ratio is measured from a real encoded sample rather
 * than guessed, because the ratio depends on how well the dictionary
 * columns compress for this particular dataset.
 */
function chooseGrid(features, bounds) {
  const sample = features.slice(0, Math.min(features.length, 2000));
  const bytesPerFeature = Buffer.byteLength(JSON.stringify(encode(sample))) / sample.length;
  const needed = Math.ceil(features.length * bytesPerFeature / TARGET_BYTES);
  let size = 1;
  while (size < needed && size < 128) size *= 2;

  const cells = new Map();
  for (const f of features) {
    const key = cellKey(f.lng, f.lat, bounds, size);
    let bucket = cells.get(key);
    if (!bucket) cells.set(key, (bucket = []));
    bucket.push(f);
  }
  return { size, cells, bytesPerFeature };
}

function cellKey(lng, lat, bounds, size) {
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const col = Math.min(size - 1, Math.max(0, Math.floor(((lng - minLng) / spanLng) * size)));
  // Latitude grows northwards; row 0 is the south edge.
  const row = Math.min(size - 1, Math.max(0, Math.floor(((maxLat - lat) / spanLat) * size)));
  return `${col}_${row}`;
}

/**
 * Dictionary-encode a column so repeated strings cost one entry. The result is
 * namespaced because several columns are encoded in the same payload and the
 * bare `table`/`idx` keys would otherwise overwrite each other.
 */
function dict(name, values) {
  const table = [];
  const index = new Map();
  const idx = values.map((v) => {
    let i = index.get(v);
    if (i === undefined) {
      i = table.push(v) - 1;
      index.set(v, i);
    }
    return i;
  });
  return { [name]: { table, idx } };
}

async function main() {
  let raw;
  try {
    raw = await readFile(sourceFile, "utf8");
  } catch {
    console.error(`[shard-trees] source not found: ${sourceFile}`);
    console.error("[shard-trees] nothing to shard; the app will fall back to the raw geojson.");
    return;
  }

  const geo = JSON.parse(raw);
  const features = [];
  for (const f of geo.features ?? []) {
    const c = f?.geometry?.coordinates;
    if (!c || f.geometry.type !== "Point") continue;
    features.push({ lng: c[0], lat: c[1], p: f.properties ?? {} });
  }
  if (!features.length) {
    console.error("[shard-trees] no point features found; aborting without touching existing output.");
    return;
  }

  const lngs = features.map((f) => f.lng);
  const lats = features.map((f) => f.lat);
  const bounds = {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };

  const { size, cells, bytesPerFeature } = chooseGrid(features, bounds);

  // Build every shard first, then swap the directory in, so a failure never
  // leaves the app reading a half-written manifest.
  const staged = `${outDir}.tmp`;
  await rm(staged, { recursive: true, force: true });
  await mkdir(staged, { recursive: true });

  const manifest = { version: 1, total: features.length, grid: { size, ...bounds }, cells: [] };

  if (cells) {
    for (const [key, bucket] of cells) {
      const payload = encode(bucket);
      const json = JSON.stringify(payload);
      const file = `${key}.json`;
      await writeFile(path.join(staged, file), json);
      manifest.cells.push({
        c: key,
        n: bucket.length,
        // byte length of the shard as served, used for cache accounting
        b: Buffer.byteLength(json),
      });
    }
  } else {
    const json = JSON.stringify(encode(features));
    await writeFile(path.join(staged, "0_0.json"), json);
    manifest.cells.push({ c: "0_0", n: features.length, b: Buffer.byteLength(json) });
  }

  manifest.cells.sort((a, b) => a.c.localeCompare(b.c));
  await writeFile(path.join(staged, "manifest.json"), JSON.stringify(manifest));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.dirname(outDir), { recursive: true });
  await (await import("node:fs/promises")).rename(staged, outDir);

  const written = await readdir(outDir);
  const largest = Math.max(...manifest.cells.map((c) => c.b));
  const totalBytes = manifest.cells.reduce((s, c) => s + c.b, 0);
  console.log(
    `[shard-trees] ${features.length} trees -> ${manifest.cells.length} shards ` +
      `(grid ${size}x${size}, ${(bytesPerFeature).toFixed(0)} B/tree, largest ${(largest / 1024).toFixed(0)} KiB, ` +
      `total ${(totalBytes / 1024 / 1024).toFixed(2)} MiB from ${(raw.length / 1024 / 1024).toFixed(1)} MiB source)`,
  );
  if (largest > TARGET_BYTES) {
    console.warn(
      `[shard-trees] WARNING: largest shard is ${(largest / 1024 / 1024).toFixed(2)} MiB, ` +
        `over the ${(TARGET_BYTES / 1024 / 1024).toFixed(2)} MiB target; it may not persist to localStorage.`,
    );
  }
}

function encode(list) {
  const n = list.length;
  const lng = new Array(n);
  const lat = new Array(n);
  const assetId = new Array(n);
  const common = [];
  const species = [];
  const treeType = [];
  const treeStatus = [];
  const age = [];
  const dbh = new Array(n);
  const height = new Array(n);

  for (let i = 0; i < n; i++) {
    const { lng: x, lat: y, p } = list[i];
    lng[i] = r6(x);
    lat[i] = r6(y);
    assetId[i] = p.asset_id ?? "";
    common[i] = p.CommonName ?? "";
    species[i] = p.SpeciesName ?? "";
    treeType[i] = p.TreeType ?? "";
    treeStatus[i] = p.Tree_Status ?? "";
    age[i] = p.Tree_Age ?? "";
    dbh[i] = typeof p.DBH_in_cm === "number" ? p.DBH_in_cm : null;
    height[i] = typeof p.TreeHeight === "number" ? p.TreeHeight : null;
  }

  return {
    n,
    lng,
    lat,
    assetId,
    dbh,
    height,
    species: dict("species", species).species,
    common: dict("common", common).common,
    treeType: dict("treeType", treeType).treeType,
    treeStatus: dict("treeStatus", treeStatus).treeStatus,
    age: dict("age", age).age,
  };
}

main().catch((err) => {
  console.error("[shard-trees] failed:", err);
  process.exitCode = 1;
});