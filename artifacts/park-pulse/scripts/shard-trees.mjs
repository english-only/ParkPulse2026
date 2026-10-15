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
 * Council trees (PRD Phase 3) use the same encoder but shard into their own
 * directory plus a registry entry, so the app can fetch exactly the councils
 * the user has selected:
 *
 *   public/data/councils-trees/index.json          registry of shard sets
 *   public/data/councils-trees/{lga_id}/manifest.json
 *   public/data/councils-trees/{lga_id}/{col}_{row}.json
 *
 * Usage:
 *   node ./scripts/shard-trees.mjs          auto-pick grid size (city trees)
 *   node ./scripts/shard-trees.mjs 10       force a 10x10 grid
 *   node ./scripts/shard-trees.mjs --lga city-of-parramatta-council \
 *     --name "City of Parramatta Council" \
 *     --source ../../Data/council-downloads/parramatta/trees.geojson
 *
 * `--source` defaults to Data/council-downloads/{lga_id}/trees.geojson at the
 * repo root. Output is deterministic: the same input yields byte-identical
 * shards and registry entries.
 */
import { readFile, writeFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode, r6 } from "./lib/shard-encode.mjs";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(artifactDir, "..", "..");
const sourceFile = path.join(artifactDir, "public", "data", "trees.geojson");
const outDir = path.join(artifactDir, "public", "data", "trees");
/** Council shard sets live beside the city ones, one directory per LGA. */
const councilRoot = path.join(artifactDir, "public", "data", "councils-trees");

/** Target bytes per shard. Kept well under the 4 MiB dataCache cap. */
const TARGET_BYTES = 900 * 1024;
/** Bounds below this many cells we consider the grid too fine and coarsen. */
const MIN_CELLS = 4;

/**
 * Pick the coarsest grid whose largest shard stays under TARGET_BYTES.
 *
 * The bytes-per-feature ratio is measured from a real encoded sample rather
 * than guessed, because the ratio depends on how well the dictionary
 * columns compress for this particular dataset.
 */
