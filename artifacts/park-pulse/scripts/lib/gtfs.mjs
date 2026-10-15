/**
 * Shared GTFS vocabulary helpers for the conversion scripts (PRD FR4.1/FR4.2).
 *
 * `route_type` may be the basic GTFS enum (0–7) or the TPEG-based extended
 * enum. The app only ever renders five modes, so every value collapses into
 * ROUTE_MODES — and anything we cannot classify returns `null` rather than
 * being guessed into the wrong bucket.
 *
 * Reference: https://developers.google.com/transit/gtfs/reference/extended-route-types
 *
 * The values actually present in `Data/full_greater_sydney_gtfs_static_0.zip`
 * are 700, 712, 714, 204, 205, 106, 4, 2, 900 and 401 (checked against each
 * route's `route_long_name`/`route_desc`), and TfNSW follows the official
 * table: 712 School Bus → bus, 714 Rail Replacement Bus → bus, 204/205 coach →
 * bus, 106 Regional Rail → rail, 401 Metro → metro, 900 Tram → lightrail,
 * 4 ferry → ferry, 2 rail → rail.
 */

/** The five modes the UI renders (PRD FR4.2 enum). */
export const ROUTE_MODES = ["bus", "rail", "ferry", "lightrail", "metro"];

const RAIL = new Set([
  2, 6, 10, 11, // basic: rail, funicular, ?; 11 monorail
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
  400, 403, 404, 405,
]);

const METRO = new Set([1, 401, 402]);

const TRAM = new Set([0, 5, 900, 901, 902, 903, 904, 905, 906]);

const FERRY = new Set([4, 1000, 1200]);

const BUS = new Set([3, 7, 800, 1501]);

/**
 * Collapse a raw `route_type` value into one of ROUTE_MODES.
 *
 * Ranges: 200–209 coach services and 700–716 bus services → bus.
 * Returns `null` for missing/unknown values so callers can drop them instead
 * of inventing a mode.
 *
 * @param {string|number} raw
 * @returns {"bus"|"rail"|"ferry"|"lightrail"|"metro"|null}
 */
export function normalizeRouteType(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (RAIL.has(n)) return "rail";
  if (METRO.has(n)) return "metro";
  if (TRAM.has(n)) return "lightrail";
  if (FERRY.has(n)) return "ferry";
  if (BUS.has(n)) return "bus";
  if (n >= 200 && n <= 209) return "bus";
  if (n >= 700 && n <= 716) return "bus";
  return null;
}
