/**
 * scripts/lib/canopy.mjs — pure canopy-cover math (PRD Phase 5, FR5.1/5.2/5.5).
 *
 * The raster side of `scripts/canopy-extract.mjs` lives here with no I/O so
 * the vitest suite can assert exact numbers on synthetic geometry, exactly
 * like `scripts/lib/geo.mjs` does for the GTFS pipeline.
 *
 * Method (documented so the numbers are auditable):
 *   1. Pick the coarsest overview of the canopy GeoTIFF whose pixel size is
 *      still ≤ 30 m (the source rasters are ~0.5 m — reading them full-res
 *      would be 1.7 billion pixels for Blacktown alone).
 *   2. Project the council boundary (WGS84) into the raster CRS.
 *   3. For every raster row, intersect a horizontal scanline with the rings
 *      (even-odd, so holes are honoured) → the columns that fall inside the
 *      council → count canopy pixels there. This is O(rows × edges) instead
 *      of O(pixels × edges), which turns Hawkesbury from hours into seconds.
 *   4. canopy_percent = round(inside_canopy / inside_total × 100), integer
 *      0–100, clamped (FR5.2 rounding rule; null when nothing was measured).
 *
 * Every function is deterministic: identical inputs produce identical output
 * (FR5.5), which is what makes the emitted GeoJSON safe to cache and diff.
 */

/** Coarsest acceptable overview pixel size (FR5.1 clip/sample resolution). */
export const CANOPY_TARGET_METERS = 30;

/**
 * How much of one pixel counts as canopy.
 *
 * The source layers are binary 0/1 masks. An averaged overview (should the
 * encoder ever emit one) yields fractions, which contribute proportionally;
 * anything ≥ 0.5 counts fully, so a value of 2 (a class code we have not seen)
 * still means "canopy" rather than "twice as much canopy".
 */
export function canopyWeight(value) {
  if (typeof value !== "number" || !(value > 0)) return 0;
  return value >= 0.5 ? 1 : value;
}

/**
 * FR5.2: `round(canopy / total × 100)` as an integer 0–100.
 * Returns `null` (never 0) when there is nothing inside the boundary to
 * measure, so the UI can render "—" instead of a fabricated zero.
 */
export function canopyPercent(weightSum, totalPixels) {
  if (!Number.isFinite(totalPixels) || totalPixels <= 0) return null;
  const pct = Math.round((weightSum / totalPixels) * 100);
  if (!Number.isFinite(pct)) return null;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Choose the coarsest overview whose pixel size stays ≤ `targetMeters`.
 *
 * @param levels Array of [width, height] per image level, level 0 = full res.
 * @param basePixelSize Pixel size of level 0 in CRS units (degrees or metres).
 * @param unitsPerMeter CRS units per metre — 1 for projected CRS, ~111320 for
 *   geographic ones (only used to compare against a metre budget).
 * @returns index of the chosen level (0 = full resolution).
 */
export function pickOverviewLevel(levels, basePixelSize, targetMeters = CANOPY_TARGET_METERS, unitsPerMeter = 1) {
  if (!Array.isArray(levels) || levels.length === 0) throw new Error("pickOverviewLevel: no image levels");
  const baseWidth = levels[0][0];
  let chosen = 0;
  for (let i = 0; i < levels.length; i++) {
    const metres = ((basePixelSize * baseWidth) / levels[i][0]) * unitsPerMeter;
    if (metres <= targetMeters) chosen = i;
    else break; // levels only get coarser from here
  }
  return chosen;
}

/**
 * Geotransform for an overview level. Overviews repeat neither the tiepoint
 * nor the geokeys, so the origin is inherited from level 0 and the resolution
 * scales with the width ratio (square pixels).
 */
export function overviewTransform({ originX, originY, resX, resY, baseWidth, levelWidth }) {
  const scale = baseWidth / levelWidth;
  return { originX, originY, resX: resX * scale, resY: resY * scale };
}

/** Close a GeoJSON ring if the producer forgot (first ≠ last). */
function closeRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * Flatten a GeoJSON Polygon | MultiPolygon (or bare coordinates array) into
 * projected rings. `project(lng, lat) → [x, y]` converts to the raster CRS.
 */
export function ringsFromGeometry(geometry, project) {
  const type = geometry?.type;
  const polys = type === "MultiPolygon" ? geometry.coordinates : type === "Polygon" ? [geometry.coordinates] : null;
  if (!polys) throw new Error(`ringsFromGeometry: unsupported geometry ${JSON.stringify(type)}`);
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = closeRing(ring).map(([lng, lat]) => project(lng, lat));
      if (pts.length >= 4) rings.push(pts);
    }
  }
  if (!rings.length) throw new Error("ringsFromGeometry: geometry has no usable rings");
  return rings;
}

