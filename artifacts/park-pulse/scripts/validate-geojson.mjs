#!/usr/bin/env node
/**
 * scripts/validate-geojson.mjs
 *
 * Structural validation for the council datasets (PRD FR2.6). A file passes
 * when it is a non-empty FeatureCollection whose coordinates are plausible
 * EPSG:4326 degrees (lng ∈ [-180,180], lat ∈ [-90,90]) — the app only ever
 * consumes WGS84, so anything else must fail loudly rather than render at
 * (0, 0).
 *
 * The exported `validateGeoJSON` is pure so both the fetch scripts and the
 * vitest fixtures can call it without spawning a process.
 *
 * Usage:
 *   node scripts/validate-geojson.mjs <file.geojson> [more files…]
 * Exit code 0 when every file passes, 1 otherwise.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_BYTES = 80 * 1024;

/**
 * @returns {{ ok: boolean, errors: string[], features: number, bytes: number }}
 */
export function validateGeoJSON(input, { maxBytes = Infinity } = {}) {
  const errors = [];
  const bytes = typeof input === "string" ? Buffer.byteLength(input, "utf8") : 0;

  if (bytes > maxBytes) {
    errors.push(`${bytes} bytes exceeds budget of ${maxBytes}`);
  }

  let data;
  try {
    data = typeof input === "string" ? JSON.parse(input) : input;
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${err.message}`], features: 0, bytes };
  }

  if (!data || data.type !== "FeatureCollection") {
    errors.push(`expected type "FeatureCollection", got ${JSON.stringify(data?.type)}`);
    return { ok: false, errors, features: 0, bytes };
  }
  if (!Array.isArray(data.features) || data.features.length === 0) {
    errors.push("FeatureCollection has no features");
    return { ok: false, errors, features: 0, bytes };
  }

  let badGeometry = 0;
  let badCoords = 0;
  const walk = (coords, depth) => {
    if (depth === 0) {
      const [lng, lat] = coords;
      if (
        !Array.isArray(coords) ||
        typeof lng !== "number" ||
        typeof lat !== "number" ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        Math.abs(lng) > 180 ||
        Math.abs(lat) > 90
      ) {
        badCoords++;
      }
      return;
    }
    if (!Array.isArray(coords)) {
      badCoords++;
      return;
    }
    for (const c of coords) walk(c, depth - 1);
  };
  const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

  for (const feature of data.features) {
    const g = feature?.geometry;
    if (!g || DEPTH[g.type] === undefined) {
      badGeometry++;
      continue;
    }
    if (g.type === "GeometryCollection") {
      badGeometry++;
      continue;
    }
    walk(g.coordinates, DEPTH[g.type]);
  }

  if (badGeometry) errors.push(`${badGeometry} feature(s) with missing/unknown geometry`);
  if (badCoords) errors.push(`${badCoords} coordinate position(s) outside EPSG:4326 range`);
  if (data.features.some(f => f?.type !== "Feature")) {
    errors.push("array contains non-Feature entries");
  }

  return { ok: errors.length === 0, errors, features: data.features.length, bytes };
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node scripts/validate-geojson.mjs <file.geojson> [...]");
    process.exitCode = 1;
    return;
  }
  let failed = false;
  for (const file of files) {
    const full = path.resolve(file);
    let result;
    try {
      result = validateGeoJSON(await readFile(full, "utf8"));
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
      failed = true;
      continue;
    }
    if (result.ok) {
      console.log(`✓ ${file}: ${result.features} features, ${(result.bytes / 1024).toFixed(1)} KB`);
    } else {
      failed = true;
      console.error(`❌ ${file}:`);
      for (const e of result.errors) console.error(`   - ${e}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
