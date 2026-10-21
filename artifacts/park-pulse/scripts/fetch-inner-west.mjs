/**
 * scripts/fetch-inner-west.mjs
 *
 * Sprint 2 POC: fetch Inner West Council parks + trees from their
 * ArcGIS Online FeatureServer and write them to `public/data/inner-west/`
 * as GeoJSON files ready for `useCulledMarkerLayer`.
 *
 * Inner West Council's ArcGIS Online org:
 *   orgId: dp2UIID5MUpTUFVA  (owner: davidchanIWC)
 *   services root: https://services1.arcgis.com/dp2UIID5MUpTUFVA/arcgis/rest/services
 *
 * The council's exact FeatureServer layer names are not pre-confirmed in
 * the repo. On first run the script performs service discovery:
 *   1. Fetches the org services root to enumerate all published services.
 *   2. Filters for FeatureServer services whose names match /park|tree|green|recreat|reserv|garden/i.
 *   3. Prints the full service list for manual confirmation.
 *   4. Tries the first candidate for parks and trees; if the layer has
 *      0 point features, falls through to the next candidate.
 *
 * If you already know the layer names, pass them explicitly:
 *   node scripts/fetch-inner-west.mjs --parks-layer "IWC_Parks" --trees-layer "IWC_Trees"
 *
 * Usage:
 *   node scripts/fetch-inner-west.mjs
 *   node scripts/fetch-inner-west.mjs --park-only
 *   node scripts/fetch-inner-west.mjs --trees-only
 *   node scripts/fetch-inner-west.mjs --parks-layer "IWC_Parks" --trees-layer "IWC_Trees"
 */

import { writeFile, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(artifactDir, "public", "data", "inner-west");

// ── ArcGIS Online org ─────────────────────────────────────────────────────────
// Confirmed from research/raw/org-info.json:
//   Inner West Council  orgId: dp2UIID5MUpTUFVA  owner: davidchanIWC
const ORG_ID = "dp2UIID5MUpTUFVA";
const SERVICES_ROOT = `https://services1.arcgis.com/${ORG_ID}/arcgis/rest/services`;

// Candidate layer name patterns (case-insensitive) for auto-discovery.
// The council may use any of these naming conventions.
const PARK_NAME_RE = /park|open.?space|green.?space|recreation|reserv/i;
const TREE_NAME_RE = /tree|greening|vegetation|plant/i;

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const getFlag = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    parkOnly: args.includes("--park-only"),
    treesOnly: args.includes("--trees-only"),
    parksLayer: getFlag("parks-layer"),
    treesLayer: getFlag("trees-layer"),
  };
}

// ── ArcGIS helpers ───────────────────────────────────────────────────────────

/**
 * Fetch the list of all services published under an ArcGIS Online org.
 * Returns an array of { name, type, url }.
 */
