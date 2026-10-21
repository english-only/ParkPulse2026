#!/usr/bin/env node
/**
 * build-stats — derive the numbers the UI shows from the datasets themselves.
 *
 * Writes two files into public/data/:
 *
 *   stats.json        Real, computed counts for every shipped dataset (park
 *                     type breakdown, amenity counts, council/canopy
 *                     summaries, last-updated stamp) plus a small set of
 *                     data-derived facts for the Home "Did you know" rotator.
 *                     Nothing here is hand-written: if a dataset changes, the
 *                     numbers change with it.
 *
 *   The Home hero is derived separately by `build-hero-plate.mjs`, which draws
 *   the published park polygons themselves; statistics here stay numeric.
 *
 * Run via `node scripts/build-stats.mjs` — wired into the build and dev
 * scripts in package.json.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");

async function readJson(rel) {
  const p = path.join(DATA, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, "utf8"));
}

/** Representative point for a geometry: centroid of the first outer ring, or the point itself. */
function featurePoint(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === "Point") return { lng: g.coordinates[0], lat: g.coordinates[1] };
  const poly =
    g.type === "Polygon" ? g.coordinates :
    g.type === "MultiPolygon" ? g.coordinates[0] :
    null;
  const ring = poly?.[0];
  if (!ring?.length) return null;
  // Sample the ring (every k-th vertex) so huge polygons stay cheap; the
  // average of ring vertices is a stable representative point for mapping.
  const step = Math.max(1, Math.floor(ring.length / 64));
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < ring.length; i += step) {
    sx += ring[i][0]; sy += ring[i][1]; n++;
  }
  return n ? { lng: sx / n, lat: sy / n } : null;
}

function countFeatures(fc) {
  if (Array.isArray(fc?.features)) return fc.features.length;
  // Some shipped datasets are plain record arrays (toilets-sydney.json is
  // [{ n, lat, lng, t, h }] rather than a FeatureCollection).
  if (Array.isArray(fc)) return fc.length;
  return 0;
}

const TYPE_COLORS = {
  // Marker palette used by Explore's park markers (parkMarkerColor).
  Playground: "#E76F51",
  Iconic: "#FFD166",
  Sports: "#F4A261",
  Sportsfield: "#F4A261",
  Neighbourhood: "#83C5BE",
  Pocket: "#9B59B6",
  Park: "#2D6A4F",
  Unknown: "#8A9A92",
};

