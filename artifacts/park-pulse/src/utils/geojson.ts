import { fetchWithCache } from "./dataCache";

/** A point feature in a GeoJSON FeatureCollection. */
export interface PointFeature<TProps = Record<string, unknown>> {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  properties?: TProps | null;
}

export interface FeatureCollection<TProps = Record<string, unknown>> {
  type: "FeatureCollection";
  features: PointFeature<TProps>[];
}

/** A ring is a closed list of [lng, lat] positions. */
type Ring = number[][];

/** A polygon or multipolygon feature — the parks dataset is area geometry. */
export interface AreaFeature<TProps = Record<string, unknown>> {
  type: "Feature";
  id?: string | number;
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] }
    | null;
  properties?: TProps | null;
}

/**
 * A FeatureCollection whose members may be points *or* polygons. Several of the
 * shipped datasets are mixed, so the geometry has to be discriminated at the
 * use site rather than baked into one shape.
 */
export interface MixedCollection<TProps = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Array<PointFeature<TProps> | AreaFeature<TProps>>;
}

/**
 * A representative point for any feature: the coordinates for a point, or the
 * centroid of the first ring for an area. Returns null when the feature has no
 * usable geometry, so callers can skip it instead of inventing a location.
 */
export function readFeatureCentroid<TProps>(
  feature: PointFeature<TProps> | AreaFeature<TProps>,
): LatLngPoint | null {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (geometry.type === "Polygon") {
    return ringCentroid(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    return ringCentroid(geometry.coordinates[0]?.[0]);
  }
  return null;
}

function ringCentroid(ring: Ring | undefined): LatLngPoint | null {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;
  for (const position of ring) {
    const lng = Number(position?.[0]);
    const lat = Number(position?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sumLat += lat;
    sumLng += lng;
    count++;
  }
  return count > 0 ? { lat: sumLat / count, lng: sumLng / count } : null;
}

/** The datasets shipped in `public/data` are not all FeatureCollections. */
export type LooseCollection<TProps> =
  | FeatureCollection<TProps>
  | Array<PointFeature<TProps> | TProps>;

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export function boundsContain(b: Bounds, lat: number, lng: number): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/**
 * Reads latitude/longitude out of the several shapes these datasets use:
 * a GeoJSON point feature, or a flat record with lat/lng under either a
 * `lat`/`lng`, `lat`/`lon`, `latitude`/`longitude`, or nested `geometry.coordinates`.
 */
export function readLatLng<TProps = Record<string, unknown>>(
  item: PointFeature<TProps> | AreaFeature<TProps> | Record<string, unknown>,
): LatLngPoint | null {
  const record = item as unknown as Record<string, unknown>;

  if (record.type === "Feature" && record.geometry) {
    const coords = (record.geometry as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    return null;
  }

  const lat = firstNumber(record.lat, record.latitude);
  const lng = firstNumber(record.lng, record.lon, record.longitude);
  if (lat !== null && lng !== null) return { lat, lng };

  // Fall back to nested GeoJSON-style coordinates before giving up; some
  // exports attach a geometry object to an otherwise flat record.
  if (record.geometry) {
    const coords = (record.geometry as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const nlat = Number(coords[1]);
      const nlng = Number(coords[0]);
      if (Number.isFinite(nlat) && Number.isFinite(nlng)) return { lat: nlat, lng: nlng };
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    // Some exports ship coordinates as numeric strings.
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Loads a point dataset and drops everything outside the viewport.
 *
 * The public toilets, transport and Blacktown layers previously added every
 * one of their markers to the map at once — roughly 6,000 DOM nodes the moment
 * a checkbox was ticked, whether or not they were on screen. Filtering during
 * load keeps only what the user can actually see; panning re-runs the same
 * filtered loader.
 */
export async function loadPointsInBounds<TProps>(
  url: string,
  cacheId: string,
  bounds: Bounds | null,
  padFraction = 0.3,
): Promise<{ points: PointFeature<TProps>[]; total: number }> {
  const { data } = await fetchWithCache<LooseCollection<TProps>>(url, cacheId);

  // Some exports are a bare array of records rather than a FeatureCollection;
  // readLatLng copes with both, so the entries are normalised to feature-ish
  // records here.
  const raw: Array<PointFeature<TProps>> = Array.isArray(data)
    ? (data as Array<PointFeature<TProps>>)
    : Array.isArray((data as FeatureCollection<TProps>)?.features)
      ? (data as FeatureCollection<TProps>).features
      : [];

  const usable = raw.filter((f) => readLatLng<TProps>(f) !== null);

  if (!bounds) return { points: usable, total: usable.length };

  // The pad is a fraction of the current viewport, not a fixed number of
  // degrees: an absolute pad large enough to matter when zoomed out (0.5° is
  // ~55 km) is useless once zoomed in, and would leave every marker loaded.
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const padLat = latSpan * padFraction;
  const padLng = lngSpan * padFraction;
  const padded: Bounds = {
    south: bounds.south - padLat,
    north: bounds.north + padLat,
    west: bounds.west - padLng,
    east: bounds.east + padLng,
  };
  const visible = usable.filter((f) => {
    const ll = readLatLng<TProps>(f);
    return ll !== null && boundsContain(padded, ll.lat, ll.lng);
  });

  return { points: visible, total: usable.length };
}