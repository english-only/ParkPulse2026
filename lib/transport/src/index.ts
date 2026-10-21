/**
 * @workspace/transport
 *
 * Shared types and helpers for TfNSW transport data.
 *
 * Current state: `public/data/public-transports.json` (294 KB, 11,642 GTFS
 * stops) is already shipped. This package adds:
 *  - Normalised stop / route / line types
 *  - Fetch helpers for expanding the existing dataset with bus routes,
 *    cycling infrastructure, ferry stops, and light-rail lines (Sprint 4)
 */

// ── Normalised record types ─────────────────────────────────────────────────

export interface TransportStop {
  /** TfNSW GTFS stop_id. */
  stopId: string;
  name: string;
  /** LGA id if known. */
  lga?: string;
  /** Mode: "bus" | "train" | "ferry" | "light_rail" | "cycling". */
  mode: TransportMode;
  lat: number;
  lng: number;
  sourceUrl: string;
}

export interface TransportRoute {
  routeId: string;
  name: string;
  mode: TransportMode;
  /** WGS84 line geometry. */
  coords: [number, number][]; // [lng, lat] pairs
  sourceUrl: string;
}

export type TransportMode = "bus" | "train" | "ferry" | "light_rail" | "cycling";

// ── GeoJSON types (minimal, avoids pulling @types/geojson into the package) ─

export interface GeoJsonObject {
  type: string;
  [key: string]: unknown;
}

export interface Feature<T = GeoJsonObject> {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: T | null;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

// ── TfNSW API fetch helper ──────────────────────────────────────────────────

/**
 * Fetch TfNSW open-data GeoJSON endpoint.
 *
 * @param endpoint  Full URL to the TfNSW open-data resource.
 * @param opts      Optional filters (BBox, layer, etc.).
 */
export async function fetchTfnsGeoJson(
  endpoint: string,
  opts: { bbox?: [number, number, number, number]; layer?: string } = {},
): Promise<FeatureCollection> {
  const params = new URLSearchParams();
  if (opts.layer) params.set("layer", opts.layer);
  const qs = params.toString();
  const url = qs ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}` : endpoint;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[transport] TfNSW fetch failed (${res.status}) for ${url}`);
  }
  return (await res.json()) as FeatureCollection;
}


// ── TfNSW endpoint config ───────────────────────────────────────────────────

export const TFNS_ENDPOINTS = {
  /** All TfNSW stops (bus, train, ferry, light rail) — expands existing public-transports.json */
  stops: "https://api.transport.nsw.gov.au/v1/tp/stop?format=geojson",
  /** Bus, train, ferry, and light-rail route lines */
  lines: "https://api.transport.nsw.gov.au/v1/tp/line?format=geojson",
  /** Cycling infrastructure (bikeways, shared lanes) */
  cycling: "https://data.nsw.gov.au/data/dataset/cycling-infrastructure",
} as const;
