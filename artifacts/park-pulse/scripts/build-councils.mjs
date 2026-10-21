/**
 * Builds the frontend council dataset from `Data/councils.json`.
 *
 * The extracted file is ~20 MB of full-resolution LGA geometry, far too heavy
 * to ship to the browser as one payload. This script turns it into:
 *
 *   public/data/boundaries/councils-index.json      metadata (~15 KB)
 *   public/data/boundaries/councils/{lga_id}.geojson one simplified boundary
 *                                                   per council, lazy-loaded
 *
 * Each boundary is simplified with Douglas–Peucker, rounded to 5 decimal
 * places (~1 m) and stripped of sub-1,000 m² islands, then the tolerance is
 * raised until the file fits under MAX_GEOM_BYTES. The index carries the
 * things the UI needs without touching geometry at all: display name,
 * priority rank, area (km²), bbox and centroid.
 *
 * Usage:
 *   node ./scripts/build-councils.mjs
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeCanopyIntoIndex } from "./lib/canopy.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(artifactDir, "..", "..");
const sourceFile = path.join(repoRoot, "Data", "councils.json");
const outDir = path.join(artifactDir, "public", "data", "boundaries");
const geoDir = path.join(outDir, "councils");

/** Per-council geometry budget. Keeps every file far under the 2 MiB
 *  localStorage cache cap in src/utils/dataCache.ts. */
const MAX_GEOM_BYTES = 80 * 1024;

/** Coordinates are rounded to this many decimals — 5 ≈ 1.1 m. */
const PRECISION = 1e5;

/** Polygons smaller than this (km²) are dropped as islands/noise. */
const MIN_POLYGON_KM2 = 0.001;

/** Tolerances in degrees (~11 m at this latitude for 0.0001), tried in order
 *  until the serialised file fits the budget. */
const TOLERANCES = [0.0001, 0.0002, 0.0004, 0.0008, 0.0016];

/**
 * Councils the PRD names for Phase 1. The rank fixes their order in the
 * selector; councils without a rank sort alphabetically after them.
 * Rank 0 is the City of Sydney baseline already shipped by the app.
 */
const PRIORITY_RANKS = {
  "council-of-the-city-of-sydney": 0,
  "city-of-parramatta-council": 1,
  "liverpool-city-council": 2,
  "blacktown-city-council": 3,
  "northern-beaches-council": 4,
  "campbelltown-city-council": 5,
  "camden-council": 6,
  "randwick-city-council": 7,
};

/** Raw NSW_LGA__2 names that title-casing alone renders badly. */
const DISPLAY_OVERRIDES = {
  "council-of-the-city-of-sydney": "City of Sydney",
  "the-council-of-the-shire-of-hornsby": "Hornsby Shire Council",
  "the-council-of-the-municipality-of-hunters-hill": "Hunters Hill Council",
  "the-hills-shire-council": "The Hills Shire Council",
  "city-of-canada-bay-council": "City of Canada Bay",
  "ku-ring-gai-council": "Ku-ring-gai Council",
  "unincorporated": "Unincorporated Area",
};

const SMALL_WORDS = new Set(["of", "the", "and", "in", "on", "at"]);

/** "BLACKTOWN CITY COUNCIL" → "Blacktown City Council". */
function titleCase(raw) {
  const words = raw.toLowerCase().split(/(\s+|-)/);
  let start = true;
  return words
    .map((token) => {
      if (/^\s+$/.test(token) || token === "-") return token;
      const lower = token.toLowerCase();
      const keepLower = !start && SMALL_WORDS.has(lower);
      start = false;
      return keepLower ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .trim();
}

// ── Geometry helpers ────────────────────────────────────────────────────────

/**
 * Signed area of a ring in km² (equirectangular approximation).
 * Coordinates are degrees; scaling each axis by its km-per-degree factor
 * makes the shoelace sum come out directly in km² — no m² conversion.
 */
function ringAreaKm2(ring) {
  if (!ring || ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.574;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(sum) / 2;
}

function round(value) {
  return Math.round(value * PRECISION) / PRECISION;
}

function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

/** Perpendicular distance from p to the segment a–b, in degrees. */
function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + clamped * dx), p[1] - (a[1] + clamped * dy));
}

/** Douglas–Peucker line simplification (iterative, so deep rings cannot
 *  blow the JS stack the way the recursive version can). */
function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function polygonRingsOf(type, coordinates) {
  return type === "Polygon" ? [coordinates] : coordinates;
}

/** Simplify a whole geometry, dropping polygons that fall below the island
 *  threshold but always keeping the largest one. */
function simplifyGeometry(geometry, tolerance) {
  const polys = polygonRingsOf(geometry.type, geometry.coordinates);
  const simplified = [];

  const areas = polys.map((rings) => ringAreaKm2(rings[0]));
  const largest = areas.indexOf(Math.max(...areas));

  polys.forEach((rings, i) => {
    if (i !== largest && areas[i] < MIN_POLYGON_KM2) return;
    const outer = closeRing(simplifyRing(rings[0], tolerance));
    if (outer.length < 4) return;
    const holes = rings
      .slice(1)
      .map((r) => closeRing(simplifyRing(r, tolerance)))
      .filter((r) => r.length >= 4);
    simplified.push([outer.map(([lng, lat]) => [round(lng), round(lat)]),
      ...holes.map((r) => r.map(([lng, lat]) => [round(lng), round(lat)]))]);
  });

  if (!simplified.length) return null;
  return {
    type: simplified.length === 1 ? "Polygon" : "MultiPolygon",
    coordinates: simplified.length === 1 ? simplified[0] : simplified,
  };
}

