#!/usr/bin/env node
/**
 * scripts/fetch-council-arcgis.mjs
 *
 * Generic council ArcGIS FeatureServer → normalised GeoJSON fetcher (PRD
 * FR2.5). Pages past `maxRecordCount` with object-id paging, converts
 * esri geometry to GeoJSON (ring winding handled), maps attributes onto the
 * target schema with `null` for anything unmappable, and validates the
 * result before writing.
 *
 * Pure logic lives in `scripts/lib/arcgis.mjs`; this file is the CLI shell.
 * No network at import time — the fetch only runs when invoked directly.
 *
 * Usage:
 *   node scripts/fetch-council-arcgis.mjs \
 *     --service <FeatureServer URL> --layer <id> \
 *     --lga-id city-of-parramatta-council --lga-name "City of Parramatta Council" \
 *     --category parks --out Data/council-downloads/parramatta/parks.geojson
 *
 * Exit code 0 on a successful, validated write; 1 on any failure.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectAllFeatures,
  esriFeatureToGeoJSON,
  normalizeProperties,
  objectIdsUrl,
  queryUrl,
  toFeatureCollection,
} from "./lib/arcgis.mjs";
import { validateGeoJSON } from "./validate-geojson.mjs";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(artifactDir, "..", "..");

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  return {
    service: flag("service"),
    layer: flag("layer"),
    lgaId: flag("lga-id"),
    lgaName: flag("lga-name"),
    category: flag("category") ?? "parks",
    out: flag("out"),
    pageSize: Number(flag("page-size") ?? 100),
  };
}

/** Convert a raw ArcGIS GeoJSON export (esri-flavoured) into the target schema. */
export function normalizeExport(geojson, { lgaId, lgaName }) {
  const features = [];
  const dropped = [];
  (geojson.features ?? []).forEach((f, i) => {
    // ArcGIS `f=geojson` returns standard GeoJSON, so the geometry can be
    // taken as-is; only the properties need normalising. The esri-geometry
    // path is kept for `f=pjson` style payloads.
    const geometry = f.geometry?.rings
      ? esriFeatureToGeoJSON(f, {})?.geometry
      : f.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      dropped.push(i);
      return;
    }
    features.push({
      type: "Feature",
      properties: normalizeProperties({
        id: f.properties?.OBJECTID ?? f.properties?.objectid ?? i,
        raw: f.properties ?? {},
        lgaId,
        lgaName,
      }),
      geometry,
    });
  });
  return { collection: toFeatureCollection(features), dropped };
}

async function main() {
  const opts = parseArgs(process.argv);
  for (const key of ["service", "layer", "lgaId", "lgaName", "out"]) {
    if (!opts[key]) {
      console.error(`❌ missing required --${key.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`);
      process.exitCode = 1;
      return;
    }
  }

  const { service, layer, lgaId, lgaName, out } = opts;

  // 1. Object ids to page with.
  const idsRes = await fetch(objectIdsUrl(service, layer));
  if (!idsRes.ok) {
    console.error(`❌ objectIds query failed: HTTP ${idsRes.status}`);
    process.exitCode = 1;
    return;
  }
  const idsJson = await idsRes.json();
  const objectIds = idsJson.objectIds ?? [];
  if (!objectIds.length) {
    console.error(`❌ layer returned no object ids${idsJson.error ? `: ${idsJson.error.message}` : ""}`);
    process.exitCode = 1;
    return;
  }

  // 2. Page through the features as GeoJSON.
  const { features, skippedPages } = await collectAllFeatures({
    objectIds,
    pageSize: opts.pageSize,
    queryFn: async (chunk) => {
      const res = await fetch(queryUrl(service, layer, chunk));
      if (!res.ok) throw new Error(`HTTP ${res.status} for objectIds ${chunk[0]}…`);
      const json = await res.json();
      return (json.features ?? []).map(f => ({
        properties: f.properties ?? {},
        geometry: f.geometry,
      }));
    },
  });

  // 3. Normalise onto the target schema and validate.
  const { collection, dropped } = normalizeExport(toFeatureCollection(features), {
    lgaId,
    lgaName,
  });
  const check = validateGeoJSON(collection);
  if (!check.ok) {
    console.error("❌ normalised output failed validation:");
    for (const e of check.errors) console.error(`   - ${e}`);
    process.exitCode = 1;
    return;
  }

  const dest = path.isAbsolute(out) ? out : path.join(repoRoot, out);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(collection));
  console.log(
    `✅ ${lgaName} ${opts.category}: ${collection.features.length} features → ${path.relative(repoRoot, dest)}` +
      (dropped.length ? ` (${dropped.length} dropped, unparsable geometry)` : "") +
      (skippedPages.length ? ` (${skippedPages.length} skipped page(s))` : ""),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
