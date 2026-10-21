#!/usr/bin/env node
/**
 * build-hero-plate — turn the served park polygons into the Home hero artwork.
 *
 * The landing page used to plot a scatter of representative points. A point is
 * not a park: the centroid of a ring can fall outside its own polygon, and the
 * old file mixed the City of Sydney layer with a sampled OpenStreetMap layer, so
 * the picture was neither accurate nor a single dataset. This script draws the
 * real thing instead — every published park area, as its own outline.
 *
 * Output: public/data/hero-plate.json
 *   {
 *     generatedAt, source, viewBox: [w, h],
 *     types: [{ label, color, count }],
 *     parks: [{ name, typeIndex, paths: ["M…Z", …] }]
 *   }
 *
 * Geometry is projected once (equirectangular, metres), simplified to ~2.5 m,
 * then quantised into viewBox units. Only outer rings are kept: holes are below
 * one pixel at hero scale and would double the payload.
 *
 * Run via `node scripts/build-hero-plate.mjs` — wired into dev and build.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");
const SOURCE = path.join(DATA, "Parks.geojson");
const TARGET = path.join(DATA, "hero-plate.json");

/** One colour per published park type, matching Explore's marker palette. */
const TYPE_COLORS = {
  Civic: "#2D6A4F",
  Iconic: "#FFD166",
  Neighbourhood: "#83C5BE",
  Pocket: "#9B59B6",
  Sportsfield: "#F4A261",
};
const FALLBACK_COLOR = "#2D6A4F";

/* Height is fixed; width follows the true aspect of the City of Sydney
   extent, so the plate has no dead space on either side. */
const VIEW_H = 860;
const FRAME_PADDING = 12;
const SIMPLIFY_METRES = 2.5;
const MIN_RING_POINTS = 4;

const M_PER_DEG_LAT = 111_320;

function project(lng, lat, originLng, originLat, mPerDegLng) {
  return [(lng - originLng) * mPerDegLng, (originLat - lat) * M_PER_DEG_LAT];
}

/** Perpendicular distance from p to segment ab, in projected metres. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker on a projected ring. */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let farthest = -1;
  let maxDistance = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      farthest = i;
    }
  }
  if (maxDistance <= tolerance || farthest === -1) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, farthest + 1), tolerance);
  const right = simplify(points.slice(farthest), tolerance);
  return [...left.slice(0, -1), ...right];
}

function outerRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates?.[0] ?? []];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates ?? []).map((poly) => poly?.[0] ?? []);
  return [];
}

async function main() {
  if (!existsSync(SOURCE)) {
    // Absent dataset is a documented state of this build; the hero falls back
    // to its written summary rather than shipping a stale plate.
    console.warn("[build-hero-plate] Parks.geojson missing — skipping hero plate");
    return;
  }

  const collection = JSON.parse(await readFile(SOURCE, "utf8"));
  const features = Array.isArray(collection?.features) ? collection.features : [];

  // Ring points, to derive the projected extent of the whole set.
  const raw = [];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    const rings = outerRings(feature?.geometry)
      .map((ring) =>
        ring.filter(
          (position) => Array.isArray(position) && Number.isFinite(position[0]) && Number.isFinite(position[1]),
        ),
      )
      .filter((ring) => ring.length >= MIN_RING_POINTS);
    if (!rings.length) continue;

    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    const properties = feature.properties ?? {};
    raw.push({
      name: typeof properties.Name === "string" ? properties.Name.trim() : "",
      type: typeof properties.Type === "string" ? properties.Type : "Unknown",
      rings,
    });
  }

  if (!raw.length || !Number.isFinite(minLng)) {
    console.warn("[build-hero-plate] no usable polygons — skipping hero plate");
    return;
  }

  const originLat = (minLat + maxLat) / 2;
  const originLng = (minLng + maxLng) / 2;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180);
  const widthM = (maxLng - minLng) * mPerDegLng;
  const heightM = (maxLat - minLat) * M_PER_DEG_LAT;

  // One scale for both axes, so the city keeps its shape, centred in the frame.
  // `project` measures from the centre of the extent, so the origin of the
  // viewBox is the middle of the frame — not its top-left corner.
  const VIEW_W = Math.round((VIEW_H - FRAME_PADDING * 2) * (widthM / heightM) + FRAME_PADDING * 2);
  const scale = Math.min((VIEW_W - FRAME_PADDING * 2) / widthM, (VIEW_H - FRAME_PADDING * 2) / heightM);
  const offsetX = VIEW_W / 2;
  const offsetY = VIEW_H / 2;

  const typeCounts = new Map();
  const parks = [];
  let pointCount = 0;

  for (const park of raw) {
    const paths = [];
    for (const ring of park.rings) {
      const projected = ring.map(([lng, lat]) => {
        const [x, y] = project(lng, lat, originLng, originLat, mPerDegLng);
        return [x, y];
      });
      const simplified = simplify(projected, SIMPLIFY_METRES);
      const closed =
        simplified.length >= MIN_RING_POINTS ? simplified : [...simplified, simplified[0]];
      if (closed.length < MIN_RING_POINTS) continue;

      const commands = closed.map(([x, y], index) => {
        const px = (offsetX + x * scale).toFixed(1);
        const py = (offsetY + y * scale).toFixed(1);
        return `${index === 0 ? "M" : "L"}${px} ${py}`;
      });
      paths.push(`${commands.join("")}Z`);
      pointCount += closed.length;
    }
    if (!paths.length) continue;

    typeCounts.set(park.type, (typeCounts.get(park.type) ?? 0) + 1);
    parks.push({ name: park.name, type: park.type, paths });
  }

  const types = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, color: TYPE_COLORS[label] ?? FALLBACK_COLOR }));

  const typeIndex = new Map(types.map((type, index) => [type.label, index]));
  const plate = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "City of Sydney Open Data — park polygons (public/data/Parks.geojson)",
    viewBox: [VIEW_W, VIEW_H],
    // Ground metres per viewBox unit, so the hero can draw an honest scale
    // bar. `scale` is viewBox units per metre.
    metresPerUnit: Number((1 / scale).toFixed(2)),
    types,
    parks: parks.map((park) => ({
      name: park.name,
      typeIndex: typeIndex.get(park.type) ?? 0,
      paths: park.paths,
    })),
  };

  const payload = JSON.stringify(plate);
  await writeFile(TARGET, `${payload}\n`);
  console.log(
    `[build-hero-plate] ${plate.parks.length} park outlines · ${pointCount.toLocaleString()} points · ` +
      `${types.length} types · ${(payload.length / 1024).toFixed(1)} KiB`,
  );
}

main().catch((error) => {
  console.error("[build-hero-plate] failed:", error);
  process.exit(1);
});
