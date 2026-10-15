#!/usr/bin/env node
/**
 * scripts/gtfs-convert.mjs — GTFS static → GeoJSON converters (PRD FR4.1/FR4.2).
 *
 * Usage:
 *   node scripts/gtfs-convert.mjs --stops [options]   # FR4.1  stops.txt → public/data/transport/stops.geojson
 *   node scripts/gtfs-convert.mjs --routes [options]  # FR4.2  routes.txt + shapes.txt → public/data/transport/routes.geojson
 *
 * Options:
 *   --zip <path>         GTFS zip (default: Data/full_greater_sydney_gtfs_static_0.zip)
 *   --out <path>         output path (default: public/data/transport/<mode>.geojson)
 *   --limit <n>          keep at most n features (smoke tests)
 *   --sample <n>         (--routes) emit n complete shapes then stop; the offline
 *                        validation mode for the 979 MB shapes.txt gate (FR4.2)
 *   --no-boundary        skip the 35-council boundary filter
 *   --all-types          keep every location_type (default: stations/parents only)
 *   --no-route-types     skip the stop→route join; route_types will be []
 *   --help               usage
 *
 * Contract notes (FR4.1):
 *   - deterministic: features keep stops.txt order, route_types sorted, fixed
 *     property order, compact JSON
 *   - streamed: zip members are read through a child `unzip -p` and parsed
 *     incrementally, so the 17 MB / 420 MB / 979 MB members never load whole
 *   - malformed rows abort with exit 1 and the offending row number logged
 *
 * FR4.3 boundary: stop_times.txt is read ONLY to join stop → route mode for
 * FR4.1's `route_types[]` field. Arrival/departure times are discarded (the
 * parser is told to capture just trip_id + stop_id) and no frequency or
 * arrival feature is derived — TBD-5 stays open.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRowStream, toObject } from "./lib/csv.mjs";
import { normalizeRouteType, ROUTE_MODES } from "./lib/gtfs.mjs";
import { buildPolygonIndex, pointInIndex } from "./lib/geo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PROJECT_ROOT, "..", "..");
const DEFAULT_ZIP = path.join(REPO_ROOT, "Data", "full_greater_sydney_gtfs_static_0.zip");
const COUNCIL_DIR = path.join(PROJECT_ROOT, "public", "data", "boundaries", "councils");
const OUT_DIR = path.join(PROJECT_ROOT, "public", "data", "transport");

/** A row that violates the GTFS contract: reported with its row number, exit 1. */
class RowError extends Error {
  constructor(file, line, detail) {
    super(`${file}:${line}: ${detail}`);
    this.name = "RowError";
    this.file = file;
    this.line = line;
  }
}