function chooseGrid(features, bounds, fieldMap) {
  const sample = features.slice(0, Math.min(features.length, 2000));
  const bytesPerFeature = Buffer.byteLength(JSON.stringify(encode(sample, fieldMap))) / sample.length;
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

/** Build the cells map for a specific grid size, used when --size is forced. */
function buildCells(features, bounds, size) {
  const cells = new Map();
  for (const f of features) {
    const key = cellKey(f.lng, f.lat, bounds, size);
    let bucket = cells.get(key);
    if (!bucket) cells.set(key, (bucket = []));
    bucket.push(f);
  }
  return cells;
}

/** Tree attributes produced by scripts/lib/arcgis.mjs `normalizeProperties`. */
const COUNCIL_TREE_FIELD_MAP = {
  assetId: (p) => p.tree?.asset_id ?? p.id ?? "",
  common: (p) => p.tree?.common_name ?? "",
  species: (p) => p.tree?.species ?? "",
  treeType: (p) => p.tree?.tree_type ?? "",
  treeStatus: (p) => p.tree?.status ?? "",
  age: (p) => p.tree?.age ?? "",
  dbh: (p) => p.tree?.dbh_cm ?? null,
  height: (p) => p.tree?.height_m ?? null,
};

/** Read a point geojson into { lng, lat, p } records. */
async function readPoints(file) {
  const raw = await readFile(file, "utf8");
  const geo = JSON.parse(raw);
  const features = [];
  for (const f of geo.features ?? []) {
    const c = f?.geometry?.coordinates;
    if (!c || f.geometry.type !== "Point") continue;
    features.push({ lng: c[0], lat: c[1], p: f.properties ?? {} });
  }
  return { rawLength: raw.length, features };
}

/**
 * Encode `features` into shards under `targetDir` (staged swap so a failure
 * never leaves the app reading a half-written manifest). Returns the written
 * manifest.
 */
async function writeShards({ features, bounds, targetDir, forcedSize, fieldMap }) {
  const { size, cells, bytesPerFeature } = forcedSize
    ? { size: forcedSize, cells: buildCells(features, bounds, forcedSize), bytesPerFeature: 0 }
    : chooseGrid(features, bounds, fieldMap);

  const staged = `${targetDir}.tmp`;
  await rm(staged, { recursive: true, force: true });
  await mkdir(staged, { recursive: true });

  const manifest = { version: 1, total: features.length, grid: { size, ...bounds }, cells: [] };

  if (cells) {
    for (const [key, bucket] of cells) {
      const json = JSON.stringify(encode(bucket, fieldMap));
      await writeFile(path.join(staged, `${key}.json`), json);
      manifest.cells.push({
        c: key,
        n: bucket.length,
        // byte length of the shard as served, used for cache accounting
        b: Buffer.byteLength(json),
      });
    }
  } else {
    const json = JSON.stringify(encode(features, fieldMap));
    await writeFile(path.join(staged, "0_0.json"), json);
    manifest.cells.push({ c: "0_0", n: features.length, b: Buffer.byteLength(json) });
  }

  manifest.cells.sort((a, b) => a.c.localeCompare(b.c));
  await writeFile(path.join(staged, "manifest.json"), JSON.stringify(manifest));

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(path.dirname(targetDir), { recursive: true });
  await rename(staged, targetDir);

  const largest = Math.max(...manifest.cells.map((c) => c.b));
  const totalBytes = manifest.cells.reduce((s, c) => s + c.b, 0);
  console.log(
    `[shard-trees] ${features.length} trees -> ${manifest.cells.length} shards ` +
      `(grid ${size}x${size}, ${bytesPerFeature.toFixed(0)} B/tree, largest ${(largest / 1024).toFixed(0)} KiB, ` +
      `total ${(totalBytes / 1024 / 1024).toFixed(2)} MiB)`,
  );
  if (largest > TARGET_BYTES) {
    console.warn(
      `[shard-trees] WARNING: largest shard is ${(largest / 1024 / 1024).toFixed(2)} MiB, ` +
        `over the ${(TARGET_BYTES / 1024 / 1024).toFixed(2)} MiB target; it may not persist to localStorage.`,
    );
  }
  return manifest;
}

/** Merge one council into the shard-set registry (deterministic ordering). */
async function updateRegistry(lgaId, displayName, manifest) {
  const registryFile = path.join(councilRoot, "index.json");
  let registry = { version: 1, councils: [] };
  try {
    registry = JSON.parse(await readFile(registryFile, "utf8"));
  } catch {
    // First council: start a fresh registry.
  }
  const entry = {
    lga_id: lgaId,
    display_name: displayName,
    total: manifest.total,
    shards: manifest.cells.length,
  };
  const next = registry.councils.filter((c) => c.lga_id !== lgaId);
  next.push(entry);
  next.sort((a, b) => a.lga_id.localeCompare(b.lga_id));
  const out = { version: 1, councils: next };
  await mkdir(councilRoot, { recursive: true });
  await writeFile(registryFile, JSON.stringify(out));
  console.log(`[shard-trees] registry updated: ${registryFile} (${next.length} council(s))`);
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const argSize = parseInt(argv[0], 10);
  const forcedSize = Number.isInteger(argSize) && argSize >= 1 ? argSize : undefined;

  const lgaId = flag("lga");
  if (lgaId) {
    // ── Council mode (FR3.1) ───────────────────────────────────────────────
    const displayName = flag("name") ?? lgaId;
    const source = flag("source")
      ? path.resolve(flag("source"))
      : path.join(repoRoot, "Data", "council-downloads", lgaId, "trees.geojson");
    let read;
    try {
      read = await readPoints(source);
    } catch (err) {
      console.error(`[shard-trees] council source not found: ${source}`);
      console.error("[shard-trees] nothing to shard; run the council fetcher first.");
      process.exitCode = 1;
      return;
    }
    if (!read.features.length) {
      console.error("[shard-trees] council source has no point features; aborting.");
      process.exitCode = 1;
      return;
    }
    const lngs = read.features.map((f) => f.lng);
    const lats = read.features.map((f) => f.lat);
    const bounds = {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    };
    const target = path.join(councilRoot, lgaId);
    const manifest = await writeShards({
      features: read.features,
      bounds,
      targetDir: target,
      forcedSize,
      fieldMap: COUNCIL_TREE_FIELD_MAP,
    });
    await updateRegistry(lgaId, displayName, manifest);
    return;
  }

  // ── City baseline mode ────────────────────────────────────────────────────
  let read;
  try {
    read = await readPoints(sourceFile);
  } catch {
    console.error(`[shard-trees] source not found: ${sourceFile}`);
    console.error("[shard-trees] nothing to shard; the app will fall back to the raw geojson.");
    return;
  }
  const { features, rawLength } = read;
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
  const manifest = await writeShards({ features, bounds, targetDir: outDir, forcedSize });
  await readdir(outDir);
  console.log(`[shard-trees] source was ${(rawLength / 1024 / 1024).toFixed(1)} MiB`);
}

// `encode` (and the r6 coordinate rounding it applies) come from
// scripts/lib/shard-encode.mjs so every tree sharder emits the same format;
// src/utils/treeShardFormat.ts is the browser-side twin.

main().catch((err) => {
  console.error("[shard-trees] failed:", err);
  process.exitCode = 1;
});