/**
 * Measures what the trees layer actually costs when it loads, against the
 * real dataset. This is the regression gate for the P0 tree work.
 *
 * The important detail this benchmark exists to record: the nearest-park
 * lookup runs inside a Leaflet popup *factory*, so it happens once per popup
 * the user opens, not once per tree. Only one tree popup can be open at a
 * time, so the expensive part of the old implementation was never the
 * nearest-park maths at all - it was eagerly building ~49,000 detached DOM
 * nodes and downloading 17 MB.
 *
 * Usage: node --experimental-strip-types ./scripts/bench-trees.mts
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NearestIndex, haversineKm } from "../src/utils/geo.ts";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(artifactDir, "public", "data");

function centroid(coords: number[][]): { lat: number; lng: number } {
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

async function main() {
  const parksGeo = JSON.parse(await readFile(path.join(dataDir, "Parks.geojson"), "utf8"));
  const suburbs = JSON.parse(await readFile(path.join(dataDir, "parks-suburbs.json"), "utf8"));
  const parks = parksGeo.features.map((f: any, i: number) => {
    const p = f.properties;
    const g = f.geometry;
    let lat = -33.8688;
    let lng = 151.2093;
    if (g.type === "Polygon") {
      const c = centroid(g.coordinates[0]);
      lat = c.lat;
      lng = c.lng;
    } else if (g.type === "MultiPolygon") {
      const c = centroid(g.coordinates[0][0]);
      lat = c.lat;
      lng = c.lng;
    }
    return {
      id: p.OBJECTID ?? i,
      name: p.Name || "Unnamed Park",
      type: p.Type || "Unknown",
      suburb: (suburbs[String(p.OBJECTID)] || {}).suburb || "",
      hasPlayground: p.Playgrounds === "Yes",
      area: p.Shape__Area ? Math.round(p.Shape__Area) : null,
      assetId: p.Asset_ID || "",
      lat,
      lng,
    };
  });

  const shardDir = path.join(dataDir, "trees");
  const shardFiles = (await readdir(shardDir)).filter((f) => f !== "manifest.json");

  // Bytes actually shipped for the whole dataset, versus the original file.
  const shardedBytes = (
    await Promise.all(shardFiles.map(async (f) => (await stat(path.join(shardDir, f))).size))
  ).reduce((a, b) => a + b, 0);
  const sourceBytes = (await stat(path.join(dataDir, "trees.geojson"))).size;

  const decodeStart = performance.now();
  const lngs: number[] = [];
  const lats: number[] = [];
  for (const file of shardFiles) {
    const payload = JSON.parse(await readFile(path.join(shardDir, file), "utf8"));
    for (let i = 0; i < payload.n; i++) {
      lngs.push(payload.lng[i]);
      lats.push(payload.lat[i]);
    }
  }
  const decodeMs = performance.now() - decodeStart;
  const treeCount = lngs.length;

  const indexStart = performance.now();
  const index = new NearestIndex(parks);
  const indexMs = performance.now() - indexStart;

  // A single popup lookup is all the user can trigger at once.
  const popupsToOpen = 200;
  const popupStart = performance.now();
  let hits = 0;
  for (let i = 0; i < popupsToOpen; i++) {
    if (index.nearest(lats[i], lngs[i])) hits++;
  }
  const popupMs = performance.now() - popupStart;
  const perPopupMs = popupMs / popupsToOpen;

  // Baseline for what the old eager implementation actually did: one linear
  // scan over every park, for every tree, on the main thread.
  const scanTrees = 2000;
  const scanStart = performance.now();
  let acc = 0;
  for (let i = 0; i < scanTrees; i++) {
    let best = Infinity;
    for (const park of parks) {
      const d = haversineKm(lats[i], lngs[i], park.lat, park.lng);
      if (d < best) best = d;
    }
    acc += best;
  }
  const scanSampleMs = performance.now() - scanStart;

  console.log("dataset");
  console.log("  trees               :", treeCount.toLocaleString());
  console.log("  parks               :", parks.length);
  console.log("  shards              :", shardFiles.length);
  console.log(`  shipped bytes       : ${(shardedBytes / 1024 / 1024).toFixed(2)} MiB (was ${(sourceBytes / 1024 / 1024).toFixed(1)} MiB, ${(sourceBytes / shardedBytes).toFixed(1)}x smaller)`);
  console.log("");
  console.log("layer load (what the user waits for)");
  console.log("  decode shards       :", decodeMs.toFixed(0), "ms");
  console.log("  build index         :", indexMs.toFixed(1), "ms");
  console.log("  popup lookups       : none (deferred to popup open)");
  console.log("  TOTAL blocking      :", (decodeMs + indexMs).toFixed(0), "ms");
  console.log("");
  console.log("per interaction");
  console.log(`  nearest-park lookup : ${perPopupMs.toFixed(3)} ms  (${hits}/${popupsToOpen} hit)`);
  console.log("");
  console.log("old implementation (eager, on the main thread)");
  console.log(`  ${scanTrees.toLocaleString()} trees x ${parks.length} parks: ${scanSampleMs.toFixed(0)} ms`);
  console.log(`  extrapolated to ${treeCount.toLocaleString()} trees: ${((scanSampleMs / scanTrees) * treeCount / 1000).toFixed(1)} s`);
  console.log(`  plus ~${treeCount.toLocaleString()} detached popup DOM nodes built up front`);
  if (acc < 0) console.log("unreachable");

  if (perPopupMs > 1) {
    console.error(`\nFAIL: a single popup lookup should be well under 1 ms, got ${perPopupMs.toFixed(3)} ms`);
    process.exitCode = 1;
  }
  if (decodeMs + indexMs > 2000) {
    console.error(`\nFAIL: layer load should stay under 2 s, got ${(decodeMs + indexMs).toFixed(0)} ms`);
    process.exitCode = 1;
  }
  console.log("\nOK");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});