function parseArgs(argv) {
  const opts = {
    mode: null,
    zip: DEFAULT_ZIP,
    out: null,
    limit: Infinity,
    sample: 50,
    boundary: true,
    stationsOnly: true,
    routeTypes: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stops" || a === "--routes") opts.mode = a.slice(2);
    else if (a === "--zip") opts.zip = path.resolve(argv[++i] ?? "");
    else if (a === "--out") opts.out = path.resolve(argv[++i] ?? "");
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--sample") opts.sample = Number(argv[++i]);
    else if (a === "--no-boundary") opts.boundary = false;
    else if (a === "--all-types") opts.stationsOnly = false;
    else if (a === "--no-route-types") opts.routeTypes = false;
    else if (a === "--help" || a === "-h") opts.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (opts.limit !== Infinity && !(opts.limit > 0)) {
    console.error("--limit expects a positive number");
    process.exit(2);
  }
  return opts;
}

const USAGE = `gtfs-convert — GTFS static → GeoJSON (PRD FR4.1 / FR4.2)

  node scripts/gtfs-convert.mjs --stops  [--zip p] [--out p] [--limit n] [--no-boundary] [--all-types] [--no-route-types]
  node scripts/gtfs-convert.mjs --routes [--zip p] [--out p] [--sample n] [--limit n]

Exit codes: 0 success · 1 malformed row or missing input (row number logged) · 2 usage`;

/**
 * Stream one zip member through `unzip -p`, parsing rows incrementally.
 *
 * `handle(fields, meta)` may throw to abort (the child is killed and the error
 * rejects the promise) or return `false` to stop reading early — that is how
 * `--sample` avoids chewing through 979 MB of shapes.txt offline.
 */
function streamZipMember(zip, member, handle, { maxFields = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-p", zip, member], { stdio: ["ignore", "pipe", "pipe"] });
    const decoder = new TextDecoder("utf-8");
    let failure = null;
    let stoppedEarly = false;
    let stderr = "";
    const rows = createRowStream(
      (fields, meta) => {
        if (failure || stoppedEarly) return;
        try {
          if (handle(fields, meta) === false) {
            stoppedEarly = true;
            child.kill("SIGTERM");
          }
        } catch (err) {
          failure = err;
          child.kill("SIGTERM");
        }
      },
      { maxFields },
    );
    child.stdout.on("data", (buf) => {
      if (failure || stoppedEarly) return;
      try {
        rows.write(decoder.decode(buf, { stream: true }));
      } catch (err) {
        failure = err;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (failure) return reject(failure);
      if (!stoppedEarly && code !== 0) {
        return reject(new Error(`unzip -p ${member} failed (exit ${code}): ${stderr.trim()}`));
      }
      try {
        if (!stoppedEarly) rows.end();
      } catch (err) {
        return reject(err);
      }
      resolve({ stoppedEarly });
    });
  });
}

function loadCouncilIndex() {
  if (!existsSync(COUNCIL_DIR)) {
    throw new Error(
      `council boundaries not found at ${path.relative(process.cwd(), COUNCIL_DIR)} — run ` +
        "`node scripts/build-councils.mjs` first (or pass --no-boundary)",
    );
  }
  const files = readdirSync(COUNCIL_DIR).filter((f) => f.endsWith(".geojson")).sort();
  if (!files.length) {
    throw new Error(`no council geometry in ${COUNCIL_DIR} — run \`node scripts/build-councils.mjs\``);
  }
  const geoms = files.map((f) => JSON.parse(readFileSync(path.join(COUNCIL_DIR, f), "utf8")));
  return buildPolygonIndex(geoms);
}

// ── FR4.1 — stops.txt → stops.geojson ───────────────────────────────────────

async function convertStops(opts) {
  const t0 = Date.now();
  const index = opts.boundary ? loadCouncilIndex() : null;

  const REQUIRED = ["stop_id", "stop_name", "stop_lat", "stop_lon"];
  let header = null;
  let rowsSeen = 0;
  let skippedNoCoords = 0;
  let skippedType = 0;
  let skippedOutside = 0;
  const kept = [];
  /** child stop_id → parent stop_id, for aggregating child route modes up. */
  const parentOf = new Map();

  await streamZipMember(opts.zip, "stops.txt", (fields, { line }) => {
    rowsSeen += 1;
    if (!header) {
      header = fields.map((f) => f.trim());
      const missing = REQUIRED.filter((c) => !header.includes(c));
      if (missing.length) {
        throw new RowError("stops.txt", line, `missing required column(s): ${missing.join(", ")}`);
      }
      return;
    }
    if (fields.length > header.length) {
      throw new RowError("stops.txt", line, `expected ${header.length} fields, got ${fields.length}`);
    }
    const rec = toObject(header, fields);
    if (!rec.stop_id) throw new RowError("stops.txt", line, "stop_id is empty");
    if (rec.parent_station) parentOf.set(rec.stop_id, rec.parent_station);

    if (rec.stop_lat === "" || rec.stop_lon === "") {
      skippedNoCoords += 1;
      return;
    }
    const lat = Number(rec.stop_lat);
    const lon = Number(rec.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new RowError("stops.txt", line, `invalid coordinates (${rec.stop_lat}, ${rec.stop_lon})`);
    }
    if (opts.stationsOnly && (rec.location_type || "0") !== "1") {
      skippedType += 1;
      return;
    }
    if (index && !pointInIndex(index, lon, lat)) {
      skippedOutside += 1;
      return;
    }
    if (kept.length >= opts.limit) return;
    kept.push({ id: rec.stop_id, name: rec.stop_name, lat, lon });
  });

  if (!header) throw new RowError("stops.txt", 1, "file contained no header row");

  // ── route_types[] join: routes.txt → trips.txt → stop_times.txt ──────────
  // Stop-time rows only need trip_id + stop_id; everything after stop_id is
  // scanned but never materialised (see FR4.3 note in the file header).
  const modes = new Map(kept.map((s) => [s.id, new Set()]));
  let routesSeen = 0;
  let tripsSeen = 0;
  let stopTimesSeen = 0;
  if (opts.routeTypes && kept.length) {
    const routeMode = new Map();
    await streamZipMember(
      opts.zip,
      "routes.txt",
      (fields, { line }) => {
        routesSeen += 1;
        if (routesSeen === 1) {
          if (fields[0] !== "route_id" || fields[5] !== "route_type") {
            throw new RowError("routes.txt", line, `expected columns route_id,…,route_type; got ${fields.slice(0, 6).join(",")}`);
          }
          return;
        }
        const mode = normalizeRouteType(fields[5]);
        if (mode) routeMode.set(fields[0], mode);
      },
      { maxFields: 6 },
    );

    const tripRoute = new Map();
    await streamZipMember(
      opts.zip,
      "trips.txt",
      (fields, { line }) => {
        tripsSeen += 1;
        if (tripsSeen === 1) {
          if (fields[0] !== "route_id" || fields[2] !== "trip_id") {
            throw new RowError("trips.txt", line, `expected columns route_id,…,trip_id; got ${fields.slice(0, 3).join(",")}`);
          }
          return;
        }
        if (fields[2]) tripRoute.set(fields[2], fields[0]);
      },
      { maxFields: 3 },
    );

    const keptSet = new Set(modes.keys());
    const ascend = (stopId) => {
      let target = stopId;
      for (let hops = 0; target && hops < 8; hops++) {
        if (keptSet.has(target)) return target;
        target = parentOf.get(target);
      }
      return null;
    };

    await streamZipMember(
      opts.zip,
      "stop_times.txt",
      (fields, { line }) => {
        stopTimesSeen += 1;
        if (stopTimesSeen === 1) {
          if (fields[0] !== "trip_id" || fields[3] !== "stop_id") {
            throw new RowError(
              "stop_times.txt",
              line,
              `expected columns trip_id,…,stop_id at index 3; got ${fields.join(",")}`,
            );
          }
          return;
        }
        if (fields.length < 4) return;
        const mode = routeMode.get(tripRoute.get(fields[0]));
        if (!mode) return;
        const target = ascend(fields[3]);
        if (target) modes.get(target).add(mode);
      },
      { maxFields: 4 }, // trip_id + arrival + departure + stop_id; times discarded (FR4.3/TBD-5)
    );
  }

  const features = kept.map((s) => ({
    type: "Feature",
    properties: {
      stop_id: s.id,
      stop_name: s.name,
      stop_lat: s.lat,
      stop_lon: s.lon,
      route_types: [...modes.get(s.id)].sort(),
    },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
  }));

  const json = JSON.stringify({ type: "FeatureCollection", features });
  const out = opts.out ?? path.join(OUT_DIR, "stops.geojson");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, json);

  const withRoutes = features.filter((f) => f.properties.route_types.length > 0).length;
  const modeCounts = {};
  for (const f of features) for (const m of f.properties.route_types) modeCounts[m] = (modeCounts[m] ?? 0) + 1;
  console.log(`✓ stops.geojson — ${features.length} features, ${(Buffer.byteLength(json, "utf8") / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  source rows      ${rowsSeen} (stops.txt, header included)`);
  console.log(`  skipped          ${skippedType} non-station, ${skippedOutside} outside council boundaries, ${skippedNoCoords} without coordinates`);
  console.log(`  route_types      ${withRoutes}/${features.length} stops carry a mode · ${JSON.stringify(modeCounts)}`);
  if (opts.routeTypes && kept.length) {
    console.log(`  join scan        ${routesSeen - 1} routes · ${tripsSeen - 1} trips · ${stopTimesSeen - 1} stop_times rows`);
  } else {
    console.log("  join scan        skipped (--no-route-types or no stops kept)");
  }
  console.log(`  boundary filter  ${opts.boundary ? "35 council polygons" : "disabled"} · elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { features: features.length, out };
}

// ── FR4.2 — routes.txt + shapes.txt → routes.geojson ────────────────────────

async function convertRoutes(opts) {
  const t0 = Date.now();

  // 1. routes.txt → route_id → normalized mode (+ display fields)
  const routes = new Map();
  let n = 0;
  await streamZipMember(opts.zip, "routes.txt", (fields, { line }) => {
    n += 1;
    if (n === 1) {
      if (fields[0] !== "route_id" || fields[5] !== "route_type") {
        throw new RowError("routes.txt", line, `expected columns route_id,…,route_type; got ${fields.slice(0, 6).join(",")}`);
      }
      return;
    }
    const mode = normalizeRouteType(fields[5]);
    routes.set(fields[0], { mode, short: fields[2], long: fields[3], raw: fields[5] });
  });

  // 2. trips.txt → shape_id → route_ids (which shapes belong to which route)
  const shapeRoutes = new Map();
  n = 0;
  await streamZipMember(opts.zip, "trips.txt", (fields, { line }) => {
    n += 1;
    if (n === 1) {
      if (fields[0] !== "route_id" || fields[3] !== "shape_id") {
        throw new RowError("trips.txt", line, `expected columns route_id,…,shape_id; got ${fields.slice(0, 4).join(",")}`);
      }
      return;
    }
    const [routeId, , , shapeId] = fields;
    if (!shapeId) return;
    let set = shapeRoutes.get(shapeId);
    if (!set) shapeRoutes.set(shapeId, (set = new Set()));
    set.add(routeId);
  });

  // 3. shapes.txt → one LineString per shape, grouped on the fly; `--sample n`
  //    stops after n complete shapes so the 979 MB member is only opened far
  //    enough to validate the pipeline on an offline machine.
  const features = [];
  let currentId = null;
  let currentCoords = [];
  let shapesSeen = 0;
  let pointsSeen = 0;
  let headerChecked = false;

  const flush = () => {
    if (!currentId || currentCoords.length < 2) {
      currentCoords = [];
      return false;
    }
    const routeIds = [...(shapeRoutes.get(currentId) ?? [])].sort();
    const modes = [...new Set(routeIds.map((r) => routes.get(r)?.mode).filter(Boolean))].sort();
    const primary = modes.includes("rail") ? "rail" : modes[0] ?? null;
    features.push({
      type: "Feature",
      properties: {
        shape_id: currentId,
        route_ids: routeIds,
        route_modes: modes,
        route_type: primary,
        route_short_name: routes.get(routeIds[0])?.short ?? "",
      },
      geometry: { type: "LineString", coordinates: currentCoords },
    });
    currentCoords = [];
    return true;
  };

  const limit = opts.limit;
  await streamZipMember(opts.zip, "shapes.txt", (fields, { line }) => {
    if (!headerChecked) {
      if (fields[0] !== "shape_id" || fields[1] !== "shape_pt_lat" || fields[2] !== "shape_pt_lon") {
        throw new RowError("shapes.txt", line, `expected columns shape_id,shape_pt_lat,shape_pt_lon; got ${fields.slice(0, 3).join(",")}`);
      }
      headerChecked = true;
      return;
    }
    if (fields.length < 3) return;
    const [shapeId, latRaw, lonRaw] = fields;
    if (shapeId !== currentId) {
      if (currentId !== null) {
        const emitted = flush();
        if (emitted) shapesSeen += 1;
        if (shapesSeen >= opts.sample) {
          currentId = null;
          return false; // --sample reached: stop reading the member
        }
      }
      currentId = shapeId;
    }
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new RowError("shapes.txt", line, `invalid shape point (${latRaw}, ${lonRaw})`);
    }
    currentCoords.push([lon, lat]);
    pointsSeen += 1;
    if (limit !== Infinity && features.length >= limit) return false;
    return undefined;
  });
  if (currentId !== null && shapesSeen < opts.sample) {
    const emitted = flush();
    if (emitted) shapesSeen += 1;
  }

  const json = JSON.stringify({ type: "FeatureCollection", features });
  const out = opts.out ?? path.join(OUT_DIR, "routes.geojson");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, json);

  console.log(`✓ routes.geojson — ${features.length} LineStrings from ${pointsSeen} shape points, ${(Buffer.byteLength(json, "utf8") / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  routes ${routes.size} · shapes referenced by trips ${shapeRoutes.size} · elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (shapesSeen < opts.sample) {
    console.log(`  ⚠ --sample requested ${opts.sample} shapes; the feed yielded ${shapesSeen} before the member ended`);
  } else {
    console.log(`  sample mode: stopped after ${shapesSeen} complete shapes (full run needs a connected machine per FR4.2 gate)`);
  }
  const unknown = features.filter((f) => f.properties.route_type === null).length;
  if (unknown) console.log(`  ⚠ ${unknown} shapes map to no known mode (route_type left null)`);
  return { features: features.length, out };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.mode) {
    console.log(USAGE);
    process.exit(opts.help ? 0 : 2);
  }
  if (!existsSync(opts.zip)) {
    console.error(`GTFS zip not found: ${opts.zip}`);
    process.exit(1);
  }
  if (opts.mode === "stops") await convertStops(opts);
  else await convertRoutes(opts);
  if (!ROUTE_MODES.length) process.exit(1); // keep the enum imported & asserted
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