function bboxOf(geometry) {
  const polys = polygonRingsOf(geometry.type, geometry.coordinates);
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const rings of polys) {
    for (const [lng, lat] of rings[0]) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
  }
  return [round(south), round(west), round(north), round(east)];
}

/** Area-weighted centroid of the largest outer ring, in [lat, lng]. */
function centroidOf(geometry) {
  const polys = polygonRingsOf(geometry.type, geometry.coordinates);
  let best = polys[0][0];
  let bestArea = 0;
  for (const rings of polys) {
    const area = ringAreaKm2(rings[0]);
    if (area > bestArea) {
      bestArea = area;
      best = rings[0];
    }
  }
  let sumLat = 0, sumLng = 0, weight = 0;
  for (let i = 0; i < best.length - 1; i++) {
    const [x1, y1] = best[i];
    const [x2, y2] = best[i + 1];
    const cross = x1 * y2 - x2 * y1;
    sumLng += (x1 + x2) * cross;
    sumLat += (y1 + y2) * cross;
    weight += cross;
  }
  if (Math.abs(weight) < 1e-12) {
    return [round(best[0][1]), round(best[0][0])];
  }
  return [round(sumLat / (3 * weight)), round(sumLng / (3 * weight))];
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // F-01: the 20 MB full-resolution extract is a local data input, not a
  // committed one. A checkout without it must build with the council UI in
  // its explicit unavailable state instead of failing the whole app build.
  if (!existsSync(sourceFile)) {
    console.warn(`[build-councils] source missing: ${path.relative(repoRoot, sourceFile)}`);
    console.warn("[build-councils] council scoping and boundaries will be unavailable in this build.");
    return;
  }
  const raw = await readFile(sourceFile, "utf8");
  const source = JSON.parse(raw);
  const councils = Array.isArray(source.councils) ? source.councils : [];
  if (!councils.length) throw new Error(`No councils found in ${sourceFile}`);

  await rm(geoDir, { recursive: true, force: true });
  await mkdir(geoDir, { recursive: true });

  const index = [];
  let totalArea = 0;
  let totalBytes = 0;

  for (const council of councils) {
    const lgaId = council.lga_id;
    const displayName = DISPLAY_OVERRIDES[lgaId] ?? titleCase(council.name);
    const geometry = council.geometry;
    if (!geometry) {
      console.warn(`⚠ no geometry for ${lgaId}, skipped`);
      continue;
    }

    // Smallest tolerance that fits the byte budget.
    let chosen = null;
    let encoded = null;
    for (const tolerance of TOLERANCES) {
      const simplified = simplifyGeometry(geometry, tolerance);
      if (!simplified) continue;
      const feature = {
        type: "Feature",
        properties: { id: council.id, lga_id: lgaId, name: displayName },
        geometry: simplified,
      };
      const json = JSON.stringify(feature);
      chosen = feature;
      encoded = json;
      if (json.length <= MAX_GEOM_BYTES) break;
    }
    if (!chosen) {
      console.warn(`⚠ could not simplify ${lgaId}, skipped`);
      continue;
    }

    const file = `${lgaId}.geojson`;
    await writeFile(path.join(geoDir, file), encoded);
    totalBytes += encoded.length;

    const areaKm2 = polygonRingsOf(chosen.geometry.type, chosen.geometry.coordinates)
      .reduce((sum, rings) => sum + ringAreaKm2(rings[0]), 0);
    totalArea += areaKm2;

    index.push({
      id: council.id,
      lga_id: lgaId,
      name: council.name,
      display_name: displayName,
      priority: lgaId in PRIORITY_RANKS,
      priority_rank: PRIORITY_RANKS[lgaId] ?? null,
      area_km2: Math.round(areaKm2 * 100) / 100,
      bbox: bboxOf(chosen.geometry),
      centroid: centroidOf(chosen.geometry),
      geometry_file: `boundaries/councils/${file}`,
    });
  }

  index.sort((a, b) => {
    const ar = a.priority_rank;
    const br = b.priority_rank;
    if (ar !== null && br !== null) return ar - br;
    if (ar !== null) return -1;
    if (br !== null) return 1;
    return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" });
  });

  const out = {
    generated_from: "Data/councils.json",
    total_councils: index.length,
    total_area_km2: Math.round(totalArea * 100) / 100,
    councils: index,
  };

  // PRD Phase 5 (FR5.2): fold the scalar canopy values written by
  // `canopy-extract.mjs` into the index — rebuilt here, never hand-edited.
  // Councils without a measured value carry an explicit `null` so the UI
  // renders "—" instead of a fabricated 0 (FR5.4).
  let canopyIndex = null;
  try {
    canopyIndex = JSON.parse(await readFile(path.join(artifactDir, "public", "data", "canopies", "index.json"), "utf8"));
  } catch {
    // no canopy run yet — every council stays null (TBD-6/TBD-11 gate)
  }
  mergeCanopyIntoIndex(out, canopyIndex);
  const canopyMeasured = out.councils.filter(c => c.canopy_percent !== null).length;

  const indexJson = JSON.stringify(out);
  await writeFile(path.join(outDir, "councils-index.json"), indexJson);

  console.log(`✅ ${index.length} councils → ${path.relative(repoRoot, outDir)}`);
  console.log(`   index: ${(indexJson.length / 1024).toFixed(1)} KB, geometry: ${(totalBytes / 1024).toFixed(0)} KB total, area: ${out.total_area_km2} km²`);
  console.log(`   canopy_percent: ${canopyMeasured}/${out.councils.length} councils measured`);
}

main().catch((err) => {
  console.error("❌ build-councils failed:", err);
  process.exitCode = 1;
});