async function main() {
  const [parks, blacktown, dogs, fountains, toilets, npws, trees, stops, councilsIdx, contributions, meta] =
    await Promise.all([
      readJson("Parks.geojson"),
      readJson("blacktown.geojson"),
      readJson("Dog_off-leash_parks.geojson"),
      readJson("drinking-fountains.geojson"),
      readJson("toilets-sydney.json"),
      readJson("npws-facilities-greater-sydney.geojson"),
      readJson("trees.geojson"),
      readJson("transport/stops.geojson"),
      readJson("boundaries/councils-index.json"),
      readJson("contributions.geojson"),
      readJson("meta.json"),
    ]);

  // ── Parks + type breakdown ────────────────────────────────────────────────
  const typeCounts = {};
  let playgrounds = 0;
  let areaM2 = 0;
  for (const f of parks?.features ?? []) {
    const p = f.properties ?? {};
    const type = p.Type || "Unknown";
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (p.Playgrounds === "Yes") playgrounds++;
    if (typeof p.Shape__Area === "number") areaM2 += p.Shape__Area;
  }
  const parkCount = countFeatures(parks);

  // Largest park (for a data-derived fact).
  let largest = null;
  for (const f of parks?.features ?? []) {
    const p = f.properties ?? {};
    if (typeof p.Shape__Area === "number" && (!largest || p.Shape__Area > largest.areaM2)) {
      largest = { name: p.Name || "Unnamed park", areaM2: p.Shape__Area };
    }
  }

  // ── Councils + canopy ─────────────────────────────────────────────────────
  const councils = councilsIdx?.councils ?? [];
  // Canopy is intentionally not aggregated into this file. The source is
  // licensed no-derivatives and the project documents disagree on the mean,
  // so publishing a percentage here would put a gated figure in a public
  // artifact even if no page rendered it.
  const totalAreaKm2 = councilsIdx?.total_area_km2 ?? null;

  // ── NPWS subtypes (top 3 — for the map legend) ───────────────────────────
  const subtypeCounts = {};
  for (const f of npws?.features ?? []) {
    const s = f.properties?.d_SubtypeC || "Facility";
    subtypeCounts[s] = (subtypeCounts[s] ?? 0) + 1;
  }
  const topSubtypes = Object.entries(subtypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const treesCount = countFeatures(trees);

  const stats = {
    generatedAt: new Date().toISOString().slice(0, 10),
    dataLastUpdated: meta?.lastUpdated ?? null,
    parks: {
      total: parkCount,
      playgrounds,
      areaHa: Math.round(areaM2 / 10000),
      byType: typeCounts,
    },
    blacktown: { total: countFeatures(blacktown) },
    dogs: { total: countFeatures(dogs) },
    fountains: { total: countFeatures(fountains) },
    toilets: { total: countFeatures(toilets) },
    npws: { total: countFeatures(npws), topSubtypes },
    trees: { total: treesCount },
    transport: { stops: countFeatures(stops) },
    // Accepted community records. Zero is a real count here: the dataset
    // exists and is shipped, and no batch has been published yet.
    contributions: { total: countFeatures(contributions) },
    councils: {
      total: councilsIdx?.total_councils ?? councils.length,
      areaKm2: totalAreaKm2,
    },
  };

  // Data-derived facts only — every number is computed from the shipped files.
  const facts = [];
  if (largest) {
    facts.push(
      `${largest.name} is the largest park in the dataset at ${(largest.areaM2 / 10000).toFixed(1)} ha.`,
    );
  }
  if (parkCount && playgrounds) {
    facts.push(
      `${Math.round((playgrounds / parkCount) * 100)}% of mapped City of Sydney parks (${playgrounds.toLocaleString()} of ${parkCount.toLocaleString()}) have a playground.`,
    );
  }
  if (stats.dogs.total) {
    facts.push(`${stats.dogs.total.toLocaleString()} designated off-leash dog areas are mapped across the network.`);
  }
  if (stats.toilets.total) {
    facts.push(`The dataset includes ${stats.toilets.total.toLocaleString()} public toilets from the National Public Toilet Map.`);
  }
  if (stats.fountains.total) {
    facts.push(`${stats.fountains.total.toLocaleString()} drinking fountains are mapped from City of Sydney open data.`);
  }
  if (stats.trees.total) {
    facts.push(`${stats.trees.total.toLocaleString()} street trees are mapped across the City of Sydney extract.`);
  }
  if (stats.npws.total && topSubtypes.length) {
    facts.push(
      `${stats.npws.total.toLocaleString()} National Parks facilities are mapped — the most common is ${topSubtypes[0][0].toLowerCase()} (${topSubtypes[0][1].toLocaleString()}).`,
    );
  }
  if (stats.transport.stops) {
    facts.push(
      `${stats.transport.stops.toLocaleString()} public transport stops (bus, rail, ferry, metro, light rail) can be overlaid on the map.`,
    );
  }
  if (stats.councils.total && totalAreaKm2) {
    facts.push(
      `Council boundaries cover ${Number(totalAreaKm2).toLocaleString(undefined, { maximumFractionDigits: 0 })} km² across ${stats.councils.total} Greater Sydney councils.`,
    );
  }
  stats.facts = facts;

  await writeFile(path.join(DATA, "stats.json"), JSON.stringify(stats, null, 2) + "\n");
  console.log(`[build-stats] ${parkCount} park areas · ${facts.length} facts`);
}

main().catch((err) => {
  console.error("[build-stats] failed:", err);
  process.exit(1);
});
