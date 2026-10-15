/**
 * Build-side geometry helpers.
 *
 * The app already ships point-in-polygon in `src/utils/councils.ts`, but build
 * scripts run under plain Node and cannot import TypeScript, so this module
 * keeps the same algorithm: bbox pre-filter, then even-odd ray casting on the
 * exterior ring, with holes honoured (a point inside a hole is *outside* the
 * council).
 */

const polysOf = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
};

const ringBbox = (ring) => {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const [x, y] of ring) {
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  return { minx, miny, maxx, maxy };
};

/**
 * Flatten GeoJSON (Feature, FeatureCollection, or bare geometry) into an
 * indexed polygon list. Input may be a single object or an array of them.
 *
 * @returns {{minx:number,miny:number,maxx:number,maxy:number,exterior:Array,holes:Array[]}[]}
 */
export function buildPolygonIndex(inputs) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const index = [];
  for (const input of list) {
    const features =
      input?.type === "FeatureCollection"
        ? input.features ?? []
        : input?.type === "Feature"
          ? [input]
          : [input];
    for (const feature of features) {
      const geometry = feature?.type === "Feature" ? feature.geometry : feature;
      for (const rings of polysOf(geometry)) {
        const [exterior, ...holes] = rings;
        if (!exterior || exterior.length < 4) continue;
        const bbox = ringBbox(exterior);
        index.push({
          ...bbox,
          exterior,
          holes: holes.filter((h) => h && h.length >= 4).map((h) => ({ ring: h, bbox: ringBbox(h) })),
        });
      }
    }
  }
  return index;
}

/** Even-odd ray casting against one closed ring (first point == last point). */
export function pointInRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat) {
      if (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** True when (lon, lat) falls in any polygon of the index (holes excluded). */
export function pointInIndex(index, lon, lat) {
  for (const poly of index) {
    if (lon < poly.minx || lon > poly.maxx || lat < poly.miny || lat > poly.maxy) continue;
    if (!pointInRing(poly.exterior, lon, lat)) continue;
    const inHole = poly.holes.some(
      (h) =>
        lon >= h.bbox.minx && lon <= h.bbox.maxx && lat >= h.bbox.miny && lat <= h.bbox.maxy &&
        pointInRing(h.ring, lon, lat),
    );
    if (!inHole) return true;
  }
  return false;
}
