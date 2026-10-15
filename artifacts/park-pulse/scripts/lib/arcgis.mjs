/**
 * Pure helpers for ArcGIS FeatureServer → GeoJSON normalisation.
 *
 * No network, no fs: every function takes parsed JSON and returns data, so
 * the whole pipeline is fixture-testable offline (see
 * `src/utils/councilFetch.test.ts`). The fetchers in `scripts/` are thin
 * shells around these functions.
 */

/**
 * Signed area of a ring via the shoelace formula. Positive = counter-
 * clockwise in the [lng, lat] plane, negative = clockwise.
 */
export function signedRingArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * ArcGIS polygon rings use the shapefile convention: outer rings are
 * clockwise, holes counter-clockwise, and rings are NOT nested between
 * separate polygons. GeoJSON groups a polygon as [outer, ...holes]. This
 * walks the ring list and starts a new polygon at every clockwise ring.
 */
export function esriRingsToPolygons(rings) {
  const polygons = [];
  for (const raw of rings) {
    const ring = closeRing(raw.map(([x, y]) => [x, y]));
    if (ring.length < 4) continue;
    const ccw = signedRingArea(ring) > 0;
    if (!ccw || polygons.length === 0) {
      // Clockwise (or the first ring): a new exterior ring.
      polygons.push([ring]);
    } else {
      // Counter-clockwise after an exterior: a hole in the current polygon.
      polygons[polygons.length - 1].push(ring);
    }
  }
  return polygons;
}

function closeRing(ring) {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [first[0], first[1]]];
  }
  return ring;
}

/**
 * Convert one ArcGIS feature ({ geometry, attributes }) to a GeoJSON
 * feature. Supports point, multipoint, polygon and polyline. Returns null
 * for geometries it cannot represent, so callers can count and report them
 * rather than shipping broken features.
 */
export function esriFeatureToGeoJSON(feature, properties) {
  const g = feature?.geometry;
  if (!g) return null;

  if (typeof g.x === "number" && typeof g.y === "number") {
    return { type: "Feature", properties, geometry: { type: "Point", coordinates: [g.x, g.y] } };
  }
  if (Array.isArray(g.points) && g.points.length > 0) {
    return {
      type: "Feature",
      properties,
      geometry: { type: "MultiPoint", coordinates: g.points.map(([x, y]) => [x, y]) },
    };
  }
  if (Array.isArray(g.rings) && g.rings.length > 0) {
    const polygons = esriRingsToPolygons(g.rings).filter(p => p[0].length >= 4);
    if (!polygons.length) return null;
    return {
      type: "Feature",
      properties,
      geometry:
        polygons.length === 1
          ? { type: "Polygon", coordinates: polygons[0] }
          : { type: "MultiPolygon", coordinates: polygons },
    };
  }
  if (Array.isArray(g.paths) && g.paths.length > 0) {
    const lines = g.paths.map(path => path.map(([x, y]) => [x, y])).filter(p => p.length >= 2);
    if (!lines.length) return null;
    return {
      type: "Feature",
      properties,
      geometry:
        lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines },
    };
  }
  return null;
}

/**
 * Target schema (PRD §5.1). Every value the source cannot supply is `null` —
 * never a placeholder. `source` keeps the raw attributes for provenance.
 */
export function normalizeProperties({
  id,
  raw,
  lgaId,
  lgaName,
  nameKeys = ["name", "NAME", "Name", "PLANLABEL"],
  suburbKeys = ["suburb", "SUBURB", "locality"],
  typeKeys = ["type", "TYPE", "CLASSSUBTY", "category"],
  playgroundKeys = ["playground", "PLAYGROUND", "has_playground"],
  areaKeys = ["area_m2", "SHAPE_Area", "Shape__Area", "AREA"],
}) {
  const str = (keys) => {
    for (const k of keys) {
      const v = raw?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const num = (keys) => {
    for (const k of keys) {
      const v = raw?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };

  const rawPlayground = str(playgroundKeys);
  // Unrecognised flag values stay null: a definitive false must never be
  // fabricated from a string the mapping does not understand.
  const hasPlayground =
    rawPlayground === null
      ? null
      : /^(yes|true|y|1)$/i.test(rawPlayground)
        ? true
        : /^(no|false|n|0)$/i.test(rawPlayground)
          ? false
          : null;
  return {
    id: id ?? null,
    name: str(nameKeys),
    type: str(typeKeys),
    suburb: str(suburbKeys),
    lga_id: lgaId,
    lga_name: lgaName,
    has_playground: hasPlayground,
    area_m2: num(areaKeys),
  };
}

/**
 * Page through an ArcGIS `query` endpoint using object-id paging, which is
 * the only reliable way past `maxRecordCount` (1,000 by default).
 *
 * `queryFn(objectIds) -> Promise<GeoJSONFeature[]>` is injected so this
 * function stays pure and testable; the CLI supplies the real fetch.
 */
export async function collectAllFeatures({ objectIds, pageSize = 500, queryFn }) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < objectIds.length; i += pageSize) {
    const chunk = objectIds.slice(i, i + pageSize);
    const features = await queryFn(chunk);
    for (const feature of features ?? []) {
      if (feature) out.push(feature);
      else skipped.push(i);
    }
  }
  return { features: out, skippedPages: skipped };
}

/** Build the objectIds paging URL for a layer. */
export function objectIdsUrl(serviceUrl, layerId) {
  return `${serviceUrl.replace(/\/$/, "")}/${layerId}/query?where=1%3D1&returnIdsOnly=true&f=json`;
}

/**
 * Build the "fetch these object ids as GeoJSON" URL for a layer.
 *
 * Built by hand rather than with URLSearchParams: percent-encoding the
 * commas and the `*` in outFields is tolerated by some servers and 404s on
 * others, and ArcGIS Online also rejects over-long URLs — hence the small
 * page sizes in the fetcher.
 */
export function queryUrl(serviceUrl, layerId, objectIds) {
  const base = `${serviceUrl.replace(/\/$/, "")}/${layerId}/query`;
  const params = [
    "f=geojson",
    "where=1%3D1",
    "outFields=*",
    "outSR=4326",
    `objectIds=${objectIds.join(",")}`,
  ];
  return `${base}?${params.join("&")}`;
}

/** Minimal FeatureCollection wrapper. */
export function toFeatureCollection(features) {
  return { type: "FeatureCollection", features };
}
