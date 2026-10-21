#!/usr/bin/env node
/**
 * scripts/canopy-extract.mjs — PRD Phase 5 "Canopy Cover Processing" (FR5.1–FR5.5).
 *
 * Turns the NSW urban-canopy GeoTIFFs (`Data/canopy-lgas-*-gda2020.zip`, one
 * ~0.5 m binary raster per LGA) into, per council:
 *
 *   public/data/canopies/{lga_id}.geojson  canopy polygons (≤ 30 m cells) each
 *                                          carrying `canopy_percent`   (FR5.2)
 *   public/data/canopies/index.json        scalar table consumed by
 *                                          build-councils.mjs          (FR5.2)
 *
 * Then rebuilds `councils-index.json` so `canopy_percent` reaches the UI
 * through a rebuild — never a hand-edit (FR5.2).
 *
 * Toolchain note (TBD-6): `gdal_translate` is not on PATH in this sandbox, so
 * the FR5.1 "documented fallback if GDAL absent" is the shipped path: GeoTIFF.js
 * reads the tiles and proj4 reprojects, both pure JS and both unit-tested in
 * `src/utils/canopy.test.ts`. The CLI is backend-agnostic, so swapping in GDAL
 * later changes no interface.
 *
 * Usage:
 *   node scripts/canopy-extract.mjs --fixture [--out dir]   # offline CI path
 *   node scripts/canopy-extract.mjs --all                   # every council
 *   node scripts/canopy-extract.mjs --lga blacktown-city-council [--lga …]
 *   options: --zips <dir>   canopy zip location   (default <repo>/Data)
 *            --target <m>   coarsest overview ≤ m metres (default 30)
 *            --no-rebuild   skip the councils-index rebuild afterwards
 *
 * Exit code 0 when every requested council produced a percentage; 1 on any
 * hard failure (missing boundary, unreadable raster, unsupported CRS).
 * A council whose canopy tile simply does not exist (e.g. the unincorporated
 * area) is reported as `unavailable` and is not an error.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import {
  CANOPY_TARGET_METERS,
  canopyPercent,
  computeCanopy,
  mergeRunsIntoRectangles,
  overviewTransform,
  pickOverviewLevel,
  rectanglesToFeatures,
  ringsFromGeometry,
} from "./lib/canopy.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(artifactDir, "..", "..");

const BOUNDARY_DIR = path.join(artifactDir, "public", "data", "boundaries", "councils");
const CANOPY_OUT_DIR = path.join(artifactDir, "public", "data", "canopies");
const COUNCILS_INDEX = path.join(artifactDir, "public", "data", "boundaries", "councils-index.json");
const FIXTURE_TIF = path.join(artifactDir, "src", "test", "fixtures", "canopy-fixture.tif");
const FIXTURE_COUNCIL = path.join(artifactDir, "src", "test", "fixtures", "canopy-fixture-council.geojson");

/** GeoTIFF.js must hold the whole tile in memory (Hawkesbury is 233 MB). */
const UNZIP_MAX_BYTES = 640 * 1024 * 1024;

/**
 * Per-council byte budget for `canopies/{lga_id}.geojson` (FR5.2). The scalar
 * is always measured at the ≤ 30 m analysis level; only the *layer* coarsens
 * to fit this budget, in the same spirit as the 80 KB boundary budget in
 * build-councils.mjs. Set so every real council fits at its coarsest overview
 * (the two bushland LGAs need 161 KiB at 493 m cells); 35 × 192 KiB ≈ 6.6 MB
 * worst case, ~4 MB as measured. If a future raster still overflows at the
 * coarsest level, the documented fallback ships it rather than lose the layer.
 */
export const LAYER_BUDGET_BYTES = 192 * 1024;
/** Metres per degree — only used to compare a geographic raster to a metre budget. */
const METRES_PER_DEGREE = 111320;

/**
 * Councils whose LGA directory inside the zip is not derivable from their
 * display name (FR2.5-style normalisation table; every entry is verified
 * against the actual zip contents by the unit tests).
 */
const TIFF_DIR_OVERRIDES = {
  "council-of-the-city-of-sydney": "SYDNEY",
  "city-of-parramatta-council": "PARRAMATTA",
  "city-of-canada-bay-council": "CANADA BAY",
  "unincorporated": null, // no per-LGA canopy tile exists → documented gap
};

/** Words that differ between `display_name` and the zip's LGA directory. */
const NOISE_WORDS = new Set(["THE", "CITY", "OF", "SHIRE", "COUNCIL", "MUNICIPALITY", "MUNICIPAL", "AREA"]);