/**
 * Even-odd scanline fill for one row: which integer column intervals
 * `[c0, c1)` have their centre inside the rings at `y`.
 *
 * Rings are all tested together, so an interior ring (a hole) flips coverage
 * exactly the way `pointInPolygon` does in `src/utils/councils.ts`.
 */
export function fillIntervalsForRow(rings, y, transform, width) {
  const { originX, resX } = transform;
  const xs = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      // Half-open on y so shared vertices are counted exactly once.
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  }
  if (xs.length < 2) return [];
  xs.sort((a, b) => a - b);
  const intervals = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    // u is measured in pixels where column c owns centre c + 0.5.
    const u0 = (xs[i] - originX) / resX;
    const u1 = (xs[i + 1] - originX) / resX;
    const c0 = Math.max(0, Math.floor(u0 - 0.5) + 1);
    const c1 = Math.min(width, Math.floor(u1 - 0.5) + 1);
    if (c1 > c0) intervals.push([c0, c1]);
  }
  return intervals;
}

/**
 * Single pass over the raster: measure canopy coverage inside `rings` and
 * collect canopy runs (per row, `[col0, col1)` half-open) for polygon output.
 *
 * @param data flat row-major pixel values (one band)
 * @param transform { originX, originY, resX, resY } of the level being read
 * @returns { totalPixels, canopyWeight, canopyPixels, runs }
 */
export function computeCanopy({ data, width, height, transform, rings }) {
  const { originY, resY } = transform;
  let total = 0;
  let weight = 0;
  let canopyPixels = 0;
  const runs = [];
  for (let row = 0; row < height; row++) {
    const y = originY + (row + 0.5) * resY;
    const intervals = fillIntervalsForRow(rings, y, transform, width);
    if (intervals.length === 0) continue;
    const base = row * width;
    for (const [c0, c1] of intervals) {
      let runStart = -1;
      for (let c = c0; c < c1; c++) {
        const value = data[base + c];
        total++;
        weight += canopyWeight(value);
        const isCanopy = value >= 0.5;
        if (isCanopy) {
          canopyPixels++;
          if (runStart === -1) runStart = c;
        } else if (runStart !== -1) {
          runs.push({ row, col0: runStart, col1: c });
          runStart = -1;
        }
      }
      if (runStart !== -1) runs.push({ row, col0: runStart, col1: c1 });
    }
  }
  return { totalPixels: total, canopyWeight: weight, canopyPixels, runs };
}

/**
 * Merge identical column spans on consecutive rows into taller rectangles so
 * the emitted GeoJSON stays small (a 60×60 canopy block becomes 1 feature
 * instead of 60). Input must be sorted by row then column, which is what
 * `computeCanopy` produces.
 */
export function mergeRunsIntoRectangles(runs) {
  const rects = [];
  for (const run of runs) {
    const last = rects[rects.length - 1];
    if (last && last.row1 === run.row && last.col0 === run.col0 && last.col1 === run.col1) {
      last.row1 = run.row + 1;
    } else {
      rects.push({ row0: run.row, row1: run.row + 1, col0: run.col0, col1: run.col1 });
    }
  }
  return rects;
}

const round7 = (n) => Math.round(n * 1e7) / 1e7;

/**
 * Turn merged rectangles into EPSG:4326 polygon features, each carrying the
 * council's `canopy_percent` (FR5.2). `project(x, y) → [lng, lat]` converts
 * raster-CRS corners back to WGS84; 4 corners per rectangle is plenty at
 * ≤ 30 m cells.
 */
export function rectanglesToFeatures(rects, transform, project, properties = {}) {
  const { originX, originY, resX, resY } = transform;
  const features = [];
  for (const rect of rects) {
    const x0 = originX + rect.col0 * resX;
    const x1 = originX + rect.col1 * resX;
    const yTop = originY + rect.row0 * resY;
    const yBottom = originY + rect.row1 * resY;
    const corners = [
      [x0, yTop],
      [x1, yTop],
      [x1, yBottom],
      [x0, yBottom],
      [x0, yTop],
    ].map(([x, y]) => {
      const [lng, lat] = project(x, y);
      return [round7(lng), round7(lat)];
    });
    features.push({
      type: "Feature",
      properties: { ...properties },
      geometry: { type: "Polygon", coordinates: [corners] },
    });
  }
  return features;
}

/**
 * Merge the scalar canopy values produced by `canopy-extract.mjs` into the
 * councils index object (FR5.2 "extend schema; rebuild index, never
 * hand-edit"). Councils without a measured value get an explicit `null` so
 * the UI renders "—" instead of a fabricated 0.
 */
export function mergeCanopyIntoIndex(index, canopyIndex) {
  const byId = new Map((canopyIndex?.councils ?? []).map(entry => [entry.lga_id, entry]));
  for (const council of index.councils) {
    const entry = byId.get(council.lga_id);
    const pct = entry?.canopy_percent;
    council.canopy_percent = Number.isFinite(pct) ? pct : null;
  }
  return index;
}