async function fetchOrgServices() {
  console.log(`[inner-west] fetching org services list: ${SERVICES_ROOT}`);
  const res = await fetch(SERVICES_ROOT, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Org services fetch failed (${res.status}): ${SERVICES_ROOT}`);
  const json = await res.json();
  const services = json.services ?? [];
  console.log(`[inner-west] found ${services.length} services in Inner West Council ArcGIS Online org.`);
  return services;
}

/**
 * From a raw services list, return candidate FeatureServer layer names
 * matching the given regex, one per service (top-level only, no sub-layers).
 */
function findLayerCandidates(services, nameRe, exclude = []) {
  return services
    .filter((s) => s.type === "FeatureServer" && nameRe.test(s.name) && !exclude.includes(s.name))
    .map((s) => s.name);
}

/**
 * Fetch a specific layer (sub-layer 0) of a FeatureServer and return its
 * feature count. Returns -1 if the layer doesn't exist.
 */
async function testLayer(serviceName) {
  const layerUrl = `${SERVICES_ROOT}/${serviceName}/FeatureServer/0`;
  try {
    const res = await fetch(
      `${layerUrl}?outFields=OBJECTID&where=1=1&outSR=4326&f=json&resultOffset=0&resultRecordSet=1`,
    );
    if (!res.ok) return { count: -1, url: layerUrl, error: res.status };
    const json = await res.json();
    if (json.features?.length > 0 || json.exceededTransferLimit === false) {
      // Get total count
      const countRes = await fetch(`${layerUrl}?f=json&outFields=OBJECTID&where=1=1&resultRecordSet=1`);
      const countJson = await countRes.json();
      const total = countJson.totalCount ?? countJson.features?.length ?? 0;
      return { count: total, url: layerUrl };
    }
    return { count: 0, url: layerUrl };
  } catch {
    return { count: -1, url: layerUrl, error: "network" };
  }
}

/**
 * Fetch all features from a confirmed FeatureServer layer URL with pagination.
 */
async function fetchAllFeatures(layerUrl) {
  const allFeatures = [];
  let offset = 0;
  const recordSet = 2000;

  while (true) {
    const params = new URLSearchParams({
      outFields: "*",
      where: "1=1",
      outSR: "4326",
      f: "json",
      resultOffset: String(offset),
      resultRecordSet: String(recordSet),
    });
    const url = `${layerUrl}?${params}`;
    console.log(`[inner-west]   page offset=${offset}  ${url.slice(0, 100)}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Feature fetch failed (${res.status}): ${url}`);
    const json = await res.json();
    const features = json.features ?? [];
    allFeatures.push(...features);
    console.log(`[inner-west]   → ${features.length} features (running total ${allFeatures.length})`);
    if (!json.exceededTransferLimit || features.length === 0) break;
    offset += recordSet;
  }

  return allFeatures;
}

// ── Feature transform ────────────────────────────────────────────────────────

/**
 * Convert an ArcGIS feature to a { lat, lng, props } object.
 * Returns null for non-point geometries.
 */
function toPoint(f) {
  const attrs = f.attributes ?? {};
  const geom = f.geometry;
  if (!geom || geom.type !== "point") return null;
  const lat = geom.y;
  const lng = geom.x;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng, props: attrs };
}

// ── Output ───────────────────────────────────────────────────────────────────

async function writeGeoJson(filename, features) {
  const geoJson = {
    type: "FeatureCollection",
    features: features
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lng, f.lat] },
        properties: f.props,
      }))
      .filter(Boolean),
  };
  const json = JSON.stringify(geoJson);
  const filePath = path.join(outDir, filename);
  await writeFile(filePath, json);
  console.log(`[inner-west] wrote ${filename} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KiB, ${geoJson.features.length} features)`);
  return { file: filename, count: geoJson.features.length, bytes: Buffer.byteLength(json) };
}

// ── Service discovery ────────────────────────────────────────────────────────

/**
 * Discover the correct park and tree FeatureServer layer names by:
 *   1. Fetching the org services list.
 *   2. Filtering FeatureServers matching PARK_NAME_RE / TREE_NAME_RE.
 *   3. Testing the top candidates until one returns >0 features.
 *
 * Returns { parksLayer, treesLayer, allServices }.
 * If no suitable layer is found for a category, the field is undefined.
 */
async function discoverLayers(explicitParks, explicitTrees) {
  const services = await fetchOrgServices();

  // Print full services list for manual inspection.
  console.log("[inner-west] full service list:");
  services.forEach((s) => {
    console.log(`[inner-west]   ${s.type.padEnd(15)} ${s.name}`);
  });

  let parksLayer;
  let treesLayer;

  // Parks
  if (explicitParks) {
    const url = `${SERVICES_ROOT}/${explicitParks}/FeatureServer/0`;
    console.log(`[inner-west] using explicit parks layer: ${explicitParks} → ${url}`);
    parksLayer = url;
  } else {
    const candidates = findLayerCandidates(services, PARK_NAME_RE);
    if (candidates.length === 0) {
      console.warn("[inner-west] no park FeatureServer candidates found in org services list.");
    } else {
      console.log(`[inner-west] park candidates: ${candidates.join(", ")}`);
      for (const name of candidates) {
        const result = await testLayer(name);
        if (result.count > 0) {
          console.log(`[inner-west] selected parks layer "${name}" (${result.count} features)`);
          parksLayer = result.url;
          break;
        }
        console.log(`[inner-west]   "${name}" returned 0 features, trying next…`);
      }
      if (!parksLayer) console.warn("[inner-west] no park layer with features found.");
    }
  }

  // Trees
  if (explicitTrees) {
    const url = `${SERVICES_ROOT}/${explicitTrees}/FeatureServer/0`;
    console.log(`[inner-west] using explicit trees layer: ${explicitTrees} → ${url}`);
    treesLayer = url;
  } else {
    const candidates = findLayerCandidates(services, TREE_NAME_RE);
    if (candidates.length === 0) {
      console.warn("[inner-west] no tree FeatureServer candidates found in org services list.");
    } else {
      console.log(`[inner-west] tree candidates: ${candidates.join(", ")}`);
      for (const name of candidates) {
        const result = await testLayer(name);
        if (result.count > 0) {
          console.log(`[inner-west] selected trees layer "${name}" (${result.count} features)`);
          treesLayer = result.url;
          break;
        }
        console.log(`[inner-west]   "${name}" returned 0 features, trying next…`);
      }
      if (!treesLayer) console.warn("[inner-west] no tree layer with features found.");
    }
  }

  return { parksLayer, treesLayer, services };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { parkOnly, treesOnly, parksLayer, treesLayer } = parseArgs(process.argv);

  if (parkOnly && treesOnly) {
    console.error("[inner-west] cannot use --park-only and --trees-only together");
    process.exit(1);
  }

  // Set up output directory
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    lga: "inner-west",
    source: "ArcGIS Online org dp2UIID5MUpTUFVA (Inner West Council)",
  };

  // Discover layers if not explicitly provided
  if (!parksLayer || !treesLayer) {
    const discovered = await discoverLayers(
      parkOnly ? undefined : parksLayer,
      treesOnly ? undefined : treesLayer,
    );

    // Explicit args override discovery
    const resolvedParksLayer =
      parksLayer && !parkOnly
        ? `${SERVICES_ROOT}/${parksLayer}/FeatureServer/0`
        : discovered.parksLayer;
    const resolvedTreesLayer =
      treesLayer && !treesOnly
        ? `${SERVICES_ROOT}/${treesLayer}/FeatureServer/0`
        : discovered.treesLayer;

    manifest.discoveredParksLayer = resolvedParksLayer ?? null;
    manifest.discoveredTreesLayer = resolvedTreesLayer ?? null;

    if (!parkOnly && resolvedParksLayer) {
      await fetchDataset(resolvedParksLayer, "parks.geojson", manifest, "parks");
    } else if (!parkOnly) {
      console.warn("[inner-west] no parks layer found — skipping parks.geojson");
    }

    if (!treesOnly && resolvedTreesLayer) {
      await fetchDataset(resolvedTreesLayer, "trees.geojson", manifest, "trees");
    } else if (!treesOnly) {
      console.warn("[inner-west] no trees layer found — skipping trees.geojson");
    }
  }

  // Write manifest
  manifest.files = await readdir(outDir);
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n[inner-west] done. ${manifest.files.length} files in public/data/inner-west/`);
}

async function fetchDataset(layerUrl, filename, manifest, key) {
  try {
    console.log(`[inner-west] fetching ${key} from ${layerUrl.slice(0, 90)}…`);
    const features = await fetchAllFeatures(layerUrl);
    const points = features.map(toPoint).filter(Boolean);

    if (!points.length) {
      console.warn(`[inner-west] no ${key} features returned — layer may be empty.`);
      return;
    }

    await writeGeoJson(filename, points);
    manifest[key] = { count: points.length, source: layerUrl };
  } catch (err) {
    console.error(`[inner-west] ${key} fetch failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("[inner-west] failed:", err);
  process.exitCode = 1;
});