/** "Blacktown City Council" / "THE HILLS SHIRE COUNCIL" → "BLACKTOWN" / "HILLS". */
export function normalizeCouncilKey(name) {
  return String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(word => word && !NOISE_WORDS.has(word))
    .join(" ");
}

/**
 * proj4 does not ship GDA2020, so register the CRS ourselves (TBD-6 fallback).
 * Returns { epsg, def, unitsPerMetre }. Throws for anything we cannot stand
 * behind rather than silently mis-projecting a whole LGA.
 */
export function registerProjection(epsg) {
  if (!Number.isFinite(epsg)) throw new Error("raster has no EPSG code in its GeoTIFF keys");
  if (epsg === 4326) {
    return { epsg, def: "+proj=longlat +datum=WGS84 +no_defs", unitsPerMetre: METRES_PER_DEGREE };
  }
  if (epsg === 7844 || epsg === 4283) {
    // GDA2020 / GDA94 geographic — ellipsoid-aligned with WGS84 to well under
    // a metre, which is far below one 30 m cell.
    const def = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs";
    proj4.defs(`EPSG:${epsg}`, def);
    return { epsg, def, unitsPerMetre: METRES_PER_DEGREE };
  }
  // GDA2020 MGA zones 49–56 are EPSG 7849–7856 (code = 7800 + zone); the
  // observed Sydney tiles are 7856 = MGA zone 56. GDA94 MGA is 28349–28356.
  const mgaZone = epsg >= 7849 && epsg <= 7856 ? epsg - 7800 : epsg >= 28349 && epsg <= 28356 ? epsg - 28300 : null;
  if (mgaZone === null) throw new Error(`unsupported raster CRS EPSG:${epsg}`);
  const def = `+proj=utm +zone=${mgaZone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  proj4.defs(`EPSG:${epsg}`, def);
  return { epsg, def, unitsPerMetre: 1 };
}

/** List every `*.tif` entry across the canopy zips: normKey → { zip, entry }. */
function buildTifLookup(zipsDir) {
  const files = readdirSync(zipsDir)
    .filter(name => name.startsWith("canopy-lgas-") && name.endsWith(".zip"))
    .sort();
  const lookup = new Map();
  const notes = [];
  for (const name of files) {
    const zipPath = path.join(zipsDir, name);
    const listing = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (listing.status !== 0) {
      notes.push(`could not list ${name}: ${(listing.stderr || "").toString().trim() || `exit ${listing.status}`}`);
      continue;
    }
    for (const entry of listing.stdout.split("\n")) {
      if (!/\.tif$/i.test(entry)) continue;
      const dir = entry.split("/")[0].toUpperCase();
      const key = normalizeCouncilKey(dir);
      if (key && !lookup.has(key)) lookup.set(key, { zip: zipPath, entry, dir });
    }
  }
  if (lookup.size === 0) throw new Error(`no canopy .tif entries found in ${zipsDir}`);
  return { lookup, notes, zipCount: files.length };
}

/** Read a tif straight out of a zip into a Buffer (`unzip -p`, no temp file). */
function readZipMember(zipPath, entry) {
  const result = spawnSync("unzip", ["-p", zipPath, entry], { maxBuffer: UNZIP_MAX_BYTES, encoding: null });
  if (result.status !== 0 || !result.stdout?.length) {
    throw new Error(`unzip -p failed for ${entry}: ${(result.stderr || "").toString().trim() || `exit ${result.status}`}`);
  }
  return result.stdout;
}

/**
 * Open a canopy tile: read the pyramid geometry and expose level readers.
 * Level 0 is full resolution (~0.5 m — 1.7 billion pixels for Blacktown), so
 * callers must only ever ask for an overview picked by `pickOverviewLevel`.
 */
async function openRaster(arrayBuffer, targetMeters) {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const imageCount = await tiff.getImageCount();
  const base = await tiff.getImage(0);
  const geoKeys = base.getGeoKeys?.() ?? {};
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey;
  const { def, unitsPerMetre } = registerProjection(epsg);

  const levels = [];
  for (let i = 0; i < imageCount; i++) {
    const img = await tiff.getImage(i);
    levels.push([img.getWidth(), img.getHeight()]);
  }
  const [originX, originY] = base.getOrigin();
  const [resX, resY] = base.getResolution();
  const geo = {
    originX,
    originY,
    resX: Math.abs(resX),
    resY: -Math.abs(resY),
    baseWidth: levels[0][0],
  };

  const pixelMetresAt = level => ((Math.abs(resX) * geo.baseWidth) / levels[level][0]) * unitsPerMetre;
  const readLevel = async level => {
    const [width, height] = levels[level];
    const rasters = await (await tiff.getImage(level)).readRasters();
    return { data: rasters[0], width, height, transform: overviewTransform({ ...geo, levelWidth: width }) };
  };

  return {
    levels,
    epsg,
    def,
    readLevel,
    pixelMetresAt,
    coarsestLevel: imageCount - 1,
    analysisLevel: pickOverviewLevel(levels, Math.abs(resX), targetMeters, unitsPerMetre),
  };
}

/**
 * Core routine: boundary GeoJSON + raster bytes → scalar, features, stats.
 * Exported so `src/utils/canopy.test.ts` can assert exact numbers in-process.
 */
export async function extractCanopy({
  boundaryJson,
  rasterBuffer,
  lgaId,
  targetMeters = CANOPY_TARGET_METERS,
  layerBudget = LAYER_BUDGET_BYTES,
  properties = {},
}) {
  const boundary = typeof boundaryJson === "string" ? JSON.parse(boundaryJson) : boundaryJson;
  const geometry = boundary.type === "Feature" ? boundary.geometry : boundary;
  const raster = await openRaster(
    rasterBuffer.buffer.slice(rasterBuffer.byteOffset, rasterBuffer.byteOffset + rasterBuffer.byteLength),
    targetMeters,
  );

  const toRaster = proj4("EPSG:4326", raster.def);
  const toWgs84 = proj4(raster.def, "EPSG:4326");
  const rings = ringsFromGeometry(geometry, (lng, lat) => toRaster.forward([lng, lat]));

  // 1. Measure once at the analysis level (≤ targetMeters). The scalar is
  //    computed here and only here, so it never depends on the layer
  //    resolution chosen next (FR5.2 rounding rule).
  const analysis = await raster.readLevel(raster.analysisLevel);
  const stats = computeCanopy({
    data: analysis.data,
    width: analysis.width,
    height: analysis.height,
    transform: analysis.transform,
    rings,
  });
  const percent = canopyPercent(stats.canopyWeight, stats.totalPixels);

  // 2. Emit the layer at the finest overview whose serialised size still fits
  //    `layerBudget` — the same "raise the tolerance until the file fits"
  //    ladder that build-councils.mjs uses for the 80 KB boundaries. A canopy
  //    mask has one cluster per tree stand, so pinning it to the analysis
  //    resolution would ship ~15 MB for Blacktown alone; the scalar above is
  //    unaffected either way. Never goes finer than the analysis level.
  let best = null;
  if (percent !== null) {
    for (let level = raster.coarsestLevel; level >= raster.analysisLevel; level--) {
      const source = level === raster.analysisLevel ? analysis : await raster.readLevel(level);
      const runs =
        level === raster.analysisLevel
          ? stats.runs
          : computeCanopy({ data: source.data, width: source.width, height: source.height, transform: source.transform, rings }).runs;
      const features = rectanglesToFeatures(mergeRunsIntoRectangles(runs), source.transform, (x, y) => toWgs84.forward([x, y]), {
        lga_id: lgaId,
        canopy_percent: percent,
        ...properties,
      });
      const collection = { type: "FeatureCollection", features };
      const candidate = {
        collection,
        level,
        bytes: Buffer.byteLength(stableStringify(collection)),
        featureCount: features.length,
        pixelMetres: Math.round(raster.pixelMetresAt(level) * 100) / 100,
      };
      if (candidate.bytes > layerBudget) {
        if (best === null) best = candidate; // even the coarsest overflows: ship it, never lose the layer
        break;
      }
      best = candidate;
    }
  }

  return {
    lgaId,
    percent,
    totalPixels: stats.totalPixels,
    canopyPixels: stats.canopyPixels,
    level: raster.analysisLevel,
    epsg: raster.epsg,
    pixelMetres: Math.round(raster.pixelMetresAt(raster.analysisLevel) * 100) / 100,
    layer: best
      ? { level: best.level, bytes: best.bytes, features: best.featureCount, pixelMetres: best.pixelMetres }
      : { level: raster.analysisLevel, bytes: 0, features: 0, pixelMetres: Math.round(raster.pixelMetresAt(raster.analysisLevel) * 100) / 100 },
    featureCollection: best ? best.collection : { type: "FeatureCollection", features: [] },
  };
}

/** Deterministic serialisation (FR5.5): same inputs → identical bytes. */
function stableStringify(value) {
  return JSON.stringify(value);
}

async function writeCanopyOutputs(outDir, lgaId, result) {
  await mkdir(outDir, { recursive: true });
  const geoPath = path.join(outDir, `${lgaId}.geojson`);
  await writeFile(geoPath, stableStringify(result.featureCollection));
  return geoPath;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** Rebuild (or extend) `canopies/index.json`, sorted by lga_id (FR5.5). */
async function upsertCanopyIndex(outDir, entry) {
  const indexPath = path.join(outDir, "index.json");
  let index = { version: 1, councils: [] };
  try {
    index = await readJson(indexPath);
    if (!Array.isArray(index.councils)) index = { version: 1, councils: [] };
  } catch {
    // first run — start fresh
  }
  const rest = index.councils.filter(c => c.lga_id !== entry.lga_id);
  const councils = [...rest, entry].sort((a, b) => a.lga_id.localeCompare(b.lga_id, "en"));
  const next = { version: 1, councils };
  await writeFile(indexPath, stableStringify(next));
  return councils.length;
}

/** FR5.2: rebuild councils-index.json through build-councils.mjs (never hand-edit). */
function rebuildCouncilsIndex() {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, "build-councils.mjs")], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`build-councils.mjs exited ${result.status}`);
}

/** Offline CI path (FR5.3): fixture TIFF + fixture council → exact numbers. */
export async function extractFromFixture({ outDir, targetMeters = CANOPY_TARGET_METERS } = {}) {
  const [boundary, raster] = await Promise.all([readFile(FIXTURE_COUNCIL, "utf8"), readFile(FIXTURE_TIF)]);
  const result = await extractCanopy({
    boundaryJson: boundary,
    rasterBuffer: raster,
    lgaId: "fixture-lga",
    targetMeters,
    properties: { fixture: true },
  });
  const files = [];
  if (outDir) {
    files.push(await writeCanopyOutputs(outDir, "fixture-lga", result));
    const indexPath = path.join(outDir, "index.json");
    files.push(indexPath);
    await upsertCanopyIndex(outDir, {
      lga_id: "fixture-lga",
      display_name: "Fixture LGA",
      canopy_percent: result.percent,
      canopy_pixels: result.canopyPixels,
      inside_pixels: result.totalPixels,
      target_meters: targetMeters,
      source: "src/test/fixtures/canopy-fixture.tif",
    });
  }
  return { ...result, files };
}

/** One real council: locate tile → measure → write outputs → record index. */
async function extractOne(council, opts) {
  const boundaryFile = path.join(BOUNDARY_DIR, `${council.lga_id}.geojson`);
  const boundaryJson = await readFile(boundaryFile, "utf8");

  const override = Object.prototype.hasOwnProperty.call(TIFF_DIR_OVERRIDES, council.lga_id)
    ? TIFF_DIR_OVERRIDES[council.lga_id]
    : undefined;
  if (override === null) return { status: "unavailable", reason: "no per-LGA canopy tile exists for this area" };

  const key = override ?? normalizeCouncilKey(council.display_name);
  const hit = opts.lookup.get(key);
  if (!hit) return { status: "unavailable", reason: `no canopy tile matched "${key}" in ${opts.zipCount} zips` };

  const started = Date.now();
  const buffer = readZipMember(hit.zip, hit.entry);
  const result = await extractCanopy({
    boundaryJson,
    rasterBuffer: buffer,
    lgaId: council.lga_id,
    targetMeters: opts.targetMeters,
  });
  if (result.percent === null) return { status: "unavailable", reason: "raster does not overlap the boundary" };

  const geoPath = await writeCanopyOutputs(opts.out, council.lga_id, result);
  await upsertCanopyIndex(opts.out, {
    lga_id: council.lga_id,
    display_name: council.display_name,
    canopy_percent: result.percent,
    canopy_pixels: result.canopyPixels,
    inside_pixels: result.totalPixels,
    target_meters: opts.targetMeters,
    layer_pixel_m: result.layer.pixelMetres,
    source: `${path.basename(hit.zip)}!${hit.entry}`,
  });
  const { size } = await stat(geoPath);
  return {
    status: "ok",
    display_name: council.display_name,
    percent: result.percent,
    canopyPixels: result.canopyPixels,
    totalPixels: result.totalPixels,
    level: result.level,
    pixelMetres: result.pixelMetres,
    layerLevel: result.layer.level,
    layerPixelMetres: result.layer.pixelMetres,
    bytes: size,
    ms: Date.now() - started,
  };
}

function parseArgs(argv) {
  const opts = {
    fixture: false,
    all: false,
    lgas: [],
    zips: path.join(repoRoot, "Data"),
    out: null,
    targetMeters: CANOPY_TARGET_METERS,
    rebuild: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture") opts.fixture = true;
    else if (arg === "--all") opts.all = true;
    else if (arg === "--lga") opts.lgas.push(argv[++i]);
    else if (arg === "--zips") opts.zips = path.resolve(argv[++i]);
    else if (arg === "--out") opts.out = path.resolve(argv[++i]);
    else if (arg === "--target") opts.targetMeters = Number(argv[++i]);
    else if (arg === "--no-rebuild") opts.rebuild = false;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.fixture && !opts.all && opts.lgas.length === 0) opts.help = true;
  if (!Number.isFinite(opts.targetMeters) || opts.targetMeters <= 0) throw new Error("--target must be a positive number");
  // Fixture output never lands in the shipped data directory (FR5.3).
  if (opts.out === null) {
    opts.out = opts.fixture ? path.join(os.tmpdir(), "pp-canopy-fixture") : CANOPY_OUT_DIR;
  }
  return opts;
}

const USAGE = `canopy-extract — canopy_percent per council (PRD Phase 5)

  node scripts/canopy-extract.mjs --fixture [--out dir] [--target m]
  node scripts/canopy-extract.mjs --all [--zips dir] [--target m] [--no-rebuild]
  node scripts/canopy-extract.mjs --lga <lga_id> [--lga <lga_id> …]
`;

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (opts.fixture) {
    const result = await extractFromFixture({ outDir: opts.out, targetMeters: opts.targetMeters });
    console.log(
      `[canopy] fixture → ${result.percent}% canopy ` +
        `(${result.canopyPixels}/${result.totalPixels} cells @ ${result.pixelMetres} m, overview level ${result.level}, EPSG:${result.epsg})`,
    );
    for (const file of result.files) console.log(`         wrote ${path.relative(repoRoot, file)}`);
    return 0;
  }

  const { lookup, notes, zipCount } = buildTifLookup(opts.zips);
  for (const note of notes) console.warn(`[canopy] ⚠ ${note}`);

  const index = await readJson(COUNCILS_INDEX);
  const wanted = opts.all ? index.councils : opts.lgas.map(id => index.councils.find(c => c.lga_id === id));
  const unknown = opts.lgas.filter((id, i) => !wanted[i] || wanted[i] === undefined);
  if (unknown.length) throw new Error(`unknown lga_id(s): ${unknown.join(", ")}`);

  const optsAll = { ...opts, lookup, zipCount };
  const ok = [];
  const skipped = [];
  const failed = [];
  for (const council of wanted) {
    try {
      const outcome = await extractOne(council, optsAll);
      if (outcome.status === "ok") {
        ok.push(outcome);
        console.log(
          `[canopy] ${outcome.display_name}: ${outcome.percent}% ` +
            `(${outcome.canopyPixels}/${outcome.totalPixels} cells @ ${outcome.pixelMetres} m, analysis level ${outcome.level}) ` +
            `→ layer ${outcome.layerPixelMetres} m/level ${outcome.layerLevel} = ${(outcome.bytes / 1024).toFixed(0)} KiB in ${outcome.ms} ms`,
        );
      } else {
        skipped.push({ lga_id: council.lga_id, display_name: council.display_name, reason: outcome.reason });
        console.warn(`[canopy] — ${council.display_name}: ${outcome.reason}`);
      }
    } catch (err) {
      failed.push({ lga_id: council.lga_id, display_name: council.display_name, error: err.message });
      console.error(`[canopy] ✗ ${council.display_name}: ${err.message}`);
    }
  }

  if (ok.length > 0) {
    console.log(`[canopy] index → ${path.relative(repoRoot, path.join(opts.out, "index.json"))} (${ok.length} measured)`);
    if (opts.rebuild) rebuildCouncilsIndex();
  }
  console.log(`[canopy] done: ${ok.length} measured, ${skipped.length} unavailable, ${failed.length} failed`);
  if (skipped.length) {
    console.log(`[canopy] unavailable: ${skipped.map(s => `${s.display_name} (${s.reason})`).join("; ")}`);
  }
  return failed.length > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    err => {
      console.error(`[canopy] failed: ${err.message}`);
      process.exitCode = 1;
    },
  );
}
