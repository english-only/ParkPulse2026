/**
 * @workspace/parks-sydney
 *
 * Shared types and helpers for Greater Sydney council park data.
 *
 * This package will eventually hold:
 *  - Per-LGA fetch helpers (Inner West, Parramatta, etc.)
 *  - Normalised park record types
 *  - Tree data expansion logic (Greater Sydney 10×10 sharding)
 *
 * Sprint 2 POC: Inner West Council only.
 */

// ── LGA identifiers ──────────────────────────────────────────────────────────

export type LgaId =
  | "inner-west"
  | "parramatta"
  | "northern-beaches"
  | "blacktown"
  | "randwick"
  | "strathfield"
  | "canterbury-bankstown"
  | "city-of-sydney";

// ── Normalised record types ─────────────────────────────────────────────────

export interface LgaPark {
  /** LGA id this park belongs to. */
  lga: LgaId;
  /** Council-assigned asset / object id. */
  id: string;
  name: string;
  type?: string;
  suburb?: string;
  areaSqM?: number | null;
  hasPlayground?: boolean;
  /** WGS84 latitude. */
  lat: number;
  /** WGS84 longitude. */
  lng: number;
  /** Source URL (for attribution / re-fetch). */
  sourceUrl: string;
}

export interface LgaTree {
  lga: LgaId;
  assetId: string;
  commonName: string;
  speciesName: string;
  treeType?: string;
  treeStatus?: string;
  age?: string;
  dbhCm: number | null;
  height: number | null;
  lat: number;
  lng: number;
  sourceUrl: string;
}

// ── ArcGIS FeatureServer fetch helper ───────────────────────────────────────

/**
 * Fetch a page of features from an ArcGIS FeatureServer.
 *
 * @param endpoint  Full URL to the FeatureServer (e.g. `https://arcgis.innerwest.nsw.gov.au/.../FeatureServer/0`)
 * @param outFields Comma-separated field list, or `"*"` for all fields.
 * @param where     SQL where clause; `"1=1"` returns everything.
 * @param outSR     Spatial reference WKID (default 4326 = WGS84).
 * @param resultOffset  0-based offset for pagination.
 * @param resultRecordSet  Max features per page (default 2000).
 *
 * @returns Normalised ArcGIS JSON or throws on network / HTTP error.
 */
export async function fetchArcGisFeatures(
  endpoint: string,
  opts: {
    outFields?: string;
    where?: string;
    outSR?: number;
    resultOffset?: number;
    resultRecordSet?: number;
  } = {},
): Promise<{ features: ArcGisFeature[]; total: number; exceededTransferLimit: boolean }> {
  const params = new URLSearchParams({
    outFields: opts.outFields ?? "*",
    where: opts.where ?? "1=1",
    outSR: String(opts.outSR ?? 4326),
    f: "json",
    resultOffset: String(opts.resultOffset ?? 0),
    resultRecordSet: String(opts.resultRecordSet ?? 2000),
  });

  const url = `${endpoint}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[parks-sydney] ArcGIS fetch failed (${res.status}) for ${url}`);
  }
  const json = await res.json();
  return {
    features: json.features ?? [],
    total: json.exceededTransferLimit ? 0 : (json.features?.length ?? 0),
    exceededTransferLimit: Boolean(json.exceededTransferLimit),
  };
}

// ── ArcGIS types (minimal) ───────────────────────────────────────────────────

export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    type: string;
    // Point
    x?: number;
    y?: number;
    // Polygon / Multipolygon
    rings?: number[][][];
    // Polyline
    paths?: number[][][];
    [key: string]: unknown;
  };
}

// ── LGA-specific endpoint config ─────────────────────────────────────────────

/**
 * ArcGIS Online service base URL helper.
 *
 * Each Sydney council publishes its GIS layers via ArcGIS Online
 * (services1.arcgis.com/<orgId>). The service base URL is:
 *
 *   https://services1.arcgis.com/<orgId>/arcgis/rest/services
 *
 * The specific FeatureServer layer name (e.g. "Parks", "Trees", "Street_Trees")
 * must be discovered by fetching the org's service list at runtime, because
 * council teams rename / reorganise layers without notice.
 */

export interface LgaEndpointInfo {
  /** ArcGIS Online org ID (orgId from `https://www.arcgis.com/sharing/rest`). */
  orgId: string;
  /** Human-readable council name for log lines. */
  displayName: string;
  /** Direct FeatureServer URLs when the layer names are confirmed. */
  parks?: string;
  trees?: string;
  /**
   * When true, the service names in `parks` / `trees` are placeholders that
   * need runtime discovery via the org's service list.
   * Set to `false` once a successful fetch confirms the layer names.
   */
  needsDiscovery?: boolean;
}

/**
 * Known ArcGIS Online org IDs for Greater Sydney councils.
 * Source: `research/raw/org-info.json` + `research/raw/cos-services-all.json`.
 */
export const LGA_ENDPOINTS: Partial<Record<LgaId, LgaEndpointInfo>> = {
  "inner-west": {
    orgId: "dp2UIID5MUpTUFVA",
    displayName: "Inner West Council",
    // Service names are placeholders until runtime discovery confirms them.
    parks: "https://services1.arcgis.com/dp2UIID5MUpTUFVA/arcgis/rest/services/Parks/FeatureServer/0",
    trees: "https://services1.arcgis.com/dp2UIID5MUpTUFVA/arcgis/rest/services/Street_Trees/FeatureServer/0",
    needsDiscovery: true,
  },
  "city-of-sydney": {
    orgId: "cNVyNtjGVZybOQWZ",
    displayName: "City of Sydney",
    // Confirmed from cos-services-all.json — 196 services under this org.
    parks: "https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Parks/FeatureServer/0",
    trees: "https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Trees/FeatureServer/0",
    needsDiscovery: false,
  },
};

/**
 * Build the ArcGIS Online org services root URL.
 * Used by discovery helpers to list all published layers.
 */
export function arcGisOrgServicesUrl(orgId: string): string {
  return `https://services1.arcgis.com/${orgId}/arcgis/rest/services`;
}
